/* eslint-disable @typescript-eslint/no-explicit-any -- Boundary fixtures model heterogeneous database and provider records. */
import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  requireDealerFeedAccess,
  requireDealerFeedResource
} from '~~/server/utils/feeds/departmentAccess'

const state = vi.hoisted(() => ({
  groups: ['MARKETING_MANAGEMENT'],
  active: true,
  readOnly: false
}))
vi.mock('~~/server/utils/auth', () => ({
  requireAuth: async () => ({ id: 'staff', email: 'staff@example.test' })
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: async () => ({
    userId: 'staff',
    permissionGroups: state.groups,
    assistantReadOnly: state.readOnly,
    mcpStaffAuthority: 'fresh'
  })
}))
vi.mock('~~/server/utils/db', () => ({
  queryOneFresh: async () => (state.active ? { id: 'client' } : null)
}))
const event = { context: {} } as any
const link = {
  clientId: 'client',
  providerId: 'social-dashboard',
  externalOrgId: 'org',
  sellerRefs: ['seller'],
  defaultFeedIds: []
}
beforeEach(() => {
  state.groups = ['MARKETING_MANAGEMENT']
  state.active = true
  state.readOnly = false
})
describe('dedicated browser feed authority', () => {
  it('admits the dedicated group without any general admin elevation', async () => {
    const result = await requireDealerFeedAccess(
      event,
      '11111111-1111-4111-8111-111111111111',
      true
    )
    expect(result.user.id).toBe('staff')
    expect(result.management).toBe(true)
    expect(result.admin).toBe(false)
  })
  it('rejects unrelated groups, inactive clients and read-only writes', async () => {
    state.groups = ['MEDIA_BUYING']
    await expect(requireDealerFeedAccess(event)).rejects.toThrow()
    state.groups = ['MARKETING_MANAGEMENT']
    state.active = false
    await expect(
      requireDealerFeedAccess(event, '11111111-1111-4111-8111-111111111111')
    ).rejects.toThrow()
    state.active = true
    state.readOnly = true
    await expect(
      requireDealerFeedAccess(event, undefined, true)
    ).rejects.toThrow()
  })
  it('retains admin access and refuses cross-client provider resources before preview or mutation', async () => {
    state.groups = ['ADMIN']
    expect((await requireDealerFeedAccess(event)).admin).toBe(true)
    const provider = {
      listFeeds: async () => [{ id: 'feed', platform: 'google' }],
      getFeed: async () => ({ id: 'feed', filters: { sellerIds: ['other'] } })
    } as any
    await expect(
      requireDealerFeedResource(provider, {} as any, link, 'foreign')
    ).rejects.toThrow()
    await expect(
      requireDealerFeedResource(provider, {} as any, link, 'feed')
    ).rejects.toThrow()
  })
})

describe('browser feed route integration', () => {
  it('uses dedicated authority on feed endpoints and removes mutation from URL reads', () => {
    for (const path of [
      'index.get.ts',
      'index.post.ts',
      'preview.post.ts',
      '[feedId]/preview.get.ts',
      '[feedId]/generate.post.ts',
      '[feedId]/url.get.ts'
    ]) {
      const source = readFileSync(
        `server/api/admin/dealer-feeds/[clientId]/${path}`,
        'utf8'
      )
      expect(source).toContain('requireDealerFeedAccess')
      expect(source).not.toContain('requireRole(')
    }
    const source = readFileSync(
      'server/api/admin/dealer-feeds/[clientId]/[feedId]/url.get.ts',
      'utf8'
    )
    expect(source).not.toContain('updateFeed(')
    expect(source).toContain('requireDealerFeedResource')
    expect(
      readFileSync('app/pages/agency/dealer-feeds.vue', 'utf8')
    ).not.toContain('middleware: [\'role-admin\']')
  })
})
