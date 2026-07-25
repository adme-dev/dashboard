import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../../', import.meta.url)
const source = (path: string) => readFileSync(new URL(path, root), 'utf8')

describe('platform job observability contracts', () => {
  it('installs a payload-free execution ledger with health indexes', () => {
    const migration = source('server/database/migrations/300_platform_job_execution_observability.sql')
    expect(migration).toContain('platform_job_executions')
    expect(migration).toContain('REFERENCES agency_clients(id)')
    expect(migration).toContain('UNIQUE (job_id, attempt)')
    expect(migration).toContain('idx_platform_job_executions_failures')
    expect(migration).not.toContain('payload JSONB')
  })

  it('records stable job identity and fails unknown job types', () => {
    expect(source('server/utils/queue.ts')).toContain('jobId: globalThis.crypto.randomUUID()')
    expect(source('server/utils/queueConsumer.ts')).toContain('throw new Error(`Unknown queue job type:')
  })

  it('exposes admin-only queue SLO health without payloads', () => {
    const endpoint = source('server/api/agency/operations/queue-health.get.ts')
    expect(endpoint).toContain("requirePermission(event, 'ADMIN')")
    expect(endpoint).toContain('PERCENTILE_CONT(0.95)')
    expect(endpoint).toContain('successRateTarget: 0.99')
    expect(endpoint).not.toContain('payload')
  })
})
