// Código de un solo uso (6 cifras) que llega por email: verificación de cuenta y recuperación de contraseña.

export const CODE_LENGTH = 6

/** Deja solo las cifras (pegar «123 456» o «Código: 123456» funciona) y corta a 6. */
export function normalizeCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, CODE_LENGTH)
}

export function isCompleteCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code)
}
