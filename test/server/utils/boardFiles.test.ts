import { describe, expect, it } from 'vitest'
import type { User } from '~~/server/utils/auth'
import { mapBoardFileRows } from '~~/server/utils/boardFiles'

const member = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'Member',
  role: 'member',
  is_active: true
} satisfies User

const owner = {
  id: 'owner-1',
  email: 'owner@example.com',
  name: 'Owner',
  role: 'owner',
  is_active: true
} satisfies User

describe('board file aggregation', () => {
  it('maps board documents and task evidence without changing ownership', () => {
    const result = mapBoardFileRows('board-1', [
      {
        id: 'board-file-1',
        file_name: 'Cashflow policy.pdf',
        file_url: 'https://files.example/policy.pdf',
        file_type: 'application/pdf',
        file_size: '2048',
        category: 'policy',
        description: 'Approved cashflow procedure',
        source: 'xeroflow',
        source_reference: null,
        created_at: '2026-08-04T01:00:00.000Z',
        uploader_id: 'user-1',
        uploader_name: 'Clara',
        uploader_email: 'clara@adme.net.au'
      }
    ], [
      {
        id: 'task-file-1',
        task_id: 'task-1',
        task_title: 'Reference PDFs',
        file_name: 'Bookkeeper instruction.pdf',
        file_url: 'https://files.example/instruction.pdf',
        file_type: 'application/pdf',
        file_size: 4096,
        created_at: '2026-08-03T01:00:00.000Z',
        uploader_id: 'user-2',
        uploader_name: 'Kellie',
        uploader_email: 'accounts@adme.net.au',
        monday_asset_id: '3155321317'
      }
    ], member)

    expect(result).toEqual({
      files: [
        {
          id: 'board-file-1',
          boardId: 'board-1',
          scope: 'board',
          fileName: 'Cashflow policy.pdf',
          fileUrl: '/api/agency/boards/board-1/files/board-file-1/download',
          fileType: 'application/pdf',
          fileSize: 2048,
          category: 'policy',
          description: 'Approved cashflow procedure',
          source: 'xeroflow',
          sourceReference: null,
          createdAt: '2026-08-04T01:00:00.000Z',
          uploadedBy: { id: 'user-1', name: 'Clara', email: 'clara@adme.net.au' },
          canDelete: true,
          task: null,
          knowledge: {
            submissionId: null,
            reviewStatus: null,
            extractionStatus: null,
            indexStatus: null,
            indexable: true,
            label: 'Not submitted',
            canSubmit: true,
            canReview: false
          }
        },
        {
          id: 'task-file-1',
          boardId: 'board-1',
          scope: 'task',
          fileName: 'Bookkeeper instruction.pdf',
          fileUrl: '/api/agency/boards/board-1/files/task/task-file-1/download',
          fileType: 'application/pdf',
          fileSize: 4096,
          category: 'evidence',
          description: null,
          source: 'monday',
          sourceReference: '3155321317',
          createdAt: '2026-08-03T01:00:00.000Z',
          uploadedBy: { id: 'user-2', name: 'Kellie', email: 'accounts@adme.net.au' },
          canDelete: false,
          task: { id: 'task-1', title: 'Reference PDFs' },
          knowledge: {
            submissionId: null,
            reviewStatus: null,
            extractionStatus: null,
            indexStatus: null,
            indexable: true,
            label: 'Not submitted',
            canSubmit: true,
            canReview: false
          }
        }
      ],
      summary: { total: 2, boardDocuments: 1, taskEvidence: 1 }
    })
  })

  it('keeps an unknown uploader nullable and labels native task evidence', () => {
    const result = mapBoardFileRows('board-1', [], [{
      id: 'task-file-2',
      task_id: 'task-2',
      task_title: 'Bank reconciliation',
      file_name: 'reconciliation.csv',
      file_url: '/api/_uploads/reconciliation.csv',
      storage_key: 'attachments/task-2/reconciliation.csv',
      file_type: 'text/csv',
      file_size: null,
      created_at: new Date('2026-08-02T01:00:00.000Z'),
      uploader_id: null,
      uploader_name: null,
      uploader_email: null,
      monday_asset_id: null
    }], owner)

    expect(result.files[0]).toMatchObject({
      source: 'task',
      sourceReference: null,
      fileSize: 0,
      uploadedBy: null,
      canDelete: false
    })
  })

  it('falls back safely when an uploader record has incomplete profile metadata', () => {
    const result = mapBoardFileRows('board-1', [{
      id: 'board-file-2',
      file_name: 'Forecast template.xlsx',
      file_url: 'https://files.example/forecast.xlsx',
      file_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      file_size: '1024',
      category: 'template',
      description: null,
      source: 'xeroflow',
      source_reference: null,
      created_at: '2026-08-04T01:00:00.000Z',
      uploader_id: 'deleted-user',
      uploader_name: null,
      uploader_email: null
    }], [], owner)

    expect(result.files[0]?.uploadedBy).toEqual({
      id: 'deleted-user',
      name: 'Unknown user',
      email: ''
    })
  })

  it('marks unsupported files as not indexable before any submission exists', () => {
    const result = mapBoardFileRows('board-1', [{
      id: 'board-file-image',
      file_name: 'whiteboard.png',
      file_type: 'image/png',
      file_size: 512,
      category: 'reference',
      description: null,
      source: 'xeroflow',
      source_reference: null,
      created_at: '2026-08-04T01:00:00.000Z',
      uploader_id: 'user-1',
      uploader_name: 'Clara',
      uploader_email: 'clara@adme.net.au'
    }], [], member)

    expect(result.files[0]?.knowledge).toEqual({
      submissionId: null,
      reviewStatus: null,
      extractionStatus: null,
      indexStatus: null,
      indexable: false,
      label: 'Not indexable',
      canSubmit: false,
      canReview: false
    })
  })

  it.each([
    ['queued', 'pending', 'not_indexed', 'Extracting'],
    ['processing', 'pending', 'not_indexed', 'Extracting'],
    ['ready', 'pending', 'not_indexed', 'Ready for review'],
    ['ready', 'approved', 'queued', 'Approved · indexing'],
    ['ready', 'approved', 'indexed', 'Used by AI'],
    ['ready', 'rejected', 'not_indexed', 'Rejected'],
    ['failed', 'pending', 'not_indexed', 'Extraction failed'],
    ['ready', 'archived', 'removed', 'Archived']
  ] as const)('projects %s/%s/%s as %s with permission-aware actions', (
    extractionStatus,
    reviewStatus,
    indexStatus,
    label
  ) => {
    const managerViaCustomRole = {
      ...member,
      permissionGroups: ['MANAGEMENT']
    } satisfies User
    const result = mapBoardFileRows('board-1', [{
      id: 'board-file-knowledge',
      file_name: 'forecast.pdf',
      file_type: 'application/pdf',
      file_size: 1024,
      category: 'reference',
      description: null,
      source: 'xeroflow',
      source_reference: null,
      created_at: '2026-08-04T01:00:00.000Z',
      uploader_id: 'user-1',
      uploader_name: 'Clara',
      uploader_email: 'clara@adme.net.au',
      knowledge_submission_id: 'submission-1',
      knowledge_review_status: reviewStatus,
      knowledge_extraction_status: extractionStatus,
      knowledge_index_status: indexStatus
    }], [], managerViaCustomRole)

    expect(result.files[0]?.knowledge).toEqual({
      submissionId: 'submission-1',
      reviewStatus,
      extractionStatus,
      indexStatus,
      indexable: true,
      label,
      canSubmit: false,
      canReview: true
    })
  })
})
