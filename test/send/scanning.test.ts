import { describe, expect, it, vi } from 'vitest'
import {
  createSendScanOrchestrator,
  type SendScanJob
} from '../../server/utils/send/scanning'

const JOB_ID = '77777777-7777-4777-8777-777777777777'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-07-21T01:00:00.000Z')

function job(overrides: Partial<SendScanJob> = {}): SendScanJob {
  return {
    id: JOB_ID,
    transferId: TRANSFER_ID,
    fileId: FILE_ID,
    objectKey: `send/${TRANSFER_ID}/${FILE_ID}`,
    expectedSizeBytes: 2048,
    expectedMimeType: 'application/pdf',
    objectEtag: 'etag-before-scan',
    uploadMethod: 'multipart',
    attemptCount: 1,
    maxAttempts: 3,
    availableAt: NOW,
    ...overrides
  }
}

function metadata(overrides: Record<string, unknown> = {}) {
  return {
    key: `send/${TRANSFER_ID}/${FILE_ID}`,
    size: 2048,
    contentType: 'application/pdf',
    etag: 'etag-before-scan',
    ...overrides
  }
}

function providerResult(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    jobId: JOB_ID,
    objectEtag: 'etag-before-scan',
    provider: 'clamav',
    engineVersion: '1.5.3',
    signatureVersion: '2026072101',
    verdict: 'clean',
    reasonCode: 'NONE',
    detectedMimeType: 'application/pdf',
    activeContent: false,
    scannedAt: '2026-07-21T01:05:00.000Z',
    ...overrides
  }
}

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    claimJob: vi.fn(async () => ({ status: 'claimed' as const, job: job() })),
    getObjectMetadata: vi.fn(async () => metadata()),
    scanObject: vi.fn(async () => providerResult()),
    releaseJob: vi.fn(async () => undefined),
    completeJob: vi.fn(async () => undefined),
    ...overrides
  }
}

describe('Send scan orchestration', () => {
  it('retries without touching R2 before a single-part capability expires', async () => {
    const deps = dependencies({
      claimJob: vi.fn(async () => ({ status: 'not_ready' as const, retryAfterSeconds: 120 }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'retry',
      delaySeconds: 120,
      outcome: 'not_ready'
    })
    expect(deps.getObjectMetadata).not.toHaveBeenCalled()
    expect(deps.scanObject).not.toHaveBeenCalled()
  })

  it('marks only a stable, verified clean object clean', async () => {
    const deps = dependencies()
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'clean'
    })
    expect(deps.getObjectMetadata).toHaveBeenCalledTimes(2)
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      jobId: JOB_ID,
      status: 'clean',
      fileState: 'clean',
      scanStatus: 'clean',
      canonicalObjectEtag: 'etag-before-scan',
      evidence: {
        provider: 'clamav',
        engineVersion: '1.5.3',
        signatureVersion: '2026072101',
        reasonCode: 'NONE',
        detectedMimeType: 'application/pdf',
        activeContent: false,
        contentDisposition: 'attachment',
        scannedAt: '2026-07-21T01:05:00.000Z'
      }
    }))
  })

  it('rejects detected malware without storing a signature name or raw output', async () => {
    const deps = dependencies({
      scanObject: vi.fn(async () => providerResult({
        verdict: 'detected',
        reasonCode: 'MALWARE_DETECTED'
      }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'detected'
    })
    const completion = deps.completeJob.mock.calls[0]![0]
    expect(completion).toMatchObject({ status: 'detected', fileState: 'rejected', scanStatus: 'infected' })
    expect(JSON.stringify(completion)).not.toMatch(/filename|objectKey|rawOutput|signatureName/i)
  })

  it('retries a provider error while attempts remain', async () => {
    const deps = dependencies({
      scanObject: vi.fn(async () => providerResult({
        verdict: 'error',
        reasonCode: 'SCANNER_UNAVAILABLE'
      }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'retry',
      delaySeconds: 30,
      outcome: 'scanner_error'
    })
    expect(deps.releaseJob).toHaveBeenCalledWith({
      jobId: JOB_ID,
      attemptCount: 1,
      reasonCode: 'SCANNER_UNAVAILABLE',
      retryAt: new Date('2026-07-21T01:00:30.000Z')
    })
    expect(deps.completeJob).not.toHaveBeenCalled()
  })

  it('records a timeout fail-closed when the final attempt is exhausted', async () => {
    const deps = dependencies({
      claimJob: vi.fn(async () => ({
        status: 'claimed' as const,
        job: job({ attemptCount: 3, maxAttempts: 3 })
      })),
      scanObject: vi.fn(async () => providerResult({
        verdict: 'timeout',
        reasonCode: 'SCAN_TIMEOUT'
      }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'timeout'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'timeout',
      fileState: 'quarantined',
      scanStatus: 'error'
    }))
  })

  it('acknowledges duplicate queue delivery without rescanning a terminal job', async () => {
    const deps = dependencies({
      claimJob: vi.fn(async () => ({ status: 'complete' as const, outcome: 'clean' as const }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'duplicate'
    })
    expect(deps.getObjectMetadata).not.toHaveBeenCalled()
    expect(deps.scanObject).not.toHaveBeenCalled()
  })

  it.each([
    ['size', { size: 2049 }],
    ['type', { contentType: 'text/plain' }],
    ['multipart ETag', { etag: 'substituted-etag' }]
  ])('fails closed before scanning on canonical %s mismatch', async (_label, changed) => {
    const deps = dependencies({
      getObjectMetadata: vi.fn(async () => metadata(changed))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'object_mismatch'
    })
    expect(deps.scanObject).not.toHaveBeenCalled()
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      fileState: 'quarantined',
      scanStatus: 'error',
      evidence: expect.objectContaining({ reasonCode: 'OBJECT_MISMATCH' })
    }))
  })

  it('accepts the post-expiry ETag as canonical for a single PUT, then binds the result to it', async () => {
    const canonical = metadata({ etag: 'etag-after-final-authorized-put' })
    const deps = dependencies({
      claimJob: vi.fn(async () => ({ status: 'claimed' as const, job: job({ uploadMethod: 'single' }) })),
      getObjectMetadata: vi.fn(async () => canonical),
      scanObject: vi.fn(async () => providerResult({ objectEtag: canonical.etag }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'clean'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      canonicalObjectEtag: canonical.etag
    }))
  })

  it('fails closed when the object changes during the scan', async () => {
    const deps = dependencies({
      getObjectMetadata: vi.fn()
        .mockResolvedValueOnce(metadata())
        .mockResolvedValueOnce(metadata({ etag: 'etag-after-scan' }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'object_changed'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error',
      fileState: 'quarantined',
      evidence: expect.objectContaining({ reasonCode: 'OBJECT_CHANGED_DURING_SCAN' })
    }))
  })

  it('keeps matching active content clean but forces attachment disposition', async () => {
    const deps = dependencies({
      claimJob: vi.fn(async () => ({
        status: 'claimed' as const,
        job: job({ expectedMimeType: 'text/html' })
      })),
      getObjectMetadata: vi.fn(async () => metadata({ contentType: 'text/html' })),
      scanObject: vi.fn(async () => providerResult({
        detectedMimeType: 'text/html',
        activeContent: true
      }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'clean'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      evidence: expect.objectContaining({ activeContent: true, contentDisposition: 'attachment' })
    }))
  })

  it('rejects a clean malware verdict when magic-byte MIME evidence conflicts', async () => {
    const deps = dependencies({
      scanObject: vi.fn(async () => providerResult({ detectedMimeType: 'application/x-executable' }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'detected'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'detected',
      fileState: 'rejected',
      evidence: expect.objectContaining({ reasonCode: 'CONTENT_TYPE_MISMATCH' })
    }))
  })

  it.each([
    ['generic binary declaration', 'application/octet-stream', 'application/pdf'],
    [
      'ZIP-based Office document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip'
    ],
    ['plain-text CSV', 'text/csv', 'text/plain'],
    ['legacy Office container', 'application/msword', 'application/x-ole-storage']
  ])('accepts compatible magic-byte evidence for %s', async (_label, expectedMimeType, detectedMimeType) => {
    const deps = dependencies({
      claimJob: vi.fn(async () => ({
        status: 'claimed' as const,
        job: job({ expectedMimeType })
      })),
      getObjectMetadata: vi.fn(async () => metadata({ contentType: expectedMimeType })),
      scanObject: vi.fn(async () => providerResult({ detectedMimeType }))
    })
    const orchestrator = createSendScanOrchestrator(deps)

    await expect(orchestrator.process({ jobId: JOB_ID, now: NOW })).resolves.toEqual({
      action: 'ack',
      outcome: 'clean'
    })
    expect(deps.completeJob).toHaveBeenCalledWith(expect.objectContaining({
      status: 'clean',
      evidence: expect.objectContaining({ detectedMimeType })
    }))
  })
})
