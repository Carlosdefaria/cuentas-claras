import { describe, expect, it } from 'vitest'
import { canDeleteGroup, canRemoveMember, isAdmin, isReadOnly, type GroupMember } from './members'

const m = (userId: string, role: 'admin' | 'member' = 'member', removedAt: string | null = null): GroupMember => ({ userId, role, removedAt })
const members = [m('ana', 'admin'), m('bea'), m('carla'), m('dani', 'member', '2026-11-20T10:00:00Z')]
const bal = (entries: Record<string, number>) => new Map(Object.entries(entries))

describe('isAdmin', () => {
  it('solo quien administra y sigue en el grupo', () => {
    expect(isAdmin(members, 'ana')).toBe(true)
    expect(isAdmin(members, 'bea')).toBe(false)
    expect(isAdmin(members, 'x')).toBe(false)
    expect(isAdmin([m('ana', 'admin', '2026-11-20T10:00:00Z')], 'ana')).toBe(false)
    expect(isAdmin(members, null)).toBe(false)
  })
})

describe('canRemoveMember', () => {
  it('quien administra quita a alguien con saldo 0', () => {
    expect(canRemoveMember(members, 'ana', 'bea', bal({ bea: 0 }))).toEqual({ ok: true })
    expect(canRemoveMember(members, 'ana', 'bea', bal({}))).toEqual({ ok: true }) // sin movimientos: 0
  })

  it('bloqueado si debe o le deben, con el saldo', () => {
    expect(canRemoveMember(members, 'ana', 'bea', bal({ bea: -1250 }))).toEqual({ ok: false, reason: 'unsettled', balanceCents: -1250 })
    expect(canRemoveMember(members, 'ana', 'carla', bal({ carla: 300 }))).toEqual({ ok: false, reason: 'unsettled', balanceCents: 300 })
  })

  it('solo quien administra; nunca a sí mismo; solo a quien sigue en el grupo', () => {
    expect(canRemoveMember(members, 'bea', 'carla', bal({}))).toEqual({ ok: false, reason: 'not-admin' })
    expect(canRemoveMember(members, null, 'carla', bal({}))).toEqual({ ok: false, reason: 'not-admin' })
    expect(canRemoveMember(members, 'ana', 'ana', bal({}))).toEqual({ ok: false, reason: 'self' })
    expect(canRemoveMember(members, 'ana', 'dani', bal({}))).toEqual({ ok: false, reason: 'not-member' })
    expect(canRemoveMember(members, 'ana', 'x', bal({}))).toEqual({ ok: false, reason: 'not-member' })
  })
})

describe('canDeleteGroup', () => {
  it('quien administra lo borra si todos tienen saldo 0', () => {
    expect(canDeleteGroup(members, 'ana', bal({ ana: 0, bea: 0 }))).toEqual({ ok: true })
  })

  it('bloqueado con saldos pendientes: quién y cuánto, en el orden de los miembros', () => {
    expect(canDeleteGroup(members, 'ana', bal({ carla: 500, ana: -200, bea: -300 }))).toEqual({
      ok: false,
      reason: 'unsettled',
      pending: [
        { userId: 'ana', balanceCents: -200 },
        { userId: 'bea', balanceCents: -300 },
        { userId: 'carla', balanceCents: 500 },
      ],
    })
  })

  it('solo quien administra', () => {
    expect(canDeleteGroup(members, 'bea', bal({}))).toEqual({ ok: false, reason: 'not-admin' })
  })
})

describe('isReadOnly', () => {
  it('solo lectura si participa alguien que ya no está', () => {
    expect(isReadOnly(['ana', 'bea'], members)).toBe(false)
    expect(isReadOnly(['ana', 'dani'], members)).toBe(true)
    expect(isReadOnly([], members)).toBe(false)
  })

  it('alguien desconocido no lo vuelve de solo lectura (la BD decide)', () => {
    expect(isReadOnly(['x'], members)).toBe(false)
  })
})
