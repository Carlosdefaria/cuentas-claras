// ¿Hay hoja nativa de compartir para un enlace? (iOS Safari y la PWA instalada sí; muchos escritorios no.)

export function canShareUrl(url: string): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  try {
    return navigator.canShare ? navigator.canShare({ url }) : true
  } catch {
    return false
  }
}
