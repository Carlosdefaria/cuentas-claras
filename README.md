# Cuentas Claras

App web (PWA) para registrar gastos compartidos en grupo y saber quién debe cuánto a quién.
Requisitos en [`docs/PRD.md`](docs/PRD.md); decisiones técnicas y reglas del proyecto en [`CLAUDE.md`](CLAUDE.md).

**Stack:** React + Vite + TypeScript + Tailwind · Neon (Postgres, Neon Auth, Data API con RLS) · Vercel.

## Desarrollo

```bash
npm install
npm run dev      # https://localhost:5173 (HTTPS local; proxy /api/auth → Neon Auth de la rama test)
npm test         # tests de dominio y del proxy (sin red)
npm run test:db  # tests de RLS/RPC contra la rama test de Neon (requiere .env.test.local)
npm run build
npm run lint
```

Variables: ver [`.env.example`](.env.example). Los ficheros `.env*` reales nunca se suben al repo.

## Despliegue de prueba (Vercel Preview)

Cada push a una rama genera un Preview que usa la rama `test` de Neon. Variables del entorno **Preview**:
`NEON_AUTH_BASE_URL`, `NEON_AUTH_COOKIE_SECRET` (secreto) y `VITE_NEON_DATA_API_URL`.
Pruebas en iPhone: [`docs/pruebas-pwa.md`](docs/pruebas-pwa.md).
