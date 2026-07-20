import { describe, expect, it } from 'vitest'
import {
  SendPolicyConfigSchema,
  resolveTransferPolicy,
  toPublicTransferSummary
} from '../../server/utils/send/policy'

const publicConfig = SendPolicyConfigSchema.parse({
  surface: 'public',
  maxTransferBytes: 2 * 1024 * 1024 * 1024,
  maxFileBytes: 2 * 1024 * 1024 * 1024,
  maxFiles: 20,
  defaultRetentionDays: 7,
  maxRetentionDays: 7,
  maxRecipients: 20,
  maxDownloads: 100,
  scanRequired: true
})

describe('Send policy resolution', () => {
  it('returns a canonical snapshot from explicit configuration', () => {
    const resolved = resolveTransferPolicy(publicConfig, {
      now: new Date('2026-07-21T00:00:00.000Z'),
      expiresAt: new Date('2026-07-28T00:00:00.000Z'),
      fileSizes: [1024 * 1024, 1024 * 1024],
      recipientCount: 1,
      maxDownloads: 5
    })

    expect(resolved.expiresAt.toISOString()).toBe('2026-07-28T00:00:00.000Z')
    expect(resolved.snapshot).toEqual({
      surface: 'public',
      maxTransferBytes: 2 * 1024 * 1024 * 1024,
      maxFileBytes: 2 * 1024 * 1024 * 1024,
      maxFiles: 20,
      retentionDays: 7,
      maxRecipients: 20,
      maxDownloads: 5,
      scanRequired: true
    })
  })

  it('rejects excess bytes, files, recipients, retention, and downloads', () => {
    const base = {
      now: new Date('2026-07-21T00:00:00.000Z'),
      expiresAt: new Date('2026-07-28T00:00:00.000Z'),
      fileSizes: [100],
      recipientCount: 1,
      maxDownloads: 5
    }

    expect(() => resolveTransferPolicy(publicConfig, { ...base, fileSizes: [publicConfig.maxTransferBytes + 1] })).toThrow('file byte limit')
    expect(() => resolveTransferPolicy(publicConfig, { ...base, fileSizes: Array.from({ length: 21 }, () => 1) })).toThrow('file limit')
    expect(() => resolveTransferPolicy(publicConfig, { ...base, recipientCount: 21 })).toThrow('recipient limit')
    expect(() => resolveTransferPolicy(publicConfig, {
      ...base,
      expiresAt: new Date('2026-07-28T00:00:00.001Z')
    })).toThrow('retention limit')
    expect(() => resolveTransferPolicy(publicConfig, { ...base, maxDownloads: 101 })).toThrow('download limit')
  })

  it('rejects contradictory or permissive configuration', () => {
    expect(SendPolicyConfigSchema.safeParse({
      ...publicConfig,
      maxFileBytes: publicConfig.maxTransferBytes + 1
    }).success).toBe(false)
    expect(SendPolicyConfigSchema.safeParse({ ...publicConfig, extra: true }).success).toBe(false)
  })
})

describe('public transfer mapping', () => {
  it('allowlists guest-safe fields without leaking identity or secrets', () => {
    const mapped = toPublicTransferSummary({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Campaign assets',
      message: 'For launch',
      status: 'ready',
      expiresAt: '2026-07-28T00:00:00.000Z',
      publishedAt: '2026-07-21T00:00:00.000Z',
      expectedFileCount: 2,
      expectedTotalBytes: 2048,
      accessMode: 'password',
      senderDisplayName: 'XeroFlow Studio',
      clientId: 'secret-client',
      ownerTeamMemberId: 'secret-owner',
      shareTokenHash: 'a'.repeat(64),
      managementTokenHash: 'b'.repeat(64),
      passwordHash: '$2b$secret',
      policySnapshot: { internal: true },
      signedUrl: 'https://r2.example/signed'
    })

    expect(mapped).toEqual({
      id: '44444444-4444-4444-8444-444444444444',
      title: 'Campaign assets',
      message: 'For launch',
      status: 'ready',
      expiresAt: '2026-07-28T00:00:00.000Z',
      publishedAt: '2026-07-21T00:00:00.000Z',
      fileCount: 2,
      totalBytes: 2048,
      passwordProtected: true,
      senderDisplayName: 'XeroFlow Studio'
    })
    expect(JSON.stringify(mapped)).not.toMatch(/token|passwordHash|signedUrl|clientId|owner/i)
  })
})
