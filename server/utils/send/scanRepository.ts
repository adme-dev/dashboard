import type {
  CompleteSendScanJobInput,
  SendScanClaim,
  SendScanJob
} from './scanning'

interface QueryResultLike { rows: unknown[] }
interface QueryClientLike {
  query(sql: string, params?: unknown[]): Promise<QueryResultLike>
}

interface ScanJobRow {
  id: string
  transfer_id: string
  file_id: string
  object_key: string
  expected_size_bytes: number | string
  expected_mime_type: string
  object_etag: string
  upload_method: 'single' | 'multipart'
  status: 'pending' | 'running' | 'clean' | 'detected' | 'error' | 'timeout'
  attempt_count: number | string
  max_attempts: number | string
  available_at: Date | string
  lease_expires_at: Date | string | null
  file_state: string
  scan_status: string
}

export interface PostgresSendScanRepositoryDeps {
  queryOne?<T>(sql: string, params?: unknown[]): Promise<T | null>
  transaction?<T>(callback: (database: QueryClientLike) => Promise<T>): Promise<T>
}

const JOB_COLUMNS = `
  j.id, j.transfer_id, j.file_id, j.object_key, j.expected_size_bytes,
  j.expected_mime_type, j.object_etag, j.upload_method, j.status,
  j.attempt_count, j.max_attempts, j.available_at, j.lease_expires_at,
  f.state AS file_state, f.scan_status
`

const JOB_RETURNING_COLUMNS = `
  id, transfer_id, file_id, object_key, expected_size_bytes,
  expected_mime_type, object_etag, upload_method, status,
  attempt_count, max_attempts, available_at, lease_expires_at,
  'quarantined'::TEXT AS file_state, 'running'::TEXT AS scan_status
`

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value)
}

function secondsUntil(value: Date | string, now: Date): number {
  return Math.max(1, Math.ceil((asDate(value).getTime() - now.getTime()) / 1000))
}

function mapJob(row: ScanJobRow): SendScanJob {
  return {
    id: row.id,
    transferId: row.transfer_id,
    fileId: row.file_id,
    objectKey: row.object_key,
    expectedSizeBytes: Number(row.expected_size_bytes),
    expectedMimeType: row.expected_mime_type,
    objectEtag: row.object_etag,
    uploadMethod: row.upload_method,
    attemptCount: Number(row.attempt_count),
    maxAttempts: Number(row.max_attempts),
    availableAt: asDate(row.available_at)
  }
}

function requireTransaction(deps: PostgresSendScanRepositoryDeps) {
  if (!deps.transaction) throw new Error('Send scan transaction dependency is unavailable')
  return deps.transaction
}

export function createPostgresSendScanRepository(deps: PostgresSendScanRepositoryDeps) {
  return {
    async findJobForObject(objectKey: string): Promise<string | null> {
      if (!deps.queryOne) throw new Error('Send scan query dependency is unavailable')
      const row = await deps.queryOne<{ id: string }>(
        `SELECT j.id
           FROM send_scan_jobs j
          WHERE j.object_key = $1
          ORDER BY j.created_at DESC
          LIMIT 1`,
        [objectKey]
      )
      return row?.id ?? null
    },

    async claimJob(jobId: string, now: Date): Promise<SendScanClaim> {
      return requireTransaction(deps)(async (database) => {
        const locked = (await database.query(
          `SELECT ${JOB_COLUMNS}
             FROM send_scan_jobs j
             JOIN send_files f
               ON f.transfer_id = j.transfer_id
              AND f.id = j.file_id
            WHERE j.id = $1
            FOR UPDATE OF j, f`,
          [jobId]
        )).rows[0] as ScanJobRow | undefined
        if (!locked) return { status: 'missing' }
        if (['clean', 'detected', 'error', 'timeout'].includes(locked.status)) {
          return { status: 'complete', outcome: locked.status } as SendScanClaim
        }
        if (asDate(locked.available_at).getTime() > now.getTime()) {
          return {
            status: 'not_ready',
            retryAfterSeconds: secondsUntil(locked.available_at, now)
          }
        }
        if (locked.status === 'running' && locked.lease_expires_at
          && asDate(locked.lease_expires_at).getTime() > now.getTime()) {
          return {
            status: 'busy',
            retryAfterSeconds: secondsUntil(locked.lease_expires_at, now)
          }
        }
        const leaseExpiresAt = new Date(now.getTime() + 10 * 60 * 1000)
        const claimed = (await database.query(
          `UPDATE send_scan_jobs
              SET status = 'running',
                  attempt_count = attempt_count + 1,
                  claimed_at = $2,
                  lease_expires_at = $3,
                  result_code = NULL,
                  updated_at = NOW()
            WHERE id = $1
          RETURNING ${JOB_RETURNING_COLUMNS}`,
          [jobId, now.toISOString(), leaseExpiresAt.toISOString()]
        )).rows[0] as ScanJobRow | undefined
        if (!claimed) return { status: 'missing' }
        await database.query(
          `UPDATE send_files
              SET scan_status = 'running', updated_at = NOW()
            WHERE transfer_id = $1 AND id = $2 AND state = 'quarantined'`,
          [locked.transfer_id, locked.file_id]
        )
        return { status: 'claimed', job: mapJob(claimed) }
      })
    },

    async releaseJob(input: {
      jobId: string
      attemptCount: number
      reasonCode: string
      retryAt: Date
    }): Promise<void> {
      return requireTransaction(deps)(async (database) => {
        await database.query(
          `WITH released AS (
             UPDATE send_scan_jobs
                SET status = 'pending',
                    result_code = $2,
                    available_at = $3,
                    lease_expires_at = NULL,
                    updated_at = NOW()
              WHERE id = $1
                AND status = 'running'
                AND attempt_count = $4
          RETURNING transfer_id, file_id
           )
           UPDATE send_files f
              SET scan_status = 'error', updated_at = NOW()
             FROM released r
            WHERE f.transfer_id = r.transfer_id AND f.id = r.file_id`,
          [input.jobId, input.reasonCode, input.retryAt.toISOString(), input.attemptCount]
        )
      })
    },

    async completeJob(input: CompleteSendScanJobInput): Promise<void> {
      const evidenceJson = JSON.stringify(input.evidence)
      if (/"(file_?name|object_?key|signed_?url|raw_?output|provider_?response|password|token)"\s*:/i.test(evidenceJson)) {
        throw new Error('Send scan evidence contains a prohibited field')
      }
      return requireTransaction(deps)(async (database) => {
        const locked = (await database.query(
          `SELECT ${JOB_COLUMNS}
             FROM send_scan_jobs j
             JOIN send_files f
               ON f.transfer_id = j.transfer_id
              AND f.id = j.file_id
            WHERE j.id = $1
            FOR UPDATE OF j, f`,
          [input.jobId]
        )).rows[0] as ScanJobRow | undefined
        if (!locked || ['clean', 'detected', 'error', 'timeout'].includes(locked.status)) return
        if (Number(locked.attempt_count) !== input.attemptCount) return
        if (locked.status !== 'running' || locked.file_state !== 'quarantined') {
          throw new Error('Send scan job is not finalizable')
        }

        await database.query(
          `UPDATE send_scan_jobs
              SET status = $2,
                  object_etag = $3,
                  provider = $4,
                  engine_version = $5,
                  signature_version = $6,
                  result_code = $7,
                  evidence = $8::jsonb,
                  completed_at = $9,
                  lease_expires_at = NULL,
                  updated_at = NOW()
            WHERE id = $1 AND status = 'running'`,
          [
            input.jobId,
            input.status,
            input.canonicalObjectEtag,
            input.evidence.provider,
            input.evidence.engineVersion,
            input.evidence.signatureVersion,
            input.evidence.reasonCode,
            evidenceJson,
            input.evidence.scannedAt
          ]
        )
        await database.query(
          `UPDATE send_files
              SET state = $3,
                  scan_status = $4,
                  object_etag = $5,
                  scan_provider = $6,
                  scan_version = $7,
                  scan_evidence = $8::jsonb,
                  scanned_at = $9,
                  updated_at = NOW()
            WHERE transfer_id = $1
              AND id = $2
              AND state = 'quarantined'`,
          [
            locked.transfer_id,
            locked.file_id,
            input.fileState,
            input.scanStatus,
            input.canonicalObjectEtag,
            input.evidence.provider,
            `${input.evidence.engineVersion}:${input.evidence.signatureVersion}`,
            evidenceJson,
            input.evidence.scannedAt
          ]
        )
        await database.query(
          `INSERT INTO send_events (
             transfer_id, file_id, actor_class, actor_id, event_type,
             idempotency_key, metadata
           ) VALUES ($1, $2, 'system', $3, 'scan_completed', $4, $5::jsonb)
           ON CONFLICT (transfer_id, idempotency_key) DO NOTHING`,
          [
            locked.transfer_id,
            locked.file_id,
            'send-scanner',
            `scan-completed:${input.jobId}`,
            JSON.stringify({
              fileId: locked.file_id,
              verdict: input.status,
              reasonCode: input.evidence.reasonCode
            })
          ]
        )
      })
    }
  }
}
