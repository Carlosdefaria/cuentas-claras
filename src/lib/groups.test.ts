import { describe, expect, it, vi } from 'vitest'
import type { DataApi } from './dataApi'
import { activeMembers, goneNames, createGroup, deleteGroup, getGroup, invitePreview, listMembers, listMyGroups, removeMember, validateGroupName } from './groups'

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
  it('listMyGroups pide el recuento de miembros activos y lo aplana', async () => {
    const api = fakeApi([{ id: ID, name: 'Piso', memberships: [{ count: 3 }] }])
    expect(await listMyGroups(api)).toEqual([{ id: ID, name: 'Piso', memberCount: 3 }])
    expect(api.select).toHaveBeenCalledWith('groups?select=id,name,memberships(count)&memberships.removed_at=is.null&order=created_at.desc,id.asc')
  })

  it('getGroup con un id que no es uuid no consulta y devuelve null', async () => {
    const api = fakeApi([])
    expect(await getGroup(api, 'x;drop')).toBeNull()
    expect(api.select).not.toHaveBeenCalled()
  })

  it('getGroup devuelve null si RLS no deja verlo', async () => {
    expect(await getGroup(fakeApi([]), ID)).toBeNull()
  })

  it('listMembers filtra por grupo, ordena por llegada e incluye a quien ya no está', async () => {
    const api = fakeApi([
      { user_id: 'u1', name: 'Ana', role: 'admin', joined_at: 't', removed_at: null },
      { user_id: 'u2', name: 'Bea', role: 'member', joined_at: 't2', removed_at: 't3' },
    ])
    const members = await listMembers(api, ID)
    expect(members).toEqual([
      { userId: 'u1', name: 'Ana', role: 'admin', joinedAt: 't', removedAt: null },
      { userId: 'u2', name: 'Bea', role: 'member', joinedAt: 't2', removedAt: 't3' },
    ])
    expect(activeMembers(members).map((m) => m.userId)).toEqual(['u1'])
    expect(goneNames(['u1', 'u2', 'u2'], members)).toEqual(['Bea'])
    expect(goneNames(['u1'], members)).toEqual([])
    expect(api.select).toHaveBeenCalledWith(`rpc/group_members?group_id=eq.${ID}&order=joined_at.asc,user_id.asc`)
  })

  it('removeMember y deleteGroup llaman a sus RPC', async () => {
    const api = fakeApi(null)
    await removeMember(api, ID, 'u2')
    expect(api.rpc).toHaveBeenCalledWith('remove_member', { p_group_id: ID, p_user_id: 'u2' })
    await deleteGroup(api, ID)
    expect(api.rpc).toHaveBeenCalledWith('delete_group', { p_group_id: ID })
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
