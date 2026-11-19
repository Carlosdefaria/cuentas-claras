// Función de Vercel: proxy same-origin de Neon Auth (ver server/authProxy.ts).
// vercel.json reescribe /api/auth/:path* → /api/auth?__path=:path*
//
// Variables de entorno (solo servidor, por entorno de Vercel):
//   NEON_AUTH_BASE_URL       URL de Auth de la rama de Neon (Preview → test; Production → production)
//   NEON_AUTH_COOKIE_SECRET  ≥ 32 caracteres (openssl rand -base64 32). SECRETO: nunca en el cliente.

import { authProxy } from '../server/authProxy.ts'

export function GET(request: Request): Promise<Response> {
  return authProxy(request, process.env)
}

export function POST(request: Request): Promise<Response> {
  return authProxy(request, process.env)
}
