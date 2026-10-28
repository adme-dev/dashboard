/**
 * Opt-in real-Postgres contract for the browser social-inbox department scope. Skipped unless
 * SOCIAL_INBOX_SCOPE_PG_URL points at a LOCAL scratch database. Inbox tables come from migrations
 * 144, 148, 151, 211, 212 and 400 executed verbatim; agency_clients, team_members, custom_roles and
 * role_permission_groups mirror schema.sql + migration 062 (only the columns the fresh grant
 * check reads). The real route handlers, query builders, scope predicates and the real fresh
 * MARKETING_MANAGEMENT grant check run; only the platform reply dispatcher is a fake.
 *
 *   initdb -D /tmp/inboxscopepg -U postgres && pg_ctl -D /tmp/inboxscopepg -o "-p 54333 -k /tmp -c listen_addresses=''" start
 *   SOCIAL_INBOX_SCOPE_PG_URL='postgresql:///postgres?host=/tmp&port=54333&user=postgres' pnpm exec vitest run test/server/api/socialInboxDepartmentScopePostgres.test.ts
 */
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'

const url = process.env.SOCIAL_INBOX_SCOPE_PG_URL
function isLocal(value?: string): boolean {
  if (!value) return false
  try {
    const parsed = new URL(value)
    const socket = parsed.searchParams.get('host')
    return ['', 'localhost', '127.0.0.1'].includes(parsed.hostname) && (!socket || socket.startsWith('/'))
  } catch {
    return false
  }
}
const local = isLocal(url)

type Err = Error & { statusCode: number }
const g = globalThis as Record<string, unknown>
g.defineEventHandler = (fn: unknown) => fn
g.getRouterParam = (event: { id?: string }) => event.id
g.getQuery = (event: { query?: Record<string, unknown> }) => event.query ?? {}
g.readBody = async (event: { body?: unknown }) => event.body ?? {}
g.createError = (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input) as Err

const h = vi.hoisted(() => ({
  client: null as null | import('pg').Client,
  user: {} as Record<string, unknown>,
  dispatched: [] as string[]
}))
vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params as never[])).rows
  const one = async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null
  const execute = async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params as never[])).rowCount ?? 0
  return { queryRows: rows, queryRowsFresh: rows, queryOne: one, queryOneFresh: one, execute }
})
vi.mock('~~/server/utils/kv', () => ({ kvGet: vi.fn(async () => null), kvPut: vi.fn(), kvDelete: vi.fn() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(async () => h.user) }))
vi.mock('~~/server/utils/godMode/authority', () => ({ resolveGodModeAuthority: vi.fn(async () => ({ active: false })), isActiveGodModeAuthority: () => false }))
vi.mock('~~/server/utils/socialInbox/godModeMutations', () => {
  const tx = async <T>(cb: (db: import('pg').Client) => Promise<T>) => {
    await h.client!.query('BEGIN')
    try {
      const out = await cb(h.client!)
      await h.client!.query('COMMIT')
      return out
    } catch (error) {
      await h.client!.query('ROLLBACK')
      throw error
    }
  }
  return {
    executeSocialInboxMutation: async (_e: unknown, _k: string, mutate: (d: unknown) => Promise<unknown>) => tx(mutate),
    executeSocialInboxExternalMutation: async (_e: unknown, _k: string, run: (r: unknown) => Promise<unknown>) => run({ replay: false, markDispatched: async () => {} }),
    socialInboxTransactionDb: (d: import('pg').Client) => ({
      queryOne: async (sql: string, p?: unknown[]) => (await d.query(sql, p as never[])).rows[0] ?? null,
      execute: async (sql: string, p?: unknown[]) => (await d.query(sql, p as never[])).rowCount ?? 0
    })
  }
})
vi.mock('~~/server/utils/socialInbox/dispatch', () => ({
  dispatchReply: vi.fn(async (_db: unknown, conversationId: string) => {
    h.dispatched.push(conversationId)
    return { ok: true, platformMessageId: `fb_${h.dispatched.length}`, clientId: null }
  })
}))
vi.mock('~~/server/utils/socialInbox/events', () => ({ emitInboxEvent: vi.fn(), streamInboxEvents: vi.fn(() => 'stream') }))
vi.mock('~~/server/utils/socialInbox/clientApprovals', () => ({ recordSocialInboxApprovalEvent: vi.fn(async () => {}) }))
vi.mock('~~/server/utils/notifications', () => ({ createNotification: vi.fn(async () => {}) }))

const R = '../../../server/api/agency/social/inbox'
const list = (await import(`${R}/conversations/index.get`)).default as (e: unknown) => Promise<Array<{ id: string }>>
const detail = (await import(`${R}/conversations/[id]/index.get`)).default as (e: unknown) => Promise<unknown>
const patch = (await import(`${R}/conversations/[id]/index.patch`)).default as (e: unknown) => Promise<unknown>
const note = (await import(`${R}/conversations/[id]/note.post`)).default as (e: unknown) => Promise<unknown>
const reply = (await import(`${R}/conversations/[id]/reply.post`)).default as (e: unknown) => Promise<unknown>
const queue = (await import(`${R}/response-queue/index.get`)).default as (e: unknown) => Promise<Array<{ id: string }>>
const approve = (await import(`${R}/response-queue/[id]/approve.post`)).default as (e: unknown) => Promise<unknown>
const reject = (await import(`${R}/response-queue/[id]/reject.post`)).default as (e: unknown) => Promise<unknown>
const health = (await import(`${R}/accounts/health.get`)).default as (e: unknown) => Promise<Array<Record<string, unknown>>>

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const DEPT = ID(1), LEGACY = ID(2), ROLE = ID(5)
const CLIENT = ID(10), OTHER = ID(11), INACTIVE = ID(12)
const ACC = ID(50), ACC_OFF = ID(51), ACC_GONE = ID(52), ACC_OTHER = ID(53)
const CONV = ID(60), CONV_OFF = ID(61), CONV_GONE = ID(62), CONV_MIXED = ID(63), CONV_OTHER = ID(64)
const Q = ID(80), Q_MIXED = ID(81), Q_OFF = ID(82)

const PREREQS = `
DROP SCHEMA IF EXISTS inbox_scope_test CASCADE; CREATE SCHEMA inbox_scope_test; SET search_path TO inbox_scope_test, public;
CREATE TABLE agency_clients (id uuid PRIMARY KEY, name varchar(255) NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE custom_roles (id uuid PRIMARY KEY, slug text NOT NULL, is_system boolean NOT NULL DEFAULT false);
CREATE TABLE role_permission_groups (role_id uuid REFERENCES custom_roles(id) ON DELETE CASCADE, permission_group text NOT NULL);
CREATE TABLE team_members (id uuid PRIMARY KEY, name varchar(255) NOT NULL, email varchar(255) UNIQUE NOT NULL, is_active boolean DEFAULT true,
  user_role text NOT NULL DEFAULT 'staff', custom_role_id uuid REFERENCES custom_roles(id));
CREATE TABLE task_statuses (id uuid PRIMARY KEY, name text);
CREATE TABLE projects (id uuid PRIMARY KEY, name text, client_id uuid);
CREATE TABLE tasks (id uuid PRIMARY KEY, title text, status_id uuid, project_id uuid);
CREATE TABLE client_requests (id uuid PRIMARY KEY, title text, status text, request_type text, client_id uuid);
`
const MIGRATIONS = ['144_social_accounts.sql', '148_social_inbox.sql', '151_social_automation.sql', '211_social_inbox_native_links.sql',
  '212_social_inbox_case_events.sql', '400_social_inbox_account_client_consistency.sql']
const SEED = `
INSERT INTO agency_clients VALUES ('${CLIENT}', 'Client', true), ('${OTHER}', 'Other', true), ('${INACTIVE}', 'Gone', false);
INSERT INTO custom_roles VALUES ('${ROLE}', 'marketing-manager', false);
INSERT INTO role_permission_groups VALUES ('${ROLE}', 'MARKETING_MANAGEMENT'), ('${ROLE}', 'CLIENTS');
INSERT INTO team_members (id, name, email, custom_role_id) VALUES ('${DEPT}', 'Garrix', 'garrix@agency.test', '${ROLE}'), ('${LEGACY}', 'Legacy', 'legacy@agency.test', NULL);
INSERT INTO social_accounts (id, client_id, platform, platform_account_id, account_name, access_token, is_active) VALUES
  ('${ACC}', '${CLIENT}', 'facebook', 'pg-client', 'Client Page', 'secret-token-1', true),
  ('${ACC_OFF}', '${CLIENT}', 'facebook', 'pg-off', 'Old Page', 'secret-token-2', false),
  ('${ACC_GONE}', '${INACTIVE}', 'facebook', 'pg-gone', 'Gone Page', 'secret-token-3', true),
  ('${ACC_OTHER}', '${OTHER}', 'facebook', 'pg-other', 'Other Page', 'secret-token-4', true);
-- CONV_MIXED: a conversation recorded under CLIENT on another client's account (insert-time drift the
-- migration 400 trigger does not repair). Newest, so an unscoped LIMIT 1 returns it.
INSERT INTO social_conversations (id, client_id, social_account_id, platform, channel_type, platform_conversation_id, last_message_at) VALUES
  ('${CONV}', '${CLIENT}', '${ACC}', 'facebook', 'comment', 'post-1', NOW() - interval '5 minutes'),
  ('${CONV_OFF}', '${CLIENT}', '${ACC_OFF}', 'facebook', 'comment', 'post-2', NOW() - interval '4 minutes'),
  ('${CONV_GONE}', '${INACTIVE}', '${ACC_GONE}', 'facebook', 'comment', 'post-3', NOW() - interval '3 minutes'),
  ('${CONV_OTHER}', '${OTHER}', '${ACC_OTHER}', 'facebook', 'comment', 'post-5', NOW() - interval '2 minutes'),
  ('${CONV_MIXED}', '${CLIENT}', '${ACC_OTHER}', 'facebook', 'comment', 'post-4', NOW() - interval '1 minute');
INSERT INTO social_response_queue (id, client_id, conversation_id, draft_content, status, effective_mode, approver_type) VALUES
  ('${Q}', '${CLIENT}', '${CONV}', 'Thanks!', 'pending', 'approval', 'staff'),
  ('${Q_MIXED}', '${CLIENT}', '${CONV_OTHER}', 'Mixed', 'pending', 'approval', 'staff'),
  ('${Q_OFF}', '${CLIENT}', '${CONV_OFF}', 'Off', 'pending', 'approval', 'staff');
`

const asDept = () => {
  h.user = { id: DEPT, role: 'staff', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS'] }
}
const asLegacy = () => {
  h.user = { id: LEGACY, role: 'staff', permissionGroups: ['CLIENTS'] }
}
const ev = (extra: Record<string, unknown>) => ({ context: {}, ...extra })
const ids = (rows: Array<{ id: string }>) => rows.map(r => r.id).sort()
const one = async (sql: string, params: unknown[]) => (await h.client!.query(sql, params)).rows[0]

describe.skipIf(!local)('browser social inbox department scope (real Postgres)', () => {
  beforeAll(async () => {
    h.client = new pg.Client({ connectionString: url })
    await h.client.connect()
    await h.client.query(PREREQS)
    for (const file of MIGRATIONS) await h.client.query(readFileSync(`server/database/migrations/${file}`, 'utf8'))
    await h.client.query('SET search_path TO inbox_scope_test, public')
    await h.client.query(SEED)
  })
  afterAll(async () => {
    await h.client?.query('DROP SCHEMA IF EXISTS inbox_scope_test CASCADE')
    await h.client?.end()
  })
  beforeEach(() => {
    h.dispatched.length = 0
    asDept()
  })

  it('department list returns only own-active-account conversations of active clients, scoped before LIMIT', async () => {
    expect(ids(await list(ev({ query: {} })))).toEqual([CONV, CONV_OTHER].sort())
    expect(ids(await list(ev({ query: { clientId: CLIENT } })))).toEqual([CONV])
    // The newest row is the mixed one; an unscoped LIMIT 1 would return it and filter to nothing.
    expect(ids(await list(ev({ query: { limit: '1' } })))).toEqual([CONV_OTHER])
    await expect(list(ev({ query: { clientId: INACTIVE } }))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('legacy staff keep the existing all-clients list (preserved behaviour)', async () => {
    asLegacy()
    expect(ids(await list(ev({ query: {} })))).toEqual([CONV, CONV_GONE, CONV_MIXED, CONV_OTHER].sort())
    expect(ids(await list(ev({ query: { limit: '1' } })))).toEqual([CONV_MIXED])
  })

  it.each([[CONV_OFF, 'inactive account'], [CONV_GONE, 'inactive client'], [CONV_MIXED, 'foreign account']])('detail/patch/note/reply refuse %s (%s) with no effect', async (conversationId) => {
    const before = await one('SELECT status, updated_at FROM social_conversations WHERE id = $1', [conversationId])
    await expect(detail(ev({ id: conversationId }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(patch(ev({ id: conversationId, body: { status: 'closed' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(note(ev({ id: conversationId, body: { content: 'x' } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(reply(ev({ id: conversationId, body: { content: 'x' } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(await one('SELECT status, updated_at FROM social_conversations WHERE id = $1', [conversationId])).toEqual(before)
    expect((await one('SELECT COUNT(*)::int AS n FROM social_messages WHERE conversation_id = $1', [conversationId])).n).toBe(0)
    expect(h.dispatched).toEqual([])
  })

  it('in-scope detail, patch, note and single-actor reply work', async () => {
    expect(await detail(ev({ id: CONV }))).toMatchObject({ conversation: { id: CONV } })
    await patch(ev({ id: CONV, body: { status: 'snoozed', snoozed_until: new Date(Date.now() + 3_600_000).toISOString() } }))
    expect((await one('SELECT status FROM social_conversations WHERE id = $1', [CONV])).status).toBe('snoozed')
    await note(ev({ id: CONV, body: { content: 'internal' } }))
    expect((await one('SELECT COUNT(*)::int AS n FROM social_messages WHERE conversation_id = $1 AND is_internal_note', [CONV])).n).toBe(1)
    await reply(ev({ id: CONV, body: { content: 'Hi' } }))
    expect(h.dispatched).toEqual([CONV])
  })

  it('queue list and approve/reject exclude mixed-ID and inactive-account rows', async () => {
    expect(ids(await queue(ev({ query: { clientId: CLIENT } })))).toEqual([Q])
    await expect(approve(ev({ id: Q_MIXED, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(approve(ev({ id: Q_OFF, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 404 })
    await expect(reject(ev({ id: Q_OFF, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 404 })
    expect(h.dispatched).toEqual([])
    expect((await h.client!.query(`SELECT id, status FROM social_response_queue WHERE id = ANY($1::uuid[]) ORDER BY id`, [[Q_MIXED, Q_OFF]])).rows)
      .toEqual([{ id: Q_MIXED, status: 'pending' }, { id: Q_OFF, status: 'pending' }])
  })

  it('an account deactivated after drafting cannot be sent from; reactivated it sends exactly once', async () => {
    await h.client!.query('UPDATE social_accounts SET is_active = FALSE WHERE id = $1', [ACC])
    await expect(approve(ev({ id: Q, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 404 })
    expect((await one('SELECT status FROM social_response_queue WHERE id = $1', [Q])).status).toBe('pending')
    await h.client!.query('UPDATE social_accounts SET is_active = TRUE WHERE id = $1', [ACC])
    await approve(ev({ id: Q, body: { clientId: CLIENT } }))
    expect(h.dispatched).toEqual([CONV])
    expect((await one('SELECT status, approved_by FROM social_response_queue WHERE id = $1', [Q]))).toEqual({ status: 'sent', approved_by: DEPT })
    await expect(approve(ev({ id: Q, body: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 409 })
    expect(h.dispatched).toEqual([CONV])
  })

  it('a client deactivated mid-session drops out immediately', async () => {
    await h.client!.query('UPDATE agency_clients SET is_active = FALSE WHERE id = $1', [OTHER])
    try {
      expect(ids(await list(ev({ query: {} })))).toEqual([CONV])
      await expect(detail(ev({ id: CONV_OTHER }))).rejects.toMatchObject({ statusCode: 404 })
    } finally {
      await h.client!.query('UPDATE agency_clients SET is_active = TRUE WHERE id = $1', [OTHER])
    }
  })

  it('fresh revocation (role grant removed, or member deactivated) refuses before any read or write', async () => {
    await h.client!.query(`DELETE FROM role_permission_groups WHERE role_id = $1 AND permission_group = 'MARKETING_MANAGEMENT'`, [ROLE])
    try {
      await expect(list(ev({ query: {} }))).rejects.toMatchObject({ statusCode: 403 })
      await expect(note(ev({ id: CONV, body: { content: 'after revoke' } }))).rejects.toMatchObject({ statusCode: 403 })
      await expect(reply(ev({ id: CONV, body: { content: 'after revoke' } }))).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await h.client!.query(`INSERT INTO role_permission_groups VALUES ($1, 'MARKETING_MANAGEMENT')`, [ROLE])
    }
    await h.client!.query('UPDATE team_members SET is_active = FALSE WHERE id = $1', [DEPT])
    try {
      await expect(queue(ev({ query: { clientId: CLIENT } }))).rejects.toMatchObject({ statusCode: 403 })
    } finally {
      await h.client!.query('UPDATE team_members SET is_active = TRUE WHERE id = $1', [DEPT])
    }
    expect((await one(`SELECT COUNT(*)::int AS n FROM social_messages WHERE content = 'after revoke'`, [])).n).toBe(0)
    expect(h.dispatched).toEqual([])
  })

  it('account health: department sees only active accounts of active clients, counts only own-client conversations, never tokens', async () => {
    const rows = await health(ev({ query: {} }))
    expect(rows.map(r => r.id).sort()).toEqual([ACC, ACC_OTHER].sort())
    expect(rows.find(r => r.id === ACC_OTHER)?.conversation_count).toBe(1)
    expect(JSON.stringify(rows)).not.toContain('secret-token')
    expect(ids(await health(ev({ query: { clientId: CLIENT } })) as never)).toEqual([ACC])
    asLegacy()
    const legacy = await health(ev({ query: {} }))
    expect(legacy.find(r => r.id === ACC_OTHER)?.conversation_count).toBe(2)
    expect(ids(await health(ev({ query: { clientId: CLIENT } })) as never)).toEqual([ACC, ACC_OFF].sort())
  })
})
