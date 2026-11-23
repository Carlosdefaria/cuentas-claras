// Suspende el compute de la rama de prueba con la API de Neon (para probar el arranque en frío).
// Solo actúa sobre el endpoint de la rama de prueba (`test` o `baseline-*`, ver scripts/testDb.ts).
// Requiere NEON_API_KEY (en el contenedor cloud: NEON_API_KEY=proxy-injected; el proxy pone la real).

import { readFileSync } from 'node:fs'
import { testDatabaseUrl, testEnv } from '../../scripts/testDb.ts'

const API = 'https://console.neon.tech/api/v2'

function ids() {
  const host = new URL(testDatabaseUrl()).hostname // ep-xxx-pooler.region...
  const endpointId = host.split('.')[0].replace(/-pooler$/, '')
  const projectId = (JSON.parse(readFileSync('.neon', 'utf8')) as { projectId: string }).projectId
  return { endpointId, projectId }
}

async function api(path: string, method = 'GET') {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${process.env.NEON_API_KEY}`, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`API de Neon ${method} ${path}: HTTP ${res.status}`)
  return res.json() as Promise<{ endpoint: { current_state: string; branch_id: string } }>
}

export const canSuspend = () => Boolean(process.env.NEON_API_KEY)

/** Suspende el endpoint de la rama test y espera a que quede inactivo. */
export async function suspendTestEndpoint(timeoutMs = 90_000): Promise<void> {
  const { endpointId, projectId } = ids()
  const { endpoint } = await api(`/projects/${projectId}/endpoints/${endpointId}`)
  const branch = testEnv().NEON_BRANCH_ID?.trim()
  if (!branch || endpoint.branch_id !== branch) {
    throw new Error('Abortado: el endpoint no pertenece a la rama de prueba')
  }
  await api(`/projects/${projectId}/endpoints/${endpointId}/suspend`, 'POST')
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { endpoint: e } = await api(`/projects/${projectId}/endpoints/${endpointId}`)
    if (e.current_state === 'idle') return
    await new Promise((r) => setTimeout(r, 2_000))
  }
  throw new Error('El endpoint de test no llegó a suspenderse a tiempo')
}
