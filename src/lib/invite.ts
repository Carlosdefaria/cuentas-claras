// Enlaces de invitación: https://<origen>/unirse/<código>. El código (≥ 128 bits, base64url) es el secreto.

const CODE = /^[A-Za-z0-9_-]{22,64}$/

export function isInviteCode(value: string): boolean {
  return CODE.test(value)
}

export function invitePath(code: string): string {
  return `/unirse/${encodeURIComponent(code)}`
}

export function inviteUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}${invitePath(code)}`
}

/**
 * Código a partir de lo que pega la persona: el enlace completo (de cualquier despliegue de la app, p. ej.
 * el Preview), la ruta /unirse/<código> o solo el código. null si no lo reconoce.
 */
export function parseInviteCode(text: string): string | null {
  const raw = text.trim()
  if (!raw) return null
  if (isInviteCode(raw)) return raw
  // El texto compartido puede llevar algo más que el enlace («Únete a … https://…»).
  const match = raw.match(/(?:^|[\s/])unirse\/([A-Za-z0-9_-]+)(?=$|[\s?#/.,;:!)»"'])/)
  return match && isInviteCode(match[1]) ? match[1] : null
}
