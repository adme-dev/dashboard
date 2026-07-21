import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  requirePublicSendEnabled,
  requireWorkspaceSendEnabled,
  resolvePublicSendPolicyConfig,
  resolveWorkspaceSendPolicyConfig
} from '../../server/utils/send/feature'

const originalRuntimeConfig = globalThis.useRuntimeConfig

afterEach(() => {
  globalThis.useRuntimeConfig = originalRuntimeConfig
})

describe('workspace Send feature configuration', () => {
  it('fails closed unless the private server flag is exactly true', () => {
    globalThis.useRuntimeConfig = vi.fn(() => ({ sendEnabled: false })) as never
    expect(() => requireWorkspaceSendEnabled({})).toThrow(expect.objectContaining({ statusCode: 404 }))

    globalThis.useRuntimeConfig = vi.fn(() => ({ sendEnabled: true })) as never
    expect(() => requireWorkspaceSendEnabled({})).not.toThrow()
  })

  it('resolves a strict workspace policy from runtime configuration', () => {
    globalThis.useRuntimeConfig = vi.fn(() => ({
      sendWorkspaceMaxTransferBytes: 2147483648,
      sendWorkspaceMaxFileBytes: 2147483648,
      sendWorkspaceMaxFiles: 20,
      sendWorkspaceDefaultRetentionDays: 7,
      sendWorkspaceMaxRetentionDays: 30,
      sendWorkspaceMaxRecipients: 20,
      sendWorkspaceMaxDownloads: 100
    })) as never

    expect(resolveWorkspaceSendPolicyConfig({})).toEqual({
      surface: 'workspace',
      maxTransferBytes: 2147483648,
      maxFileBytes: 2147483648,
      maxFiles: 20,
      defaultRetentionDays: 7,
      maxRetentionDays: 30,
      maxRecipients: 0,
      maxDownloads: 100,
      scanRequired: false
    })
  })
})

describe('public Send feature configuration', () => {
  it('fails closed unless the independent public server flag is exactly true', () => {
    globalThis.useRuntimeConfig = vi.fn(() => ({ sendPublicEnabled: false })) as never
    expect(() => requirePublicSendEnabled({})).toThrow(expect.objectContaining({ statusCode: 404 }))

    globalThis.useRuntimeConfig = vi.fn(() => ({ sendPublicEnabled: true })) as never
    expect(() => requirePublicSendEnabled({})).not.toThrow()
  })

  it('resolves the approved scan-required beta policy', () => {
    globalThis.useRuntimeConfig = vi.fn(() => ({
      sendPublicMaxTransferBytes: 262144000,
      sendPublicMaxFileBytes: 104857600,
      sendPublicMaxFiles: 10,
      sendPublicDefaultRetentionDays: 3,
      sendPublicMaxRetentionDays: 3,
      sendPublicMaxDownloads: 20
    })) as never

    expect(resolvePublicSendPolicyConfig({})).toEqual({
      surface: 'public',
      maxTransferBytes: 262144000,
      maxFileBytes: 104857600,
      maxFiles: 10,
      defaultRetentionDays: 3,
      maxRetentionDays: 3,
      maxRecipients: 0,
      maxDownloads: 20,
      scanRequired: true
    })
  })
})
