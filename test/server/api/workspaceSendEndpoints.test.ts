import { beforeEach, describe, expect, it, vi } from 'vitest'

type Event = { body?: unknown, query?: Record<string, unknown> }
const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: Event) => Promise<unknown>
  getQuery: (event: Event) => Record<string, unknown>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
globals.defineEventHandler = handler => handler
globals.readBody = async event => event.body
globals.getQuery = event => event.query ?? {}
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireWriteAccess = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireEnabled = vi.fn()
const mockPolicy = vi.fn()
const mockCreateDraft = vi.fn()
const mockList = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))
vi.mock('~~/server/utils/send/feature', () => ({
  requireWorkspaceSendEnabled: (...args: unknown[]) => mockRequireEnabled(...args),
  resolveWorkspaceSendPolicyConfig: (...args: unknown[]) => mockPolicy(...args)
}))
vi.mock('~~/server/utils/send/workspace', () => ({
  createWorkspaceSendService: () => ({ createDraft: mockCreateDraft, list: mockList }),
  toWorkspaceSendHttpError: (error: unknown) => error
}))

const { default: createHandler } = await import('../../../server/api/agency/send/index.post')
const { default: listHandler } = await import('../../../server/api/agency/send/index.get')

const validBody = {
  title: 'Campaign assets',
  recipients: ['CLIENT@example.com'],
  expiresAt: '2026-07-28T00:00:00.000Z',
  idempotencyKey: 'create-send-draft-0001'
}

describe('workspace Send API boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireWriteAccess.mockResolvedValue({ id: 'member-1', role: 'member' })
    mockRequireAuth.mockResolvedValue({ id: 'member-1', role: 'member' })
    mockPolicy.mockReturnValue({
      surface: 'workspace',
      defaultRetentionDays: 7,
      maxRetentionDays: 30,
      maxRecipients: 20,
      maxDownloads: 100,
      maxTransferBytes: 2147483648,
      maxFileBytes: 2147483648,
      maxFiles: 20
    })
    mockCreateDraft.mockResolvedValue({ id: 'transfer-1', status: 'draft' })
    mockList.mockResolvedValue({ transfers: [], page: 1, pageSize: 25, hasMore: false })
  })

  it('enforces the kill switch before authenticating or reading a create body', async () => {
    mockRequireEnabled.mockImplementationOnce(() => {
      throw Object.assign(new Error('Not found'), { statusCode: 404 })
    })

    await expect(createHandler({ body: validBody } as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mockRequireWriteAccess).not.toHaveBeenCalled()
    expect(mockCreateDraft).not.toHaveBeenCalled()
  })

  it('normalizes strict create input and derives the actor from authentication', async () => {
    await createHandler({ body: validBody } as never)

    expect(mockCreateDraft).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'member-1', role: 'member' },
      draft: expect.objectContaining({ recipients: ['client@example.com'] })
    }))
  })

  it('rejects unknown create fields before calling the service', async () => {
    await expect(createHandler({ body: { ...validBody, ownerTeamMemberId: 'attacker' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateDraft).not.toHaveBeenCalled()
  })

  it('validates list filters and applies bounded pagination', async () => {
    const response = await listHandler({ query: { status: 'ready', page: '2', pageSize: '50' } } as never)
    expect(mockList).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      status: 'ready',
      page: 2,
      pageSize: 50
    })
    expect(response).toMatchObject({ policy: { defaultRetentionDays: 7, maxDownloads: 100 } })

    await expect(listHandler({ query: { status: 'not-real', extra: 'x' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects repeated pagination parameters instead of coercing arrays', async () => {
    await expect(listHandler({ query: { page: ['1'] } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(mockList).not.toHaveBeenCalled()
  })
})
