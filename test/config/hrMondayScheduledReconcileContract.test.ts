import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const route = readFileSync('server/api/cron/monday-reconcile.post.ts', 'utf8')
const worker = readFileSync('workers/pages-cron/src/index.ts', 'utf8')
const scope = readFileSync('server/utils/hr/mondayScope.ts', 'utf8')
const runner = readFileSync('server/utils/hr/mondaySyncRunner.ts', 'utf8')

describe('scheduled governed Monday reconciliation contract', () => {
  it('requires cron authentication and an approved owner', () => {
    expect(route).toContain("getHeader(event, 'x-cron-secret')")
    expect(route).toContain('process.env.CRON_SECRET')
    expect(route).toContain('getActiveMondayEvidenceScope()')
    expect(route).toContain('scope.approved_by')
    expect(route).toContain("startGovernedMondaySync(event, scope, scope.approved_by, 'scheduled')")
    expect(scope).toContain('approved_by: string | null')
  })

  it('keeps scheduled repair inside the approved field and date boundary', () => {
    expect(runner).toContain('allowedFields: scope.allowed_fields')
    expect(runner).toContain("updatedUntil: `${scope.period_end}T23:59:59.999Z`")
  })

  it('runs reconciliation hourly and drains webhook events every five minutes', () => {
    expect(worker).toContain("'/api/cron/monday-reconcile'")
    expect(worker).toContain("'/api/cron/monday-health-notifications'")
    expect(worker).toContain("'/api/cron/monday-webhooks'")
  })
})
