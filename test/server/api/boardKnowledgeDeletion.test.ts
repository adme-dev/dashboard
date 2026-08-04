import { beforeEach, describe, expect, it, vi } from 'vitest'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const TASK_ID = '33333333-3333-4333-8333-333333333333'
const ATTACHMENT_ID = '44444444-4444-4444-8444-444444444444'
const USER_ID = '55555555-5555-4555-8555-555555555555'
const SUBMISSION_ID = '66666666-6666-4666-8666-666666666666'
const STORAGE_KEY = `attachments/${TASK_ID}/forecast.pdf`

const mockRequireAuth = vi.fn()
const mockRequireWriteAccess = vi.fn()
const mockResolveAccessibleBoard = vi.fn()
const mockQueryOne = vi.fn()
const mockQueryRows = vi.fn()
const mockTransaction = vi.fn()
const mockClientQuery = vi.fn()
const mockDeleteFile = vi.fn()
const mockFileExists = vi.fn()
const mockIsStorageConfigured = vi.fn()
const mockCanDeleteStorageObject = vi.fn()
const mockGuardKnowledgeSourceDeletion = vi.fn()
const mockArchiveKnowledgeSourceForDeletion = vi.fn()
const mockEnqueue = vi.fn()

const params: Record<string, string> = {
  id: TASK_ID,
  fileId: FILE_ID,
  attachmentId: ATTACHMENT_ID,
  key: encodeURIComponent(STORAGE_KEY)
}
let hardDelete = false

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  getRouterParam: (_event: unknown, name: string) => string | undefined
  getQuery: (_event: unknown) => Record<string, string>
  createError: (input: { statusCode: number, statusMessage: string }) => Error & {
    statusCode: number
    statusMessage: string
  }
}

testGlobal.defineEventHandler = handler => handler
testGlobal.getRouterParam = (_event, name) => params[name]
testGlobal.getQuery = () => hardDelete ? { hard: 'true' } : {}
testGlobal.createError = input => Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
  requireWriteAccess: (...args: unknown[]) => mockRequireWriteAccess(...args)
}))

vi.mock('~~/server/utils/boardFiles', () => ({
  resolveAccessibleBoard: (...args: unknown[]) => mockResolveAccessibleBoard(...args)
}))

vi.mock('~~/server/utils/db', () => ({
  queryOne: (...args: unknown[]) => mockQueryOne(...args),
  queryRows: (...args: unknown[]) => mockQueryRows(...args),
  transaction: (...args: unknown[]) => mockTransaction(...args)
}))

vi.mock('~~/server/utils/storage', () => ({
  deleteFile: (...args: unknown[]) => mockDeleteFile(...args),
  fileExists: (...args: unknown[]) => mockFileExists(...args),
  isStorageConfigured: (...args: unknown[]) => mockIsStorageConfigured(...args)
}))

vi.mock('~~/server/utils/storageAccess', () => ({
  canDeleteStorageObject: (...args: unknown[]) => mockCanDeleteStorageObject(...args)
}))

vi.mock('~~/server/utils/boardKnowledge/lifecycle', () => ({
  archiveKnowledgeSourceForDeletion: (...args: unknown[]) => mockArchiveKnowledgeSourceForDeletion(...args),
  guardKnowledgeSourceDeletion: (...args: unknown[]) => mockGuardKnowledgeSourceDeletion(...args)
}))

vi.mock('~~/server/utils/queue', () => ({
  enqueue: (...args: unknown[]) => mockEnqueue(...args)
}))

const { prepareKnowledgeSourceDeletion } = await import('~~/server/utils/boardKnowledge/deletion')
const { default: deleteBoardFile } = await import('~~/server/api/agency/boards/[id]/files/[fileId].delete')
const { default: deleteTaskAttachment } = await import('~~/server/api/agency/tasks/[id]/attachments/[attachmentId].delete')
const { default: deleteTask } = await import('~~/server/api/agency/tasks/[id].delete')
const { default: deleteStorageObject } = await import('~~/server/api/storage/[key].delete')

function latestSubmission() {
  return {
    id: SUBMISSION_ID,
    sourceVersionKey: 'sha256:version',
    updatedAt: '2026-08-04T05:00:00.000Z',
    indexStatus: 'queued'
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  hardDelete = false
  params.id = TASK_ID
  params.fileId = FILE_ID
  params.attachmentId = ATTACHMENT_ID
  params.key = encodeURIComponent(STORAGE_KEY)
  mockRequireAuth.mockResolvedValue({ id: USER_ID, role: 'owner' })
  mockRequireWriteAccess.mockResolvedValue({ id: USER_ID, role: 'owner' })
  mockResolveAccessibleBoard.mockResolvedValue({ id: BOARD_ID, user: { id: USER_ID, role: 'owner' } })
  mockTransaction.mockImplementation(async callback => callback({ query: mockClientQuery }))
  mockGuardKnowledgeSourceDeletion.mockResolvedValue('clear')
  mockArchiveKnowledgeSourceForDeletion.mockResolvedValue([])
  mockEnqueue.mockResolvedValue(true)
  mockDeleteFile.mockResolvedValue(undefined)
  mockFileExists.mockResolvedValue(true)
  mockIsStorageConfigured.mockReturnValue(true)
  mockCanDeleteStorageObject.mockResolvedValue(true)
  mockQueryRows.mockResolvedValue([])
})

describe('knowledge source deletion preparation', () => {
  const input = {
    departmentId: BOARD_ID,
    sourceType: 'board_file' as const,
    sourceId: FILE_ID,
    actorId: USER_ID
  }

  it('blocks deletion while extraction is processing', async () => {
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('blocked_extraction')

    await expect(prepareKnowledgeSourceDeletion({ context: {} } as never, input)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Knowledge extraction or indexing is in progress'
    })
    expect(mockArchiveKnowledgeSourceForDeletion).not.toHaveBeenCalled()
  })

  it('archives and schedules de-indexing before allowing deletion', async () => {
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('archive_required')
    mockArchiveKnowledgeSourceForDeletion.mockResolvedValue([latestSubmission()])

    await expect(prepareKnowledgeSourceDeletion({ context: {} } as never, input)).resolves.toEqual({
      archived: true,
      queued: true
    })
    expect(mockArchiveKnowledgeSourceForDeletion).toHaveBeenCalledWith({
      departmentId: BOARD_ID,
      sourceType: 'board_file',
      sourceId: FILE_ID,
      actorId: USER_ID
    })
    expect(mockEnqueue).toHaveBeenCalledWith(expect.anything(), 'knowledge.index', {
      submissionId: SUBMISSION_ID,
      expectedVersionKey: 'sha256:version'
    })
  })

  it('keeps deletion available after an archived article is unpublished even if dispatch fails', async () => {
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('archive_required')
    mockArchiveKnowledgeSourceForDeletion.mockResolvedValue([latestSubmission()])
    mockEnqueue.mockRejectedValue(new Error('queue unavailable'))

    await expect(prepareKnowledgeSourceDeletion({ context: {} } as never, input)).resolves.toEqual({
      archived: true,
      queued: false
    })
    expect(mockArchiveKnowledgeSourceForDeletion).toHaveBeenCalledOnce()
  })
})

describe('knowledge-aware deletion routes', () => {
  it('does not remove a board file when knowledge extraction is active', async () => {
    params.id = BOARD_ID
    mockQueryOne.mockResolvedValueOnce({
      id: FILE_ID,
      uploaded_by: USER_ID,
      storage_key: STORAGE_KEY
    })
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('blocked_extraction')

    await expect(deleteBoardFile({ context: {} } as never)).rejects.toMatchObject({ statusCode: 409 })
    expect(mockQueryOne).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it('archives approved board knowledge before deleting its row and storage object', async () => {
    params.id = BOARD_ID
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('archive_required')
    mockArchiveKnowledgeSourceForDeletion.mockResolvedValue([latestSubmission()])
    mockQueryOne
      .mockResolvedValueOnce({ id: FILE_ID, uploaded_by: USER_ID, storage_key: STORAGE_KEY })
      .mockResolvedValueOnce({ id: FILE_ID })

    await expect(deleteBoardFile({ context: {} } as never)).resolves.toEqual({ success: true })

    expect(mockArchiveKnowledgeSourceForDeletion).toHaveBeenCalledOnce()
    expect(mockQueryOne).toHaveBeenLastCalledWith(
      expect.stringContaining('DELETE FROM board_files'),
      [FILE_ID, BOARD_ID]
    )
    expect(mockArchiveKnowledgeSourceForDeletion.mock.invocationCallOrder[0]).toBeLessThan(mockQueryOne.mock.invocationCallOrder[1]!)
    expect(mockDeleteFile.mock.invocationCallOrder[0]).toBeGreaterThan(mockQueryOne.mock.invocationCallOrder[1]!)
  })

  it('applies the same lifecycle guard to a task attachment', async () => {
    mockGuardKnowledgeSourceDeletion.mockResolvedValue('archive_required')
    mockArchiveKnowledgeSourceForDeletion.mockResolvedValue([latestSubmission()])
    mockQueryOne.mockResolvedValueOnce({
      id: ATTACHMENT_ID,
      task_id: TASK_ID,
      file_name: 'forecast.pdf',
      storage_key: STORAGE_KEY,
      uploaded_by: USER_ID,
      assignee_id: null,
      reporter_id: null,
      department_id: BOARD_ID
    })

    await expect(deleteTaskAttachment({ context: {} } as never)).resolves.toMatchObject({ success: true })
    expect(mockGuardKnowledgeSourceDeletion).toHaveBeenCalledWith({
      departmentId: BOARD_ID,
      sourceType: 'task_attachment',
      sourceId: ATTACHMENT_ID
    })
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM task_attachments'),
      [ATTACHMENT_ID]
    )
    expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_KEY)
  })

  it('prepares every attachment before a hard task delete and removes storage afterward', async () => {
    hardDelete = true
    mockQueryOne.mockResolvedValueOnce({ id: TASK_ID, title: 'Forecast review', department_id: BOARD_ID })
    mockQueryRows.mockResolvedValueOnce([{ id: ATTACHMENT_ID, storage_key: STORAGE_KEY }])

    await expect(deleteTask({ context: {} } as never)).resolves.toMatchObject({ success: true })
    expect(mockGuardKnowledgeSourceDeletion).toHaveBeenCalledWith({
      departmentId: BOARD_ID,
      sourceType: 'task_attachment',
      sourceId: ATTACHMENT_ID
    })
    expect(mockClientQuery).toHaveBeenCalledWith('DELETE FROM task_attachments WHERE task_id = $1', [TASK_ID])
    expect(mockDeleteFile).toHaveBeenCalledWith(STORAGE_KEY)
    expect(mockDeleteFile.mock.invocationCallOrder[0]).toBeGreaterThan(mockTransaction.mock.invocationCallOrder[0]!)
  })

  it('guards knowledge references before generic storage cleanup and deletes R2 last', async () => {
    mockQueryRows.mockResolvedValueOnce([{
      source_type: 'task_attachment',
      source_id: ATTACHMENT_ID,
      department_id: BOARD_ID
    }])

    await expect(deleteStorageObject({ context: {} } as never)).resolves.toMatchObject({ success: true })
    expect(mockGuardKnowledgeSourceDeletion).toHaveBeenCalledWith({
      departmentId: BOARD_ID,
      sourceType: 'task_attachment',
      sourceId: ATTACHMENT_ID
    })
    expect(mockClientQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM task_attachments'),
      [STORAGE_KEY]
    )
    const finalDatabaseCall = mockClientQuery.mock.invocationCallOrder.at(-1)!
    expect(mockDeleteFile.mock.invocationCallOrder[0]).toBeGreaterThan(finalDatabaseCall)
  })
})
