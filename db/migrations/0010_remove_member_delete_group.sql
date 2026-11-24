-- 0010_remove_member_delete_group.sql — quitar miembros y borrar el grupo (RF-11).
--
-- Reglas (decididas por el usuario):
--   * Solo actúa quien administra (role 'admin', activo), que no puede quitarse a sí mismo.
--   * Quitar a alguien solo si su saldo es 0; borrar el grupo solo si todos tienen saldo 0.
--   * A quien quitaron no puede volver a entrar con el enlace.
--   * Los gastos y pagos en los que participa alguien que ya no está son de solo lectura (ni editar ni borrar), para
--     que su saldo siga siendo 0.
-- La fila de memberships no se borra (removed_at): se conserva el nombre para el historial. my_group_ids() e
-- is_member() solo cuentan a los miembros activos, así que quien ya no está deja de ver el grupo (RLS).
-- Saldo en la BD (app_private.member_balance) con la misma fórmula que computeBalances en la app:
--   pagado − cuota + pagos hechos − pagos recibidos, sin contar lo borrado.
-- Errores propios (la app los traduce por código): CC001 saldo pendiente · CC002 te quitaron del grupo ·
-- CC003 gasto o pago de solo lectura (participa alguien que ya no está).
-- Usuario actual siempre con app_private.current_user_id(). Aplicar primero SOLO en la rama `test`.

begin;

alter table public.memberships add column removed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Pertenencia: solo miembros activos
-- ---------------------------------------------------------------------------
create or replace function app_private.is_member(p_group_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (
    select 1
    from public.memberships m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = app_private.current_user_id()
      and m.removed_at is null
      and g.deleted_at is null
  )
$function$;

create or replace function app_private.my_group_ids()
 returns setof uuid
 language sql
 stable security definer
 set search_path to ''
as $function$
  select m.group_id
  from public.memberships m
  join public.groups g on g.id = m.group_id
  where m.user_id = app_private.current_user_id()
    and m.removed_at is null
    and g.deleted_at is null
$function$;

-- ¿Es p_user miembro activo de p_group? (sin identidad: la comprueba quien llama)
create function app_private.is_active_member(p_group_id uuid, p_user_id uuid)
 returns boolean
 language sql
 stable security definer
 set search_path to ''
as $function$
  select exists (select 1 from public.memberships m
                 where m.group_id = p_group_id and m.user_id = p_user_id and m.removed_at is null)
$function$;

-- Miembros de mis grupos, también los que ya no están (removed_at no nulo), para poner nombre a su historial.
-- Cambia la forma de la tabla: drop + create (primero el envoltorio público, que llama a la interna).
drop function public.group_members();
drop function app_private.group_members();

create function app_private.group_members()
 returns table(group_id uuid, user_id uuid, name text, role text, joined_at timestamptz, removed_at timestamptz)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select m.group_id, m.user_id, u.name, m.role, m.joined_at, m.removed_at
  from public.memberships m
  join neon_auth."user" u on u.id = m.user_id
  where app_private.is_member(m.group_id)
  order by m.group_id, m.joined_at
$function$;

create function public.group_members()
 returns table(group_id uuid, user_id uuid, name text, role text, joined_at timestamptz, removed_at timestamptz)
 language sql
 stable
 set search_path to ''
as $function$
  select * from app_private.group_members()
$function$;

-- ---------------------------------------------------------------------------
-- Saldo de una persona en un grupo (misma fórmula que computeBalances). Sin identidad: solo la llaman RPC.
-- ---------------------------------------------------------------------------
create function app_private.member_balance(p_group_id uuid, p_user_id uuid)
 returns bigint
 language sql
 stable security definer
 set search_path to ''
as $function$
  select coalesce((select sum(e.amount_cents) from public.expenses e
                   where e.group_id = p_group_id and e.paid_by = p_user_id and e.deleted_at is null), 0)
       - coalesce((select sum(s.amount_cents) from public.expense_shares s
                   join public.expenses e on e.id = s.expense_id
                   where e.group_id = p_group_id and s.user_id = p_user_id and e.deleted_at is null), 0)
       + coalesce((select sum(x.amount_cents) from public.settlements x
                   where x.group_id = p_group_id and x.from_user = p_user_id and x.deleted_at is null), 0)
       - coalesce((select sum(x.amount_cents) from public.settlements x
                   where x.group_id = p_group_id and x.to_user = p_user_id and x.deleted_at is null), 0)
$function$;

-- Grupo vivo bloqueado (FOR UPDATE) del que el usuario actual es administrador activo. Bloquear el grupo serializa
-- con create_expense / create_settlement (FOR SHARE): ningún gasto nuevo cambia un saldo mientras se comprueba.
-- Errores: 28000 sin identidad · P0002 grupo no encontrado · 42501 no eres administrador.
create function app_private.lock_group_as_admin(p_group_id uuid, p_uid uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if p_uid is null then
    raise exception 'No autenticado' using errcode = '28000';
  end if;

  perform 1 from public.groups g
  where g.id = p_group_id and g.deleted_at is null
  for update;
  if not found then
    raise exception 'Grupo no encontrado' using errcode = 'P0002';
  end if;

  if not exists (select 1 from public.memberships m
                 where m.group_id = p_group_id and m.user_id = p_uid
                   and m.removed_at is null and m.role = 'admin') then
    raise exception 'Solo quien administra el grupo puede hacerlo' using errcode = '42501';
  end if;
end $function$;

-- ---------------------------------------------------------------------------
-- RPC: quitar a un miembro (solo con saldo 0) y registrar member_removed.
-- ---------------------------------------------------------------------------
create function public.remove_member(p_group_id uuid, p_user_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_balance bigint;
  v_name text;
begin
  perform app_private.lock_group_as_admin(p_group_id, v_uid);

  if p_user_id is null or p_user_id = v_uid then
    raise exception 'No puedes quitarte a ti mismo' using errcode = '22023';
  end if;

  perform 1 from public.memberships m
  where m.group_id = p_group_id and m.user_id = p_user_id and m.removed_at is null
  for update;
  if not found then
    raise exception 'No es miembro del grupo' using errcode = 'P0002';
  end if;

  v_balance := app_private.member_balance(p_group_id, p_user_id);
  if v_balance <> 0 then
    raise exception 'Su saldo es % céntimos: tiene que ser 0', v_balance using errcode = 'CC001';
  end if;

  update public.memberships set removed_at = clock_timestamp()
   where group_id = p_group_id and user_id = p_user_id;

  select u.name into v_name from neon_auth."user" u where u.id = p_user_id;

  insert into public.activities (group_id, actor, type, payload)
  values (p_group_id, v_uid, 'member_removed', jsonb_build_object('user_id', p_user_id, 'name', v_name));
end $function$;

-- ---------------------------------------------------------------------------
-- RPC: borrar el grupo (soft delete; solo si todos tienen saldo 0) y registrar group_deleted.
-- ---------------------------------------------------------------------------
create function public.delete_group(p_group_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_uid uuid := app_private.current_user_id();
  v_name text;
begin
  perform app_private.lock_group_as_admin(p_group_id, v_uid);

  -- Todos, también quien ya no está (su saldo es 0 porque lo suyo es de solo lectura, pero se comprueba igual).
  if exists (select 1 from public.memberships m
             where m.group_id = p_group_id and app_private.member_balance(p_group_id, m.user_id) <> 0) then
    raise exception 'Hay saldos pendientes en el grupo' using errcode = 'CC001';
  end if;

  update public.groups set deleted_at = clock_timestamp()
   where id = p_group_id
  returning name into v_name;

  insert into public.activities (group_id, actor, type, payload)
  values (p_group_id, v_uid, 'group_deleted', jsonb_build_object('name', v_name));
end $function$;

-- ---------------------------------------------------------------------------
-- Unirse: quien fue quitado no vuelve con el enlace. Vista previa: cuenta solo activos.
-- ---------------------------------------------------------------------------
create or replace function public.join_group(p_invite_code text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  if exists (select 1 from public.memberships m
             where m.group_id = v_group_id and m.user_id = v_uid and m.removed_at is not null) then
    raise exception 'Ya no formas parte de este grupo' using errcode = 'CC002';
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

create or replace function public.invite_preview(p_invite_code text)
 returns table(group_id uuid, name text, member_count integer, is_member boolean)
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

  if exists (select 1 from public.memberships m
             where m.group_id = v_group_id and m.user_id = v_uid and m.removed_at is not null) then
    raise exception 'Ya no formas parte de este grupo' using errcode = 'CC002';
  end if;

  return query
  select v_group_id,
         v_name,
         (select count(*)::integer from public.memberships m where m.group_id = v_group_id and m.removed_at is null),
         app_private.is_active_member(v_group_id, v_uid);
end $function$;

-- ---------------------------------------------------------------------------
-- Gastos y pagos: solo miembros activos; lo de quien ya no está, de solo lectura
-- ---------------------------------------------------------------------------
-- Pagador y participantes: miembros activos (un gasto nuevo o editado no puede incluir a quien ya no está).
create or replace function app_private.check_expense_input(p_group_id uuid, p_description text, p_amount_cents integer, p_paid_by uuid, p_shares jsonb, p_split_type text)
 returns void
 language plpgsql
 stable security definer
 set search_path to ''
as $function$
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

  if not app_private.is_active_member(p_group_id, p_paid_by) then
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
  left join public.memberships m on m.group_id = p_group_id and m.user_id = s.user_id and m.removed_at is null;

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

-- Gasto vivo que el usuario actual puede modificar (FOR UPDATE): quien lo añadió, siendo miembro activo, y sin nadie
-- que ya no esté (pagador o participante). Errores: 28000 · P0002 · 42501 · CC003 solo lectura.
create or replace function app_private.lock_own_expense(p_expense_id uuid, p_uid uuid)
 returns public.expenses
 language plpgsql
 security definer
 set search_path to ''
as $function$
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
  if not app_private.is_active_member(v_expense.group_id, p_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if v_expense.created_by <> p_uid then
    raise exception 'Solo quien añadió el gasto puede cambiarlo o borrarlo' using errcode = '42501';
  end if;

  if exists (select 1 from public.memberships m
             where m.group_id = v_expense.group_id and m.removed_at is not null
               and (m.user_id = v_expense.paid_by
                    or m.user_id in (select s.user_id from public.expense_shares s where s.expense_id = p_expense_id))) then
    raise exception 'En este gasto participa alguien que ya no está en el grupo' using errcode = 'CC003';
  end if;

  return v_expense;
end $function$;

create or replace function public.create_expense(p_group_id uuid, p_description text, p_amount_cents integer, p_paid_by uuid, p_expense_date date, p_shares jsonb, p_split_type text default 'equal'::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  if not app_private.is_active_member(p_group_id, v_uid) then
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

create or replace function public.create_settlement(p_group_id uuid, p_from_user uuid, p_to_user uuid, p_amount_cents integer, p_settled_on date)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  if not app_private.is_active_member(p_group_id, v_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if v_uid is distinct from p_from_user and v_uid is distinct from p_to_user then
    raise exception 'Solo quien paga o quien cobra puede registrar el pago' using errcode = '42501';
  end if;

  if p_from_user is null or p_to_user is null or p_from_user = p_to_user then
    raise exception 'Quien paga y quien cobra tienen que ser personas distintas' using errcode = '22023';
  end if;

  if not (app_private.is_active_member(p_group_id, p_from_user) and app_private.is_active_member(p_group_id, p_to_user)) then
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

create or replace function public.delete_settlement(p_settlement_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to ''
as $function$
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

  if not app_private.is_active_member(v_old.group_id, v_uid) then
    raise exception 'No eres miembro de este grupo' using errcode = '42501';
  end if;

  if v_old.created_by <> v_uid then
    raise exception 'Solo quien registró el pago puede borrarlo' using errcode = '42501';
  end if;

  if not (app_private.is_active_member(v_old.group_id, v_old.from_user) and app_private.is_active_member(v_old.group_id, v_old.to_user)) then
    raise exception 'En este pago participa alguien que ya no está en el grupo' using errcode = 'CC003';
  end if;

  update public.settlements set deleted_at = clock_timestamp() where id = p_settlement_id;

  insert into public.activities (group_id, actor, type, payload)
  values (v_old.group_id, v_uid, 'settlement_deleted',
          jsonb_build_object('settlement_id', p_settlement_id, 'from_user', v_old.from_user,
                             'to_user', v_old.to_user, 'amount_cents', v_old.amount_cents));
end $function$;

-- ---------------------------------------------------------------------------
-- Privilegios: las funciones nuevas nacen con EXECUTE para PUBLIC; se quita y se concede solo lo necesario.
-- ---------------------------------------------------------------------------
revoke execute on function app_private.is_active_member(uuid, uuid)   from public, anonymous, authenticated;
revoke execute on function app_private.member_balance(uuid, uuid)     from public, anonymous, authenticated;
revoke execute on function app_private.lock_group_as_admin(uuid, uuid) from public, anonymous, authenticated;
revoke execute on function app_private.group_members()                from public, anonymous, authenticated;
revoke execute on function public.group_members()                     from public, anonymous, authenticated;
revoke execute on function public.remove_member(uuid, uuid)           from public, anonymous, authenticated;
revoke execute on function public.delete_group(uuid)                  from public, anonymous, authenticated;

grant execute on function app_private.group_members()       to authenticated;
grant execute on function public.group_members()            to authenticated;
grant execute on function public.remove_member(uuid, uuid)  to authenticated;
grant execute on function public.delete_group(uuid)         to authenticated;

commit;
