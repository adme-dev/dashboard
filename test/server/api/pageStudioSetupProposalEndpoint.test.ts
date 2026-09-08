import { beforeEach, describe, expect, it, vi } from 'vitest'

const requireClientAuth = vi.hoisted(() => vi.fn())
const edgeGenerate = vi.hoisted(() => vi.fn())
vi.mock('~~/server/utils/clientAuth', () => ({ requireClientAuth }))
vi.mock('~~/server/utils/edgeAi', () => ({ edgeGenerate }))

const testGlobal = globalThis as typeof globalThis & {
  eventHandler: <T>(handler: T) => T
  readBody: (event: { body?: unknown }) => Promise<unknown>
  createError: (input: Record<string, unknown>) => Error & Record<string, unknown>
}
testGlobal.eventHandler = handler => handler
testGlobal.readBody = async event => event.body
testGlobal.createError = input => Object.assign(new Error(String(input.statusMessage)), input)

describe('portal Page Studio setup proposal endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireClientAuth.mockResolvedValue({ id: 'user-1', role: 'manager', clientId: 'client-1' })
    edgeGenerate.mockResolvedValue(null)
  })

  it('uses Workers AI only to rephrase deterministic missing facts', async () => {
    edgeGenerate.mockResolvedValue('{"questions":["Which phone number should customers use?"]}')
    const { default: handler } = await import('~~/server/api/portal/page-studio/setup-proposal.post')
    const result = await handler({ body: {
      name: 'Fantasy Limo', route: 'fantasy-limo', starterVersion: 'limousine-v1', setupSource: 'chat', setupBrief: 'Airport transfers.'
    } } as never)
    expect(result).toEqual({ proposal: expect.objectContaining({ questions: ['Which phone number should customers use?'] }) })
    expect(edgeGenerate).toHaveBeenCalledWith(expect.anything(), expect.stringContaining('Do not add facts'), expect.objectContaining({ featureKey: 'page_studio_setup_questions' }))
  })

  it('returns a deterministic, review-required proposal from a chat brief', async () => {
    const { default: handler } = await import('~~/server/api/portal/page-studio/setup-proposal.post')
    const result = await handler({ body: {
      name: 'Fantasy Limo',
      route: 'fantasy-limo',
      starterVersion: 'limousine-v1',
      setupSource: 'chat',
      setupBrief: 'Airport transfers with bookings and quote enquiries.'
    } } as never)
    expect(result).toEqual({ proposal: expect.objectContaining({
      businessName: 'Fantasy Limo',
      setupSource: 'chat',
      modules: expect.arrayContaining(['bookings', 'enquiries']),
      pages: expect.arrayContaining(['bookings', 'enquiries']),
      requiresAgencyReview: true
    }) })
  })

  it('rejects portal viewers before generating a proposal', async () => {
    requireClientAuth.mockResolvedValue({ id: 'user-1', role: 'viewer', clientId: 'client-1' })
    const { default: handler } = await import('~~/server/api/portal/page-studio/setup-proposal.post')
    await expect(handler({ body: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
  })
})
