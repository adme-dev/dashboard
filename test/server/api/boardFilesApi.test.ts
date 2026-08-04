import { beforeEach, describe, expect, it, vi } from 'vitest'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const USER_ID = '33333333-3333-4333-8333-333333333333'

const mockResolveAccessibleBoard = vi.fn()
const mockListBoardFiles = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockQueryOne = vi.fn()
const mockUploadFile = vi.fn()
const mockDeleteFile = vi.fn()
const mockGenerateStorageKey = vi.fn()
const mockGetPublicUrl = vi.fn()
const mockGetPresignedDownloadUrl = vi.fn()
const mockIsStorageConfigured = vi.fn()
const mockValidateFileType = vi.fn()
const mockValidateFileSize = vi.fn()
const mockGetHeader = vi.fn()
const mockReadMultipartFormData = vi.fn()
const mockSendRedirect = vi.fn()

const routeParams: Record<string, string> = { id: BOARD_ID, fileId: FILE_ID }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (_event: unknown, name: string) => string | undefined
  getHeader: typeof mockGetHeader
  readMultipartFormData: typeof mockReadMultipartFormData
  sendRedirect: typeof mockSendRedirect
  createError: (input: { statusCode: number; statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (_event, name) => routeParams[name]
testGlobal.getHeader = (...args: unknown[]) => mockGetHeader(...args)
testGlobal.readMultipartFormData = (...args: unknown[]) => mockReadMultipartFormData(...args)
testGlobal.sendRedirect = (...args: unknown[]) => mockSendRedirect(...args)
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/boardFiles', () => ({
  resolveAccessibleBoard: (...args: unknown[]) => mockResolveAccessibleBoard(...args),
  listBoardFiles: (...args: unknown[]) => mockListBoardFiles(...args)
}))

vi.mock('~~/server/utils/auth', () => ({
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args)
}))

vi.mock('~~/server/utils/storage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  generateStorageKey: (...args: unknown[]) => mockGenerateStorageKey(...args),
  getAllowedTypes: () => ['application/pdf'],
  getMaxFileSize: () => 50 * 1024 * 1024,
  getPresignedDownloadUrl: (...args: unknown[]) => mockGetPresignedDownloadUrl(...args),
  getPublicUrl: (...args: unknown[]) => mockGetPublicUrl(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args),
  uploadFile: (...args: unknown[]) => mockUploadFile(...args),
  validateFileSize: (...args: unknown[]) => mockValidateFileSize(...args),
  validateFileType: (...args: unknown[]) => mockValidateFileType(...args)
}))

const { default: listHandler } = await import('~~/server/api/agency/boards/[id]/files/index.get')
const { default: uploadHandler } = await import('~~/server/api/agency/boards/[id]/files/index.post')
const { default: downloadHandler } = await import('~~/server/api/agency/boards/[id]/files/[fileId]/download.get')
const { default: deleteHandler } = await import('~~/server/api/agency/boards/[id]/files/[fileId].delete')

describe('board files API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    routeParams.id = BOARD_ID
    routeParams.fileId = FILE_ID
    mockResolveAccessibleBoard.mockResolvedValue({ id: BOARD_ID, name: 'Finance', slug: 'finance' })
    mockRequireWriteAccess.mockResolvedValue({ id: USER_ID, role: 'member' })
    mockListBoardFiles.mockResolvedValue({
      files: [],
      summary: { total: 0, boardDocuments: 0, taskEvidence: 0 }
    })
    mockGetHeader.mockReturnValue('multipart/form-data; boundary=test')
    mockReadMultipartFormData.mockResolvedValue([
      { name: 'file', filename: 'policy.pdf', type: 'application/pdf', data: Buffer.from('%PDF-policy') },
      { name: 'category', data: Buffer.from('policy') },
      { name: 'description', data: Buffer.from('Approved procedure') }
    ])
    mockValidateFileType.mockReturnValue(true)
    mockValidateFileSize.mockReturnValue(true)
    mockGenerateStorageKey.mockReturnValue(`attachments/${BOARD_ID}/policy.pdf`)
    mockUploadFile.mockResolvedValue({
      key: `attachments/${BOARD_ID}/policy.pdf`,
      url: 'https://files.example/policy.pdf',
      size: 11
    })
    mockDeleteFile.mockResolvedValue(undefined)
    mockGetPublicUrl.mockReturnValue(null)
    mockIsStorageConfigured.mockReturnValue(true)
    mockGetPresignedDownloadUrl.mockResolvedValue('https://signed.example/policy.pdf')
    mockSendRedirect.mockImplementation((_event, url, statusCode) => ({ url, statusCode }))
  })

  it('lists files only after resolving board access', async () => {
    const response = await listHandler({ context: {} } as never)

    expect(mockResolveAccessibleBoard).toHaveBeenCalledWith(expect.anything(), BOARD_ID)
    expect(mockListBoardFiles).toHaveBeenCalledWith(BOARD_ID)
    expect(response.summary).toEqual({ total: 0, boardDocuments: 0, taskEvidence: 0 })
  })

  it('rejects duplicate board content before writing storage', async () => {
    mockQueryOne.mockResolvedValueOnce({ id: 'existing-file' })

    await expect(uploadHandler({ context: {} } as never)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'This file is already in the board library'
    })

    expect(mockUploadFile).not.toHaveBeenCalled()
  })

  it('attributes a valid multipart upload to the authenticated user', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: FILE_ID,
        file_name: 'policy.pdf',
        file_type: 'application/pdf',
        file_size: 11,
        category: 'policy',
        description: 'Approved procedure',
        source: 'xeroflow',
        created_at: '2026-08-04T02:00:00.000Z'
      })

    const response = await uploadHandler({ context: {} } as never)

    expect(mockUploadFile).toHaveBeenCalledWith(
      Buffer.from('%PDF-policy'),
      `attachments/${BOARD_ID}/policy.pdf`,
      'application/pdf',
      { boardId: BOARD_ID, uploadedBy: USER_ID, originalName: 'policy.pdf' }
    )
    expect(mockQueryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO board_files'),
      expect.arrayContaining([BOARD_ID, USER_ID, 'policy.pdf', 'policy', 'Approved procedure'])
    )
    expect(response).toMatchObject({ id: FILE_ID, fileName: 'policy.pdf', category: 'policy' })
  })

  it('removes an uploaded object when the database insert fails', async () => {
    mockQueryOne
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('database unavailable'))

    await expect(uploadHandler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 500 })
    expect(mockDeleteFile).toHaveBeenCalledWith(`attachments/${BOARD_ID}/policy.pdf`)
  })

  it('downloads only a file selected by both board and file ID', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: FILE_ID,
      storage_key: `attachments/${BOARD_ID}/policy.pdf`,
      file_url: 'https://stale.example/policy.pdf'
    })

    const response = await downloadHandler({ context: {} } as never)

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining('department_id = $2'),
      [FILE_ID, BOARD_ID]
    )
    expect(mockGetPresignedDownloadUrl).toHaveBeenCalledWith(`attachments/${BOARD_ID}/policy.pdf`, 900)
    expect(response).toEqual({ url: 'https://signed.example/policy.pdf', statusCode: 302 })
  })

  it('prevents a member from deleting another uploader\'s board file', async () => {
    mockQueryOne.mockResolvedValueOnce({
      id: FILE_ID,
      uploaded_by: 'another-user',
      storage_key: `attachments/${BOARD_ID}/policy.pdf`
    })

    await expect(deleteHandler({ context: {} } as never)).rejects.toMatchObject({ statusCode: 403 })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it('allows an owner to delete a board file and its storage object', async () => {
    mockRequireWriteAccess.mockResolvedValue({ id: USER_ID, role: 'owner' })
    mockQueryOne
      .mockResolvedValueOnce({
        id: FILE_ID,
        uploaded_by: 'another-user',
        storage_key: `attachments/${BOARD_ID}/policy.pdf`
      })
      .mockResolvedValueOnce({ id: FILE_ID })

    await expect(deleteHandler({ context: {} } as never)).resolves.toEqual({ success: true })
    expect(mockQueryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM board_files'),
      [FILE_ID, BOARD_ID]
    )
    expect(mockDeleteFile).toHaveBeenCalledWith(`attachments/${BOARD_ID}/policy.pdf`)
  })
})
