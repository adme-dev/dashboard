import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { readInvitedSiteAccess, writeInvitedSiteAccess } from '~~/server/utils/pageStudio/invitedAccess'
import type { RunPageStudioTransaction } from '~~/server/utils/pageStudio/sites'
import { findPortalMagicLinkRecipients } from '~~/server/utils/portalMagicLinkRecipients'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn(), queryRowsFresh: vi.fn() }))
const url = process.env.PAGE_STUDIO_INVITED_ACCESS_TEST_URL
if (url && !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('A disposable local PostgreSQL database is required')
const ids = { actor: randomUUID(), client: randomUUID(), otherClient: randomUUID(), user: randomUUID(), otherUser: randomUUID(), site: randomUUID() }
const scope = { tenantId: 'agency-a', siteId: ids.site, actorId: ids.actor }
const grant = { ...scope, userId: ids.user, role: 'editor' as const }

describe.runIf(Boolean(url))('invited CMS grants on PostgreSQL', () => {
  const schema = `cms_access_${randomUUID().replaceAll('-', '')}`
  let pool: pg.Pool
  const run: RunPageStudioTransaction = async (work) => {
    const db = await pool.connect()
    try {
      await db.query('BEGIN')
      const result = await work(db)
      await db.query('COMMIT')
      return result
    } catch (error) {
      await db.query('ROLLBACK')
      throw error
    } finally { db.release() }
  }
  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},pg_catalog -c statement_timeout=8000 -c lock_timeout=6000` })
    await pool.query(`CREATE SCHEMA "${schema}"`)
    await pool.query(`CREATE TABLE agency_clients (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL, name TEXT DEFAULT 'Client');
      CREATE TABLE team_members (id UUID PRIMARY KEY, is_active BOOLEAN NOT NULL, user_role TEXT);
      CREATE TABLE client_users (id UUID PRIMARY KEY, client_id UUID REFERENCES agency_clients(id), name TEXT, email TEXT, status TEXT, role TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE client_invitations (client_id UUID, email TEXT, status TEXT, expires_at TIMESTAMPTZ);
      CREATE TABLE custom_roles (id UUID PRIMARY KEY, slug TEXT);
      CREATE TABLE role_permission_groups (role_id UUID, permission_group TEXT, UNIQUE (role_id, permission_group));`)
    await pool.query(readFileSync(new URL('../../../server/database/migrations/402_page_studio_control_plane.sql', import.meta.url), 'utf8'))
  })
  beforeEach(async () => {
    await pool.query('TRUNCATE agency_clients, team_members, client_invitations CASCADE')
    await pool.query('INSERT INTO agency_clients VALUES ($1, TRUE), ($2, TRUE)', [ids.client, ids.otherClient])
    await pool.query('INSERT INTO team_members VALUES ($1, TRUE, \'admin\')', [ids.actor])
    await pool.query(`INSERT INTO client_users VALUES ($1, $2, 'Paul', 'same@example.com', 'pending', 'viewer'), ($3, $4, 'Paul', 'same@example.com', 'active', 'viewer')`, [ids.user, ids.client, ids.otherUser, ids.otherClient])
    await pool.query('INSERT INTO client_invitations VALUES ($1, \'same@example.com\', \'pending\', NOW() + INTERVAL \'1 day\')', [ids.client])
    const entitlement = (await pool.query('INSERT INTO page_studio_entitlements (tenant_id, client_id) VALUES (\'agency-a\', $1) RETURNING id', [ids.client])).rows[0].id
    await pool.query(`INSERT INTO page_studio_sites (id, tenant_id, client_id, entitlement_id, name, route, starter_version)
      VALUES ($1, 'agency-a', $2, $3, 'Fantasy Limo', 'fantasy-limo', 'v1')`, [ids.site, ids.client, entitlement])
  })
  afterAll(async () => {
    if (pool) {
      await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await pool.end()
    }
  })
  it('grants only the exact invited account and preserves both account states', async () => {
    await writeInvitedSiteAccess(grant, run)
    expect((await readInvitedSiteAccess(scope, run)).users).toMatchObject([{ id: ids.user, role: 'editor', status: 'pending' }])
    expect((await pool.query('SELECT user_id, granted_by FROM page_studio_site_memberships')).rows).toEqual([{ user_id: ids.user, granted_by: ids.actor }])
    expect((await pool.query('SELECT status, role FROM client_users WHERE id=$1', [ids.otherUser])).rows[0]).toEqual({ status: 'active', role: 'viewer' })
    expect((await pool.query('SELECT metadata FROM page_studio_audit_events')).rows[0].metadata).toEqual({ previousRole: 'none', role: 'editor' })
  })
  it('emails only the assigned website account when the same address belongs to multiple clients', async () => {
    const recipients = (redirect: string) => findPortalMagicLinkRecipients('same@example.com', redirect, async (sql, params) => (await pool.query(sql, params)).rows)
    await writeInvitedSiteAccess(grant, run)
    expect((await recipients(`/studio/sites/${ids.site}`)).map(user => user.id)).toEqual([ids.user])
    expect(await recipients(`/studio/sites/${randomUUID()}`)).toEqual([])
    expect(await recipients('/studio/sites/not-a-uuid')).toEqual([])
    expect((await recipients(`/studio/sites/${ids.site}/forms?view=all`)).map(user => user.id)).toEqual([ids.user])
    expect(await recipients('/portal')).toHaveLength(2)
    await writeInvitedSiteAccess({ ...grant, role: 'none' }, run)
    expect(await recipients(`/studio/sites/${ids.site}`)).toEqual([])
  })
  it('excludes unrelated client profiles from the general Studio sign-in', async () => {
    const recipients = (redirect: string) => findPortalMagicLinkRecipients('same@example.com', redirect, async (sql, params) => (await pool.query(sql, params)).rows)
    await writeInvitedSiteAccess(grant, run)

    expect((await recipients('/studio/sites')).map(user => user.id)).toEqual([ids.user])
    expect((await recipients('/studio/sites?view=current')).map(user => user.id)).toEqual([ids.user])
    expect((await recipients('/studio/sites/')).map(user => user.id)).toEqual([ids.user])
    expect(await recipients('/portal')).toHaveLength(2)

    await writeInvitedSiteAccess({ ...grant, role: 'none' }, run)
    expect(await recipients('/studio/sites')).toEqual([])
  })
  it('keeps assigned client profiles separate for a shared Studio email address', async () => {
    const recipients = () => findPortalMagicLinkRecipients('same@example.com', '/studio/sites', async (sql, params) => (await pool.query(sql, params)).rows)
    await writeInvitedSiteAccess(grant, run)
    const otherSite = randomUUID()
    const entitlement = (await pool.query('INSERT INTO page_studio_entitlements (tenant_id, client_id) VALUES (\'agency-a\', $1) RETURNING id', [ids.otherClient])).rows[0].id
    await pool.query(`INSERT INTO page_studio_sites (id, tenant_id, client_id, entitlement_id, name, route, starter_version)
      VALUES ($1, 'agency-a', $2, $3, 'Other website', 'other-website', 'v1')`, [otherSite, ids.otherClient, entitlement])
    await writeInvitedSiteAccess({ ...scope, siteId: otherSite, userId: ids.otherUser, role: 'viewer' }, run)

    const eligible = await recipients()
    expect(eligible).toHaveLength(2)
    expect(eligible.map(user => user.id).sort()).toEqual([ids.user, ids.otherUser].sort())
    expect((await pool.query('SELECT id, status FROM client_users ORDER BY id')).rows).toEqual([
      { id: ids.user, status: 'pending' },
      { id: ids.otherUser, status: 'active' }
    ].sort((a, b) => a.id.localeCompare(b.id)))
  })
  it('does not send general Studio links for unavailable assigned websites', async () => {
    const recipients = () => findPortalMagicLinkRecipients('same@example.com', '/studio/sites', async (sql, params) => (await pool.query(sql, params)).rows)
    await writeInvitedSiteAccess(grant, run)
    await pool.query('UPDATE page_studio_sites SET status=\'archived\' WHERE id=$1', [ids.site])
    expect(await recipients()).toEqual([])
    await pool.query('UPDATE page_studio_sites SET status=\'active\' WHERE id=$1', [ids.site])
    await pool.query('UPDATE agency_clients SET is_active=FALSE WHERE id=$1', [ids.client])
    expect(await recipients()).toEqual([])
  })
  it.each(['expired', 'cancelled'])('does not send general Studio links for a pending profile whose invitation is %s', async (state) => {
    await writeInvitedSiteAccess(grant, run)
    if (state === 'expired') await pool.query('UPDATE client_invitations SET expires_at=NOW() - INTERVAL \'1 minute\'')
    else await pool.query('UPDATE client_invitations SET status=\'cancelled\'')

    expect(await findPortalMagicLinkRecipients('same@example.com', '/studio/sites', async (sql, params) => (await pool.query(sql, params)).rows)).toEqual([])
  })
  it('rejects another client identity even with the same email', async () => {
    await expect(writeInvitedSiteAccess({ ...grant, userId: ids.otherUser }, run)).rejects.toMatchObject({ statusCode: 404 })
    expect((await pool.query('SELECT * FROM page_studio_site_memberships')).rows).toHaveLength(0)
  })
  it('rejects another tenant and a deactivated administrator', async () => {
    await expect(writeInvitedSiteAccess({ ...grant, tenantId: 'agency-b' }, run)).rejects.toMatchObject({ statusCode: 404 })
    await pool.query('UPDATE team_members SET is_active=FALSE')
    await expect(writeInvitedSiteAccess(grant, run)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('does not grant an expired or cancelled invitation', async () => {
    await pool.query('UPDATE client_invitations SET expires_at=NOW() - INTERVAL \'1 minute\'')
    await expect(writeInvitedSiteAccess(grant, run)).rejects.toMatchObject({ statusCode: 404 })
    await pool.query('UPDATE client_invitations SET expires_at=NOW() + INTERVAL \'1 day\', status=\'cancelled\'')
    await expect(writeInvitedSiteAccess(grant, run)).rejects.toMatchObject({ statusCode: 404 })
  })
  it('serializes duplicate grants and audits once', async () => {
    await Promise.all([writeInvitedSiteAccess(grant, run), writeInvitedSiteAccess(grant, run)])
    expect((await pool.query('SELECT * FROM page_studio_site_memberships')).rows).toHaveLength(1)
    expect((await pool.query('SELECT * FROM page_studio_audit_events')).rows).toHaveLength(1)
  })
  it('allows removing access after the account is suspended', async () => {
    await writeInvitedSiteAccess(grant, run)
    await pool.query('UPDATE client_users SET status=\'suspended\' WHERE id=$1', [ids.user])
    expect((await readInvitedSiteAccess(scope, run)).users).toHaveLength(1)
    await writeInvitedSiteAccess({ ...grant, role: 'none' }, run)
    expect((await pool.query('SELECT * FROM page_studio_site_memberships')).rows).toHaveLength(0)
    expect((await pool.query('SELECT * FROM page_studio_audit_events')).rows).toHaveLength(2)
  })
  it('rolls back the grant if its mandatory audit cannot be recorded', async () => {
    await pool.query('ALTER TABLE page_studio_audit_events ADD CONSTRAINT test_reject_membership CHECK (action <> \'site.membership.changed\')')
    try {
      await expect(writeInvitedSiteAccess(grant, run)).rejects.toThrow()
      expect((await pool.query('SELECT * FROM page_studio_site_memberships')).rows).toHaveLength(0)
    } finally { await pool.query('ALTER TABLE page_studio_audit_events DROP CONSTRAINT test_reject_membership') }
  })
})
