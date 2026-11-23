# CLAUDE.md – Cuentas Claras

App web de gastos compartidos (tipo Splitwise). Requisitos completos en `docs/PRD.md`.
Se construye por fases (PRD §11). Plan de trabajo: Fase 1 = auth, grupos, gastos con reparto igual, saldos.

## Stack (decidido)
- **Frontend:** React + Vite + TypeScript + Tailwind. Mobile-first.
- **Backend / BD:** Neon — Postgres + Neon Auth (Better Auth gestionado), login por email.
- **Acceso a datos:** Data API de Neon (PostgREST) con JWT de Neon Auth + **RLS** en todas las tablas.
  Las operaciones de varias tablas (p. ej. gasto + repartos) van en funciones SQL (RPC) atómicas.
- **Tests:** Vitest. **Despliegue:** Vercel.

## Dinero (no negociable)
- Importes siempre en **céntimos enteros** (`integer` en BD, entero en TS). Nunca floats ni `numeric` con decimales.
- Moneda única **EUR** en el MVP. La columna `currency` existe pero siempre vale `'EUR'`.
- Formatear a euros solo en la UI: `Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' })`.

## Reglas de saldo (PRD §6)
- Saldo = pagado − cuota + pagos **realizados** − pagos **recibidos**. Positivo = le deben.
  (El PRD §6 tiene los signos de los pagos al revés; esta es la versión correcta: pagar reduce tu deuda.)
- La suma de saldos de un grupo es siempre 0. Los saldos **no se almacenan**: se calculan.
- Reparto igual: los céntimos sobrantes se reparten 1 a 1 por orden ascendente de `user_id` (determinista).
- Simplificación de deudas (Fase 2): voraz, mayor deudor ↔ mayor acreedor, ≤ n−1 pagos.
- Borrado de gastos = soft delete (`deleted_at`).

## UI y PWA
### Producto
- Se usa como app real: **PWA instalable** en la pantalla de inicio del móvil, en modo `standalone`.
- Mobile-first: pantalla estrecha, uso con una mano, zonas táctiles de **≥ 44 px**.
- Interfaz en español; euros con **números tabulares** (`font-variant-numeric: tabular-nums`, `tabular-nums` en Tailwind).
- Cada pantalla tiene estados de **carga, vacío y error**.

### Navegación
- Barra inferior para las secciones principales y **botón de volver siempre visible** (iOS standalone no tiene gesto de volver).
- Respetar safe-area con `env(safe-area-inset-*)` y `viewport-fit=cover`.
- Inputs con fuente **≥ 16 px** (evita el zoom automático de iOS). No desactivar el zoom del navegador.

### PWA (adaptado a Vite: no hay `app/manifest.ts` de Next.js)
- Manifest con `display: standalone`, `name`, `short_name`, `theme_color`, `background_color`.
- Iconos 192×192 y 512×512, uno `maskable` (Android) y `apple-touch-icon` (iOS).
- Service worker con **Serwist** (plugin de Vite). Sin él, Android no ofrece instalar.
- `<meta name="theme-color">` y metas de Apple (`apple-mobile-web-app-capable`, título, estilo de barra).
- iOS no tiene `beforeinstallprompt`: mostrar ayuda "Compartir → Añadir a pantalla de inicio".
- Probar la instalación en móviles reales (iOS y Android), no solo en escritorio.

### Sesión first-party (iOS) y service worker
- El navegador solo habla con `/api/auth/*` de nuestro dominio: proxy same-origin (`server/authProxy.ts`, sobre
  `handleAuthProxyRequest` de `@neon/auth/server`). En Vercel lo sirve `api/auth.ts`; en local, el plugin de Vite.
  Destino **fijo por variable de entorno** (`NEON_AUTH_BASE_URL`), solo GET/POST, rutas validadas, ≤ 64 KB, `no-store`.
  Nada de proxy abierto. `NEON_AUTH_COOKIE_SECRET` es secreto de servidor (≥ 32 caracteres).
- El cliente de Auth apunta a `${origin}/api/auth`. El JWT para la Data API sale de `getSession()` (`session.token`);
  por eso el proxy pide `get-session` con `disableCookieCache=true` (la caché del SDK responde sin JWT).
- El SDK lanza excepciones en los errores de Auth (p. ej. `invalid_credentials`): capturarlas en la UI.
- **Dominios de confianza de Neon Auth:** cada rama nueva tiene otra dirección de Preview en Vercel
  (`cuentas-claras-git-<rama>-…-sistema-reservas.vercel.app`) y hay que añadirla a los dominios de confianza de Neon Auth
  de `test` (consola: rama test → Auth → Configuration → Trusted domains). Si no, Neon Auth responde `403 INVALID_ORIGIN`
  y la app muestra «Esta dirección de la app no está autorizada…». Production tendrá solo su dominio propio.
- Verificación de email y recuperación de contraseña **por código (OTP), nunca por enlace**: en iOS la PWA
  instalada no comparte cookies con Safari, y un enlace abriría Safari.
- Códigos por email: `src/lib/otp.ts` (el SDK registra el plugin email OTP pero no lo tipa). Neon Auth de `test`:
  `require_email_verification`, envío al registrarse y al entrar sin verificar, `auto_sign_in_after_verification`,
  `revoke_sessions_on_password_reset` y sin Google OAuth. **Production tendrá que configurarse igual** (con autorización).
  Pantallas: `/verificar`, `/recuperar`, `/recuperar/codigo` (dos pasos). Registrarse con un email que ya existe no
  da error (no se revela qué emails existen): lleva a «Confirma tu email» con «¿Ya tenías cuenta…? Entra».
  En e2e el código se fija con `e2e/otp.ts` (Neon Auth guarda el hash SHA-256 base64url, «hash:intentos»).
- Serwist: estrategia **solo red** para `/api/auth/*` y la Data API. **Nunca cachear respuestas con datos de usuario.**
  Implementado en `src/sw/` (`routes.ts` puro con tests; `sw.ts` con su `tsconfig.sw.json`): precaché solo del armazón
  del build, navegaciones con `index.html` precacheado (excepto `/api`), y versión nueva tras pulsar «Actualizar»
  (`skipWaiting: false`). El SW no existe en `npm run dev`: se prueba con el build (`vite preview`, también con el proxy).
- Icono: fuente en `design/icon/*.svg`; los PNG de `public/` se regeneran con `npm run icons` (no editarlos a mano).
- Dev en HTTPS (`@vitejs/plugin-basic-ssl`): WebKit/Safari solo guarda cookies `Secure` en contexto seguro.

### Grupos e invitaciones
- Datos: `src/lib/dataApi.ts` (PostgREST con el JWT de `getSession()`, **solo en memoria** hasta 60 s antes de `exp`;
  un 401 pide JWT nuevo y reintenta una vez; errores → `DataApiError.kind`, textos en `src/lib/dataErrors.ts`).
  Instancia en `src/lib/data.ts`; el JWT se olvida al cerrar sesión o cambiar de usuario. Consultas en `src/lib/groups.ts`.
- La Data API **exige JWT** (sin token: `401 PGRST302`, aunque exista el rol `anonymous`): sin sesión no se puede leer
  nada, ni siquiera el nombre del grupo de una invitación.
- Enlace: `https://<origen>/unirse/<invite_code>` (`src/lib/invite.ts`). `/unirse/:code` es pública: sin sesión ofrece
  registrarse o entrar con `?redirectTo=/unirse/<code>` (sobrevive a registro → verificación → entrar); con sesión,
  `invite_preview` (migración 0005) y un toque en «Unirme» (`join_group`); si ya es miembro, al grupo.
- iOS: la app instalada arranca en `/` y no comparte sesión con Safari. Con una invitación pendiente no se muestra la
  ayuda de instalación en Entrar/Registro; se une en Safari y después se ofrece instalar. En la app, «Unirme con un
  enlace» (`/unirse`) acepta el enlace o el código pegados. No se guarda el código en almacenamiento local.
- Los e2e que crean grupos borran **primero los grupos** y luego los usuarios (las FK de `created_by` lo exigen).

### Gastos y saldos
- Formulario: `src/domain/expenseForm.ts` (`validateExpense`, `sharesFor` = `splitEqual`, `remainderRecipients`; tope
  1.000.000,00 €; `draftFromExpense` e `isUnchanged` para editar). Se guarda con la RPC `create_expense` (atómica, valida
  miembros y suma). El mismo formulario edita (`/grupos/:id/gastos/:expenseId/editar`, `EditExpense`).
- Editar y borrar (migración 0007): **solo quien añadió el gasto** (`expenses.created_by`), ni el admin ni el pagador.
  RPC `update_expense` (sustituye cuotas en la misma transacción; bloqueo optimista con el `updated_at` leído → `40001`,
  `DataApiError.kind = 'conflict'`; sin cambios no escribe) y `delete_expense` (soft delete). Ambas registran
  `expense_updated` (con `changes` antes/después) / `expense_deleted` en `activities`. Validaciones comunes en
  `app_private.check_expense_input` (también las usa `create_expense`).
- Actividad (RF-10): pestaña «Actividad» (`?seccion=actividad`), `listActivity` (filtrada por grupo, `order=id.desc`,
  páginas de 50 con cursor `id=lt.`) y `parseActivity` (`src/domain/activity.ts`, defensiva: lo que no entiende se omite).
- Saldos **solo** con `computeBalances` (`src/lib/expenses.ts`: `balancesOf`, `myBalancesByGroup`); pagos (settlements)
  ya cuentan aunque aún no haya UI para crearlos.
- Lecturas de `expenses`/`settlements` **siempre con filtro de grupo** (`group_id=eq.` / `in.(…)`): sin él, RLS recorre
  la tabla entera (en `test` hay 5.000 gastos sintéticos de `db:perf`) y la lista de grupos tardaba segundos.
- Fechas de gasto en fecha local (`src/lib/dates.ts`); etiquetas «Hoy · 22 nov», «Ayer · 21 nov».

### Prioridad de plataforma
- **iOS primero** (Safari y PWA instalada). Android, más adelante.
- Pruebas automáticas de navegador en **WebKit y Chromium**.

### Skills de diseño
- `impeccable`: base de diseño. `/impeccable init` al empezar (con el PRD como contexto); `polish` y `critique` al terminar cada pantalla.
- `web-design-guidelines`: solo como auditoría antes de cada merge.
- No cargar otras skills de diseño a la vez.
- Instaladas en `.claude/skills/` (versiones fijadas en `skills-lock.json`). De `impeccable` se usa la variante para
  Claude Code del repo (`.claude/skills/impeccable` del commit `b49177d`), no la genérica `.agents/` que copia
  `npx skills add` (apunta a rutas `.agents/` y no es invocable con `/impeccable`). Si se actualiza, repetir ese cambio.

## Alcance del MVP
Respetar la tabla Dentro/Fuera del PRD §4. Nada de lo marcado "Fuera (v2+)" sin pedirlo
(login social, multidivisa, recurrentes, OCR, pagos integrados, invitados sin cuenta, push, exportar).

## Seguridad
- **El repo es público: nunca subir credenciales.** Secretos solo en `.env.local` (ignorado). Plantilla en `.env.example`.
- RLS activado desde el primer día en **todas** las tablas (incluidas `settlements` y `activities`); acceso solo a miembros del grupo.
- Funciones `SECURITY DEFINER` con `search_path` fijado y comprobación explícita del usuario (`neon_auth.user.id` es `uuid`).
- El usuario actual se obtiene **siempre con `app_private.current_user_id()`**, nunca con `auth.*` directo (ver el parche en Riesgos conocidos). El rol `authenticated` no tiene USAGE en el esquema `auth` y no puede ejecutar `current_user_id()`: solo la llaman funciones SECURITY DEFINER (p. ej. `app_private.is_member`).
- Escrituras solo vía RPC; `authenticated` solo tiene SELECT. Tests de BD siempre con `SET ROLE authenticated`/`anonymous` (`neondb_owner` tiene BYPASSRLS).
- `invite_code`: largo y aleatorio (≥128 bits), nunca secuencial.
- Tests de RLS y migraciones de prueba: **solo contra la rama `test` de Neon, nunca production**.
  - `.env.local` → rama `production` (lo genera `neon deploy` / `neon env pull`).
  - `.env.test.local` → rama `test`. Los tests de BD leen **solo** este fichero.
  - `.neon` queda fijado en `production`; no cambiar con `neon checkout` sin `--no-env-pull`.

## Antes de tocar production
- **No se aplica ninguna migración en production tal cual.** Antes, las migraciones 0001–0004 (y las posteriores: 0005, 0006, 0007…) se consolidarán en
  una **línea base limpia** (sin el intento fallido 0003 y con el parche de `current_user_id()` ya integrado),
  que se probará en una **rama nueva creada desde production** (`npm run test:db` completo, incluido el test en
  frío) y cuyo esquema se comparará con el de `test` (`neon branches schema-diff` o equivalente) antes de aplicarla.
- Production no se toca (ni `neon deploy`, ni migraciones, ni dominios de Auth) sin autorización explícita.

## Riesgos conocidos
- **Rendimiento de RLS** (resuelto en la migración 0006, solo en `test`): con el parche de `current_user_id()` las
  políticas resolvían la identidad fila a fila y leer las 127.125 cuotas de un grupo (50 miembros, 5.000 gastos)
  tardaba **~3,4 s**. Ahora las políticas usan `group_id in (select app_private.my_group_ids())`, que se calcula una
  vez por consulta: **~45 ms** (límite PRD 200 ms). Medir con `npm run db:perf` tras tocar políticas.
- **PARCHE TEMPORAL `pg_session_jwt` (migraciones 0002 + 0004; 0003 fue un intento fallido, ya sustituido).**
  La extensión no está precargada: se carga en cada conexión nueva del servidor con la primera llamada a `auth.*`
  y **al cargarse borra `request.jwt.claims`**, así que `auth.uid()` era NULL en la primera transacción de cada
  conexión nueva. Confirmado con JWT real por la Data API tras despertar la rama (`403 No autenticado` y lecturas
  vacías). El parche es `app_private.current_user_id()`: lee el claim antes de llamar a `auth.uid()`, usa su `sub`
  si `auth.uid()` falla y lo guarda para el resto de la transacción (`cuentas_claras.current_user_id`, atado a `now()`).
  Devuelve NULL sin error si el rol es `anonymous`, el claim está mal formado o no hay identidad.
  Cubierto por `db/tests/currentUserId.test.ts` y `db/tests/coldStart.test.ts` (suspende la rama `test`;
  `NEON_API_KEY=proxy-injected npm run test:db`). **Retirar (migración nueva que vuelva a `auth.uid()`) cuando
  Neon lo corrija**, y comprobar antes con `coldStart.test.ts` sin el parche.

- **Límite de peticiones de Neon Auth detrás del proxy.** Neon Auth devuelve 429 en los endpoints de código si hay
  muchas peticiones seguidas (la suite e2e completa lo alcanza; 8 seguidas no, así que el umbral exacto no se ha
  medido). `handleAuthProxyRequest` del SDK **no reenvía la IP del cliente** (`X-Forwarded-For`): si el límite es
  por IP, en Vercel todos los usuarios compartirían la de la función. Con grupos pequeños es poco probable, pero
  varios invitados registrándose a la vez podrían ver «Demasiados intentos». Revisar con Neon antes de production.
  Los e2e lo esquivan esperando la ventana (`retryIfRateLimited`).

## Tests
- La lógica de dominio (`src/domain/`: `money.ts`, `split.ts`, `balances.ts`; después la simplificación) son funciones puras con tests Vitest (`*.test.ts` al lado).
- Tests primero: ningún cambio en esa lógica sin test que lo cubra.

## Convenciones
- UI en español; textos centralizados (preparados para i18n).
- Comandos: `npm run dev`, `npm test` (Vitest, dominio, sin red), `npm run build` (tsc + Vite), `npm run lint` (oxlint).
- BD (solo rama `test`, vía `scripts/testDb.ts`): `npm run db:migrate` (registra en `app_migrations.applied`; no se editan migraciones aplicadas, se crea una nueva), `npm run test:db` (RLS/RPC), `npm run db:perf` (50 miembros × 5.000 gastos + EXPLAIN ANALYZE).
- El contenedor cloud solo permite HTTPS: se usa el driver HTTP de Neon contra el host del endpoint de test (`NODE_USE_ENV_PROXY=1`, ya incluido en los scripts).
- CLI de Neon en el contenedor cloud: `NEON_API_KEY=proxy-injected neon …` (el proxy inyecta la key real).
- **Tras una migración que cree o cambie funciones/tablas expuestas**, refrescar la caché de esquema de la Data API de
  `test` o PostgREST responde `404 PGRST202` (la app muestra «Algo ha fallado»):
  `NEON_API_KEY=proxy-injected NODE_USE_ENV_PROXY=1 neon data-api refresh-schema --branch test --database neondb`
  (`NOTIFY pgrst` no llega a la Data API de Neon).
- `npm run test:e2e` levanta `npm run dev` (5173) y el build con `vite preview` (4173, pruebas `e2e/pwa.spec.ts`).
  Chromium necesita `--ignore-certificate-errors` para registrar el SW con el certificado autofirmado (ya en la config).
- `npm run dev` sirve en `https://localhost:5173` con el proxy de Auth; en el contenedor cloud lanzarlo con
  `NODE_USE_ENV_PROXY=1` para que el proxy pueda salir a Neon Auth.
