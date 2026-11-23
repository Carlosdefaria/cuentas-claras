-- 0004_current_user_id_tx_cache.sql — completa el parche temporal de 0002 (sustituye a 0003).
--
-- 0003 intentaba restaurar request.jwt.claims con set_config, pero PostgreSQL no lo permite dentro
-- de una función SECURITY DEFINER (pg_session_jwt registra ese parámetro como protegido).
--
-- Arreglo: la primera llamada de la transacción resuelve el usuario (auth.uid() o, si la carga de
-- pg_session_jwt ha borrado el claim, el `sub` leído antes) y lo guarda en un parámetro propio
-- de la transacción, atado a ella con now() (hora de inicio de la transacción):
--     cuentas_claras.current_user_id = '<now() en microsegundos>|<uuid>'
-- Las llamadas siguientes de la MISMA transacción en las que el claim ya no está (filas 2..n de una
-- lectura con RLS) usan ese valor. Nunca se reutiliza en otra transacción (is_local + now()).
--
-- Confianza: igual que el propio claim. Solo se puede fijar con SQL directo en la transacción, cosa
-- que la Data API no permite (y quien pudiera hacerlo podría fijar también request.jwt.claims).
--
-- Mismas reglas que 0002: NULL (sin error y sin respaldo) si el rol es anonymous, si el claim está
-- mal formado o si no hay identidad. Retirar junto con 0002 cuando Neon corrija pg_session_jwt.

begin;

create or replace function app_private.current_user_id() returns uuid
language plpgsql volatile security definer set search_path = '' as $$
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
end $$;

revoke execute on function app_private.current_user_id() from public, anonymous, authenticated;

commit;
