import { describe, expect, it } from 'vitest'
import { BOARD_VIEW_OPTIONS, isBoardViewType } from '~~/app/utils/boardViews'
import { filterBoardFileItems } from '~~/app/utils/boardFiles'

const files = [
  {
    id: 'board-file-1',
    boardId: 'board-1',
    scope: 'board' as const,
    fileName: 'Cashflow policy.pdf',
    fileUrl: '/download/policy',
    fileType: 'application/pdf',
    fileSize: 100,
    category: 'policy' as const,
    description: 'Approved procedure',
    source: 'xeroflow' as const,
    sourceReference: null,
    createdAt: '2026-08-04T00:00:00.000Z',
    uploadedBy: { id: 'user-1', name: 'Clara', email: 'clara@adme.net.au' },
    canDelete: true,
    task: null,
    knowledge: {
      submissionId: null,
      reviewStatus: null,
      extractionStatus: null,
      indexStatus: null,
      indexable: true,
      label: 'Not submitted' as const,
      canSubmit: true,
      canReview: false
    }
  },
  {
    id: 'task-file-1',
    boardId: 'board-1',
    scope: 'task' as const,
    fileName: 'Bookkeeper instruction.pdf',
    fileUrl: '/download/instruction',
    fileType: 'application/pdf',
    fileSize: 200,
    category: 'evidence' as const,
    description: null,
    source: 'monday' as const,
    sourceReference: 'asset-1',
    createdAt: '2026-08-03T00:00:00.000Z',
    uploadedBy: null,
    canDelete: false,
    task: { id: 'task-1', title: 'Reference PDFs' },
    knowledge: {
      submissionId: 'submission-1',
      reviewStatus: 'approved' as const,
      extractionStatus: 'ready' as const,
      indexStatus: 'indexed' as const,
      indexable: true,
      label: 'Used by AI' as const,
      canSubmit: false,
      canReview: false
    }
  }
]

describe('board Files view integration contracts', () => {
  it('recognizes Files as a routed board view and exposes it in the switcher', () => {
    expect(isBoardViewType('files')).toBe(true)
    expect(isBoardViewType('unknown')).toBe(false)
    expect(BOARD_VIEW_OPTIONS).toContainEqual({
      id: 'files',
      label: 'Files',
      icon: 'i-lucide-folder-open'
    })
  })

  it('filters by searchable metadata, scope, and category using all sentinels', () => {
    expect(filterBoardFileItems(files, { search: 'clara', scope: 'all', category: 'all' }))
      .toEqual([files[0]])
    expect(filterBoardFileItems(files, { search: 'reference pdfs', scope: 'task', category: 'evidence' }))
      .toEqual([files[1]])
    expect(filterBoardFileItems(files, { search: '', scope: 'board', category: 'policy' }))
      .toEqual([files[0]])
  })
})
