-- 0002_current_user_id.sql — PARCHE TEMPORAL para el borrado de request.jwt.claims de pg_session_jwt.
--
-- Problema (reproducido en la rama test, también con JWT real por la Data API):
--   pg_session_jwt no está precargado; se carga en cada conexión nueva del servidor con la primera
--   llamada a auth.*, y al cargarse BORRA request.jwt.claims. En la primera transacción de cada
--   conexión nueva auth.uid() devuelve NULL → "No autenticado" o listas vacías tras despertar la BD.
--
-- Parche: app_private.current_user_id() lee el claim ANTES de llamar a auth.uid(). Si auth.uid()
-- devuelve NULL, usa el `sub` leído al principio. Es el mismo valor que pg_session_jwt usaría
-- (sin JWK configurado lee request.jwt.claims), fijado por la Data API tras validar el JWT.
--
-- Reglas (devuelve NULL, sin error y sin usar el valor leído, si):
--   * el rol de la sesión (SET ROLE) es `anonymous`, o el claim `role` es `anonymous`;
--   * el claim no es JSON, no es un objeto, o `sub` no es un UUID;
--   * no hay claim (entonces solo vale lo que diga auth.uid(), protegido contra errores).
--
-- IMPORTANTE: todo el código debe obtener el usuario con current_user_id(), nunca con auth.* directo:
-- la primera llamada a auth.* de la transacción es la que borra el claim.
--
-- Retirar cuando Neon lo corrija (ver "Riesgos conocidos" en CLAUDE.md).

begin;

create function app_private.current_user_id() returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare
  -- Leer el claim ANTES de cualquier llamada a auth.* (la carga de pg_session_jwt lo borra).
  v_raw    text := nullif(current_setting('request.jwt.claims', true), '');
  v_claims jsonb;
  v_uid    uuid;
begin
  -- Rol de la sesión: dentro de SECURITY DEFINER current_user es el dueño, pero el GUC `role`
  -- conserva el SET ROLE de la Data API.
  if current_setting('role', true) = 'anonymous' then
    return null;
  end if;

  if v_raw is not null then
    begin
      v_claims := v_raw::jsonb;
    exception when others then
      return null; -- claim mal formado (no es JSON)
    end;
    if jsonb_typeof(v_claims) <> 'object' then
      return null; -- claim mal formado (no es un objeto)
    end if;
    if v_claims->>'role' = 'anonymous' then
      return null;
    end if;
  end if;

  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;
  if v_uid is not null then
    return v_uid;
  end if;

  -- Respaldo: el `sub` leído antes de que la carga de pg_session_jwt borrase el claim.
  if v_claims is not null
     and (v_claims->>'sub') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    return (v_claims->>'sub')::uuid;
  end if;
  return null;
end $$;

-- Solo la usan funciones SECURITY DEFINER (que se ejecutan como el dueño): nadie más necesita EXECUTE.
revoke execute on function app_private.current_user_id() from public, anonymous, authenticated;

-- Mismas funciones que en 0001, cambiando auth.uid() por app_private.current_user_id().
create or replace function app_private.is_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = app_private.current_user_id()
      and g.deleted_at is null
  )
$$;

create or replace function public.create_group(p_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.current_user_id();
  v_group_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  insert into public.groups (name, created_by)
  values (btrim(p_name), v_uid)
  returning id into v_group_id;

  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_uid, 'admin');

  insert into public.activities (group_id, actor, type, payload)
  values (v_group_id, v_uid, 'group_created', jsonb_build_object('name', btrim(p_name)));

  return v_group_id;
end $$;

create or replace function public.join_group(p_invite_code text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.current_user_id();
  v_group_id uuid;
  v_inserted int;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select g.id into v_group_id
  from public.groups g
  where g.invite_code = p_invite_code and g.deleted_at is null;

  if v_group_id is null then
    raise exception 'Código de invitación no válido' using errcode = 'P0002';
  end if;

  insert into public.memberships (group_id, user_id, role)
  values (v_group_id, v_uid, 'member')
  on conflict (group_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted > 0 then
    insert into public.activities (group_id, actor, type)
    values (v_group_id, v_uid, 'member_joined');
  end if;

  return v_group_id;
end $$;

create or replace function public.create_expense(
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_paid_by      uuid,
  p_expense_date date,
  p_shares       jsonb
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := app_private.current_user_id();
  v_expense_id uuid;
  v_count int;
  v_distinct int;
  v_sum bigint;
  v_non_members int;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  -- Grupo existente y no borrado (bloqueo compartido mientras dura la transacción)
  perform 1 from public.groups g
  where g.id = p_group_id and g.deleted_at is null
  for share;
  if not found then
    raise exception 'Grupo no encontrado' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.memberships m
                 where m.group_id = p_group_id and m.user_id = v_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if p_amount_cents is null or p_amount_cents <= 0 then
    raise exception 'El importe debe ser mayor que 0' using errcode = '22023';
  end if;

  if p_description is null or length(btrim(p_description)) = 0 then
    raise exception 'La descripción es obligatoria' using errcode = '22023';
  end if;

  if not exists (select 1 from public.memberships m
                 where m.group_id = p_group_id and m.user_id = p_paid_by) then
    raise exception 'El pagador no es miembro del grupo' using errcode = '22023';
  end if;

  if p_shares is null or jsonb_typeof(p_shares) <> 'array' or jsonb_array_length(p_shares) = 0 then
    raise exception 'El gasto necesita al menos un participante' using errcode = '22023';
  end if;

  -- jsonb_to_recordset rechaza por sí mismo uuids mal formados e importes no enteros.
  if exists (select 1 from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer)
             where s.user_id is null or s.amount_cents is null or s.amount_cents < 0) then
    raise exception 'Cuota no válida' using errcode = '22023';
  end if;

  select count(*), count(distinct s.user_id), sum(s.amount_cents),
         count(*) filter (where m.user_id is null)
    into v_count, v_distinct, v_sum, v_non_members
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer)
  left join public.memberships m on m.group_id = p_group_id and m.user_id = s.user_id;

  if v_distinct <> v_count then
    raise exception 'Participantes repetidos' using errcode = '22023';
  end if;

  if v_non_members > 0 then
    raise exception 'Hay participantes que no son miembros del grupo' using errcode = '22023';
  end if;

  if v_sum <> p_amount_cents then
    raise exception 'Las cuotas suman % y el importe es %', v_sum, p_amount_cents using errcode = '22023';
  end if;

  insert into public.expenses (group_id, description, amount_cents, paid_by, expense_date, created_by)
  values (p_group_id, btrim(p_description), p_amount_cents, p_paid_by,
          coalesce(p_expense_date, current_date), v_uid)
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, amount_cents)
  select v_expense_id, s.user_id, s.amount_cents
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer);

  insert into public.activities (group_id, actor, type, payload)
  values (p_group_id, v_uid, 'expense_created',
          jsonb_build_object('expense_id', v_expense_id,
                             'description', btrim(p_description),
                             'amount_cents', p_amount_cents));

  return v_expense_id;
end $$;

commit;
