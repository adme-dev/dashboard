import { describe, expect, it, vi } from 'vitest'
import {
  deleteCrmInboundEmailArtifacts,
  resolveCrmEmailRetentionDays,
  storeCrmInboundEmailArtifacts
} from '../../workers/email-worker/src/r2Artifacts'

const MiB = 1024 * 1024
const NOW = new Date('2026-07-30T05:30:00.000Z')
const MESSAGE_ID = '11111111-1111-4111-8111-111111111111'
const raw = new TextEncoder().encode('raw-secret-email').buffer
const attachmentContent = new TextEncoder().encode('attachment-secret').buffer

function dependencies() {
  return {
    now: () => NOW,
    randomUUID: () => MESSAGE_ID
  }
}

function attachment(overrides: Record<string, unknown> = {}) {
  return {
    filename: '../Customer Contract.pdf',
    mimeType: 'application/pdf',
    size: attachmentContent.byteLength,
    content: attachmentContent,
    contentId: '<contract@example.net>',
    ...overrides
  }
}

describe('CRM inbound email R2 retention policy', () => {
  it('defaults invalid configuration to 30 days and clamps longer retention', () => {
    expect(resolveCrmEmailRetentionDays()).toBe(30)
    expect(resolveCrmEmailRetentionDays('invalid')).toBe(30)
    expect(resolveCrmEmailRetentionDays('0')).toBe(30)
    expect(resolveCrmEmailRetentionDays('7')).toBe(7)
    expect(resolveCrmEmailRetentionDays('90')).toBe(30)
  })
})

describe('CRM inbound email R2 artifact storage', () => {
  it('stores opaque raw MIME and attachment objects with safe retention metadata', async () => {
    const put = vi.fn().mockResolvedValue({ key: 'stored' })
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const bucket = { put, delete: deleteObjects }

    const manifest = await storeCrmInboundEmailArtifacts({
      bucket,
      raw,
      attachments: [attachment()],
      retentionDays: 7
    }, dependencies())

    const prefix
      = `crm-email/inbound/2026/07/30/${MESSAGE_ID}`
    expect(manifest).toEqual({
      rawMimeR2Key: `${prefix}/message.eml`,
      rawMimeSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      rawMimeExpiresAt: '2026-08-06T05:30:00.000Z',
      attachments: [{
        r2ObjectKey: `${prefix}/attachments/01.bin`,
        filename: 'Customer Contract.pdf',
        contentType: 'application/pdf',
        byteSize: attachmentContent.byteLength,
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
        contentId: '<contract@example.net>'
      }]
    })
    expect(put).toHaveBeenCalledTimes(2)

    const [rawKey, rawValue, rawOptions] = put.mock.calls[0]!
    expect(rawKey).toBe(`${prefix}/message.eml`)
    expect(rawValue).toBe(raw)
    expect(rawOptions).toMatchObject({
      httpMetadata: {
        contentType: 'message/rfc822',
        cacheControl: 'private, no-store'
      },
      customMetadata: {
        kind: 'raw_mime',
        retentionExpiresAt: '2026-08-06T05:30:00.000Z',
        scanStatus: 'pending'
      },
      sha256: expect.any(ArrayBuffer)
    })

    const [attachmentKey, attachmentValue, attachmentOptions] = put.mock.calls[1]!
    expect(attachmentKey).toBe(`${prefix}/attachments/01.bin`)
    expect(attachmentValue).toBe(attachmentContent)
    expect(attachmentOptions).toMatchObject({
      httpMetadata: {
        contentType: 'application/pdf',
        cacheControl: 'private, no-store'
      },
      customMetadata: {
        kind: 'attachment',
        attachmentIndex: '1',
        retentionExpiresAt: '2026-08-06T05:30:00.000Z',
        scanStatus: 'pending'
      },
      sha256: expect.any(ArrayBuffer)
    })

    const serializedMetadata = JSON.stringify(
      put.mock.calls.map(call => call[2]?.customMetadata)
    )
    expect(serializedMetadata).not.toContain('Customer Contract')
    expect(serializedMetadata).not.toContain('raw-secret-email')
    expect(serializedMetadata).not.toContain('attachment-secret')
    expect(JSON.stringify(manifest)).not.toContain('attachment-secret')
    expect(deleteObjects).not.toHaveBeenCalled()
  })

  it('rejects missing attachment bytes before writing raw MIME', async () => {
    const put = vi.fn()
    const bucket = {
      put,
      delete: vi.fn()
    }

    await expect(storeCrmInboundEmailArtifacts({
      bucket,
      raw,
      attachments: [attachment({ content: undefined })],
      retentionDays: 30
    }, dependencies())).rejects.toThrow('Attachment content is unavailable')

    expect(put).not.toHaveBeenCalled()
  })

  it('deletes completed writes when a later R2 write fails', async () => {
    const put = vi.fn()
      .mockResolvedValueOnce({ key: 'raw' })
      .mockResolvedValueOnce({ key: 'attachment-one' })
      .mockRejectedValueOnce(new Error('R2 unavailable'))
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const bucket = { put, delete: deleteObjects }

    await expect(storeCrmInboundEmailArtifacts({
      bucket,
      raw,
      attachments: [
        attachment(),
        attachment({ filename: 'second.pdf' })
      ],
      retentionDays: 30
    }, dependencies())).rejects.toThrow('R2 unavailable')

    expect(deleteObjects).toHaveBeenCalledWith([
      `crm-email/inbound/2026/07/30/${MESSAGE_ID}/message.eml`,
      `crm-email/inbound/2026/07/30/${MESSAGE_ID}/attachments/01.bin`
    ])
  })

  it('deletes every key in a completed manifest', async () => {
    const deleteObjects = vi.fn().mockResolvedValue(undefined)
    const bucket = { put: vi.fn(), delete: deleteObjects }
    const prefix = `crm-email/inbound/2026/07/30/${MESSAGE_ID}`

    await deleteCrmInboundEmailArtifacts(bucket, {
      rawMimeR2Key: `${prefix}/message.eml`,
      rawMimeSha256: 'a'.repeat(64),
      rawMimeExpiresAt: '2026-08-29T05:30:00.000Z',
      attachments: [{
        r2ObjectKey: `${prefix}/attachments/01.bin`,
        filename: 'file.pdf',
        contentType: 'application/pdf',
        byteSize: 2 * MiB,
        sha256: 'b'.repeat(64),
        contentId: null
      }]
    })

    expect(deleteObjects).toHaveBeenCalledWith([
      `${prefix}/message.eml`,
      `${prefix}/attachments/01.bin`
    ])
  })
})
