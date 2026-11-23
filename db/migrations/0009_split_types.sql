-- 0009_split_types.sql — repartos por importes exactos y por porcentajes (RF-05).
--
-- * expenses.split_type: 'equal' (por defecto: los gastos que ya existen), 'amounts' o 'percent'.
-- * expense_shares.percent_bp: porcentaje en puntos básicos (33,33 % = 3333); solo en repartos por porcentajes.
-- * app_private.check_expense_input recibe el tipo y valida además:
--     percent  → todas las cuotas con percent_bp, que sumen 10000, y cada cuota a menos de 1 céntimo de
--                total × bp / 10000 (no se confía en el redondeo del cliente sin comprobarlo);
--     equal / amounts → percent_bp vacío. (La suma de cuotas = importe se sigue comprobando siempre.)
-- * create_expense y update_expense se sustituyen (drop + create, para no dejar dos versiones que confundan a la Data
--   API) con p_split_type text default 'equal': un cliente que no lo mande sigue creando repartos iguales.
--   update_expense registra changes.split_type {from, to}, y «split» si cambian las cuotas o los porcentajes con las
--   mismas personas e importe. Solo quien añadió el gasto puede editarlo (app_private.lock_own_expense, de 0007).
-- Usuario actual siempre con app_private.current_user_id(). Aplicar SOLO en la rama `test`.

begin;

alter table public.expenses
  add column split_type text not null default 'equal' check (split_type in ('equal', 'amounts', 'percent'));

alter table public.expense_shares
  add column percent_bp integer check (percent_bp between 0 and 10000);

-- ---------------------------------------------------------------------------
-- Validaciones comunes, ahora con el tipo de reparto
-- ---------------------------------------------------------------------------
drop function app_private.check_expense_input(uuid, text, integer, uuid, jsonb);

create function app_private.check_expense_input(
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_paid_by      uuid,
  p_shares       jsonb,
  p_split_type   text
) returns void
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

revoke execute on function app_private.check_expense_input(uuid, text, integer, uuid, jsonb, text) from public, anonymous, authenticated;

-- ---------------------------------------------------------------------------
-- create_expense con tipo de reparto
-- ---------------------------------------------------------------------------
drop function public.create_expense(uuid, text, integer, uuid, date, jsonb);

create function public.create_expense(
  p_group_id     uuid,
  p_description  text,
  p_amount_cents integer,
  p_paid_by      uuid,
  p_expense_date date,
  p_shares       jsonb,
  p_split_type   text default 'equal'
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
end $$;

-- ---------------------------------------------------------------------------
-- update_expense con tipo de reparto
-- ---------------------------------------------------------------------------
drop function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb);

create function public.update_expense(
  p_expense_id          uuid,
  p_expected_updated_at timestamptz,
  p_description         text,
  p_amount_cents        integer,
  p_paid_by             uuid,
  p_expense_date        date,
  p_shares              jsonb,
  p_split_type          text default 'equal'
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
end $$;

revoke execute on function public.create_expense(uuid, text, integer, uuid, date, jsonb, text) from public, anonymous;
revoke execute on function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb, text) from public, anonymous;
grant execute on function public.create_expense(uuid, text, integer, uuid, date, jsonb, text) to authenticated;
grant execute on function public.update_expense(uuid, timestamptz, text, integer, uuid, date, jsonb, text) to authenticated;

commit;
