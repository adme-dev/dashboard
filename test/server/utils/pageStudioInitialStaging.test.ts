import type { H3Event } from 'h3'
import type { z } from 'zod'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareCreatedSiteStaging } from '~~/server/utils/pageStudio/initialStaging'
import { pageStudioStagingAddress, type PageStudioStagingRequestSchema } from '~~/shared/pageStudio/staging'

const siteId = 'c34f6347-cc63-4ed7-9a5a-da165ebefed2'
const actorId = '30000000-0000-4000-8000-000000000001'
const clientId = '40000000-0000-4000-8000-000000000001'
const agency = { kind: 'agency' as const, actorId, tenantId: 'tenant_test' }
const portal = { kind: 'portal' as const, actorId, clientId }
const state = () => ({ siteId, ...pageStudioStagingAddress(siteId), status: 'not_published', canManage: true, active: null, currentDigest: null, failure: null })
const service = vi.fn(), retain = vi.fn()
const event = () => ({ context: { waitUntil: retain, cloudflare: { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_MANAGEMENT: { clientStaging: service } } } } }) as unknown as H3Event
const receipt = (input: z.infer<typeof PageStudioStagingRequestSchema>) => ({ ok: true, operation: input.operation, siteId: input.siteId, environment: input.expectedEnvironment,
  actorKind: input.actor.kind, scopeId: input.actor.kind === 'agency' ? input.actor.tenantId : input.actor.clientId, value: state() })

beforeEach(() => {
  vi.resetAllMocks()
  service.mockImplementation(async input => receipt(input))
})
afterEach(() => vi.useRealTimers())

describe('committed site staging setup', () => {
  it.each([agency, portal])('requests only initial staging under the trusted $kind actor', async (actor) => {
    await expect(prepareCreatedSiteStaging(event(), actor, siteId)).resolves.toEqual(state())
    expect(service).toHaveBeenCalledExactlyOnceWith({ operation: 'ensure', actor, siteId, expectedEnvironment: 'production' })
    expect(retain).toHaveBeenCalledTimes(1)
    expect(state().active).toBeNull()
  })
  it('reports unavailable setup without failing the site when bindings are missing', async () => {
    await expect(prepareCreatedSiteStaging({ context: {} } as H3Event, agency, siteId)).resolves.toBeNull()
    expect(service).not.toHaveBeenCalled()
  })
  it('contains provider errors and registers a non-rejecting background task', async () => {
    service.mockRejectedValue(new Error('private provider payload'))
    await expect(prepareCreatedSiteStaging(event(), agency, siteId)).resolves.toBeNull()
    await expect(retain.mock.calls[0][0]).resolves.toBeNull()
  })
  it.each(['siteId', 'scopeId', 'actorKind', 'environment', 'operation'])('rejects another %s in the service acknowledgement', async (key) => {
    service.mockImplementation(async input => ({ ...receipt(input), [key]: 'foreign' }))
    await expect(prepareCreatedSiteStaging(event(), agency, siteId)).resolves.toBeNull()
  })
  it('does not accept an unverified foreign staging address', async () => {
    service.mockImplementation(async input => ({ ...receipt(input), value: { ...state(), hostname: 'foreign.test', url: 'https://foreign.test/' } }))
    await expect(prepareCreatedSiteStaging(event(), agency, siteId)).resolves.toBeNull()
  })
  it('returns after five seconds while retaining the same uncertain operation in the request lifetime', async () => {
    vi.useFakeTimers()
    let finish!: (value: unknown) => void
    service.mockImplementationOnce(() => new Promise((resolve) => {
      finish = resolve
    }))
    const result = prepareCreatedSiteStaging(event(), agency, siteId)
    await vi.advanceTimersByTimeAsync(5000)
    await expect(result).resolves.toBeNull()
    expect(service).toHaveBeenCalledTimes(1)
    expect(retain).toHaveBeenCalledTimes(1)
    finish(receipt(service.mock.calls[0][0]))
    await expect(retain.mock.calls[0][0]).resolves.toEqual(state())
    expect(service).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('clears its deadline when setup resolves without leaving a timer behind', async () => {
    vi.useFakeTimers()
    await prepareCreatedSiteStaging(event(), agency, siteId)
    expect(vi.getTimerCount()).toBe(0)
  })
})
