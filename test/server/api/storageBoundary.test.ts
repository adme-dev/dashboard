import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockRequireWriteAccess = vi.fn()
const mockRequireBoardAccess = vi.fn()
const mockDeleteFile = vi.fn()
const mockFileExists = vi.fn()
const mockGenerateStorageKey = vi.fn()
const mockGetFileMetadata = vi.fn()
const mockGetPresignedDownloadUrl = vi.fn()
const mockGetPresignedUploadUrl = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockIsStorageConfigured = vi.fn()
const mockQueryOne = vi.fn()
const mockTransaction = vi.fn()
const mockCanDeleteStorageObject = vi.fn()
const mockRequireStorageEntityAccess = vi.fn()
const mockResolveStorageUploadTarget = vi.fn()
const mockSignStorageUploadCapability = vi.fn()
const mockStorageUploadCapabilityMatches = vi.fn()
const mockVerifyStorageUploadCapability = vi.fn()
const mockReadBody = vi.fn()
const mockGetRouterParam = vi.fn()
const mockGetHeader = vi.fn()
const mockReadMultipartFormData = vi.fn()
const mockUploadFile = vi.fn()

const USER_ID = '11111111-1111-4111-8111-111111111111'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const DEPARTMENT_ID = '55555555-5555-4555-8555-555555555555'

const testGlobal = globalThis as unknown as {
  defineEventHandler: <T>(handler: T) => T
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
  readBody: typeof mockReadBody
  getRouterParam: typeof mockGetRouterParam
  getHeader: typeof mockGetHeader
  readMultipartFormData: typeof mockReadMultipartFormData
  useRuntimeConfig: () => { sessionSecret: string }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)
testGlobal.readBody = mockReadBody
testGlobal.getRouterParam = mockGetRouterParam
testGlobal.getHeader = mockGetHeader
testGlobal.readMultipartFormData = mockReadMultipartFormData
testGlobal.useRuntimeConfig = () => ({ sessionSecret: 'test-storage-capability-secret-at-least-32-bytes' })

vi.mock('~~/server/utils/auth', () => ({
  requireBoardAccess: (...args: unknown[]) => mockRequireBoardAccess(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/storage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  getAllowedTypes: () => ['application/pdf'],
  getFileMetadata: (...args: unknown[]) => mockGetFileMetadata(...args),
  getMaxFileSize: () => 50 * 1024 * 1024,
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  getPresignedUploadUrl: (...args: unknown[]) => mockGetPresignedUploadUrl(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  validateFileSize: () => true,
  validateFileType: () => true
}))

vi.mock('~~/server/utils/storageAccess', () => ({
  canDeleteStorageObject: (...args: unknown[]) => mockCanDeleteStorageObject(...args),
  requireStorageEntityAccess: (...args: unknown[]) => mockRequireStorageEntityAccess(...args),
  resolveStorageUploadTarget: (...args: unknown[]) => mockResolveStorageUploadTarget(...args),
  signStorageUploadCapability: (...args: unknown[]) => mockSignStorageUploadCapability(...args),
  storageUploadCapabilityMatches: (...args: unknown[]) => mockStorageUploadCapabilityMatches(...args),
  verifyStorageUploadCapability: (...args: unknown[]) => mockVerifyStorageUploadCapability(...args)
}))

const { default: deleteHandler } = await import('~~/server/api/storage/[key].delete')
const { default: presignHandler } = await import('~~/server/api/storage/presigned-upload.post')
const { default: confirmHandler } = await import('~~/server/api/storage/confirm-upload.post')
const { default: taskAttachmentHandler } = await import('~~/server/api/agency/tasks/[id]/attachments.post')

beforeEach(() => {
  vi.clearAllMocks()
  mockRequireWriteAccess.mockResolvedValue({ id: USER_ID, role: 'account_manager' })
  mockRequireBoardAccess.mockResolvedValue({ id: USER_ID, role: 'account_manager' })
  mockIsStorageConfigured.mockReturnValue(true)
  mockFileExists.mockResolvedValue(true)
  mockGetPublicUrl.mockReturnValue(null)
  mockGetPresignedDownloadUrl.mockResolvedValue('https://download.example/file')
  mockGetPresignedUploadUrl.mockResolvedValue('https://upload.example/file')
  mockGenerateStorageKey.mockReturnValue(`attachments/${TASK_ID}/${USER_ID}/file.pdf`)
  mockResolveStorageUploadTarget.mockReturnValue({ entityType: 'task' })
  mockRequireStorageEntityAccess.mockResolvedValue(undefined)
  mockSignStorageUploadCapability.mockResolvedValue('signed-confirmation-token')
  mockVerifyStorageUploadCapability.mockResolvedValue(null)
  mockStorageUploadCapabilityMatches.mockReturnValue(false)
  mockCanDeleteStorageObject.mockResolvedValue(false)
  mockGetFileMetadata.mockResolvedValue({
    size: 4096,
    contentType: 'application/pdf',
    lastModified: new Date('2026-07-20T12:00:00Z'),
    metadata: undefined
  })
  mockGetHeader.mockReturnValue('application/json')
  mockGetRouterParam.mockReturnValue(TASK_ID)
  mockReadMultipartFormData.mockResolvedValue([])
  mockUploadFile.mockResolvedValue({ key: 'attachments/file.pdf', url: 'https://files.example/file.pdf', size: 4 })
})

describe('generic storage deletion boundary', () => {
  it('denies an unknown prefix without deleting storage or database references', async () => {
    mockGetRouterParam.mockReturnValue(encodeURIComponent('general/another-user/file.pdf'))

    await expect(deleteHandler({} as never)).rejects.toMatchObject({ statusCode: 403 })

    expect(mockCanDeleteStorageObject).toHaveBeenCalledWith('general/another-user/file.pdf', USER_ID)
    expect(mockDeleteFile).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('returns a client error for malformed URL encoding', async () => {
    mockGetRouterParam.mockReturnValue('%')

    await expect(deleteHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockCanDeleteStorageObject).not.toHaveBeenCalled()
  })
})

describe('generic storage presign boundary', () => {
  it('authorizes the entity and returns an actor-bound confirmation capability', async () => {
    mockReadBody.mockResolvedValue({
      fileName: 'brief.pdf',
      fileType: 'application/pdf',
      fileSize: 4096,
      category: 'attachments',
      entityId: TASK_ID
    })

    const result = await presignHandler({} as never)

    expect(mockRequireStorageEntityAccess).toHaveBeenCalledWith({
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      actorId: USER_ID
    })
    expect(mockSignStorageUploadCapability).toHaveBeenCalledWith(expect.objectContaining({
      actorId: USER_ID,
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      fileSize: 4096,
      fileType: 'application/pdf'
    }), expect.any(String))
    expect(result).toMatchObject({ confirmationToken: 'signed-confirmation-token' })
  })

  it('rejects generic categories that have no owned entity policy', async () => {
    mockReadBody.mockResolvedValue({
      fileName: 'payload.bin',
      fileType: 'application/octet-stream',
      fileSize: 128,
      category: 'general'
    })
    mockResolveStorageUploadTarget.mockReturnValue(null)

    await expect(presignHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled()
  })

  it('rejects malformed and oversized request bodies at the boundary', async () => {
    mockReadBody.mockResolvedValueOnce(null)
    await expect(presignHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })

    mockReadBody.mockResolvedValueOnce({
      fileName: `${'a'.repeat(256)}.pdf`,
      fileType: 'application/pdf',
      fileSize: 4096,
      category: 'attachments',
      entityId: TASK_ID
    })
    await expect(presignHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(mockGetPresignedUploadUrl).not.toHaveBeenCalled()
  })
})

describe('generic storage confirmation boundary', () => {
  it('rejects a caller-selected key before reading object metadata', async () => {
    mockReadBody.mockResolvedValue({
      key: 'attachments/another-task/stolen.pdf',
      confirmationToken: 'signed-confirmation-token'
    })
    mockVerifyStorageUploadCapability.mockResolvedValue({
      actorId: USER_ID,
      key: `attachments/${TASK_ID}/${USER_ID}/file.pdf`,
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      fileType: 'application/pdf',
      fileSize: 4096,
      exp: 9999999999,
      version: 1
    })

    await expect(confirmHandler({} as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockFileExists).not.toHaveBeenCalled()
    expect(mockQueryOne).not.toHaveBeenCalled()
  })

  it('rechecks entity access and records an authorised upload', async () => {
    const key = `attachments/${TASK_ID}/${USER_ID}/file.pdf`
    mockReadBody.mockResolvedValue({
      key,
      confirmationToken: 'signed-confirmation-token'
    })
    mockVerifyStorageUploadCapability.mockResolvedValue({
      actorId: USER_ID,
      key,
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      fileType: 'application/pdf',
      fileSize: 4096,
      exp: 9999999999,
      version: 1
    })
    mockStorageUploadCapabilityMatches.mockReturnValue(true)
    mockQueryOne.mockResolvedValueOnce({ id: 'attachment-1' })

    await expect(confirmHandler({} as never)).resolves.toMatchObject({ success: true })

    expect(mockRequireStorageEntityAccess).toHaveBeenCalledWith({
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      actorId: USER_ID
    })
    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO task_attachments[\s\S]*SELECT[\s\S]*FROM tasks/),
      expect.arrayContaining([TASK_ID, USER_ID])
    )
  })

  it('rejects malformed bodies and uploaded metadata that differs from the capability', async () => {
    mockReadBody.mockResolvedValueOnce(null)
    await expect(confirmHandler({} as never)).rejects.toMatchObject({ statusCode: 400 })

    const key = `attachments/${TASK_ID}/${USER_ID}/file.pdf`
    mockReadBody.mockResolvedValueOnce({ key, confirmationToken: 'signed-confirmation-token' })
    mockVerifyStorageUploadCapability.mockResolvedValueOnce({
      actorId: USER_ID,
      key,
      category: 'attachments',
      entityType: 'task',
      entityId: TASK_ID,
      fileType: 'application/pdf',
      fileSize: 4096,
      exp: 9999999999,
      version: 1
    })
    mockStorageUploadCapabilityMatches
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false)

    await expect(confirmHandler({} as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockQueryOne).not.toHaveBeenCalled()
  })
})

describe('task attachment compatibility boundary', () => {
  it('rejects caller-supplied storage metadata instead of attaching an arbitrary key', async () => {
    mockReadBody.mockResolvedValue({
      fileName: 'stolen.pdf',
      fileType: 'application/pdf',
      fileSize: 4096,
      storageKey: 'attachments/another-task/stolen.pdf',
      uploadedBy: 'another-user'
    })
    mockQueryOne.mockResolvedValueOnce({ id: TASK_ID, title: 'Secure storage', department_id: DEPARTMENT_ID })

    await expect(taskAttachmentHandler({} as never)).rejects.toMatchObject({ statusCode: 415 })

    expect(mockRequireWriteAccess).toHaveBeenCalled()
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('attributes multipart uploads to the authenticated actor, not a form field', async () => {
    mockGetHeader.mockReturnValue('multipart/form-data; boundary=test')
    mockIsStorageConfigured.mockReturnValue(false)
    mockReadMultipartFormData.mockResolvedValue([
      {
        name: 'file',
        filename: 'notes.txt',
        type: 'text/plain',
        data: Buffer.from('safe')
      },
      { name: 'uploadedBy', data: Buffer.from('another-user') }
    ])
    mockQueryOne
      .mockResolvedValueOnce({ id: TASK_ID, title: 'Secure storage', department_id: DEPARTMENT_ID })
      .mockResolvedValueOnce({ id: USER_ID, name: 'User', email: 'user@example.com' })

    const query = vi.fn()
      .mockResolvedValueOnce({
        rows: [{
          id: 'attachment-1',
          task_id: TASK_ID,
          file_name: 'notes.txt',
          file_type: 'text/plain',
          file_size: 4,
          file_url: 'data:text/plain;base64,c2FmZQ==',
          storage_key: null,
          created_at: '2026-07-20T12:00:00Z'
        }]
      })
      .mockResolvedValueOnce({ rows: [] })
    mockTransaction.mockImplementationOnce(async (callback: (client: { query: typeof query }) => unknown) => callback({ query }))

    await expect(taskAttachmentHandler({} as never)).resolves.toMatchObject({ id: 'attachment-1' })

    expect(mockRequireBoardAccess).toHaveBeenCalledWith(expect.anything(), DEPARTMENT_ID)
    expect(query.mock.calls[0]?.[1]).toContain(USER_ID)
    expect(query.mock.calls[0]?.[1]).not.toContain('another-user')
  })
})
