import { describe, expect, it, vi } from 'vitest'
import { createPostgresSendScanRepository } from '../../server/utils/send/scanRepository'

const JOB_ID = '77777777-7777-4777-8777-777777777777'
const FILE_ID = '55555555-5555-4555-8555-555555555555'
const TRANSFER_ID = '44444444-4444-4444-8444-444444444444'
const NOW = new Date('2026-07-21T01:00:00.000Z')

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: JOB_ID,
    transfer_id: TRANSFER_ID,
    file_id: FILE_ID,
    object_key: `send/${TRANSFER_ID}/${FILE_ID}`,
    expected_size_bytes: 2048,
    expected_mime_type: 'application/pdf',
    object_etag: 'canonical-etag',
    upload_method: 'multipart',
    status: 'pending',
    attempt_count: 0,
    max_attempts: 3,
    available_at: NOW,
    lease_expires_at: null,
    file_state: 'quarantined',
    scan_status: 'pending',
    ...overrides
  }
}

function repositoryWithDb(handler: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>) {
  const db = { query: vi.fn(handler) }
  return {
    db,
    repository: createPostgresSendScanRepository({
      transaction: (async callback => callback(db)) as never
    })
  }
}

describe('Postgres Send scan repository', () => {
  it('does not claim work before its capability-expiry availability boundary', async () => {
    const future = new Date('2026-07-21T01:02:00.000Z')
    const { db, repository } = repositoryWithDb(async sql => ({
      rows: /FOR UPDATE/.test(sql) ? [row({ upload_method: 'single', available_at: future })] : []
    }))

    await expect(repository.claimJob(JOB_ID, NOW)).resolves.toEqual({
      status: 'not_ready',
      retryAfterSeconds: 120
    })
    expect(db.query).toHaveBeenCalledOnce()
  })

  it('claims with a bounded lease and increments the canonical attempt exactly once', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const { repository } = repositoryWithDb(async (sql, params) => {
      queries.push({ sql, params })
      if (/FOR UPDATE/.test(sql)) return { rows: [row()] }
      if (/UPDATE send_scan_jobs/.test(sql)) return { rows: [row({ status: 'running', attempt_count: 1 })] }
      return { rows: [] }
    })

    await expect(repository.claimJob(JOB_ID, NOW)).resolves.toMatchObject({
      status: 'claimed',
      job: { id: JOB_ID, attemptCount: 1, maxAttempts: 3 }
    })
    expect(queries.map(query => query.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE OF j, f/),
      expect.stringMatching(/attempt_count = attempt_count \+ 1/),
      expect.stringMatching(/scan_status = 'running'/)
    ])
    expect(queries[1]!.params).toEqual([
      JOB_ID,
      NOW.toISOString(),
      '2026-07-21T01:10:00.000Z'
    ])
  })

  it('returns busy for an unexpired lease and idempotently acknowledges a terminal job', async () => {
    const lease = new Date('2026-07-21T01:03:00.000Z')
    const busy = repositoryWithDb(async sql => ({
      rows: /FOR UPDATE/.test(sql) ? [row({ status: 'running', lease_expires_at: lease })] : []
    }))
    await expect(busy.repository.claimJob(JOB_ID, NOW)).resolves.toEqual({
      status: 'busy',
      retryAfterSeconds: 180
    })
    expect(busy.db.query).toHaveBeenCalledOnce()

    const complete = repositoryWithDb(async sql => ({
      rows: /FOR UPDATE/.test(sql) ? [row({ status: 'clean' })] : []
    }))
    await expect(complete.repository.claimJob(JOB_ID, NOW)).resolves.toEqual({
      status: 'complete',
      outcome: 'clean'
    })
    expect(complete.db.query).toHaveBeenCalledOnce()
  })

  it('fails closed instead of issuing another claim after the final lease expires', async () => {
    const queries: string[] = []
    const expiredLease = new Date('2026-07-21T00:59:00.000Z')
    const { repository } = repositoryWithDb(async (sql) => {
      queries.push(sql)
      return {
        rows: /FOR UPDATE/.test(sql)
          ? [row({ status: 'running', attempt_count: 3, max_attempts: 3, lease_expires_at: expiredLease })]
          : []
      }
    })

    await expect(repository.claimJob(JOB_ID, NOW)).resolves.toEqual({
      status: 'complete',
      outcome: 'timeout'
    })
    expect(queries).toEqual([
      expect.stringMatching(/FOR UPDATE OF j, f/),
      expect.stringMatching(/status = 'timeout'/),
      expect.stringMatching(/scan_status = 'error'/),
      expect.stringMatching(/INSERT INTO send_events/)
    ])
    expect(queries.some(sql => /attempt_count = attempt_count \+ 1/.test(sql))).toBe(false)
  })

  it('releases a retryable failure without storing provider output', async () => {
    const { db, repository } = repositoryWithDb(async () => ({ rows: [] }))
    const retryAt = new Date('2026-07-21T01:00:30.000Z')

    await repository.releaseJob({
      jobId: JOB_ID,
      attemptCount: 1,
      reasonCode: 'SCANNER_UNAVAILABLE',
      retryAt
    })

    expect(db.query).toHaveBeenCalledWith(
      expect.stringMatching(/status = 'pending'[\s\S]*lease_expires_at = NULL/),
      [JOB_ID, 'SCANNER_UNAVAILABLE', retryAt.toISOString(), 1]
    )
  })

  it('finalizes clean state, canonical ETag, redacted evidence, and one audit event atomically', async () => {
    const queries: Array<{ sql: string, params: unknown[] }> = []
    const { repository } = repositoryWithDb(async (sql, params) => {
      queries.push({ sql, params })
      return { rows: /FOR UPDATE/.test(sql) ? [row({ status: 'running', attempt_count: 1 })] : [] }
    })
    const evidence = {
      provider: 'clamav' as const,
      engineVersion: '1.5.3',
      signatureVersion: '2026072101',
      reasonCode: 'NONE',
      detectedMimeType: 'application/pdf',
      activeContent: false,
      contentDisposition: 'attachment' as const,
      scannedAt: '2026-07-21T01:05:00.000Z'
    }

    await repository.completeJob({
      jobId: JOB_ID,
      attemptCount: 1,
      status: 'clean',
      fileState: 'clean',
      scanStatus: 'clean',
      canonicalObjectEtag: 'post-expiry-etag',
      evidence
    })

    expect(queries.map(query => query.sql)).toEqual([
      expect.stringMatching(/FOR UPDATE OF j, f/),
      expect.stringMatching(/UPDATE send_scan_jobs/),
      expect.stringMatching(/UPDATE send_files/),
      expect.stringMatching(/INSERT INTO send_events/)
    ])
    expect(queries[1]!.params).toEqual([
      JOB_ID,
      'clean',
      'post-expiry-etag',
      'clamav',
      '1.5.3',
      '2026072101',
      'NONE',
      JSON.stringify(evidence),
      evidence.scannedAt
    ])
    const eventMetadata = JSON.parse(queries[3]!.params[4] as string)
    expect(eventMetadata).toEqual({ fileId: FILE_ID, verdict: 'clean', reasonCode: 'NONE' })
    expect(JSON.stringify(queries)).not.toMatch(/send\/[0-9a-f-]+|rawOutput|filename|signedUrl/i)
  })

  it('does not let an expired attempt finalize after a newer claim', async () => {
    const { db, repository } = repositoryWithDb(async sql => ({
      rows: /FOR UPDATE/.test(sql) ? [row({ status: 'running', attempt_count: 2 })] : []
    }))

    await repository.completeJob({
      jobId: JOB_ID,
      attemptCount: 1,
      status: 'clean',
      fileState: 'clean',
      scanStatus: 'clean',
      canonicalObjectEtag: 'stale-etag',
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
    })

    expect(db.query).toHaveBeenCalledOnce()
  })

  it('maps an R2 object wake-up to a job ID without trusting event ETag or size', async () => {
    const queryOne = vi.fn(async () => ({ id: JOB_ID }))
    const repository = createPostgresSendScanRepository({ queryOne: queryOne as never })

    await expect(repository.findJobForObject(`send/${TRANSFER_ID}/${FILE_ID}`)).resolves.toBe(JOB_ID)
    expect(queryOne).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE j\.object_key = \$1/),
      [`send/${TRANSFER_ID}/${FILE_ID}`]
    )
  })
})
