import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  execute: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/db', () => db)

import {
  createSubmission,
  getSubmissionForBoard,
  listBoardKnowledge,
  resolveKnowledgeSource
} from '~~/server/utils/boardKnowledge/repository'

const BOARD_ID = '11111111-1111-4111-8111-111111111111'
const FILE_ID = '22222222-2222-4222-8222-222222222222'
const ATTACHMENT_ID = '33333333-3333-4333-8333-333333333333'
const SUBMISSION_ID = '44444444-4444-4444-8444-444444444444'

const submissionRow = {
  id: SUBMISSION_ID,
  department_id: BOARD_ID,
  source_type: 'board_file',
  source_entity_id: FILE_ID,
  source_file_name: 'Cashflow policy.pdf',
  source_mime_type: 'application/pdf',
  source_size: '2048',
  source_version_key: 'sha256:abc',
  source_checksum_sha256: 'abc',
  source_deleted_at: null,
  submitted_by: 'user-1',
  submitted_at: '2026-08-04T01:00:00.000Z',
  review_status: 'pending',
  reviewed_by: null,
  reviewed_at: null,
  review_reason: null,
  extraction_status: 'queued',
  extraction_method: null,
  extraction_provider: null,
  extraction_model: null,
  extraction_started_at: null,
  extraction_completed_at: null,
  extraction_metrics: {},
  extraction_warnings: [],
  extraction_error_code: null,
  extraction_error_message: null,
  index_status: 'not_indexed',
  ai_knowledge_article_id: null,
  created_at: '2026-08-04T01:00:00.000Z',
  updated_at: '2026-08-04T01:00:00.000Z'
}

describe('board knowledge repository', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves a board file only inside the requested board', async () => {
    db.queryOne.mockResolvedValueOnce({
      id: FILE_ID,
      department_id: BOARD_ID,
      file_name: 'Cashflow policy.pdf',
      file_type: 'application/pdf',
      file_size: '2048',
      storage_key: 'boards/finance/policy.pdf',
      checksum_sha256: 'ABC',
      updated_at: '2026-08-04T01:00:00.000Z'
    })

    await expect(resolveKnowledgeSource(BOARD_ID, 'board_file', FILE_ID)).resolves.toEqual({
      sourceType: 'board_file',
      sourceId: FILE_ID,
      departmentId: BOARD_ID,
      fileName: 'Cashflow policy.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      storageKey: 'boards/finance/policy.pdf',
      checksum: 'abc',
      versionKey: 'sha256:abc',
      task: null
    })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM board_files[\s\S]*id = \$1[\s\S]*department_id = \$2/i),
      [FILE_ID, BOARD_ID]
    )
  })

  it('resolves a task attachment through its task board', async () => {
    db.queryOne.mockResolvedValueOnce({
      id: ATTACHMENT_ID,
      department_id: BOARD_ID,
      file_name: 'Forecast.xlsx',
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size: 4096,
      storage_key: 'tasks/forecast.xlsx',
      created_at: '2026-08-04T01:00:00.000Z',
      task_id: 'task-1',
      task_title: 'Weekly forecast'
    })

    const source = await resolveKnowledgeSource(BOARD_ID, 'task_attachment', ATTACHMENT_ID)

    expect(source).toMatchObject({
      sourceType: 'task_attachment',
      sourceId: ATTACHMENT_ID,
      departmentId: BOARD_ID,
      storageKey: 'tasks/forecast.xlsx',
      checksum: null,
      task: { id: 'task-1', title: 'Weekly forecast' }
    })
    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/FROM task_attachments[\s\S]*JOIN tasks[\s\S]*ta\.id = \$1[\s\S]*t\.department_id = \$2/i),
      [ATTACHMENT_ID, BOARD_ID]
    )
  })

  it('fails closed when managed storage is unavailable', async () => {
    db.queryOne.mockResolvedValueOnce({
      id: FILE_ID,
      department_id: BOARD_ID,
      file_name: 'Remote.pdf',
      file_type: 'application/pdf',
      file_size: 20,
      storage_key: null,
      checksum_sha256: 'abc',
      updated_at: '2026-08-04T01:00:00.000Z'
    })

    await expect(resolveKnowledgeSource(BOARD_ID, 'board_file', FILE_ID)).rejects.toMatchObject({
      statusCode: 409,
      statusMessage: 'Source file is not available in managed storage'
    })
  })

  it('returns the existing submission after a source-version uniqueness race', async () => {
    db.queryOne
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
      .mockResolvedValueOnce(submissionRow)

    const submission = await createSubmission({
      source: {
        sourceType: 'board_file',
        sourceId: FILE_ID,
        departmentId: BOARD_ID,
        fileName: 'Cashflow policy.pdf',
        mimeType: 'application/pdf',
        size: 2048,
        storageKey: 'boards/finance/policy.pdf',
        checksum: 'abc',
        versionKey: 'sha256:abc',
        task: null
      },
      submittedBy: 'user-1'
    })

    expect(submission.id).toBe(SUBMISSION_ID)
    expect(db.queryOne.mock.calls[1]?.[0]).toMatch(/source_type = \$2[\s\S]*source_entity_id = \$3[\s\S]*source_version_key = \$4/i)
    expect(db.queryOne.mock.calls[1]?.[1]).toEqual([BOARD_ID, 'board_file', FILE_ID, 'sha256:abc'])
  })

  it('scopes detail and summary reads without selecting extracted article content', async () => {
    db.queryOne.mockResolvedValueOnce(submissionRow)
    db.queryRows.mockResolvedValueOnce([submissionRow])

    await expect(getSubmissionForBoard(SUBMISSION_ID, BOARD_ID)).resolves.toMatchObject({ id: SUBMISSION_ID })
    await expect(listBoardKnowledge(BOARD_ID)).resolves.toHaveLength(1)

    expect(db.queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE bks\.id = \$1 AND bks\.department_id = \$2/i),
      [SUBMISSION_ID, BOARD_ID]
    )
    const summarySql = String(db.queryRows.mock.calls[0]?.[0])
    expect(summarySql).toMatch(/WHERE bks\.department_id = \$1/i)
    expect(summarySql).not.toMatch(/\ba\.content\b/i)
  })
})
