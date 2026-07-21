import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/270_send_scan_jobs.sql', import.meta.url),
  'utf8'
)

describe('Send scan jobs migration 270', () => {
  it('creates canonical, idempotent, bounded scan work', () => {
    expect(migration).toContain('BEGIN;')
    expect(migration).toContain('COMMIT;')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS send_scan_jobs')
    expect(migration).toContain('file_id UUID NOT NULL UNIQUE')
    expect(migration).toContain('upload_method IN (\'single\', \'multipart\')')
    expect(migration).toContain('max_attempts BETWEEN 1 AND 10')
    expect(migration).toContain('idx_send_scan_jobs_available')
    expect(migration).toContain('Queue and R2 event messages are wake-ups only')
  })

  it('fails closed around leases, terminal outcomes, and redacted evidence', () => {
    expect(migration).toContain('status IN (\'pending\', \'running\', \'clean\', \'detected\', \'error\', \'timeout\')')
    expect(migration).toContain('status = \'running\'')
    expect(migration).toContain('lease_expires_at IS NOT NULL')
    expect(migration).toContain('completed_at IS NOT NULL')
    expect(migration).toContain('jsonb_typeof(evidence) = \'object\'')
    expect(migration).toContain('\'rawOutput\'')
    expect(migration).toContain('\'providerResponse\'')
    expect(migration).not.toMatch(/^\s*(signed_url|raw_output|provider_response|password|token)\s+/im)
  })

  it('does not provision or activate external infrastructure', () => {
    expect(migration).toContain('does not')
    expect(migration).not.toMatch(/CREATE\s+(QUEUE|CONTAINER|BUCKET)/i)
    expect(migration).not.toMatch(/CREATE\s+(PUBLIC|EXTERNAL)\s+ROUTE/i)
  })
})
