import { describe, it, expect } from 'vitest'
import { evaluateAcl } from '~~/server/utils/officeRoom'
import type { OfficeZoneRow, ActorRef, OfficeMemberRow } from '~~/app/types/office'

function zone(overrides: Partial<OfficeZoneRow> = {}): OfficeZoneRow {
  return {
    id: 'z1', office_id: 'o1', slug: 's', name: 'n',
    zone_type: 'meeting', position: { x: 0, y: 0, w: 100, h: 100 },
    capacity: 10, is_private: false, acl: {},
    notes: '', notes_version: 0, notes_updated_at: null, notes_updated_by: null,
    created_at: new Date().toISOString(),
    ...overrides
  }
}

const staffMember: OfficeMemberRow = {
  id: 'm1', office_id: 'o1',
  user_id: 'u1', client_user_id: null,
  role: 'member', added_at: new Date().toISOString()
}

const clientMember: OfficeMemberRow = {
  id: 'm2', office_id: 'o1',
  user_id: null, client_user_id: 'cu1',
  role: 'guest', added_at: new Date().toISOString()
}

describe('evaluateAcl', () => {
  it('staff member can enter a public (non-private) meeting zone', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    expect(evaluateAcl({ actor, zone: zone(), membership: staffMember })).toEqual({ allowed: true })
  })

  it('staff member can enter a private zone if their role is allowed', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    const z = zone({ is_private: true, acl: { allowed_roles: ['member'] } })
    expect(evaluateAcl({ actor, zone: z, membership: staffMember })).toEqual({ allowed: true })
  })

  it('staff member is denied a private zone with mismatched roles', () => {
    const actor: ActorRef = { type: 'user', id: 'u1', handle: 'user:u1' }
    const z = zone({ is_private: true, acl: { allowed_roles: ['admin'] } })
    const result = evaluateAcl({ actor, zone: z, membership: staffMember })
    expect(result.allowed).toBe(false)
  })

  it('non-member is denied any zone', () => {
    const actor: ActorRef = { type: 'user', id: 'u-other', handle: 'user:u-other' }
    const result = evaluateAcl({ actor, zone: zone(), membership: null })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/membership/i)
  })

  it('client member can enter a lobby with public_lobby=true', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'lobby', acl: { public_lobby: true } })
    expect(evaluateAcl({ actor, zone: z, membership: clientMember })).toEqual({ allowed: true })
  })

  it('client member is denied a zone not in their allowed_clients list', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'meeting', acl: { allowed_clients: ['other-client'] } })
    const result = evaluateAcl({ actor, zone: z, membership: clientMember, actorClientId: 'this-client' })
    expect(result.allowed).toBe(false)
  })

  it('client member is allowed a zone whose acl.allowed_clients includes their client_id', () => {
    const actor: ActorRef = { type: 'client', id: 'cu1', handle: 'client:cu1' }
    const z = zone({ zone_type: 'meeting', acl: { allowed_clients: ['my-client'] } })
    const result = evaluateAcl({ actor, zone: z, membership: clientMember, actorClientId: 'my-client' })
    expect(result.allowed).toBe(true)
  })
})
