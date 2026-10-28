/* eslint-disable @stylistic/max-statements-per-line -- compact fixture tables */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'

const m = vi.hoisted(() => ({ access: vi.fn(), query: vi.fn(), provider: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn().mockResolvedValue({ id: 'actor' }) }))
vi.mock('~~/server/utils/db', () => ({ queryOneFresh: m.query, queryOne: m.query }))
vi.mock('~~/server/utils/social/clientAccess', () => ({ requireFreshSocialClientAccess: m.access }))
vi.mock('~~/server/utils/metaClient', () => ({ getCampaigns: m.provider, getAdSets: m.provider, getPages: m.provider }))
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal('defineEventHandler', (x: unknown) => x); vi.stubGlobal('getQuery', () => ({ connectionId: 'connection', campaignId: 'campaign' })); vi.stubGlobal('createError', createError)
  m.query.mockResolvedValue({ clientId: 'client', accountId: 'account', accessToken: 'secret' }); m.access.mockRejectedValue(createError({ statusCode: 403, statusMessage: 'revoked' }))
})
describe('Meta browser provider read scope', () => {
  it.each(['campaigns', 'adsets', 'pages'])('rejects revoked client access before %s provider reads', async (route) => {
    const handler = (await import(`../../server/api/agency/banner-studio/ad-publish/meta/${route}.get.ts`)).default
    await expect(handler({ context: {} })).rejects.toMatchObject({ statusCode: 403 })
    expect(m.provider).not.toHaveBeenCalled()
  })
})
