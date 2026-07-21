import { SendPolicyConfigSchema, type SendPolicyConfig } from './policy'

interface SendRuntimeConfig {
  sendEnabled?: boolean
  sendWorkspaceMaxTransferBytes?: number
  sendWorkspaceMaxFileBytes?: number
  sendWorkspaceMaxFiles?: number
  sendWorkspaceDefaultRetentionDays?: number
  sendWorkspaceMaxRetentionDays?: number
  sendWorkspaceMaxRecipients?: number
  sendWorkspaceMaxDownloads?: number
  sendWorkspaceUploadIntentTtlSeconds?: number
  sendWorkspaceMultipartThresholdBytes?: number
  sendWorkspaceMultipartPartSizeBytes?: number
}

export function resolveWorkspaceSendMultipartConfig(event: unknown): {
  thresholdBytes: number
  partSizeBytes: number
} {
  const config = useRuntimeConfig(event as never) as SendRuntimeConfig
  const thresholdBytes = config.sendWorkspaceMultipartThresholdBytes
  const partSizeBytes = config.sendWorkspaceMultipartPartSizeBytes
  const valid = Number.isSafeInteger(thresholdBytes)
    && (thresholdBytes as number) >= 5 * 1024 * 1024
    && Number.isSafeInteger(partSizeBytes)
    && (partSizeBytes as number) >= 5 * 1024 * 1024
    && (partSizeBytes as number) <= 5 * 1024 * 1024 * 1024
    && (thresholdBytes as number) >= (partSizeBytes as number)
  if (!valid) {
    throw createError({ statusCode: 503, statusMessage: 'Send multipart upload policy is not configured' })
  }
  return {
    thresholdBytes: thresholdBytes as number,
    partSizeBytes: partSizeBytes as number
  }
}

export function resolveWorkspaceSendUploadIntentTtlSeconds(event: unknown): number {
  const config = useRuntimeConfig(event as never) as SendRuntimeConfig
  const ttl = config.sendWorkspaceUploadIntentTtlSeconds
  if (!Number.isInteger(ttl) || (ttl as number) < 60 || (ttl as number) > 3600) {
    throw createError({ statusCode: 503, statusMessage: 'Send upload intent policy is not configured' })
  }
  return ttl as number
}

export function requireWorkspaceSendEnabled(event: unknown): void {
  const config = useRuntimeConfig(event as never) as SendRuntimeConfig
  if (config.sendEnabled !== true) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}

export function resolveWorkspaceSendPolicyConfig(event: unknown): SendPolicyConfig {
  const config = useRuntimeConfig(event as never) as SendRuntimeConfig
  return SendPolicyConfigSchema.parse({
    surface: 'workspace',
    maxTransferBytes: config.sendWorkspaceMaxTransferBytes,
    maxFileBytes: config.sendWorkspaceMaxFileBytes,
    maxFiles: config.sendWorkspaceMaxFiles,
    defaultRetentionDays: config.sendWorkspaceDefaultRetentionDays,
    maxRetentionDays: config.sendWorkspaceMaxRetentionDays,
    maxRecipients: 0,
    maxDownloads: config.sendWorkspaceMaxDownloads,
    scanRequired: false
  })
}
