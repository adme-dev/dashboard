/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/* eslint-disable @stylistic/max-statements-per-line -- Compact fixture setup keeps paired state changes together. */
import { beforeEach, expect, it, vi } from 'vitest'
import { resolveEmailClientScope, assertEmailClientAccess, assertScopedCampaignLists, resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'

const fixture = vi.hoisted(() => ({ granted: true, active: ['client-new'], assignments: ['client-inactive'], reads: [] as string[] }))
vi.mock('~~/server/utils/clientScoping', () => ({
  hasFreshMarketingManagementPermission: async () => fixture.granted,
  getAssignedClientIds: async () => fixture.assignments
}))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: async (sql: string) => { fixture.reads.push(sql); return fixture.active.map(id => ({ id })) } }))
const event = {} as any
const user = { id: 'staff', role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT'] } as any
beforeEach(() => { fixture.granted = true; fixture.active = ['client-new']; fixture.reads = [] })
it('covers newly active clients without relying on support assignments or permitting inactive ones', async () => {
  expect(await resolveEmailClientScope(event, user)).toEqual(['client-new'])
  await expect(assertEmailClientAccess(event, user, 'client-new')).resolves.toBeUndefined()
  await expect(assertEmailClientAccess(event, user, 'client-inactive')).rejects.toMatchObject({ statusCode: 403 })
  expect(fixture.reads.every(sql => sql.includes('is_active = TRUE'))).toBe(true)
})
it('refuses stale marketing permission immediately instead of falling back to assignments', async () => {
  fixture.granted = false
  await expect(resolveEmailClientScope(event, user)).rejects.toMatchObject({ statusCode: 403 })
})
it('retains exact client targeting for campaigns and prevents cross-client audience mixing', async () => {
  fixture.active.push('client-other')
  await expect(resolveEmailWriteClientId(event, user)).rejects.toMatchObject({ statusCode: 403 })
  expect(() => assertScopedCampaignLists(user, 'client-new', [{ client_id: 'client-other' }])).toThrow()
})
it('keeps legacy assignment scope and owner agency lists unchanged', async () => {
  expect(await resolveEmailClientScope(event, { ...user, permissionGroups: ['CLIENTS'] })).toEqual(['client-inactive'])
  expect(await resolveEmailClientScope(event, { ...user, role: 'owner', permissionGroups: ['ADMIN'] })).toBe('all')
})
