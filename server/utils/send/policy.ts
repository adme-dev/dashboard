import { z } from 'zod'
import type { TransferStatus } from '../../../shared/types/send'

const DAY_MS = 24 * 60 * 60 * 1000

export const SendPolicyConfigSchema = z.object({
  surface: z.enum(['workspace', 'public']),
  maxTransferBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxFileBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  maxFiles: z.number().int().positive(),
  defaultRetentionDays: z.number().int().positive(),
  maxRetentionDays: z.number().int().positive(),
  maxRecipients: z.number().int().nonnegative(),
  maxDownloads: z.number().int().positive(),
  scanRequired: z.boolean()
}).strict().superRefine((config, context) => {
  if (config.maxFileBytes > config.maxTransferBytes) {
    context.addIssue({
      code: 'custom',
      path: ['maxFileBytes'],
      message: 'Per-file bytes cannot exceed transfer bytes'
    })
  }
  if (config.defaultRetentionDays > config.maxRetentionDays) {
    context.addIssue({
      code: 'custom',
      path: ['defaultRetentionDays'],
      message: 'Default retention cannot exceed maximum retention'
    })
  }
})

export type SendPolicyConfig = z.infer<typeof SendPolicyConfigSchema>

export interface ResolveTransferPolicyInput {
  now: Date
  expiresAt?: Date
  fileSizes: readonly number[]
  recipientCount: number
  maxDownloads?: number
}

export interface SendPolicySnapshot {
  surface: 'workspace' | 'public'
  maxTransferBytes: number
  maxFileBytes: number
  maxFiles: number
  retentionDays: number
  maxRecipients: number
  maxDownloads: number
  scanRequired: boolean
}

export function resolveTransferPolicy(
  untrustedConfig: SendPolicyConfig,
  input: ResolveTransferPolicyInput
): { expiresAt: Date, snapshot: SendPolicySnapshot } {
  const config = SendPolicyConfigSchema.parse(untrustedConfig)
  if (!Number.isSafeInteger(input.recipientCount) || input.recipientCount < 0) {
    throw new Error('Invalid recipient count')
  }
  if (input.fileSizes.length > config.maxFiles) throw new Error('Transfer exceeds file limit')
  if (input.recipientCount > config.maxRecipients) throw new Error('Transfer exceeds recipient limit')

  let totalBytes = 0
  for (const size of input.fileSizes) {
    if (!Number.isSafeInteger(size) || size <= 0) throw new Error('Invalid file byte size')
    if (size > config.maxFileBytes) throw new Error('File exceeds file byte limit')
    totalBytes += size
    if (!Number.isSafeInteger(totalBytes) || totalBytes > config.maxTransferBytes) {
      throw new Error('Transfer exceeds byte limit')
    }
  }

  const expiresAt = input.expiresAt
    ? new Date(input.expiresAt)
    : new Date(input.now.getTime() + config.defaultRetentionDays * DAY_MS)
  const retentionMs = expiresAt.getTime() - input.now.getTime()
  if (!Number.isFinite(retentionMs) || retentionMs <= 0) throw new Error('Transfer expiry must be in the future')
  if (retentionMs > config.maxRetentionDays * DAY_MS) throw new Error('Transfer exceeds retention limit')

  const maxDownloads = input.maxDownloads ?? config.maxDownloads
  if (!Number.isSafeInteger(maxDownloads) || maxDownloads <= 0 || maxDownloads > config.maxDownloads) {
    throw new Error('Transfer exceeds download limit')
  }

  return {
    expiresAt,
    snapshot: {
      surface: config.surface,
      maxTransferBytes: config.maxTransferBytes,
      maxFileBytes: config.maxFileBytes,
      maxFiles: config.maxFiles,
      retentionDays: retentionMs / DAY_MS,
      maxRecipients: config.maxRecipients,
      maxDownloads,
      scanRequired: config.scanRequired
    }
  }
}

export interface PublicTransferSource {
  id: string
  title: string
  message?: string | null
  status: TransferStatus
  expiresAt: string
  publishedAt?: string | null
  expectedFileCount: number
  expectedTotalBytes: number
  accessMode: 'link' | 'password'
  senderDisplayName: string
  [key: string]: unknown
}

export interface PublicTransferSummary {
  id: string
  title: string
  message: string | null
  status: TransferStatus
  expiresAt: string
  publishedAt: string | null
  fileCount: number
  totalBytes: number
  passwordProtected: boolean
  senderDisplayName: string
}

export function toPublicTransferSummary(source: PublicTransferSource): PublicTransferSummary {
  return {
    id: source.id,
    title: source.title,
    message: source.message ?? null,
    status: source.status,
    expiresAt: source.expiresAt,
    publishedAt: source.publishedAt ?? null,
    fileCount: source.expectedFileCount,
    totalBytes: source.expectedTotalBytes,
    passwordProtected: source.accessMode === 'password',
    senderDisplayName: source.senderDisplayName
  }
}
