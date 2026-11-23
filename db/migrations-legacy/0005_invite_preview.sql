-- 0005_invite_preview.sql — ver a qué grupo te invitan antes de unirte.
--
-- Hasta ahora el nombre de un grupo solo lo ven sus miembros (RLS), así que quien abre un enlace de
-- invitación no sabría a qué se une. Esta RPC devuelve lo mínimo para decidir, a cambio del código:
--   * id y nombre del grupo, cuántos miembros tiene y si ya eres miembro.
--   * Nunca nombres ni emails de otros miembros, ni el código de otros grupos.
-- Solo para `authenticated` con identidad (la Data API exige JWT; sin sesión: "No autenticado").
-- Código inexistente o grupo borrado: el mismo error (no se distingue un grupo borrado de uno que no existe).
-- Usuario actual con app_private.current_user_id() (parche de 0002/0004).
-- Aplicar SOLO en la rama `test`.

begin;

create function public.invite_preview(p_invite_code text)
returns table (group_id uuid, name text, member_count integer, is_member boolean)
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

revoke execute on function public.invite_preview(text) from public, anonymous;
grant execute on function public.invite_preview(text) to authenticated;

commit;
