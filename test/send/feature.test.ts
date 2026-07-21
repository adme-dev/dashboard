import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  requireWorkspaceSendEnabled,
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
