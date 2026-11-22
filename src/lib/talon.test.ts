import { describe, expect, it } from 'vitest'
import { initialOf, memberTalones, talonFor, TALONES } from './talon'

describe('talones', () => {
  it('talonFor es estable y siempre devuelve un talón conocido', () => {
    const id = '0b9f8a3e-6c1d-4f5e-9a7b-2c3d4e5f6a7b'
    expect(talonFor(id)).toBe(talonFor(id))
    for (let i = 0; i < 50; i++) expect(TALONES).toContain(talonFor(crypto.randomUUID()))
  })

  it('memberTalones: dos miembros seguidos nunca repiten color', () => {
    const t = memberTalones(Array.from({ length: 12 }))
    for (let i = 1; i < t.length; i++) expect(t[i]).not.toBe(t[i - 1])
    expect(t.slice(0, 5)).toEqual([...TALONES])
  })

  it.each([
    ['carlos', 'C'],
    ['  Ángela ', 'Á'],
    ['ñandú', 'Ñ'],
    ['', '?'],
    ['🙂 Ana', '🙂'],
  ])('initialOf(%j) = %j', (name, expected) => {
    expect(initialOf(name)).toBe(expected)
  })
})
