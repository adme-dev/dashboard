import { beforeEach, describe, expect, it, vi } from 'vitest'

type Event = {
  body?: unknown
  query?: Record<string, unknown>
  params?: Record<string, string>
  responseHeaders?: Record<string, string>
}
const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: Event) => Promise<unknown>
  getQuery: (event: Event) => Record<string, unknown>
  getRouterParam: (event: Event, name: string) => string | undefined
  setResponseHeader: (event: Event, name: string, value: string) => void
  createError: (input: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}
globals.defineEventHandler = handler => handler
globals.readBody = async event => event.body
globals.getQuery = event => event.query ?? {}
globals.getRouterParam = (event, name) => event.params?.[name]
globals.setResponseHeader = (event, name, value) => {
  event.responseHeaders ??= {}
  event.responseHeaders[name.toLowerCase()] = value
}
globals.createError = input => Object.assign(new Error(input.statusMessage), input)

const mockRequireWriteAccess = vi.fn()
const mockRequireAuth = vi.fn()
const mockRequireEnabled = vi.fn()
const mockPolicy = vi.fn()
const mockCreateDraft = vi.fn()
const mockList = vi.fn()
const mockCreateIntent = vi.fn()
const mockCompleteIntent = vi.fn()
const mockAbortIntent = vi.fn()
const mockResumeMultipartIntent = vi.fn()
const mockCreateMultipartPartIntent = vi.fn()
const mockUploadTtl = vi.fn()
const mockMultipartConfig = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))
vi.mock('~~/server/utils/send/feature', () => ({
  requireWorkspaceSendEnabled: (...args: unknown[]) => mockRequireEnabled(...args),
  resolveWorkspaceSendPolicyConfig: (...args: unknown[]) => mockPolicy(...args),
  resolveWorkspaceSendMultipartConfig: (...args: unknown[]) => mockMultipartConfig(...args),
  resolveWorkspaceSendUploadIntentTtlSeconds: (...args: unknown[]) => mockUploadTtl(...args)
}))
vi.mock('~~/server/utils/send/workspace', () => ({
  createWorkspaceSendService: () => ({ createDraft: mockCreateDraft, list: mockList }),
  toWorkspaceSendHttpError: (error: unknown) => error
}))
vi.mock('~~/server/utils/send/uploads', () => ({
  createWorkspaceSendUploadService: () => ({
    createIntent: mockCreateIntent,
    completeIntent: mockCompleteIntent,
    abortIntent: mockAbortIntent,
    resumeMultipartIntent: mockResumeMultipartIntent,
    createMultipartPartIntent: mockCreateMultipartPartIntent
  }),
  toWorkspaceSendUploadHttpError: (error: unknown) => { throw error }
}))

const { default: createHandler } = await import('../../../server/api/agency/send/index.post')
const { default: listHandler } = await import('../../../server/api/agency/send/index.get')
const { default: createIntentHandler } = await import('../../../server/api/agency/send/[id]/files/intents.post')
const { default: completeIntentHandler } = await import('../../../server/api/agency/send/[id]/files/[fileId]/intents/[intentId]/complete.post')
const { default: abortIntentHandler } = await import('../../../server/api/agency/send/[id]/files/[fileId]/intents/[intentId]/abort.post')
const { default: resumeMultipartHandler } = await import('../../../server/api/agency/send/[id]/files/[fileId]/intents/[intentId]/multipart/resume.post')
const { default: createMultipartPartHandler } = await import('../../../server/api/agency/send/[id]/files/[fileId]/intents/[intentId]/multipart/parts.post')

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
    mockUploadTtl.mockReturnValue(900)
    mockMultipartConfig.mockReturnValue({
      thresholdBytes: 100 * 1024 * 1024,
      partSizeBytes: 16 * 1024 * 1024
    })
    mockCreateIntent.mockResolvedValue({
      uploadMethod: 'single',
      fileId: '55555555-5555-4555-8555-555555555555',
      intentId: '66666666-6666-4666-8666-666666666666',
      uploadUrl: 'https://example.r2.cloudflarestorage.com/signed',
      capability: 'c'.repeat(43),
      requiredHeaders: { 'Content-Type': 'application/pdf' },
      expiresAt: '2026-07-21T00:15:00.000Z'
    })
    mockCompleteIntent.mockResolvedValue({ id: 'file-1', state: 'uploaded' })
    mockAbortIntent.mockResolvedValue({ aborted: true })
    mockResumeMultipartIntent.mockResolvedValue({
      partSizeBytes: 16 * 1024 * 1024,
      partCount: 3,
      uploadedParts: [],
      expiresAt: '2026-07-21T00:15:00.000Z'
    })
    mockCreateMultipartPartIntent.mockResolvedValue({
      partNumber: 1,
      uploadUrl: 'https://example.r2.cloudflarestorage.com/part',
      expiresAt: '2026-07-21T00:15:00.000Z'
    })
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

  it('creates an upload intent from a strict declaration and keeps bearer responses out of caches', async () => {
    const event: Event = {
      params: { id: '44444444-4444-4444-8444-444444444444' },
      body: {
        fileName: 'brief.pdf',
        fileSize: 4096,
        contentType: 'application/pdf',
        idempotencyKey: 'upload-brief-000001'
      }
    }
    const result = await createIntentHandler(event as never)

    expect(mockCreateIntent).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'member-1', role: 'member' },
      transferId: event.params!.id,
      ttlSeconds: 900,
      multipart: {
        thresholdBytes: 100 * 1024 * 1024,
        partSizeBytes: 16 * 1024 * 1024
      },
      declaration: expect.not.objectContaining({ objectKey: expect.anything() })
    }))
    expect(result).toMatchObject({ uploadUrl: expect.stringContaining('cloudflarestorage.com') })
    expect(event.responseHeaders).toEqual({
      'cache-control': 'no-store',
      'referrer-policy': 'no-referrer'
    })
  })

  it('rejects caller-selected object keys before creating an intent', async () => {
    await expect(createIntentHandler({
      params: { id: '44444444-4444-4444-8444-444444444444' },
      body: {
        fileName: 'brief.pdf',
        fileSize: 4096,
        contentType: 'application/pdf',
        idempotencyKey: 'upload-brief-000001',
        objectKey: 'send/substitution'
      }
    } as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCreateIntent).not.toHaveBeenCalled()
  })

  it('binds completion and abort to authenticated route identities', async () => {
    const params = {
      id: '44444444-4444-4444-8444-444444444444',
      fileId: '55555555-5555-4555-8555-555555555555',
      intentId: '66666666-6666-4666-8666-666666666666'
    }
    const body = { capability: 'c'.repeat(43) }

    await completeIntentHandler({ params, body } as never)
    await abortIntentHandler({ params, body } as never)

    expect(mockCompleteIntent).toHaveBeenCalledWith(expect.objectContaining({
      actor: { id: 'member-1', role: 'member' },
      transferId: params.id,
      fileId: params.fileId,
      intentId: params.intentId,
      capability: body.capability
    }))
    expect(mockAbortIntent).toHaveBeenCalledWith(expect.objectContaining({
      transferId: params.id,
      fileId: params.fileId,
      intentId: params.intentId
    }))
  })

  it('binds multipart resume and part signing to route identity and a body capability', async () => {
    const params = {
      id: '44444444-4444-4444-8444-444444444444',
      fileId: '55555555-5555-4555-8555-555555555555',
      intentId: '66666666-6666-4666-8666-666666666666'
    }
    const capability = 'c'.repeat(43)

    await resumeMultipartHandler({ params, body: { capability } } as never)
    await createMultipartPartHandler({ params, body: { capability, partNumber: 2 } } as never)

    expect(mockResumeMultipartIntent).toHaveBeenCalledWith({
      actor: { id: 'member-1', role: 'member' },
      transferId: params.id,
      fileId: params.fileId,
      intentId: params.intentId,
      capability
    })
    expect(mockCreateMultipartPartIntent).toHaveBeenCalledWith(expect.objectContaining({
      transferId: params.id,
      fileId: params.fileId,
      intentId: params.intentId,
      capability,
      partNumber: 2,
      ttlSeconds: 900
    }))

    await expect(createMultipartPartHandler({
      params,
      body: { capability, partNumber: 2, uploadId: 'caller-selected' }
    } as never)).rejects.toMatchObject({ statusCode: 400 })
  })
})
