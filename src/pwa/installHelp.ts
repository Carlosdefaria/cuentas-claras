// ¿Mostramos la ayuda «Compartir → Añadir a pantalla de inicio»? iOS no tiene `beforeinstallprompt`.
// Función pura: se prueba con user agents reales.

export type IosDevice = 'iPhone' | 'iPad'

export interface InstallEnv {
  userAgent: string
  /** navigator.maxTouchPoints: el iPad con iPadOS se presenta como Mac, pero es táctil. */
  maxTouchPoints: number
  /** Ya abierta como app instalada (navigator.standalone o display-mode: standalone). */
  standalone: boolean
}

// Navegadores dentro de otras apps (Instagram, Facebook, Gmail…): no pueden añadir a la pantalla de inicio.
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|LinkedInApp|Line\/|MicroMessenger|GSA\/|Twitter|TikTok|Snapchat/i

/** Dispositivo iOS en el que tiene sentido explicar cómo instalar, o null si no hay que mostrar nada. */
export function iosInstallDevice({ userAgent, maxTouchPoints, standalone }: InstallEnv): IosDevice | null {
  if (standalone || IN_APP.test(userAgent)) return null
  if (/iPhone|iPod/.test(userAgent)) return 'iPhone'
  if (/iPad/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'iPad'
  return null
}

export function currentInstallEnv(): InstallEnv {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true,
  }
}
