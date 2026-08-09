import { describe, it, expect, vi, beforeEach } from 'vitest'

import { runStatutorySeed } from '../../../server/api/cashflow/commitments/seed-statutory.post'

// In-memory stand-in: seed_key uniqueness emulates the partial unique index.
const seededKeys = new Set<string>()
const inserts: unknown[][] = []
let atoContactId: string | null = 'ato-contact-1'

vi.mock('~~/server/utils/db', () => ({
  transaction: async (fn: (client: { query: (sql: string, params: unknown[]) => Promise<{ rows: unknown[] }> }) => Promise<unknown>) => {
    const client = {
      query: vi.fn(async (sql: string, params: unknown[]) => {
        if (/SELECT contact_id/i.test(sql)) {
          return { rows: atoContactId ? [{ contact_id: atoContactId }] : [] }
        }
        // INSERT ... ON CONFLICT DO NOTHING RETURNING id — seed_key is $11 (index 10)
        const seedKey = String(params[10])
        if (seededKeys.has(seedKey)) return { rows: [] }
        seededKeys.add(seedKey)
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
    seededKeys.clear()
    inserts.length = 0
    atoContactId = 'ato-contact-1'
  })

  it('creates all four on first run', async () => {
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(res.skipped).toEqual([])
    expect(inserts).toHaveLength(4)
  })

  it('second run creates nothing (idempotent via unique seed_key)', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    inserts.length = 0
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created).toEqual([])
    expect(res.skipped.sort()).toEqual(['ato-debt-instalment', 'sro-payroll-tax', 'super-weekly', 'wages-weekly'])
    expect(inserts).toHaveLength(0)
  })

  it('anchors dates from the provided today', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    // expected_date is $6 (index 5)
    const dates = inserts.map(p => String(p[5]))
    expect(dates).toContain('2026-08-14') // wages + super: next Friday after Fri 7 Aug
    expect(dates).toContain('2026-09-07') // SRO: 7th has passed
    expect(dates).toContain('2026-08-13') // ATO instalment: 13th upcoming
  })

  it('links the ATO seed to the resolved Xero contact for bill suppression', async () => {
    await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    // contact_id is $3 (index 2), seed_key is $11 (index 10)
    const ato = inserts.find(p => String(p[10]) === 'ato-debt-instalment')!
    expect(ato[2]).toBe('ato-contact-1')
    const wages = inserts.find(p => String(p[10]) === 'wages-weekly')!
    expect(wages[2]).toBeNull()
  })

  it('still seeds the ATO row with null contact when no contact matches', async () => {
    atoContactId = null
    const res = await runStatutorySeed('tenant-1', 'user-1', new Date('2026-08-07T00:00:00Z'))
    expect(res.created).toContain('ato-debt-instalment')
    const ato = inserts.find(p => String(p[10]) === 'ato-debt-instalment')!
    expect(ato[2]).toBeNull()
  })
})
