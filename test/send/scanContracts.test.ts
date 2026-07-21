import { describe, expect, it } from 'vitest'
import {
  R2ObjectCreateEventSchema,
  SendScanQueueMessageSchema,
  SendScanResultSchema
} from '../../shared/types/sendScan'

const JOB_ID = '77777777-7777-4777-8777-777777777777'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'

describe('Send scan boundary contracts', () => {
  it('accepts an additive R2 create event while retaining only canonical wake-up fields', () => {
    expect(R2ObjectCreateEventSchema.parse({
      account: 'cloudflare-account',
      action: 'CompleteMultipartUpload',
      bucket: 'agency-files',
      object: {
        key: `send/${TRANSFER_ID}/${FILE_ID}`,
        size: 6_291_456,
        eTag: 'multipart-etag',
        futureField: 'ignored'
      },
      eventTime: '2026-07-21T01:00:00.000Z',
      futureEnvelopeField: true
    })).toEqual({
      account: 'cloudflare-account',
      action: 'CompleteMultipartUpload',
      bucket: 'agency-files',
      object: {
        key: `send/${TRANSFER_ID}/${FILE_ID}`,
        size: 6_291_456,
        eTag: 'multipart-etag'
      },
      eventTime: '2026-07-21T01:00:00.000Z'
    })
  })

  it('rejects delete events and malformed object evidence', () => {
    const base = {
      account: 'cloudflare-account',
      bucket: 'agency-files',
      object: { key: `send/${TRANSFER_ID}/${FILE_ID}`, size: 10, eTag: 'etag' },
      eventTime: '2026-07-21T01:00:00.000Z'
    }

    expect(R2ObjectCreateEventSchema.safeParse({ ...base, action: 'DeleteObject' }).success).toBe(false)
    expect(R2ObjectCreateEventSchema.safeParse({
      ...base,
      action: 'PutObject',
      object: { ...base.object, size: -1 }
    }).success).toBe(false)
  })

  it('keeps application queue messages identifier-only and versioned', () => {
    const message = { schemaVersion: 1, jobId: JOB_ID }
    expect(SendScanQueueMessageSchema.parse(message)).toEqual(message)
    expect(SendScanQueueMessageSchema.safeParse({
      ...message,
      objectKey: `send/${TRANSFER_ID}/${FILE_ID}`,
      signedUrl: 'https://example.invalid/signed'
    }).success).toBe(false)
  })

  it.each(['clean', 'detected', 'error', 'timeout'] as const)(
    'accepts a normalized %s result without raw provider output',
    (verdict) => {
      const reasonCode = {
        clean: 'NONE',
        detected: 'MALWARE_DETECTED',
        error: 'SCANNER_UNAVAILABLE',
        timeout: 'SCAN_TIMEOUT'
      } as const
      const result = {
        schemaVersion: 1,
        jobId: JOB_ID,
        objectEtag: 'canonical-etag',
        provider: 'clamav',
        engineVersion: '1.5.3',
        signatureVersion: '2026072101',
        verdict,
        reasonCode: reasonCode[verdict],
        detectedMimeType: 'application/pdf',
        activeContent: false,
        scannedAt: '2026-07-21T01:05:00.000Z'
      }

      expect(SendScanResultSchema.parse(result)).toEqual(result)
      expect(SendScanResultSchema.safeParse({
        ...result,
        rawOutput: '/tmp/customer-name.pdf: Win.Test FOUND',
        objectKey: `send/${TRANSFER_ID}/${FILE_ID}`
      }).success).toBe(false)
    }
  )

  it('keeps the normalized scanner result contract provider-neutral', () => {
    expect(SendScanResultSchema.safeParse({
      schemaVersion: 1,
      jobId: JOB_ID,
      objectEtag: 'canonical-etag',
      provider: 'approved-scanner-adapter',
      engineVersion: '2026.07',
      signatureVersion: '2026072101',
      verdict: 'clean',
      reasonCode: 'NONE',
      detectedMimeType: 'application/pdf',
      activeContent: false,
      scannedAt: '2026-07-21T01:05:00.000Z'
    }).success).toBe(true)
  })
})
