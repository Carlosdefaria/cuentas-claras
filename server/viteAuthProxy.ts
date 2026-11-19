// Plugin de Vite (solo desarrollo): sirve /api/auth/* con el mismo proxy que la función de Vercel,
// para que en local la cookie de sesión también sea first-party.
// Lee NEON_AUTH_BASE_URL y NEON_AUTH_COOKIE_SECRET de .env.development.local (sin prefijo VITE_:
// nunca llegan al navegador).

import type { Plugin } from 'vite'
import { authProxy, type AuthProxyEnv } from './authProxy.ts'

export function authProxyDev(env: AuthProxyEnv): Plugin {
  return {
    name: 'cuentas-claras:auth-proxy-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !(req.url === '/api/auth' || req.url.startsWith('/api/auth/') || req.url.startsWith('/api/auth?'))) {
          return next()
        }
        try {
          const headers = new Headers()
          for (const [key, value] of Object.entries(req.headers)) {
            if (key.startsWith(':')) continue // pseudo-cabeceras de HTTP/2 (Vite usa HTTP/2 con HTTPS)
            if (typeof value === 'string') headers.set(key, value)
            // En HTTP/2 la cabecera cookie puede llegar partida: se une con "; ", no con ", ".
            else if (Array.isArray(value)) headers.set(key, value.join(key === 'cookie' ? '; ' : ', '))
          }
          const chunks: Buffer[] = []
          for await (const chunk of req) chunks.push(chunk as Buffer)
          const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && chunks.length > 0
          const request = new Request(`https://${req.headers.host}${req.url}`, {
            method: req.method,
            headers,
            body: hasBody ? Buffer.concat(chunks) : undefined,
          })

          const response = await authProxy(request, env)
          res.statusCode = response.status
          response.headers.forEach((value, key) => {
            if (key !== 'set-cookie') res.setHeader(key, value)
          })
          const cookies = response.headers.getSetCookie()
          if (cookies.length > 0) res.setHeader('set-cookie', cookies)
          res.end(Buffer.from(await response.arrayBuffer()))
        } catch (error) {
          server.config.logger.error(`[auth-proxy] ${error instanceof Error ? error.message : String(error)}`)
          res.statusCode = 502
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify({ error: 'Auth no disponible' }))
        }
      })
    },
  }
}
