import { createHash } from 'node:crypto'

export type BoardKnowledgeSourceType = 'board_file' | 'task_attachment'
export type BoardKnowledgeReviewStatus = 'pending' | 'approved' | 'rejected' | 'archived'
export type BoardKnowledgeExtractionStatus = 'queued' | 'processing' | 'ready' | 'failed'
export type BoardKnowledgeExtractionMethod = 'native' | 'gemini' | 'huggingface'
export type BoardKnowledgeIndexStatus = 'not_indexed' | 'queued' | 'indexing' | 'indexed' | 'failed' | 'removed'
export type BoardKnowledgeLabel =
  | 'Not submitted'
  | 'Extracting'
  | 'Ready for review'
  | 'Approved · indexing'
  | 'Used by AI'
  | 'Rejected'
  | 'Extraction failed'
  | 'Archived'
  | 'Not indexable'

export interface BoardKnowledgeSubmission {
  id: string
  departmentId: string
  sourceType: BoardKnowledgeSourceType
  sourceId: string
  sourceFileName: string
  sourceMimeType: string
  sourceSize: number
  sourceVersionKey: string
  sourceChecksumSha256: string | null
  sourceDeletedAt: string | null
  submittedBy: string
  submittedAt: string
  reviewStatus: BoardKnowledgeReviewStatus
  reviewedBy: string | null
  reviewedAt: string | null
  reviewReason: string | null
  extractionStatus: BoardKnowledgeExtractionStatus
  extractionMethod: BoardKnowledgeExtractionMethod | null
  extractionProvider: string | null
  extractionModel: string | null
  extractionStartedAt: string | null
  extractionCompletedAt: string | null
  extractionMetrics: Record<string, unknown>
  extractionWarnings: string[]
  extractionErrorCode: string | null
  extractionErrorMessage: string | null
  indexStatus: BoardKnowledgeIndexStatus
  aiKnowledgeArticleId: string | null
  createdAt: string
  updatedAt: string
}

export interface BoardKnowledgeProjection {
  submissionId: string | null
  reviewStatus: BoardKnowledgeReviewStatus | null
  extractionStatus: BoardKnowledgeExtractionStatus | null
  indexStatus: BoardKnowledgeIndexStatus | null
  indexable: boolean
  label: BoardKnowledgeLabel
  canSubmit: boolean
  canReview: boolean
}

export interface BoardKnowledgeSourceVersionInput {
  id: string
  checksum: string | null
  storageKey: string | null
  size: number
  updatedAt: string | Date
}

const SUPPORTED_FILE_MIME_TYPES: Readonly<Record<string, ReadonlySet<string>>> = {
  pdf: new Set(['application/pdf']),
  docx: new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  xls: new Set(['application/vnd.ms-excel']),
  xlsx: new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  pptx: new Set(['application/vnd.openxmlformats-officedocument.presentationml.presentation']),
  csv: new Set(['text/csv', 'application/csv']),
  txt: new Set(['text/plain']),
  json: new Set(['application/json', 'text/json'])
}

function normalizedExtension(fileName: string): string {
  const normalizedName = fileName.trim().toLowerCase()
  const separator = normalizedName.lastIndexOf('.')
  if (separator <= 0 || separator === normalizedName.length - 1) return ''
  return normalizedName.slice(separator + 1)
}

function normalizedMimeType(mimeType: string): string {
  return mimeType.split(';', 1)[0]?.trim().toLowerCase() || ''
}

export function isIndexableBoardKnowledgeFile(fileName: string, mimeType: string): boolean {
  const allowedMimeTypes = SUPPORTED_FILE_MIME_TYPES[normalizedExtension(fileName)]
  return Boolean(allowedMimeTypes?.has(normalizedMimeType(mimeType)))
}

export function sourceVersionKey(input: BoardKnowledgeSourceVersionInput): string {
  const checksum = input.checksum?.trim().toLowerCase()
  if (checksum) return `sha256:${checksum}`

  const updatedAt = input.updatedAt instanceof Date ? input.updatedAt.toISOString() : input.updatedAt
  const digest = createHash('sha256')
    .update(JSON.stringify({
      id: input.id,
      storageKey: input.storageKey || '',
      size: input.size,
      updatedAt
    }))
    .digest('hex')

  return `record:${digest}`
}
