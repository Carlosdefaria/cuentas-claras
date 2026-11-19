// Qué peticiones atiende el service worker y cómo. Funciones puras (se prueban sin navegador).
//
// Regla del proyecto: nunca cachear respuestas con datos de usuario. Solo se precachea el armazón
// del build (JS, CSS, fuentes, iconos e index.html, que no llevan datos). Todo lo demás va a la red.

/** Auth (/api/*) y cualquier otro origen (la Data API de Neon): solo red, sin caché. */
export function isNetworkOnly(url: URL, appOrigin: string): boolean {
  if (url.origin !== appOrigin) return true
  return url.pathname === '/api' || url.pathname.startsWith('/api/')
}

/** Navegaciones que no deben resolverse con el index.html precacheado. */
export const navigateFallbackDenylist = [/^\/api(\/|$)/]
