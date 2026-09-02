import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../../server/database/migrations/408_measurement_sync_freshness.sql', import.meta.url),
  'utf8'
)

describe('measurement sync freshness migration', () => {
  it('tracks requested, covered, missing, and active job state independently', () => {
    expect(migration).toContain('last_requested_start_date')
    expect(migration).toContain('covered_start_date')
    expect(migration).toContain('current_job_state')
    expect(migration).toContain('measurement_data_freshness')
    expect(migration).toContain('\'spend\', \'campaign_conversions\', \'conversion_actions\', \'website_events\', \'provider_calls\'')
  })
})
