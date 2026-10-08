import { describe, expect, it, vi } from 'vitest'
import { readInvitedSiteAccess, writeInvitedSiteAccess } from '~~/server/utils/pageStudio/invitedAccess'
import type { PageStudioQueryClient, RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn() }))
const scope = { tenantId: 'agency-a', siteId: '10000000-0000-4000-8000-000000000001', actorId: '20000000-0000-4000-8000-000000000001' }
const userId = '30000000-0000-4000-8000-000000000001'
const clientId = '40000000-0000-4000-8000-000000000001'
function fixture(options: { admin?: boolean, site?: boolean, eligible?: boolean, role?: string } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('FROM team_members')) return { rows: options.admin === false ? [] : [{ id: scope.actorId }] }
    if (sql.includes('FROM page_studio_sites')) return { rows: options.site === false ? [] : [{ client_id: clientId, name: 'Fantasy Limo' }] }
    if (sql.includes('FROM client_users')) return { rows: options.eligible === false ? [] : [{ id: userId, name: 'Paul', email: 'paul@example.com', status: 'pending', role: options.role ?? null }] }
    if (sql.includes('SELECT role FROM page_studio_site_memberships')) return { rows: options.role ? [{ role: options.role }] : [] }
    return { rows: [] }
  })
  const runTransaction: RunPageStudioTransaction = callback => callback({ query } as PageStudioQueryClient)
  return { query, runTransaction }
}

describe('invited CMS access management', () => {
  it('lists only the selected site client and returns its name', async () => {
    const f = fixture()
    expect(await readInvitedSiteAccess(scope, f.runTransaction)).toMatchObject({ name: 'Fantasy Limo', users: [{ id: userId, status: 'pending', role: null }] })
    expect(f.query.mock.calls.find(([sql]) => sql.includes('FROM client_users'))?.[0]).toContain('cu.client_id = $1')
  })
  it.each([{ admin: false }, { site: false }, { eligible: false }])('rejects unavailable authority or identity before any grant: %j', async (options) => {
    const f = fixture(options)
    await expect(writeInvitedSiteAccess({ ...scope, userId, role: 'editor' }, f.runTransaction)).rejects.toThrow()
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
  })
  it('records the site grant and audit without activating or changing the account', async () => {
    const f = fixture()
    await expect(writeInvitedSiteAccess({ ...scope, userId, role: 'editor' }, f.runTransaction)).resolves.toEqual({ role: 'editor' })
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO page_studio_site_memberships'))).toBe(true)
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO page_studio_audit_events'))).toBe(true)
    expect(f.query.mock.calls.some(([sql]) => sql.includes('UPDATE client_users'))).toBe(false)
  })
  it('does not duplicate an unchanged grant or its audit', async () => {
    const f = fixture({ role: 'editor' })
    await writeInvitedSiteAccess({ ...scope, userId, role: 'editor' }, f.runTransaction)
    expect(f.query.mock.calls.some(([sql]) => sql.includes('INSERT INTO'))).toBe(false)
  })
  it('rejects admin as a fabricated CMS role', async () => {
    const f = fixture()
    await expect(writeInvitedSiteAccess({ ...scope, userId, role: 'admin' } as never, f.runTransaction)).rejects.toThrow()
    expect(f.query).not.toHaveBeenCalled()
  })
})
