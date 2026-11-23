# Migraciones posteriores a la línea base

El esquema completo está en `db/baseline.sql` (consolida 0001–0009, cuyo historial queda en `db/migrations-legacy/`).
Aquí van las migraciones nuevas, numeradas desde `0010_…sql`. Las aplica `npm run db:migrate` después de la línea base,
una vez cada una (registro en `app_migrations.applied`); una migración aplicada no se edita: se crea otra.
Tras crear o cambiar funciones o tablas expuestas, refrescar la caché de esquema de la Data API (ver CLAUDE.md).
