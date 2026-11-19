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
- Verificación de email y recuperación de contraseña **por código (OTP), nunca por enlace**: en iOS la PWA
  instalada no comparte cookies con Safari, y un enlace abriría Safari.
- Serwist: estrategia **solo red** para `/api/auth/*` y la Data API. **Nunca cachear respuestas con datos de usuario.**
- Dev en HTTPS (`@vitejs/plugin-basic-ssl`): WebKit/Safari solo guarda cookies `Secure` en contexto seguro.

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
- Funciones `SECURITY DEFINER` con `search_path` fijado y comprobación explícita de `auth.uid()` (`neon_auth.user.id` es `uuid`).
- El rol `authenticated` NO tiene USAGE en el esquema `auth`: `auth.uid()` solo se puede llamar dentro de funciones SECURITY DEFINER (p. ej. `app_private.is_member`), nunca directamente en una política.
- Escrituras solo vía RPC; `authenticated` solo tiene SELECT. Tests de BD siempre con `SET ROLE authenticated`/`anonymous` (`neondb_owner` tiene BYPASSRLS).
- `invite_code`: largo y aleatorio (≥128 bits), nunca secuencial.
- Tests de RLS y migraciones de prueba: **solo contra la rama `test` de Neon, nunca production**.
  - `.env.local` → rama `production` (lo genera `neon deploy` / `neon env pull`).
  - `.env.test.local` → rama `test`. Los tests de BD leen **solo** este fichero.
  - `.neon` queda fijado en `production`; no cambiar con `neon checkout` sin `--no-env-pull`.

## Riesgos conocidos
- **Rendimiento de RLS en `expense_shares`** (migración 0002 aplazada): con 50 miembros, 5.000 gastos y
  127.125 cuotas, leer las cuotas de un grupo tarda **~179 ms con RLS** (44 ms sin RLS; límite PRD 200 ms).
  La política evalúa `is_member` fila a fila. Revisar al cargar datos reales; posible arreglo: que la
  política calcule una sola vez los grupos del usuario. Medir con `npm run db:perf`.
- **`pg_session_jwt` no está precargado** (se carga en cada conexión nueva del servidor al primer `auth.*`)
  y **al cargarse borra `request.jwt.claims`**: en la primera transacción de cada conexión nueva `auth.uid()`
  es NULL. **Confirmado con JWT real en la Data API** tras despertar la rama: la primera llamada da
  `403 No autenticado` (y las lecturas con RLS saldrían vacías); las siguientes van bien. Falla de forma
  segura pero afecta a usuarios. Arreglo propuesto (migración 0002, pendiente de aprobar): leer el claim
  antes de la primera llamada a `auth.*`. Los helpers de test cargan la extensión como owner antes de `SET ROLE`.

## Tests
- La lógica de dominio (`src/domain/`: `money.ts`, `split.ts`, `balances.ts`; después la simplificación) son funciones puras con tests Vitest (`*.test.ts` al lado).
- Tests primero: ningún cambio en esa lógica sin test que lo cubra.

## Convenciones
- UI en español; textos centralizados (preparados para i18n).
- Comandos: `npm run dev`, `npm test` (Vitest, dominio, sin red), `npm run build` (tsc + Vite), `npm run lint` (oxlint).
- BD (solo rama `test`, vía `scripts/testDb.ts`): `npm run db:migrate` (registra en `app_migrations.applied`; no se editan migraciones aplicadas, se crea una nueva), `npm run test:db` (RLS/RPC), `npm run db:perf` (50 miembros × 5.000 gastos + EXPLAIN ANALYZE).
- El contenedor cloud solo permite HTTPS: se usa el driver HTTP de Neon contra el host del endpoint de test (`NODE_USE_ENV_PROXY=1`, ya incluido en los scripts).
- CLI de Neon en el contenedor cloud: `NEON_API_KEY=proxy-injected neon …` (el proxy inyecta la key real).
- `npm run dev` sirve en `https://localhost:5173` con el proxy de Auth; en el contenedor cloud lanzarlo con
  `NODE_USE_ENV_PROXY=1` para que el proxy pueda salir a Neon Auth.
