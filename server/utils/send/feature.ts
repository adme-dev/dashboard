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
    maxRecipients: config.sendWorkspaceMaxRecipients,
    maxDownloads: config.sendWorkspaceMaxDownloads,
    scanRequired: true
  })
}
