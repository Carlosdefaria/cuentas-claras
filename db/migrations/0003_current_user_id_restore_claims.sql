-- 0003_current_user_id_restore_claims.sql — completa el parche temporal de 0002.
--
-- Fallo de 0002 (detectado por db/tests/coldStart.test.ts): en una lectura con RLS,
-- is_member() se evalúa fila a fila. La primera llamada a current_user_id() lee el claim y
-- llama a auth.uid(), que carga pg_session_jwt y BORRA request.jwt.claims; desde la segunda fila
-- el claim ya no está y current_user_id() devolvía NULL (0 filas en la primera transacción).
--
-- Arreglo: tras la primera llamada a auth.uid(), si el claim ha desaparecido, se restaura el
-- valor original con set_config(..., is_local => true), es decir, el mismo valor y alcance
-- (transacción) que fijó la Data API. Así el resto de la transacción funciona con normalidad.
--
-- Mismas reglas que 0002: NULL (sin error y sin respaldo) si el rol es anonymous, si el claim
-- está mal formado o si no hay identidad. Pasa a VOLATILE porque puede llamar a set_config.
-- Retirar junto con 0002 cuando Neon corrija pg_session_jwt.

begin;

create or replace function app_private.current_user_id() returns uuid
language plpgsql volatile security definer set search_path = '' as $$
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

  -- Si la carga de pg_session_jwt ha borrado el claim, devolverlo a su valor original
  -- (mismo alcance de transacción que usa la Data API).
  if v_raw is not null and nullif(current_setting('request.jwt.claims', true), '') is null then
    perform set_config('request.jwt.claims', v_raw, true);
  end if;

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

revoke execute on function app_private.current_user_id() from public, anonymous, authenticated;

commit;
