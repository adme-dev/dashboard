import { describe, it, expect, vi } from 'vitest'
import { upsertSocialAccount } from '~~/server/utils/socialOAuth/store'
import type { AccountRow } from '~~/server/utils/socialOAuth/store'

const row: AccountRow = {
  platform: 'facebook', platform_account_id: 'P1', account_name: 'Acme',
  access_token: 'PT', token_expires_at: '2026-08-01T00:00:00.000Z', metadata: { webhook_subscribed: false },
}

function db(existing: any) {
  return {
    queryOne: vi.fn(async (sql: string) => {
      if (/SELECT id, client_id FROM social_accounts/.test(sql)) return existing
      if (/INSERT INTO social_accounts/.test(sql)) return { id: 'new1' }
      if (/UPDATE social_accounts/.test(sql)) return { id: existing?.id }
      if (/FROM agency_clients/.test(sql)) return { name: 'Other Client' }
      return null
    }),
    execute: vi.fn(async () => 1),
  }
}

describe('upsertSocialAccount', () => {
  it('inserts when the page is new', async () => {
    const d = db(null)
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('inserted')
    if (r.status === 'inserted') expect(r.id).toBe('new1')
  })
  it('updates (re-auth) when the page already belongs to THIS client', async () => {
    const d = db({ id: 'acc1', client_id: 'clientA' })
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('updated')
    if (r.status === 'updated') expect(r.id).toBe('acc1')
  })
  it('reports a conflict (no write) when the page belongs to ANOTHER client', async () => {
    const d = db({ id: 'acc1', client_id: 'clientB' })
    const r = await upsertSocialAccount(d as any, 'clientA', row, 'userX')
    expect(r.status).toBe('conflict')
    if (r.status === 'conflict') expect(r.conflictClientName).toBe('Other Client')
    // no insert/update issued
    expect(d.queryOne).not.toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_accounts/), expect.anything())
  })

  it('persists refresh_token on insert (Google Business needs it for offline refresh)', async () => {
    const d = db(null)
    const gbpRow: AccountRow = {
      platform: 'google-business', platform_account_id: 'acc:loc', account_name: 'Store',
      access_token: 'AT', refresh_token: 'RT', token_expires_at: '2026-08-01T00:00:00.000Z', metadata: {},
    }
    await upsertSocialAccount(d as any, 'clientA', gbpRow, 'userX')
    const insert = d.queryOne.mock.calls.find((c: any[]) => /INSERT INTO social_accounts/.test(c[0]))!
    expect(insert[0]).toMatch(/refresh_token/)
    expect(insert[1]).toContain('RT')
  })

  it('updates refresh_token with COALESCE so a missing token keeps the stored one', async () => {
    const d = db({ id: 'acc1', client_id: 'clientA' })
    await upsertSocialAccount(d as any, 'clientA', { ...row, refresh_token: null }, 'userX')
    const update = d.queryOne.mock.calls.find((c: any[]) => /UPDATE social_accounts/.test(c[0]))!
    expect(update[0]).toMatch(/refresh_token = COALESCE/)
  })
})
