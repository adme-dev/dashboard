import { describe, it, expect, vi } from 'vitest'
import { portalPeriodPostRows, portalAccountGrowth } from '~~/server/utils/socialReporting/portal'

/**
 * The portal reporting data layer is client-facing, so its cardinal property is tenant isolation:
 * every query scoped to the SESSION client_id (passed by the endpoint from requireClientAuth),
 * never a caller-supplied id. These tests assert that scoping via an injected fake runner.
 */
function rec() {
  const calls: { sql: string; params: any[] }[] = []
  return { calls, queryRows: vi.fn(async (sql: string, params: any[] = []) => { calls.push({ sql, params }); return [] }) }
}

describe('portalPeriodPostRows', () => {
  it('scopes posts to the session client_id ($1) and the date window', async () => {
    const db = rec()
    await portalPeriodPostRows(db as any, 'client-9', '2026-05-01T00:00:00Z', '2026-06-01T00:00:00Z', null)
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/FROM social_posts/i)
    expect(sql).toMatch(/p\.client_id = \$1/)
    expect(params[0]).toBe('client-9')
    expect(params).toContain('2026-05-01T00:00:00Z')
    expect(params).toContain('2026-06-01T00:00:00Z')
  })

  it('applies an optional platform filter on both the join and the targeted posts', async () => {
    const db = rec()
    await portalPeriodPostRows(db as any, 'c1', 'a', 'b', 'instagram')
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/m\.platform = \$4/)
    expect(sql).toMatch(/\$4 = ANY\(p\.platforms\)/)
    expect(params).toContain('instagram')
  })
  it('retains NULL when any platform snapshot is unavailable rather than summing a partial total', async () => {
    const db = rec()
    await portalPeriodPostRows(db as any, 'c1', 'a', 'b', null)
    const sql = db.calls[0].sql
    expect(sql).toContain('CASE WHEN COUNT(m.impressions) = COUNT(*) THEN SUM(m.impressions)::int ELSE NULL END AS impressions')
    expect(sql).not.toMatch(/COALESCE\(SUM\(m\./)
    expect(sql.match(/AS reactions/g)).toHaveLength(1)
  })
})

describe('portalAccountGrowth', () => {
  it('scopes account growth to the session client_id and aggregates per platform/day', async () => {
    const db = rec()
    await portalAccountGrowth(db as any, 'client-3', '2026-05-01', '2026-06-01', null)
    const { sql, params } = db.calls[0]
    expect(sql).toMatch(/FROM social_account_metrics/i)
    expect(sql).toMatch(/client_id = \$1/)
    expect(sql).toMatch(/GROUP BY platform, snapshot_date/i)
    expect(params[0]).toBe('client-3')
    expect(sql).toContain('CASE WHEN COUNT(reach) = COUNT(*) THEN SUM(reach)::int ELSE NULL END AS reach')
  })
})
