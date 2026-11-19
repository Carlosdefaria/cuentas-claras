// Valida el destino de "?redirectTo=" tras entrar: solo rutas internas de la app.
// Cualquier cosa dudosa (otro origen, //host, barras invertidas, esquemas, dot-segments que
// acaban en //host, caracteres de control) vuelve al inicio.

const AUTH_PAGES = new Set(['/entrar', '/registro'])
const BASE = 'https://app.invalid'

export function safeRedirect(value: string | null | undefined): string {
  if (!value) return '/'
  const raw = value.trim()
  if (!raw.startsWith('/') || raw.startsWith('//') || /[\\\s\u0000-\u001f]/.test(raw)) return '/'

  let url: URL
  try {
    url = new URL(raw, BASE)
  } catch {
    return '/'
  }
  if (url.origin !== BASE) return '/'
  // Tras normalizar ("/a/..//x" → "//x") o decodificar ("/%2F%2Fx"), sigue sin poder empezar por "//".
  if (url.pathname.startsWith('//') || decodeURIComponent(url.pathname).startsWith('//')) return '/'
  if (AUTH_PAGES.has(url.pathname)) return '/'
  return `${url.pathname}${url.search}${url.hash}`
}
