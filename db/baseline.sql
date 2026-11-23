-- baseline.sql — Esquema completo de Cuentas Claras (línea base).
--
-- Consolida las migraciones 0001–0009 (historial en db/migrations-legacy/; 0003 fue un intento fallido y no está aquí):
-- deja una base de datos vacía exactamente como la rama `test` tras 0009. Lo aplica scripts/migrate.ts en una base
-- sin historial; en `test` (que ya tiene 0001–0009) solo se anota. Lo que venga después va en db/migrations/0010+.
-- Las funciones son copia literal de su definición en `test` (pg_get_functiondef).
--
-- Modelo de seguridad:
--   * Usuarios en neon_auth."user" (Neon Auth, Better Auth gestionado). Su id es uuid.
--   * Usuario actual SIEMPRE con app_private.current_user_id() (parche de pg_session_jwt, ver la función).
--   * RLS activado y FORZADO en todas las tablas. `authenticated` solo tiene SELECT, y solo de los grupos de los que es
--     miembro; `anonymous`, nada. Todas las escrituras van por RPC SECURITY DEFINER (dueño neondb_owner, BYPASSRLS),
--     con search_path vacío y comprobación explícita del usuario.
--   * Las funciones internas viven en app_private (la Data API solo expone `public`).
--   * Importes en céntimos enteros; porcentajes en puntos básicos. Moneda única EUR.
--
-- Requisitos: la Data API activada (roles authenticated/anonymous y pg_session_jwt: auth.uid()) y Neon Auth activado
-- (neon_auth."user"). Después de aplicarlo: refrescar la caché de esquema de la Data API.

begin;

-- ---------------------------------------------------------------------------
-- Requisitos previos
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated')
     or not exists (select 1 from pg_roles where rolname = 'anonymous') then
    raise exception 'Faltan los roles authenticated/anonymous: activa la Data API en esta rama primero';
  end if;
  if to_regprocedure('auth.uid()') is null then
    raise exception 'Falta auth.uid() (pg_session_jwt): activa la Data API en esta rama primero';
  end if;
  if to_regclass('neon_auth."user"') is null then
    raise exception 'Falta neon_auth."user": activa Neon Auth en esta rama primero';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Esquema privado y utilidades
-- ---------------------------------------------------------------------------
create schema app_private;
revoke all on schema app_private from public;

create extension if not exists pgcrypto with schema app_private;

-- Que nadie pueda ejecutar funciones nuevas salvo las que se concedan explícitamente.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app_private revoke execute on functions from public;

-- Código de invitación: 16 bytes aleatorios (128 bits) en base64url → 22 caracteres.
CREATE FUNCTION app_private.new_invite_code()
 RETURNS text
 LANGUAGE sql
 SET search_path TO ''
AS $function$
  select translate(rtrim(encode(app_private.gen_random_bytes(16), 'base64'), '='), '+/', '-_')
$function$;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(btrim(name)) between 1 and 100),
  currency    char(3) not null default 'EUR' check (currency = 'EUR'),
  invite_code text not null unique default app_private.new_invite_code()
                check (length(invite_code) >= 22),
  created_by  uuid not null references neon_auth."user"(id) on delete restrict,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

create table public.memberships (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references neon_auth."user"(id) on delete restrict,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index memberships_user_id_idx on public.memberships (user_id);

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  description  text not null check (length(btrim(description)) between 1 and 200),
  amount_cents integer not null check (amount_cents > 0),
  paid_by      uuid not null references neon_auth."user"(id) on delete restrict,
  expense_date date not null default current_date,
  created_by   uuid not null references neon_auth."user"(id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  split_type   text not null default 'equal' check (split_type in ('equal', 'amounts', 'percent'))
);
create index expenses_group_id_idx on public.expenses (group_id) where deleted_at is null;

create table public.expense_shares (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  user_id      uuid not null references neon_auth."user"(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
  percent_bp   integer check (percent_bp between 0 and 10000),
  primary key (expense_id, user_id)
);
create index expense_shares_user_id_idx on public.expense_shares (user_id);

create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups(id) on delete cascade,
  from_user    uuid not null references neon_auth."user"(id) on delete restrict,
  to_user      uuid not null references neon_auth."user"(id) on delete restrict,
  amount_cents integer not null check (amount_cents > 0),
  settled_on   date not null default current_date,
  created_by   uuid not null references neon_auth."user"(id) on delete restrict,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  check (from_user <> to_user)
);
create index settlements_group_id_idx on public.settlements (group_id) where deleted_at is null;

create table public.activities (
  id         bigint generated always as identity primary key,
  group_id   uuid not null references public.groups(id) on delete cascade,
  actor      uuid not null references neon_auth."user"(id) on delete restrict,
  type       text not null check (type in (
               'group_created', 'group_deleted', 'member_joined', 'member_removed',
               'expense_created', 'expense_updated', 'expense_deleted',
               'settlement_created', 'settlement_deleted')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activities_group_id_created_at_idx on public.activities (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Funciones (internas en app_private; RPC en public)
-- ---------------------------------------------------------------------------
-- Usuario actual. PARCHE TEMPORAL de pg_session_jwt (antes 0002 + 0004): la extensión no está precargada y, al
-- cargarse con la primera llamada a auth.* de una conexión nueva, borra request.jwt.claims; auth.uid() daba NULL en
-- la primera transacción tras despertar la rama. Esta función lee el claim ANTES de llamar a auth.uid(), usa su `sub`
-- si auth.uid() falla y lo guarda para el resto de la transacción. NULL (sin error) con rol anonymous, claim mal
-- formado o sin identidad. TODO el código obtiene el usuario de aquí, nunca de auth.* directo. Retirar (migración
-- nueva que vuelva a auth.uid()) cuando Neon lo corrija; comprobar antes con db/tests/coldStart.test.ts.
CREATE FUNCTION app_private.current_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- Leer el claim ANTES de cualquier llamada a auth.* (la carga de pg_session_jwt lo borra).
  v_raw    text := nullif(current_setting('request.jwt.claims', true), '');
  v_tx     text := (extract(epoch from now()) * 1000000)::bigint::text;
  v_cache  text := nullif(current_setting('cuentas_claras.current_user_id', true), '');
  v_claims jsonb;
  v_uid    uuid;
begin
  -- Rol de la sesión: dentro de SECURITY DEFINER current_user es el dueño, pero el GUC `role`
  -- conserva el SET ROLE de la Data API.
  if current_setting('role', true) = 'anonymous' then
    return null;
  end if;

  if v_raw is null then
    -- Sin claim: o no hay identidad, o una llamada anterior de esta transacción lo vio borrarse
    -- y dejó el usuario resuelto en la caché de la transacción.
    if v_cache is not null and split_part(v_cache, '|', 1) = v_tx then
      return split_part(v_cache, '|', 2)::uuid;
    end if;
    begin
      return auth.uid();
    exception when others then
      return null;
    end;
  end if;

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

  begin
    v_uid := auth.uid();
  exception when others then
    v_uid := null;
  end;

  -- Respaldo: el `sub` leído antes de que la carga de pg_session_jwt borrase el claim.
  if v_uid is null
     and (v_claims->>'sub') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
    v_uid := (v_claims->>'sub')::uuid;
  end if;

  -- Si la carga de pg_session_jwt acaba de borrar el claim, guardar el usuario para el resto
  -- de la transacción.
  if v_uid is not null and nullif(current_setting('request.jwt.claims', true), '') is null then
    perform set_config('cuentas_claras.current_user_id', v_tx || '|' || v_uid::text, true);
  end if;

  return v_uid;
end $function$;

-- ¿Es el usuario actual miembro de un grupo vivo? (SECURITY DEFINER: evita la recursión de RLS sobre memberships)
CREATE FUNCTION app_private.is_member(p_group_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (
    select 1
    from public.memberships m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = app_private.current_user_id()
      and g.deleted_at is null
  )
$function$;

-- Grupos vivos del usuario actual. Las políticas comparan con `group_id in (select app_private.my_group_ids())`, una
-- subconsulta no correlacionada que se calcula UNA vez por consulta (antes 0006: con is_member fila a fila, leer las
-- 127.125 cuotas de un grupo tardaba ~3,4 s; así, ~45 ms).
CREATE FUNCTION app_private.my_group_ids()
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.group_id
  from public.memberships m
  join public.groups g on g.id = m.group_id
  where m.user_id = app_private.current_user_id()
    and g.deleted_at is null
$function$;

-- Miembros de mis grupos (id, nombre, rol). No expone neon_auth."user" ni emails.
CREATE FUNCTION app_private.group_members()
 RETURNS TABLE(group_id uuid, user_id uuid, name text, role text, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select m.group_id, m.user_id, u.name, m.role, m.joined_at
  from public.memberships m
  join neon_auth."user" u on u.id = m.user_id
  where app_private.is_member(m.group_id)
  order by m.group_id, m.joined_at
$function$;

-- Envoltorio público de app_private.group_members (lo que llama la Data API: /rpc/group_members).
CREATE FUNCTION public.group_members()
 RETURNS TABLE(group_id uuid, user_id uuid, name text, role text, joined_at timestamp with time zone)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select * from app_private.group_members()
$function$;

-- Validaciones comunes de un gasto (importe, concepto, pagador, cuotas que suman el importe, participantes miembros
-- y sin repetir) y del tipo de reparto: por porcentajes, todas las cuotas con percent_bp, que sumen 10000 y cada
-- cuota a menos de 1 céntimo de total × bp / 10000; en los demás tipos, sin percent_bp. Sin identidad (la comprueba
-- quien llama).
CREATE FUNCTION app_private.check_expense_input(p_group_id uuid, p_description text, p_amount_cents integer, p_paid_by uuid, p_shares jsonb, p_split_type text)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_count int;
  v_distinct int;
  v_sum bigint;
  v_non_members int;
  v_with_bp int;
  v_sum_bp bigint;
  v_off int;
begin
  if p_split_type is null or p_split_type not in ('equal', 'amounts', 'percent') then
    raise exception 'Tipo de reparto no válido' using errcode = '22023';
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
  if exists (select 1 from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer, percent_bp integer)
             where s.user_id is null or s.amount_cents is null or s.amount_cents < 0
                or s.percent_bp < 0 or s.percent_bp > 10000) then
    raise exception 'Cuota no válida' using errcode = '22023';
  end if;

  select count(*), count(distinct s.user_id), sum(s.amount_cents),
         count(*) filter (where m.user_id is null),
         count(s.percent_bp), sum(s.percent_bp),
         count(*) filter (where s.percent_bp is not null
                            and abs(s.amount_cents::bigint * 10000 - p_amount_cents::bigint * s.percent_bp) >= 10000)
    into v_count, v_distinct, v_sum, v_non_members, v_with_bp, v_sum_bp, v_off
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer, percent_bp integer)
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

  if p_split_type = 'percent' then
    if v_with_bp <> v_count then
      raise exception 'En un reparto por porcentajes, cada cuota necesita su porcentaje' using errcode = '22023';
    end if;
    if v_sum_bp <> 10000 then
      raise exception 'Los porcentajes suman % y deberían sumar 100 %%', v_sum_bp / 100.0 using errcode = '22023';
    end if;
    if v_off > 0 then
      raise exception 'Las cuotas no corresponden a los porcentajes' using errcode = '22023';
    end if;
  elsif v_with_bp > 0 then
    raise exception 'Solo los repartos por porcentajes llevan porcentajes' using errcode = '22023';
  end if;
end $function$;

-- Gasto vivo que el usuario actual puede modificar (FOR UPDATE). Solo quien lo añadió (created_by), y siendo miembro.
-- Errores: 28000 sin identidad · P0002 no existe, borrado o grupo borrado · 42501 no miembro o no lo añadió.
CREATE FUNCTION app_private.lock_own_expense(p_expense_id uuid, p_uid uuid)
 RETURNS expenses
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_expense public.expenses;
begin
  if p_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select e.* into v_expense
  from public.expenses e
  join public.groups g on g.id = e.group_id and g.deleted_at is null
  where e.id = p_expense_id and e.deleted_at is null
  for update of e;
  if not found then
    raise exception 'Gasto no encontrado' using errcode = 'P0002';
  end if;

  -- 42501 solo revela que el id existe (un uuid aleatorio), igual que create_expense con el grupo; nunca sus datos.
  if not exists (select 1 from public.memberships m
                 where m.group_id = v_expense.group_id and m.user_id = p_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if v_expense.created_by <> p_uid then
    raise exception 'Solo quien añadió el gasto puede cambiarlo o borrarlo' using errcode = '42501';
  end if;

  return v_expense;
end $function$;

-- RPC: crear grupo (quien lo crea queda como admin) y registrar group_created.
CREATE FUNCTION public.create_group(p_name text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

-- RPC: unirse con el código de invitación (idempotente; member_joined solo la primera vez).
CREATE FUNCTION public.join_group(p_invite_code text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
end $function$;

-- RPC: ver a qué grupo te invitan antes de unirte: id, nombre, cuántos miembros y si ya eres miembro. Nunca nombres
-- ni emails de otros. Código inexistente o grupo borrado: el mismo error.
CREATE FUNCTION public.invite_preview(p_invite_code text)
 RETURNS TABLE(group_id uuid, name text, member_count integer, is_member boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_group_id uuid;
  v_name text;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select g.id, g.name into v_group_id, v_name
  from public.groups g
  where g.invite_code = p_invite_code and g.deleted_at is null;

  if v_group_id is null then
    raise exception 'Código de invitación no válido' using errcode = 'P0002';
  end if;

  return query
  select v_group_id,
         v_name,
         (select count(*)::integer from public.memberships m where m.group_id = v_group_id),
         exists (select 1 from public.memberships m where m.group_id = v_group_id and m.user_id = v_uid);
end $function$;

-- RPC: crear gasto con sus cuotas (atómico). created_by = usuario actual. p_split_type por defecto 'equal'.
--   p_shares: [{"user_id": "<uuid>", "amount_cents": 334, "percent_bp": 3333?}, ...]
CREATE FUNCTION public.create_expense(p_group_id uuid, p_description text, p_amount_cents integer, p_paid_by uuid, p_expense_date date, p_shares jsonb, p_split_type text DEFAULT 'equal'::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_expense_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

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

  perform app_private.check_expense_input(p_group_id, p_description, p_amount_cents, p_paid_by, p_shares, p_split_type);

  insert into public.expenses (group_id, description, amount_cents, paid_by, expense_date, created_by, split_type)
  values (p_group_id, btrim(p_description), p_amount_cents, p_paid_by,
          coalesce(p_expense_date, current_date), v_uid, p_split_type)
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, amount_cents, percent_bp)
  select v_expense_id, s.user_id, s.amount_cents, s.percent_bp
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer, percent_bp integer);

  insert into public.activities (group_id, actor, type, payload)
  values (p_group_id, v_uid, 'expense_created',
          jsonb_build_object('expense_id', v_expense_id,
                             'description', btrim(p_description),
                             'amount_cents', p_amount_cents));

  return v_expense_id;
end $function$;

-- RPC: editar un gasto (solo quien lo añadió): sustituye datos y cuotas en la misma transacción. Bloqueo optimista con
-- el updated_at que leyó el cliente (40001 si cambió). Sin cambios no escribe. Registra expense_updated con el antes y
-- el después (changes: amount_cents, description, paid_by, expense_date, split_type, participants o split).
CREATE FUNCTION public.update_expense(p_expense_id uuid, p_expected_updated_at timestamp with time zone, p_description text, p_amount_cents integer, p_paid_by uuid, p_expense_date date, p_shares jsonb, p_split_type text DEFAULT 'equal'::text)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_old public.expenses;
  v_description text := btrim(p_description);
  v_date date := coalesce(p_expense_date, current_date);
  v_old_shares jsonb;
  v_new_shares jsonb;
  v_added jsonb;
  v_removed jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_updated_at timestamptz;
begin
  v_old := app_private.lock_own_expense(p_expense_id, v_uid);

  perform 1 from public.groups g where g.id = v_old.group_id for share;

  if p_expected_updated_at is null or v_old.updated_at <> p_expected_updated_at then
    raise exception 'El gasto ha cambiado desde que lo abriste' using errcode = '40001';
  end if;

  perform app_private.check_expense_input(v_old.group_id, p_description, p_amount_cents, p_paid_by, p_shares, p_split_type);

  -- Cuotas antes y después, como {user_id: [céntimos, puntos básicos]}.
  select coalesce(jsonb_object_agg(s.user_id, jsonb_build_array(s.amount_cents, s.percent_bp)), '{}'::jsonb) into v_old_shares
  from public.expense_shares s where s.expense_id = p_expense_id;
  select jsonb_object_agg(s.user_id, jsonb_build_array(s.amount_cents, s.percent_bp)) into v_new_shares
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer, percent_bp integer);

  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_added
  from jsonb_object_keys(v_new_shares) k where not v_old_shares ? k;
  select coalesce(jsonb_agg(k order by k), '[]'::jsonb) into v_removed
  from jsonb_object_keys(v_old_shares) k where not v_new_shares ? k;

  if v_old.amount_cents <> p_amount_cents then
    v_changes := v_changes || jsonb_build_object('amount_cents', jsonb_build_object('from', v_old.amount_cents, 'to', p_amount_cents));
  end if;
  if v_old.description <> v_description then
    v_changes := v_changes || jsonb_build_object('description', jsonb_build_object('from', v_old.description, 'to', v_description));
  end if;
  if v_old.paid_by <> p_paid_by then
    v_changes := v_changes || jsonb_build_object('paid_by', jsonb_build_object('from', v_old.paid_by, 'to', p_paid_by));
  end if;
  if v_old.expense_date <> v_date then
    v_changes := v_changes || jsonb_build_object('expense_date', jsonb_build_object('from', v_old.expense_date, 'to', v_date));
  end if;
  if v_old.split_type <> p_split_type then
    v_changes := v_changes || jsonb_build_object('split_type', jsonb_build_object('from', v_old.split_type, 'to', p_split_type));
  end if;
  if jsonb_array_length(v_added) > 0 or jsonb_array_length(v_removed) > 0 then
    v_changes := v_changes || jsonb_build_object('participants', jsonb_build_object('added', v_added, 'removed', v_removed));
  elsif v_old_shares <> v_new_shares and not v_changes ? 'amount_cents' then
    -- Mismas personas e importe, distinto reparto (otros importes u otros porcentajes).
    v_changes := v_changes || jsonb_build_object('split', true);
  end if;

  if v_changes = '{}'::jsonb then
    return v_old.updated_at; -- nada que guardar ni que registrar
  end if;

  update public.expenses
     set description = v_description,
         amount_cents = p_amount_cents,
         paid_by = p_paid_by,
         expense_date = v_date,
         split_type = p_split_type,
         updated_at = clock_timestamp()
   where id = p_expense_id
  returning updated_at into v_updated_at;

  delete from public.expense_shares where expense_id = p_expense_id;
  insert into public.expense_shares (expense_id, user_id, amount_cents, percent_bp)
  select p_expense_id, s.user_id, s.amount_cents, s.percent_bp
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer, percent_bp integer);

  insert into public.activities (group_id, actor, type, payload)
  values (v_old.group_id, v_uid, 'expense_updated',
          jsonb_build_object('expense_id', p_expense_id,
                             'description', v_description,
                             'amount_cents', p_amount_cents,
                             'changes', v_changes));

  return v_updated_at;
end $function$;

-- RPC: borrar un gasto (soft delete; solo quien lo añadió) y registrar expense_deleted.
CREATE FUNCTION public.delete_expense(p_expense_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_old public.expenses;
begin
  v_old := app_private.lock_own_expense(p_expense_id, v_uid);

  update public.expenses
     set deleted_at = clock_timestamp(), updated_at = clock_timestamp()
   where id = p_expense_id;

  insert into public.activities (group_id, actor, type, payload)
  values (v_old.group_id, v_uid, 'expense_deleted',
          jsonb_build_object('expense_id', p_expense_id,
                             'description', v_old.description,
                             'amount_cents', v_old.amount_cents,
                             'paid_by', v_old.paid_by));
end $function$;

-- RPC: registrar un pago para saldar cuentas. Solo quien paga o quien cobra; ambos miembros y distintos; importe entre
-- 1 céntimo y 1.000.000,00 €. Registra settlement_created.
CREATE FUNCTION public.create_settlement(p_group_id uuid, p_from_user uuid, p_to_user uuid, p_amount_cents integer, p_settled_on date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

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

  if v_uid is distinct from p_from_user and v_uid is distinct from p_to_user then
    raise exception 'Solo quien paga o quien cobra puede registrar el pago' using errcode = '42501';
  end if;

  if p_from_user is null or p_to_user is null or p_from_user = p_to_user then
    raise exception 'Quien paga y quien cobra tienen que ser personas distintas' using errcode = '22023';
  end if;

  if (select count(*) from public.memberships m
      where m.group_id = p_group_id and m.user_id in (p_from_user, p_to_user)) <> 2 then
    raise exception 'Quien paga y quien cobra tienen que ser miembros del grupo' using errcode = '22023';
  end if;

  -- Mismo tope que un gasto: 1.000.000,00 €.
  if p_amount_cents is null or p_amount_cents <= 0 or p_amount_cents > 100000000 then
    raise exception 'Importe no válido' using errcode = '22023';
  end if;

  insert into public.settlements (group_id, from_user, to_user, amount_cents, settled_on, created_by)
  values (p_group_id, p_from_user, p_to_user, p_amount_cents, coalesce(p_settled_on, current_date), v_uid)
  returning id into v_id;

  insert into public.activities (group_id, actor, type, payload)
  values (p_group_id, v_uid, 'settlement_created',
          jsonb_build_object('settlement_id', v_id, 'from_user', p_from_user, 'to_user', p_to_user,
                             'amount_cents', p_amount_cents));

  return v_id;
end $function$;

-- RPC: borrar un pago (soft delete; solo quien lo registró) y registrar settlement_deleted.
CREATE FUNCTION public.delete_settlement(p_settlement_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_old public.settlements;
begin
  if v_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  select s.* into v_old
  from public.settlements s
  join public.groups g on g.id = s.group_id and g.deleted_at is null
  where s.id = p_settlement_id and s.deleted_at is null
  for update of s;
  if not found then
    raise exception 'Pago no encontrado' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.memberships m
                 where m.group_id = v_old.group_id and m.user_id = v_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if v_old.created_by <> v_uid then
    raise exception 'Solo quien registró el pago puede borrarlo' using errcode = '42501';
  end if;

  update public.settlements set deleted_at = clock_timestamp() where id = p_settlement_id;

  insert into public.activities (group_id, actor, type, payload)
  values (v_old.group_id, v_uid, 'settlement_deleted',
          jsonb_build_object('settlement_id', p_settlement_id, 'from_user', v_old.from_user,
                             'to_user', v_old.to_user, 'amount_cents', v_old.amount_cents));
end $function$;

-- ---------------------------------------------------------------------------
-- RLS: activado y forzado en todas las tablas; solo lectura para miembros
-- ---------------------------------------------------------------------------
alter table public.groups         enable row level security;
alter table public.memberships    enable row level security;
alter table public.expenses       enable row level security;
alter table public.expense_shares enable row level security;
alter table public.settlements    enable row level security;
alter table public.activities     enable row level security;

alter table public.groups         force row level security;
alter table public.memberships    force row level security;
alter table public.expenses       force row level security;
alter table public.expense_shares force row level security;
alter table public.settlements    force row level security;
alter table public.activities     force row level security;

create policy groups_select_members on public.groups
  for select to authenticated using (id in (select app_private.my_group_ids()));

create policy memberships_select_members on public.memberships
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

create policy expenses_select_members on public.expenses
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

-- Las cuotas no llevan group_id: se comprueba por su gasto, con el mismo filtro de grupo.
create policy expense_shares_select_members on public.expense_shares
  for select to authenticated using (
    expense_id in (select e.id from public.expenses e where e.group_id in (select app_private.my_group_ids())));

create policy settlements_select_members on public.settlements
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

create policy activities_select_members on public.activities
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

-- Sin políticas de INSERT/UPDATE/DELETE: con RLS forzado, cualquier escritura directa se rechaza. Además no se
-- conceden esos privilegios (doble barrera).

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anonymous, authenticated;
revoke execute on all functions in schema public from public, anonymous, authenticated;
revoke execute on all functions in schema app_private from public, anonymous, authenticated;

grant select on public.groups, public.memberships, public.expenses,
                public.expense_shares, public.settlements, public.activities
  to authenticated;

grant usage on schema app_private to authenticated;
-- Internas que necesita `authenticated`: las usan las políticas (my_group_ids) y los envoltorios (group_members).
grant execute on function app_private.is_member(uuid)    to authenticated;
grant execute on function app_private.my_group_ids()     to authenticated;
grant execute on function app_private.group_members()    to authenticated;

grant execute on function public.group_members()                                                         to authenticated;
grant execute on function public.create_group(text)                                                      to authenticated;
grant execute on function public.join_group(text)                                                        to authenticated;
grant execute on function public.invite_preview(text)                                                    to authenticated;
grant execute on function public.create_expense(uuid, text, integer, uuid, date, jsonb, text)             to authenticated;
grant execute on function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb, text) to authenticated;
grant execute on function public.delete_expense(uuid)                                                     to authenticated;
grant execute on function public.create_settlement(uuid, uuid, uuid, integer, date)                       to authenticated;
grant execute on function public.delete_settlement(uuid)                                                  to authenticated;

commit;
