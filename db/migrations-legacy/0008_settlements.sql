-- 0008_settlements.sql — registrar y borrar pagos para saldar cuentas (RF-08, RF-09).
--
-- Reglas (decididas por el usuario):
--   * Registrar un pago: solo quien paga o quien cobra (from_user o to_user = usuario actual), siendo miembro.
--   * Borrar un pago: solo quien lo registró (settlements.created_by), siendo miembro. Soft delete (deleted_at).
-- Ambas registran actividad: settlement_created / settlement_deleted (nuevo tipo: se amplía el CHECK de activities).
-- Los saldos se siguen calculando en la app (computeBalances): un pago suma a quien paga y resta a quien cobra.
-- Usuario actual siempre con app_private.current_user_id() (parche de 0002/0004).
-- Aplicar SOLO en la rama `test`.

begin;

alter table public.activities drop constraint activities_type_check;
alter table public.activities add constraint activities_type_check check (type in (
  'group_created', 'group_deleted', 'member_joined', 'member_removed',
  'expense_created', 'expense_updated', 'expense_deleted',
  'settlement_created', 'settlement_deleted'));

-- ---------------------------------------------------------------------------
-- RPC: registrar un pago. Devuelve su id.
-- ---------------------------------------------------------------------------
create function public.create_settlement(
  p_group_id     uuid,
  p_from_user    uuid,
  p_to_user      uuid,
  p_amount_cents integer,
  p_settled_on   date
) returns uuid
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;

-- ---------------------------------------------------------------------------
-- RPC: borrar un pago (soft delete). Solo quien lo registró.
-- ---------------------------------------------------------------------------
create function public.delete_settlement(p_settlement_id uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;

revoke execute on function public.create_settlement(uuid, uuid, uuid, integer, date) from public, anonymous;
revoke execute on function public.delete_settlement(uuid) from public, anonymous;
grant execute on function public.create_settlement(uuid, uuid, uuid, integer, date) to authenticated;
grant execute on function public.delete_settlement(uuid) to authenticated;

commit;
