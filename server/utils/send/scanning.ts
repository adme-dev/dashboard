import {
  SendScanResultSchema,
  type SendScanResult
} from '../../../shared/types/sendScan'

export interface SendScanJob {
  id: string
  transferId: string
  fileId: string
  objectKey: string
  expectedSizeBytes: number
  expectedMimeType: string
  objectEtag: string
  uploadMethod: 'single' | 'multipart'
  attemptCount: number
  maxAttempts: number
  availableAt: Date
}

export interface SendScanObjectMetadata {
  key: string
  size: number
  contentType: string
  etag: string
}

export type SendScanClaim
  = | { status: 'missing' }
    | { status: 'not_ready', retryAfterSeconds: number }
    | { status: 'busy', retryAfterSeconds: number }
    | { status: 'complete', outcome: 'clean' | 'detected' | 'error' | 'timeout' }
    | { status: 'claimed', job: SendScanJob }

export interface SendScanEvidence {
  provider: string
  engineVersion: string
  signatureVersion: string
  reasonCode: string
  detectedMimeType: string
  activeContent: boolean
  contentDisposition: 'attachment'
  scannedAt: string
}

export interface CompleteSendScanJobInput {
  jobId: string
  attemptCount: number
  status: 'clean' | 'detected' | 'error' | 'timeout'
  fileState: 'clean' | 'rejected' | 'quarantined'
  scanStatus: 'clean' | 'infected' | 'error'
  canonicalObjectEtag: string
  evidence: SendScanEvidence
}

export interface SendScanOrchestratorDeps {
  claimJob(jobId: string, now: Date): Promise<SendScanClaim>
  getObjectMetadata(key: string): Promise<SendScanObjectMetadata | null>
  scanObject(input: {
    jobId: string
    objectKey: string
    objectEtag: string
    expectedMimeType: string
  }): Promise<unknown>
  releaseJob(input: { jobId: string, attemptCount: number, reasonCode: string, retryAt: Date }): Promise<void>
  completeJob(input: CompleteSendScanJobInput): Promise<void>
}

export type SendScanProcessResult = {
  action: 'ack'
  outcome: 'missing' | 'duplicate' | 'clean' | 'detected' | 'error' | 'timeout' | 'object_mismatch' | 'object_changed'
} | {
  action: 'retry'
  delaySeconds: number
  outcome: 'not_ready' | 'busy' | 'scanner_error'
}

function normalizedMimeType(value: string): string {
  return value.trim().toLowerCase()
}

function metadataMatchesJob(job: SendScanJob, object: SendScanObjectMetadata): boolean {
  return object.key === job.objectKey
    && object.size === job.expectedSizeBytes
    && normalizedMimeType(object.contentType) === normalizedMimeType(job.expectedMimeType)
    && Boolean(object.etag)
    && (job.uploadMethod === 'single' || object.etag === job.objectEtag)
}

function stableObject(left: SendScanObjectMetadata, right: SendScanObjectMetadata | null): boolean {
  return Boolean(right)
    && left.key === right!.key
    && left.size === right!.size
    && normalizedMimeType(left.contentType) === normalizedMimeType(right!.contentType)
    && left.etag === right!.etag
}

function parseBoundResult(value: unknown, job: SendScanJob, objectEtag: string): SendScanResult | null {
  const parsed = SendScanResultSchema.safeParse(value)
  if (!parsed.success || parsed.data.jobId !== job.id || parsed.data.objectEtag !== objectEtag) return null
  return parsed.data
}

function providerEvidence(result: SendScanResult, reasonCode = result.reasonCode): SendScanEvidence {
  return {
    provider: result.provider,
    engineVersion: result.engineVersion,
    signatureVersion: result.signatureVersion,
    reasonCode,
    detectedMimeType: result.detectedMimeType,
    activeContent: result.activeContent,
    contentDisposition: 'attachment',
    scannedAt: result.scannedAt
  }
}

function orchestratorEvidence(reasonCode: string, now: Date): SendScanEvidence {
  return {
    provider: 'orchestrator',
    engineVersion: 'send-scan-v1',
    signatureVersion: 'not-scanned',
    reasonCode,
    detectedMimeType: 'application/octet-stream',
    activeContent: false,
    contentDisposition: 'attachment',
    scannedAt: now.toISOString()
  }
}

async function failObject(
  deps: SendScanOrchestratorDeps,
  job: SendScanJob,
  canonicalObjectEtag: string,
  reasonCode: 'OBJECT_MISMATCH' | 'OBJECT_CHANGED_DURING_SCAN',
  now: Date
): Promise<void> {
  await deps.completeJob({
    jobId: job.id,
    attemptCount: job.attemptCount,
    status: 'error',
    fileState: 'quarantined',
    scanStatus: 'error',
    canonicalObjectEtag,
    evidence: orchestratorEvidence(reasonCode, now)
  })
}

async function completeProviderResult(
  deps: SendScanOrchestratorDeps,
  job: SendScanJob,
  objectEtag: string,
  result: SendScanResult
): Promise<'clean' | 'detected' | 'error' | 'timeout'> {
  const mimeMismatch = normalizedMimeType(result.detectedMimeType)
    !== normalizedMimeType(job.expectedMimeType)
  if (result.verdict === 'detected' || mimeMismatch) {
    await deps.completeJob({
      jobId: job.id,
      attemptCount: job.attemptCount,
      status: 'detected',
      fileState: 'rejected',
      scanStatus: 'infected',
      canonicalObjectEtag: objectEtag,
      evidence: providerEvidence(result, mimeMismatch ? 'CONTENT_TYPE_MISMATCH' : result.reasonCode)
    })
    return 'detected'
  }
  if (result.verdict === 'clean') {
    await deps.completeJob({
      jobId: job.id,
      attemptCount: job.attemptCount,
      status: 'clean',
      fileState: 'clean',
      scanStatus: 'clean',
      canonicalObjectEtag: objectEtag,
      evidence: providerEvidence(result)
    })
    return 'clean'
  }
  await deps.completeJob({
    jobId: job.id,
    attemptCount: job.attemptCount,
    status: result.verdict,
    fileState: 'quarantined',
    scanStatus: 'error',
    canonicalObjectEtag: objectEtag,
    evidence: providerEvidence(result)
  })
  return result.verdict
}

export function createSendScanOrchestrator(deps: SendScanOrchestratorDeps) {
  return {
    async process(input: { jobId: string, now?: Date }): Promise<SendScanProcessResult> {
      const now = input.now ?? new Date()
      const claim = await deps.claimJob(input.jobId, now)
      if (claim.status === 'missing') return { action: 'ack', outcome: 'missing' }
      if (claim.status === 'complete') return { action: 'ack', outcome: 'duplicate' }
      if (claim.status === 'not_ready' || claim.status === 'busy') {
        return {
          action: 'retry',
          delaySeconds: claim.retryAfterSeconds,
          outcome: claim.status
        }
      }

      const job = claim.job
      const before = await deps.getObjectMetadata(job.objectKey)
      if (!before || !metadataMatchesJob(job, before)) {
        await failObject(deps, job, before?.etag ?? job.objectEtag, 'OBJECT_MISMATCH', now)
        return { action: 'ack', outcome: 'object_mismatch' }
      }
      const result = parseBoundResult(await deps.scanObject({
        jobId: job.id,
        objectKey: job.objectKey,
        objectEtag: before.etag,
        expectedMimeType: job.expectedMimeType
      }), job, before.etag)
      if (!result) throw new Error('SEND_SCAN_RESULT_INVALID')
      const after = await deps.getObjectMetadata(job.objectKey)
      if (!stableObject(before, after)) {
        await failObject(deps, job, after?.etag ?? before.etag, 'OBJECT_CHANGED_DURING_SCAN', now)
        return { action: 'ack', outcome: 'object_changed' }
      }
      if ((result.verdict === 'error' || result.verdict === 'timeout')
        && job.attemptCount < job.maxAttempts) {
        const retryAt = new Date(now.getTime() + 30_000)
        await deps.releaseJob({
          jobId: job.id,
          attemptCount: job.attemptCount,
          reasonCode: result.reasonCode,
          retryAt
        })
        return { action: 'retry', delaySeconds: 30, outcome: 'scanner_error' }
      }
      const outcome = await completeProviderResult(deps, job, before.etag, result)
      return { action: 'ack', outcome }
    }
  }
}
