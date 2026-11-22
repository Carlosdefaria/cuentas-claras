// Instancia de la Data API de la app: URL pública de la rama (VITE_NEON_DATA_API_URL) y JWT de la sesión.

import { createDataApi, createJwtSource } from './dataApi'
import { fetchSession } from './auth'

export const sessionJwt = createJwtSource(async () => (await fetchSession()).jwt)

export const db = createDataApi({
  baseUrl: import.meta.env.VITE_NEON_DATA_API_URL ?? '',
  jwt: sessionJwt,
})
