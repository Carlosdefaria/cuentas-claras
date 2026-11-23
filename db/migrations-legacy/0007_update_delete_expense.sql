-- 0007_update_delete_expense.sql — editar y borrar gastos (RF-06), con registro en la actividad (RF-10).
--
-- Regla de permisos (decidida por el usuario): SOLO quien añadió el gasto (expenses.created_by) puede editarlo o
-- borrarlo, y además tiene que seguir siendo miembro del grupo. Ni el admin ni el pagador, si no lo añadieron.
--
-- * app_private.check_expense_input: validaciones comunes de un gasto (importe, concepto, pagador, cuotas que suman
--   el importe, participantes miembros y sin repetir). create_expense pasa a usarla (mismo comportamiento y mensajes).
-- * public.update_expense: sustituye datos y cuotas en la misma transacción. Bloqueo optimista con el updated_at que
--   leyó el cliente: si otra edición llegó antes, error 40001 y no se pisa nada. Si no cambia nada, no escribe ni
--   registra actividad. Registra expense_updated con el antes y el después de lo que cambió.
-- * public.delete_expense: soft delete (deleted_at) y expense_deleted en la actividad. Un gasto ya borrado: no encontrado.
-- Usuario actual siempre con app_private.current_user_id() (parche de 0002/0004).
-- Aplicar SOLO en la rama `test`.

begin;

-- ---------------------------------------------------------------------------
-- Validaciones comunes (sin identidad: la comprueba quien llama)
-- ---------------------------------------------------------------------------
create function app_private.check_expense_input(
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_paid_by      uuid,
  p_shares       jsonb
) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_count int;
  v_distinct int;
  v_sum bigint;
  v_non_members int;
begin
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
end $$;

revoke execute on function app_private.check_expense_input(uuid, text, integer, uuid, jsonb) from public, anonymous, authenticated;

-- ---------------------------------------------------------------------------
-- create_expense: igual que en 0002, con las validaciones comunes
-- ---------------------------------------------------------------------------
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

  perform app_private.check_expense_input(p_group_id, p_description, p_amount_cents, p_paid_by, p_shares);

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
-- Gasto vivo que el usuario actual puede modificar (bloqueado FOR UPDATE). Errores:
--   28000 sin identidad · P0002 no existe, borrado o grupo borrado (no se distingue) ·
--   42501 no eres miembro, o no lo añadiste tú.
-- ---------------------------------------------------------------------------
create function app_private.lock_own_expense(p_expense_id uuid, p_uid uuid)
returns public.expenses
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;

revoke execute on function app_private.lock_own_expense(uuid, uuid) from public, anonymous, authenticated;

-- ---------------------------------------------------------------------------
-- RPC: editar un gasto (datos y cuotas, atómico). Devuelve el updated_at nuevo (o el mismo si no cambió nada).
--   p_expected_updated_at: el updated_at que leyó el cliente (bloqueo optimista).
-- ---------------------------------------------------------------------------
create function public.update_expense(
  p_expense_id          uuid,
  p_expected_updated_at timestamptz,
  p_description         text,
  p_amount_cents        integer,
  p_paid_by             uuid,
  p_expense_date        date,
  p_shares              jsonb
) returns timestamptz
language plpgsql volatile security definer set search_path = '' as $$
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

  perform app_private.check_expense_input(v_old.group_id, p_description, p_amount_cents, p_paid_by, p_shares);

  -- Cuotas antes y después, como {user_id: céntimos}.
  select coalesce(jsonb_object_agg(s.user_id, s.amount_cents), '{}'::jsonb) into v_old_shares
  from public.expense_shares s where s.expense_id = p_expense_id;
  select jsonb_object_agg(s.user_id, s.amount_cents) into v_new_shares
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer);

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
  if jsonb_array_length(v_added) > 0 or jsonb_array_length(v_removed) > 0 then
    v_changes := v_changes || jsonb_build_object('participants', jsonb_build_object('added', v_added, 'removed', v_removed));
  elsif v_old_shares <> v_new_shares and not v_changes ? 'amount_cents' then
    -- Mismas personas e importe, distinto reparto (posible con repartos por importes, Fase 2).
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
         updated_at = clock_timestamp()
   where id = p_expense_id
  returning updated_at into v_updated_at;

  delete from public.expense_shares where expense_id = p_expense_id;
  insert into public.expense_shares (expense_id, user_id, amount_cents)
  select p_expense_id, s.user_id, s.amount_cents
  from jsonb_to_recordset(p_shares) as s(user_id uuid, amount_cents integer);

  insert into public.activities (group_id, actor, type, payload)
  values (v_old.group_id, v_uid, 'expense_updated',
          jsonb_build_object('expense_id', p_expense_id,
                             'description', v_description,
                             'amount_cents', p_amount_cents,
                             'changes', v_changes));

  return v_updated_at;
end $$;

-- ---------------------------------------------------------------------------
-- RPC: borrar un gasto (soft delete). Los saldos dejan de contarlo al instante (se calculan sin los borrados).
-- ---------------------------------------------------------------------------
create function public.delete_expense(p_expense_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;

revoke execute on function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb) from public, anonymous;
revoke execute on function public.delete_expense(uuid) from public, anonymous;
grant execute on function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb) to authenticated;
grant execute on function public.delete_expense(uuid) to authenticated;

commit;
