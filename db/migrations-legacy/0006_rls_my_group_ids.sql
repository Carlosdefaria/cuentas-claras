-- 0006_rls_my_group_ids.sql — RLS que calcula UNA vez los grupos del usuario (rendimiento).
--
-- Problema (npm run db:perf, 50 miembros × 5.000 gastos, 127.125 cuotas): leer las cuotas de un grupo tardaba
-- ~3,4 s con RLS. Las políticas llamaban a app_private.is_member(...) por cada fila, y is_member llama a
-- app_private.current_user_id() (parche de 0002/0004: plpgsql, volatile), así que la identidad se resolvía
-- cientos de miles de veces por consulta.
--
-- Arreglo: app_private.my_group_ids() devuelve los grupos (vivos) del usuario actual, y las políticas comparan
-- con una subconsulta NO correlacionada — `group_id in (select app_private.my_group_ids())` — que Postgres ejecuta
-- una sola vez por consulta (subplan con hash). La regla de acceso no cambia: solo miembros de grupos no borrados,
-- usuario siempre de current_user_id(), NULL → ningún grupo.
-- Aplicar SOLO en la rama `test`.

begin;

create function app_private.my_group_ids() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.group_id
  from public.memberships m
  join public.groups g on g.id = m.group_id
  where m.user_id = app_private.current_user_id()
    and g.deleted_at is null
$$;

revoke execute on function app_private.my_group_ids() from public, anonymous;
grant execute on function app_private.my_group_ids() to authenticated; -- lo usan las políticas

drop policy groups_select_members on public.groups;
create policy groups_select_members on public.groups
  for select to authenticated using (id in (select app_private.my_group_ids()));

drop policy memberships_select_members on public.memberships;
create policy memberships_select_members on public.memberships
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

drop policy expenses_select_members on public.expenses;
create policy expenses_select_members on public.expenses
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

-- Las cuotas no llevan group_id: se comprueba por su gasto, con el mismo filtro de grupo (la política de expenses
-- también se aplica a esa subconsulta; es la misma regla).
drop policy expense_shares_select_members on public.expense_shares;
create policy expense_shares_select_members on public.expense_shares
  for select to authenticated using (
    expense_id in (select e.id from public.expenses e where e.group_id in (select app_private.my_group_ids())));

drop policy settlements_select_members on public.settlements;
create policy settlements_select_members on public.settlements
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

drop policy activities_select_members on public.activities;
create policy activities_select_members on public.activities
  for select to authenticated using (group_id in (select app_private.my_group_ids()));

commit;
