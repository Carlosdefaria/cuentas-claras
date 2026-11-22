import { describe, expect, it, vi } from 'vitest'
import type { DataApi } from './dataApi'
import { createGroup, getGroup, invitePreview, listMembers, listMyGroups, validateGroupName } from './groups'

const fakeApi = (result: unknown) => {
  const api = { select: vi.fn(async () => result), rpc: vi.fn(async () => result) }
  return api as typeof api & DataApi
}
const ID = '0b9f8a3e-6c1d-4f5e-9a7b-2c3d4e5f6a7b'

describe('validateGroupName', () => {
  it.each([
    ['', 'required'],
    ['   ', 'required'],
    ['Piso', null],
    [`  ${'x'.repeat(100)}  `, null],
    ['x'.repeat(101), 'tooLong'],
  ] as const)('%j → %s', (name, expected) => {
    expect(validateGroupName(name)).toBe(expected)
  })
})

describe('consultas', () => {
  it('listMyGroups pide el recuento de miembros y lo aplana', async () => {
    const api = fakeApi([{ id: ID, name: 'Piso', memberships: [{ count: 3 }] }])
    expect(await listMyGroups(api)).toEqual([{ id: ID, name: 'Piso', memberCount: 3 }])
    expect(api.select).toHaveBeenCalledWith('groups?select=id,name,memberships(count)&order=created_at.desc,id.asc')
  })

  it('getGroup con un id que no es uuid no consulta y devuelve null', async () => {
    const api = fakeApi([])
    expect(await getGroup(api, 'x;drop')).toBeNull()
    expect(api.select).not.toHaveBeenCalled()
  })

  it('getGroup devuelve null si RLS no deja verlo', async () => {
    expect(await getGroup(fakeApi([]), ID)).toBeNull()
  })

  it('listMembers filtra por grupo y ordena por llegada', async () => {
    const api = fakeApi([{ user_id: 'u1', name: 'Ana', role: 'admin', joined_at: 't' }])
    expect(await listMembers(api, ID)).toEqual([{ userId: 'u1', name: 'Ana', role: 'admin', joinedAt: 't' }])
    expect(api.select).toHaveBeenCalledWith(`rpc/group_members?group_id=eq.${ID}&order=joined_at.asc,user_id.asc`)
  })

  it('createGroup recorta el nombre', async () => {
    const api = fakeApi(ID)
    await createGroup(api, '  Piso  ')
    expect(api.rpc).toHaveBeenCalledWith('create_group', { p_name: 'Piso' })
  })

  it('invitePreview traduce los campos', async () => {
    const api = fakeApi([{ group_id: ID, name: 'Lisboa', member_count: 4, is_member: false }])
    expect(await invitePreview(api, 'c')).toEqual({ groupId: ID, name: 'Lisboa', memberCount: 4, isMember: false })
  })
})
