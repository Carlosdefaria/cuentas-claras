-- 0001_init.sql — Esquema inicial de Cuentas Claras (Fase 1)
--
-- BORRADOR: no aplicado en ninguna rama. Aplicar SOLO en la rama `test`.
--
-- Modelo de seguridad:
--   * Usuarios en neon_auth."user" (Managed Better Auth). Su id es uuid.
--   * El usuario actual es auth.uid() (pg_session_jwt; uuid o NULL).
--   * RLS activado y FORZADO en todas las tablas. El rol `authenticated` solo tiene SELECT,
--     y solo sobre filas de grupos de los que es miembro. `anonymous` no tiene nada.
--   * Todas las escrituras pasan por funciones RPC SECURITY DEFINER (dueño: neondb_owner,
--     que tiene BYPASSRLS, así que pueden escribir aunque RLS esté forzado).
--   * Las funciones internas viven en app_private (la Data API solo expone `public`).
--   * Importes en céntimos enteros. Moneda única EUR.

begin;

-- ---------------------------------------------------------------------------
-- Requisitos previos (los crea la Data API al activarse)
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
end $$;

-- ---------------------------------------------------------------------------
-- Esquema privado y utilidades
-- ---------------------------------------------------------------------------
create schema app_private;
revoke all on schema app_private from public;

create extension if not exists pgcrypto with schema app_private;

-- Código de invitación: 16 bytes aleatorios (128 bits) en base64url → 22 caracteres.
create function app_private.new_invite_code() returns text
language sql volatile set search_path = '' as $$
  select translate(rtrim(encode(app_private.gen_random_bytes(16), 'base64'), '='), '+/', '-_')
$$;

-- Que nadie pueda ejecutar funciones de `public` salvo las que se concedan explícitamente.
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema app_private revoke execute on functions from public;

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
  deleted_at   timestamptz
);
create index expenses_group_id_idx on public.expenses (group_id) where deleted_at is null;

create table public.expense_shares (
  expense_id   uuid not null references public.expenses(id) on delete cascade,
  user_id      uuid not null references neon_auth."user"(id) on delete restrict,
  amount_cents integer not null check (amount_cents >= 0),
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
               'expense_created', 'expense_updated', 'expense_deleted', 'settlement_created')),
  payload    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index activities_group_id_created_at_idx on public.activities (group_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Membresía (SECURITY DEFINER: evita recursión de RLS al consultar memberships)
-- ---------------------------------------------------------------------------
create function app_private.is_member(p_group_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships m
    join public.groups g on g.id = m.group_id
    where m.group_id = p_group_id
      and m.user_id = auth.uid()
      and g.deleted_at is null
  )
$$;

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
  for select to authenticated using (app_private.is_member(id));

create policy memberships_select_members on public.memberships
  for select to authenticated using (app_private.is_member(group_id));

create policy expenses_select_members on public.expenses
  for select to authenticated using (app_private.is_member(group_id));

create policy expense_shares_select_members on public.expense_shares
  for select to authenticated using (
    exists (select 1 from public.expenses e
            where e.id = expense_id and app_private.is_member(e.group_id)));

create policy settlements_select_members on public.settlements
  for select to authenticated using (app_private.is_member(group_id));

create policy activities_select_members on public.activities
  for select to authenticated using (app_private.is_member(group_id));

-- Sin políticas de INSERT/UPDATE/DELETE: con RLS forzado, cualquier escritura directa
-- se rechaza. Además no se conceden esos privilegios (doble barrera).

-- ---------------------------------------------------------------------------
-- Miembros de mis grupos (id + nombre). No expone neon_auth."user" ni emails.
-- ---------------------------------------------------------------------------
create function app_private.group_members()
returns table (group_id uuid, user_id uuid, name text, role text, joined_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select m.group_id, m.user_id, u.name, m.role, m.joined_at
  from public.memberships m
  join neon_auth."user" u on u.id = m.user_id
  where app_private.is_member(m.group_id)
  order by m.group_id, m.joined_at
$$;

-- Envoltorio público (lo que llama la Data API: POST/GET /rpc/group_members).
create function public.group_members()
returns table (group_id uuid, user_id uuid, name text, role text, joined_at timestamptz)
language sql stable security invoker set search_path = '' as $$
  select * from app_private.group_members()
$$;

-- ---------------------------------------------------------------------------
-- RPC: crear grupo (el creador queda como admin)
-- ---------------------------------------------------------------------------
create function public.create_group(p_name text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
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

-- ---------------------------------------------------------------------------
-- RPC: unirse a un grupo con el código de invitación
-- ---------------------------------------------------------------------------
create function public.join_group(p_invite_code text) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
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

-- ---------------------------------------------------------------------------
-- RPC: crear gasto con sus cuotas (atómico)
--   p_shares: [{"user_id": "<uuid>", "amount_cents": 334}, ...]
--   created_by = auth.uid() siempre (no viene del cliente).
-- ---------------------------------------------------------------------------
create function public.create_expense(
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_paid_by      uuid,
  p_expense_date date,
  p_shares       jsonb
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_uid uuid := auth.uid();
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

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------
revoke all on all tables in schema public from public, anonymous, authenticated;
revoke execute on all functions in schema public from public, anonymous;
revoke execute on all functions in schema app_private from public, anonymous;

grant select on public.groups, public.memberships, public.expenses,
                public.expense_shares, public.settlements, public.activities
  to authenticated;

grant usage on schema app_private to authenticated;
grant execute on function app_private.is_member(uuid)   to authenticated; -- lo usan las políticas
grant execute on function app_private.group_members()   to authenticated; -- lo usa el envoltorio

grant execute on function public.group_members()                                   to authenticated;
grant execute on function public.create_group(text)                                to authenticated;
grant execute on function public.join_group(text)                                  to authenticated;
grant execute on function public.create_expense(uuid, text, integer, uuid, date, jsonb) to authenticated;

commit;
