import { describe, expect, it } from 'vitest'
import { invitePath, inviteUrl, isInviteCode, parseInviteCode } from './invite'

const CODE = 'q7Rk2mVb_9xY-3LpQa1ZcW'

describe('enlaces de invitación', () => {
  it('construye la ruta y el enlace', () => {
    expect(invitePath(CODE)).toBe(`/unirse/${CODE}`)
    expect(inviteUrl('https://cuentas.example/', CODE)).toBe(`https://cuentas.example/unirse/${CODE}`)
  })

  it('isInviteCode: 22–64 caracteres base64url', () => {
    expect(isInviteCode(CODE)).toBe(true)
    expect(isInviteCode('corto')).toBe(false)
    expect(isInviteCode(`${CODE}!`)).toBe(false)
    expect(isInviteCode('x'.repeat(65))).toBe(false)
  })
})

describe('parseInviteCode', () => {
  it.each([
    [CODE, CODE],
    [`  ${CODE}\n`, CODE],
    [`https://cuentas.example/unirse/${CODE}`, CODE],
    [`https://cuentas-git-rama.vercel.app/unirse/${CODE}?utm=x`, CODE],
    [`/unirse/${CODE}`, CODE],
    [`Únete a «Lisboa» en Cuentas Claras: https://cuentas.example/unirse/${CODE}`, CODE],
    [`https://cuentas.example/unirse/${CODE}.`, CODE],
  ])('%j → código', (text, expected) => {
    expect(parseInviteCode(text)).toBe(expected)
  })

  it.each(['', '   ', 'hola', 'https://cuentas.example/unirse/corto', `https://cuentas.example/otra/${CODE}x/y`, `nounirse/${CODE}`])(
    '%j → null',
    (text) => {
      expect(parseInviteCode(text)).toBeNull()
    },
  )
})
