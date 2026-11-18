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

## Tests
- La lógica de dominio (`src/domain/`: `money.ts`, `split.ts`, `balances.ts`; después la simplificación) son funciones puras con tests Vitest (`*.test.ts` al lado).
- Tests primero: ningún cambio en esa lógica sin test que lo cubra.

## Convenciones
- UI en español; textos centralizados (preparados para i18n).
- Comandos: `npm run dev`, `npm test` (Vitest, dominio, sin red), `npm run build` (tsc + Vite), `npm run lint` (oxlint).
- BD (solo rama `test`, vía `scripts/testDb.ts`): `npm run db:migrate` (registra en `app_migrations.applied`; no se editan migraciones aplicadas, se crea una nueva), `npm run test:db` (RLS/RPC), `npm run db:perf` (50 miembros × 5.000 gastos + EXPLAIN ANALYZE).
- El contenedor cloud solo permite HTTPS: se usa el driver HTTP de Neon contra el host del endpoint de test (`NODE_USE_ENV_PROXY=1`, ya incluido en los scripts).
- CLI de Neon en el contenedor cloud: `NEON_API_KEY=proxy-injected neon …` (el proxy inyecta la key real).
