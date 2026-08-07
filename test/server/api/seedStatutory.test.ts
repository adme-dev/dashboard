import { describe, it, expect, vi, beforeEach } from 'vitest'

import { runStatutorySeed } from '../../../server/api/cashflow/commitments/seed-statutory.post'

// In-memory stand-in for cashflow_commitments filtered by the seeder's lookup.
const existingRows: Array<{ notes: string }> = []
const inserts: unknown[][] = []

vi.mock('~~/server/utils/db', () => ({
  transaction: async (fn: (client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (/SELECT/i.test(sql)) {
          const like = String(params[1] ?? '')
          const prefix = like.replace(/%$/, '')
          return { rows: existingRows.filter(r => r.notes.startsWith(prefix)) }
        }
        inserts.push(params)
        return { rows: [{ id: 'new-id' }] }
      })
    }
    return fn(client)
  }
}))
vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: async () => 'tenant-1' }))

describe('statutory seeder', () => {
  beforeEach(() => {
    existingRows.length = 0
    inserts.length = 0
  })

  it('creates all four on first run', async () => {
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(res.skipped).toEqual([])
    expect(inserts).toHaveLength(4)
  })

  it('second run creates nothing (idempotent)', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    // notes is the $9 INSERT parameter (index 8)
    existingRows.push(...inserts.map(p => ({ notes: String(p[8]) })))
    inserts.length = 0
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created).toEqual([])
    expect(res.skipped.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(inserts).toHaveLength(0)
  })

  it('anchors dates from the provided today', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    // expected_date is the $5 INSERT parameter (index 4)
    const dates = inserts.map(p => String(p[4]))
    expect(dates).toContain('2026-08-14') // wages + super: next Friday after Fri 7 Aug
    expect(dates).toContain('2026-09-07') // SRO: 7th has passed
    expect(dates).toContain('2026-08-13') // ATO instalment: 13th upcoming
  })
})
