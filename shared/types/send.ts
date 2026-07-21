import { z } from 'zod'

export const TRANSFER_STATUSES = [
  'draft',
  'awaiting_verification',
  'uploading',
  'scanning',
  'ready',
  'revoked',
  'expired',
  'deletion_pending',
  'deleted',
  'failed'
] as const

export const FILE_STATUSES = [
  'pending',
  'uploading',
  'uploaded',
  'quarantined',
  'clean',
  'aborted',
  'rejected',
  'failed',
  'deleted'
] as const

export const TransferStatusSchema = z.enum(TRANSFER_STATUSES)
export const FileStatusSchema = z.enum(FILE_STATUSES)

export type TransferStatus = z.infer<typeof TransferStatusSchema>
export type FileStatus = z.infer<typeof FileStatusSchema>

const RecipientEmailSchema = z.string()
  .trim()
  .email()
  .max(320)
  .transform(email => email.toLowerCase())

const RecipientListSchema = z.array(RecipientEmailSchema).max(100).superRefine((recipients, context) => {
  const seen = new Set<string>()
  for (const [index, recipient] of recipients.entries()) {
    if (seen.has(recipient)) {
      context.addIssue({
        code: 'custom',
        path: [index],
        message: 'Duplicate recipient email'
      })
    }
    seen.add(recipient)
  }
})

const CommonTransferDraftShape = {
  title: z.string().trim().min(1).max(255),
  message: z.string().trim().max(5000).optional(),
  recipients: RecipientListSchema.default([]),
  expiresAt: z.string().datetime({ offset: true }),
  password: z.string()
    .min(8)
    .max(128)
    .refine(password => new TextEncoder().encode(password).byteLength <= 72, {
      message: 'Password must be at most 72 UTF-8 bytes'
    })
    .optional(),
  maxDownloads: z.number().int().positive().optional(),
  idempotencyKey: z.string().trim().min(16).max(255)
}

export const WorkspaceTransferDraftSchema = z.object({
  ...CommonTransferDraftShape,
  clientId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional()
}).strict().superRefine((draft, context) => {
  if (draft.projectId && !draft.clientId) {
    context.addIssue({
      code: 'custom',
      path: ['projectId'],
      message: 'A project-scoped transfer requires a client'
    })
  }
})

export const PublicTransferDraftSchema = z.object(CommonTransferDraftShape).strict()

const QueryIntegerSchema = z.preprocess(
  value => typeof value === 'string' ? Number(value) : value,
  z.number().int()
)

export const WorkspaceTransferListQuerySchema = z.object({
  status: TransferStatusSchema.optional(),
  page: QueryIntegerSchema.pipe(z.number().min(1)).default(1),
  pageSize: QueryIntegerSchema.pipe(z.number().min(1).max(100)).default(25)
}).strict()

export const FileDeclarationSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  contentType: z.string()
    .trim()
    .min(1)
    .max(255)
    .regex(/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/, 'Invalid MIME type')
}).strict()

export const WorkspaceUploadIntentRequestSchema = FileDeclarationSchema.extend({
  idempotencyKey: z.string().trim().min(16).max(255)
}).strict()

const UploadCapabilitySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

export const WorkspaceUploadCompleteSchema = z.object({
  capability: UploadCapabilitySchema
}).strict()

export const WorkspaceUploadAbortSchema = z.object({
  capability: UploadCapabilitySchema
}).strict()

export type WorkspaceTransferDraft = z.infer<typeof WorkspaceTransferDraftSchema>
export type PublicTransferDraft = z.infer<typeof PublicTransferDraftSchema>
export type WorkspaceTransferListQuery = z.infer<typeof WorkspaceTransferListQuerySchema>
export type FileDeclaration = z.infer<typeof FileDeclarationSchema>
export type WorkspaceUploadIntentRequest = z.infer<typeof WorkspaceUploadIntentRequestSchema>
export type WorkspaceUploadComplete = z.infer<typeof WorkspaceUploadCompleteSchema>

export interface WorkspaceUploadIntentResponse {
  fileId: string
  intentId: string
  uploadUrl: string
  capability: string
  requiredHeaders: { 'Content-Type': string }
  expiresAt: string
}

export interface WorkspaceUploadedFile {
  id: string
  fileName: string
  state: FileStatus
  size: number
  contentType: string
  etag: string | null
  uploadedAt: string | null
}

export interface WorkspaceTransferSummary {
  id: string
  tenantId: string | null
  clientId: string | null
  projectId: string | null
  status: TransferStatus
  version: number
  title: string
  message: string | null
  passwordProtected: boolean
  maxDownloads: number | null
  fileCount: number
  totalBytes: number
  recipientCount: number
  expiresAt: string
  createdAt: string
  updatedAt: string
}

export interface WorkspaceSendPolicySummary {
  defaultRetentionDays: number
  maxRetentionDays: number
  maxRecipients: number
  maxDownloads: number
  maxTransferBytes: number
  maxFileBytes: number
  maxFiles: number
}

export interface WorkspaceTransferListResponse {
  transfers: WorkspaceTransferSummary[]
  page: number
  pageSize: number
  hasMore: boolean
  policy: WorkspaceSendPolicySummary
}

const transferTransitions: Readonly<Record<TransferStatus, readonly TransferStatus[]>> = {
  draft: ['awaiting_verification', 'uploading', 'revoked', 'failed'],
  awaiting_verification: ['uploading', 'revoked', 'failed'],
  uploading: ['scanning', 'revoked', 'failed'],
  scanning: ['ready', 'revoked', 'failed'],
  ready: ['revoked', 'expired', 'deletion_pending'],
  revoked: ['deletion_pending'],
  expired: ['deletion_pending'],
  deletion_pending: ['deleted'],
  deleted: [],
  failed: ['deletion_pending']
}

const fileTransitions: Readonly<Record<FileStatus, readonly FileStatus[]>> = {
  pending: ['uploading', 'failed'],
  uploading: ['uploaded', 'aborted', 'failed'],
  uploaded: ['quarantined', 'rejected', 'failed'],
  quarantined: ['clean', 'rejected', 'failed'],
  clean: ['deleted'],
  aborted: ['deleted'],
  rejected: ['deleted'],
  failed: ['deleted'],
  deleted: []
}

export function canTransitionTransfer(from: TransferStatus, to: TransferStatus): boolean {
  return transferTransitions[from].includes(to)
}

export function canTransitionFile(from: FileStatus, to: FileStatus): boolean {
  return fileTransitions[from].includes(to)
}
