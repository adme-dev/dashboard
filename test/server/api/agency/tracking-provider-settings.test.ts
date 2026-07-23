import { beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as any).defineEventHandler = (fn: unknown) => fn
;(globalThis as any).createError = (opts: Record<string, unknown>) => Object.assign(new Error(String(opts.statusMessage)), opts)
;(globalThis as any).readBody = async (event: any) => event.body
;(globalThis as any).getRouterParam = (event: any, key: string) => event.context.params[key]

const {
  queryOne,
  requireClientTrackingAccess,
  requireSiteTrackingAccess,
  invalidateSiteCache
} = vi.hoisted(() => ({
  queryOne: vi.fn(),
  requireClientTrackingAccess: vi.fn(),
  requireSiteTrackingAccess: vi.fn(),
  invalidateSiteCache: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ queryOne }))
vi.mock('~~/server/utils/tracking/analytics-access', () => ({
  requireClientTrackingAccess,
  requireSiteTrackingAccess
}))
vi.mock('~~/server/utils/tracking/write-key', () => ({
  generateWriteKey: vi.fn(() => 'trk_test_key')
}))
vi.mock('~~/server/utils/tracking/site-config', () => ({ invalidateSiteCache }))

const createHandler = (await import('../../../../../server/api/agency/tracking/index.post')).default
const patchHandler = (await import('../../../../../server/api/agency/tracking/[id].patch')).default

const SETTINGS = {
  podium: {
    interactions: false,
    confirmedLeads: true,
    organizationUid: '019621ff-3586-7ed2-a838-9450286d17ff',
    locationUids: ['019621ff-36c0-7999-8c07-b3a9b0cb4e12']
  },
  xtime: { interactions: true, confirmedLeads: false }
}

describe('tracking provider settings API', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores strict per-site provider settings when a site is created', async () => {
    queryOne.mockResolvedValueOnce({ id: 'site-1', provider_tracking: SETTINGS })

    await createHandler({
      body: {
        clientId: '11111111-1111-4111-8111-111111111111',
        name: 'Dealer Studio site',
        providerTracking: SETTINGS
      }
    } as any)

    expect(requireClientTrackingAccess).toHaveBeenCalledWith(
      expect.anything(),
      '11111111-1111-4111-8111-111111111111'
    )
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/provider_tracking[\s\S]*\$10::jsonb/),
      expect.arrayContaining([JSON.stringify(SETTINGS)])
    )
  })

  it('updates settings and invalidates the public site cache', async () => {
    queryOne.mockResolvedValueOnce({ id: 'site-1', write_key: 'trk_live' })

    await patchHandler({
      context: { params: { id: 'site-1' } },
      body: { providerTracking: SETTINGS }
    } as any)

    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/provider_tracking = \$1::jsonb[\s\S]*EXISTS[\s\S]*source = 'podium'/),
      [JSON.stringify(SETTINGS), 'site-1']
    )
    expect(invalidateSiteCache).toHaveBeenCalledWith('trk_live')
  })

  it('refuses activation when the client has no Podium endpoint', async () => {
    queryOne.mockResolvedValueOnce(null)

    await expect(patchHandler({
      context: { params: { id: 'site-1' } },
      body: { providerTracking: SETTINGS }
    } as any)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Connect the Podium webhook before enabling confirmed leads'
    })
  })

  it('applies the endpoint guard to snake-case provider settings too', async () => {
    queryOne.mockResolvedValueOnce(null)

    await expect(patchHandler({
      context: { params: { id: 'site-1' } },
      body: { provider_tracking: SETTINGS }
    } as any)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Connect the Podium webhook before enabling confirmed leads'
    })
  })

  it('rejects partial or unknown settings before writing', async () => {
    await expect(patchHandler({
      context: { params: { id: 'site-1' } },
      body: {
        providerTracking: {
          podium: { interactions: true, confirmedLeads: true }
        }
      }
    } as any)).rejects.toMatchObject({
      statusCode: 400,
      statusMessage: 'Invalid provider tracking settings'
    })

    expect(queryOne).not.toHaveBeenCalled()
  })
})
