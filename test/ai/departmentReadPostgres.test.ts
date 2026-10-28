/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/**
 * Opt-in real-Postgres contract for department reads. Skipped unless DEPARTMENT_READ_PG_URL points
 * at a LOCAL scratch database (localhost or a unix socket); it refuses any other host. It builds a
 * minimal schema mirroring the migration columns these reads touch inside a throwaway schema,
 * executes the real emitted SQL and checks scope and aggregate outcomes.
 *
 *   initdb -D /tmp/deptpg && pg_ctl -D /tmp/deptpg -o "-p 54329 -k /tmp" start
 *   DEPARTMENT_READ_PG_URL='postgresql:///postgres?host=/tmp&port=54329' pnpm exec vitest run test/ai/departmentReadPostgres.test.ts
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { DEPARTMENT_NOW, departmentReadContext, fixtureClientId } from './departmentReadFixtures'

const url = process.env.DEPARTMENT_READ_PG_URL
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
const client = vi.hoisted(() => ({ current: null as null | pg.Client, captured: [] as Array<{ label: string, sql: string, params: unknown[] }> }))
vi.mock('~~/server/utils/db', () => {
  const run = async (sql: string, params?: unknown[]) => {
    client.captured.push({ label: /\/\* (dept:[a-z_]+:[a-z_]+) \*\//.exec(sql)?.[1] ?? 'unlabelled', sql, params: params ?? [] })
    return (await client.current!.query(sql, params as any[])).rows
  }
  return { queryRowsFresh: run, queryOneFresh: async (sql: string, params?: unknown[]) => (await run(sql, params))[0] ?? null }
})

const SCHEMA = `
DROP SCHEMA IF EXISTS dept_read_test CASCADE; CREATE SCHEMA dept_read_test; SET search_path TO dept_read_test;
CREATE TABLE agency_clients (id uuid PRIMARY KEY, name varchar(255) NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE team_members (id uuid PRIMARY KEY, name text);
CREATE TABLE social_connections (id uuid PRIMARY KEY, client_id uuid, platform varchar(20), status varchar(20) DEFAULT 'active', metadata jsonb);
CREATE TABLE media_spend (id uuid PRIMARY KEY, client_id uuid NOT NULL, platform varchar(50) NOT NULL, budget_allocated decimal(12,2) NOT NULL,
  actual_spend decimal(12,2) DEFAULT 0, commission_rate decimal(5,2) DEFAULT 0, period varchar(7) NOT NULL, synced_at timestamptz, connection_id uuid);
CREATE TABLE daily_spend (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), media_spend_id uuid NOT NULL, spend_date date NOT NULL, spend numeric(12,2) DEFAULT 0);
CREATE TABLE lead_form_rules (id uuid PRIMARY KEY, client_id uuid NOT NULL, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE lead_rule_destinations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), rule_id uuid NOT NULL, destination_type varchar(30), config jsonb, enabled boolean NOT NULL DEFAULT true);
CREATE TABLE leads (id uuid PRIMARY KEY, client_id uuid, source varchar(20) NOT NULL, status varchar(20) NOT NULL DEFAULT 'new', submitted_at timestamptz NOT NULL,
  contacted_at timestamptz, deleted_at timestamptz, is_test boolean NOT NULL DEFAULT false, field_data jsonb NOT NULL DEFAULT '{}'::jsonb, notes text);
CREATE TABLE lead_deliveries (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL, destination_type varchar(30) NOT NULL, status varchar(20) NOT NULL,
  scheduled_at timestamptz NOT NULL, last_error text, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE search_authority_sites (id uuid PRIMARY KEY, client_id uuid NOT NULL UNIQUE, canonical_hostname text NOT NULL, status text NOT NULL DEFAULT 'draft');
CREATE TABLE search_console_property_maps (id uuid PRIMARY KEY, client_id uuid NOT NULL, site_id uuid NOT NULL, status text NOT NULL DEFAULT 'active',
  data_through_date date, last_sync_status text, last_sync_completed_at timestamptz);
CREATE TABLE gsc_daily_property (client_id uuid NOT NULL, property_map_id uuid NOT NULL, metric_date date NOT NULL, search_type text NOT NULL DEFAULT 'web',
  clicks numeric(18,6) NOT NULL DEFAULT 0, impressions bigint NOT NULL DEFAULT 0, position numeric(12,6) NOT NULL DEFAULT 0, provisional boolean NOT NULL DEFAULT false,
  PRIMARY KEY (property_map_id, metric_date, search_type));
CREATE TABLE search_authority_opportunities (id uuid PRIMARY KEY, client_id uuid NOT NULL, opportunity_type text NOT NULL, title text NOT NULL, score int NOT NULL,
  lifecycle_status text NOT NULL DEFAULT 'new', page_url text, last_detected_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE search_authority_content_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, status text NOT NULL DEFAULT 'draft');
CREATE TABLE social_conversations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz, last_message_preview text, last_message_direction text, participant_name text, sla_breached boolean NOT NULL DEFAULT false,
  first_response_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE campaigns (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name text, subject text, status text NOT NULL DEFAULT 'draft', finished_at timestamptz,
  to_send int NOT NULL DEFAULT 0, sent int NOT NULL DEFAULT 0, delivered int NOT NULL DEFAULT 0, opened int NOT NULL DEFAULT 0, clicked int NOT NULL DEFAULT 0,
  bounced int NOT NULL DEFAULT 0, complained int NOT NULL DEFAULT 0, unsubscribed int NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE banner_projects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name varchar(255), status varchar(20) DEFAULT 'draft',
  review_status text NOT NULL DEFAULT 'draft', updated_at timestamptz DEFAULT now());
CREATE TABLE video_assets (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, r2_key text NOT NULL DEFAULT 'k', created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE brand_kits (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, name varchar(255));
CREATE TABLE projects (id uuid PRIMARY KEY, client_id uuid);
CREATE TABLE creative_proofs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid NOT NULL, status varchar(30) DEFAULT 'draft', due_date date);
CREATE TABLE tasks (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), project_id uuid, parent_task_id uuid, assignee_id uuid, due_date date,
  is_blocked boolean DEFAULT false, status_is_final boolean NOT NULL DEFAULT false);
CREATE TABLE briefs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid, status varchar(30) DEFAULT 'draft', requested_deadline date, assigned_to uuid);
`
const [A, B, C, X] = [1, 2, 3, 4].map(fixtureClientId) // X is inactive
const SEED = `
INSERT INTO agency_clients VALUES ('${A}', 'Alpha', true), ('${B}', 'Bravo', true), ('${C}', 'Charlie', true), ('${X}', 'Inactive', false);
INSERT INTO team_members VALUES ('00000000-0000-4000-9000-000000000001', 'Pat');
INSERT INTO social_connections VALUES ('00000000-0000-4000-a000-000000000001', '${A}', 'meta', 'active', '{"currency":"AUD"}'),
  ('00000000-0000-4000-a000-000000000002', '${B}', 'google', 'expired', '{"currency":"NZD"}'), ('00000000-0000-4000-a000-000000000004', '${X}', 'meta', 'active', '{"currency":"AUD"}');
INSERT INTO media_spend VALUES
  ('00000000-0000-4000-b000-000000000001', '${A}', 'meta', 1000, 1200, 15, '2026-10', '2026-10-15T00:00:00Z', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-b000-000000000002', '${A}', 'meta', 500, 100, 15, '2026-10', '2026-10-15T00:00:00Z', '00000000-0000-4000-a000-000000000001'),
  ('00000000-0000-4000-b000-000000000003', '${B}', 'google_ads', 800, 200, 15, '2026-10', '2026-10-10T00:00:00Z', '00000000-0000-4000-a000-000000000002'),
  ('00000000-0000-4000-b000-000000000004', '${X}', 'meta', 9999, 9999, 15, '2026-10', '2026-10-15T00:00:00Z', '00000000-0000-4000-a000-000000000004');
INSERT INTO daily_spend (media_spend_id, spend_date) VALUES ('00000000-0000-4000-b000-000000000001', '2026-10-14'), ('00000000-0000-4000-b000-000000000002', '2026-10-13');
INSERT INTO lead_form_rules VALUES ('00000000-0000-4000-c000-000000000001', '${A}', true);
INSERT INTO lead_rule_destinations (rule_id, destination_type, config) VALUES ('00000000-0000-4000-c000-000000000001', 'webhook', '{"url":"https://secret.example"}');
INSERT INTO leads VALUES
  ('00000000-0000-4000-d000-000000000001', '${A}', 'meta', 'qualified', '2026-10-10T00:00:00Z', NULL, NULL, false, '{"email":"a@b.c"}', 'call back'),
  ('00000000-0000-4000-d000-000000000002', '${A}', 'meta', 'new', '2026-10-12T00:00:00Z', NULL, NULL, false, '{}', NULL),
  ('00000000-0000-4000-d000-000000000003', '${A}', 'google', 'spam_suspected', '2026-10-12T00:00:00Z', NULL, NULL, false, '{}', NULL),
  ('00000000-0000-4000-d000-000000000004', '${A}', 'google', 'won', '2026-10-12T00:00:00Z', NULL, NULL, true, '{}', NULL),
  ('00000000-0000-4000-d000-000000000005', '${A}', 'google', 'won', '2026-10-12T00:00:00Z', NULL, '2026-10-13T00:00:00Z', false, '{}', NULL),
  ('00000000-0000-4000-d000-000000000006', '${X}', 'meta', 'new', '2026-10-12T00:00:00Z', NULL, NULL, false, '{}', NULL);
INSERT INTO lead_deliveries (lead_id, destination_type, status, scheduled_at, last_error, created_at) VALUES
  ('00000000-0000-4000-d000-000000000001', 'webhook', 'failed', '2026-10-10T00:00:00Z', 'leaked body', '2026-10-10T00:00:00Z'),
  ('00000000-0000-4000-d000-000000000002', 'webhook', 'delivered', '2026-10-12T00:00:00Z', NULL, '2026-10-12T00:00:00Z');
INSERT INTO search_authority_sites VALUES ('00000000-0000-4000-e000-000000000001', '${A}', 'alpha.example', 'active');
INSERT INTO search_console_property_maps VALUES ('00000000-0000-4000-e100-000000000001', '${A}', '00000000-0000-4000-e000-000000000001', 'active', '2026-10-12', 'succeeded', '2026-10-14T20:00:00Z');
INSERT INTO gsc_daily_property VALUES ('${A}', '00000000-0000-4000-e100-000000000001', '2026-10-10', 'web', 30, 600, 5, false),
  ('${A}', '00000000-0000-4000-e100-000000000001', '2026-10-11', 'web', 20, 400, 10, true);
INSERT INTO search_authority_opportunities VALUES ('00000000-0000-4000-e200-000000000001', '${A}', 'low_ctr', 'Improve title', 88, 'new', 'https://alpha.example/a', '2026-10-14T00:00:00Z'),
  ('00000000-0000-4000-e200-000000000002', '${A}', 'growth', 'Closed one', 99, 'closed', NULL, '2026-10-14T00:00:00Z');
INSERT INTO search_authority_content_assets (client_id, status) VALUES ('${A}', 'draft'), ('${A}', 'draft'), ('${A}', 'published');
INSERT INTO social_conversations (client_id, status, last_message_at, last_message_preview, last_message_direction, participant_name, sla_breached, first_response_at, created_at) VALUES
  ('${A}', 'open', '2026-10-14T00:00:00Z', 'private text', 'in', 'Jane', true, '2026-10-14T01:00:00Z', '2026-10-14T00:00:00Z'),
  ('${A}', 'closed', '2026-10-13T00:00:00Z', 'x', 'out', 'Joe', false, '2026-10-13T00:30:00Z', '2026-10-13T00:00:00Z');
INSERT INTO campaigns (client_id, name, subject, status, finished_at, sent, delivered, opened, clicked, bounced, complained, unsubscribed) VALUES
  ('${A}', 'Oct', 'Hello', 'sent', '2026-10-05T00:00:00Z', 1000, 950, 300, 40, 50, 1, 5), ('${A}', 'Draft', NULL, 'draft', NULL, 0, 0, 0, 0, 0, 0, 0);
INSERT INTO banner_projects (client_id, status, review_status) VALUES ('${A}', 'draft', 'in_review'), ('${A}', 'published', 'approved'), ('${X}', 'draft', 'draft');
INSERT INTO video_assets (client_id) VALUES ('${A}');
INSERT INTO brand_kits (client_id) VALUES ('${A}');
INSERT INTO projects VALUES ('00000000-0000-4000-f000-000000000001', '${A}'), ('00000000-0000-4000-f000-000000000004', '${X}');
INSERT INTO creative_proofs (project_id, status, due_date) VALUES ('00000000-0000-4000-f000-000000000001', 'client_review', '2026-10-01'), ('00000000-0000-4000-f000-000000000001', 'approved', '2026-10-01');
INSERT INTO tasks (project_id, assignee_id, due_date, is_blocked, status_is_final) VALUES
  ('00000000-0000-4000-f000-000000000001', '00000000-0000-4000-9000-000000000001', '2026-10-01', false, false),
  ('00000000-0000-4000-f000-000000000001', NULL, '2026-10-17', true, false),
  ('00000000-0000-4000-f000-000000000001', NULL, '2026-10-01', false, true),
  ('00000000-0000-4000-f000-000000000004', NULL, '2026-10-01', false, false);
INSERT INTO briefs (client_id, status, requested_deadline) VALUES ('${A}', 'submitted', '2026-10-01'), ('${A}', 'completed', '2026-10-01');
`

describe.skipIf(!local)('department reads against real Postgres', () => {
  let reads: typeof import('../../server/utils/ai/marketing/departmentReads')
  const deps = { authorize: async (c: any) => c, now: () => DEPARTMENT_NOW }
  const ctx = departmentReadContext()
  beforeAll(async () => {
    client.current = new pg.Client({ connectionString: url })
    await client.current.connect()
    await client.current.query(SCHEMA)
    await client.current.query(SEED)
    reads = await import('../../server/utils/ai/marketing/departmentReads')
  })
  afterAll(async () => {
    // Optional artifact for read-only EXPLAIN qualification: one entry per distinct labelled query.
    const capture = process.env.DEPARTMENT_READ_SQL_CAPTURE
    if (capture) {
      const { writeFileSync } = await import('node:fs')
      const distinct = [...new Map(client.captured.map(c => [c.label, c])).values()]
      const explained = []
      for (const entry of distinct) {
        const plan = await client.current!.query(`EXPLAIN ${entry.sql}`, entry.params as any[])
        explained.push({ ...entry, localExplainLines: plan.rows.length })
      }
      writeFileSync(capture, JSON.stringify({ capturedAt: new Date().toISOString(), schema: 'dept_read_test (local scratch)', queries: explained }, null, 2))
    }
    await client.current?.query('DROP SCHEMA IF EXISTS dept_read_test CASCADE')
    await client.current?.end()
  })

  it('inventory excludes inactive clients and counts coverage over the full scope', async () => {
    const data: any = await reads.readDepartmentClientInventory(ctx, { limit: 2 }, deps)
    expect(data.coverage).toMatchObject({ totalActiveClients: 3, withCurrentSpend: 2, withActiveAdConnection: 1, withLeadRouting: 1, withActiveSearchSite: 1 })
    expect(data.clients.map((c: any) => c.name)).toEqual(['Alpha', 'Bravo'])
    const next: any = await reads.readDepartmentClientInventory(ctx, { limit: 2, cursor: data.page.nextCursor }, deps)
    expect(next.clients.map((c: any) => c.name)).toEqual(['Charlie'])
    expect(next.page.hasMore).toBe(false)
    expect(data.clients[1].paidMedia.status).toBe('stale')
  })
  it('budget health aggregates real lines per currency', async () => {
    const data: any = await reads.readDepartmentBudgetHealth(ctx, {}, deps)
    const alpha = data.clients.find((c: any) => c.name === 'Alpha')
    expect(alpha.lines[0]).toMatchObject({ platform: 'meta', currency: 'AUD', budget: 1500, spend: 1300, lineCount: 2, spendAsOf: '2026-10-14', status: 'projected_over' })
    expect(data.clients.find((c: any) => c.name === 'Bravo').lines[0].status).toBe('stale_data')
    expect(data.totalsByCurrency).toEqual([{ currency: 'AUD', budget: 1500, spend: 1300, clientCount: 1 }, { currency: 'NZD', budget: 800, spend: 200, clientCount: 1 }])
  })
  it('lead quality excludes test, deleted and inactive-client rows and leaks no payloads', async () => {
    const data: any = await reads.readDepartmentLeadQuality(ctx, { clientId: A }, deps)
    expect(data.clients[0].leads).toMatchObject({ total: 3, qualified: 1, qualifiedRate: 0.5, byStatus: { new: 1, spam_suspected: 1, won: 0 }, bySource: { meta: 2, google: 1 }, uncontactedOver24h: 1 })
    expect(data.clients[0].routing).toMatchObject({ status: 'failing', deliveries: { failed: 1, delivered: 1 }, failedByDestination: { webhook: 1 } })
    expect(JSON.stringify(data)).not.toMatch(/a@b\.c|call back|leaked body|secret\.example/)
  })
  it('seo, inbox/email, creative, work and brief execute and aggregate', async () => {
    const seo: any = await reads.readDepartmentSeoOverview(ctx, { clientId: A }, deps)
    expect(seo.clients[0]).toMatchObject({ status: 'reporting', performance: { clicks: 50, impressions: 1000, ctr: 0.05, weightedPosition: 7, provisionalDays: 1 }, opportunities: { open: 1 }, content: { byStatus: { draft: 2, published: 1 } } })
    const inbox: any = await reads.readDepartmentInboxEmailStats(ctx, { clientId: A }, deps)
    expect(inbox.clients[0].socialInbox).toMatchObject({ open: 1, openSlaBreached: 1, awaitingReply: 1, avgFirstResponseMinutes: 45 })
    expect(inbox.clients[0].email).toMatchObject({ sentCampaigns: 1, drafts: 1, rates: { delivery: 0.95 } })
    expect(JSON.stringify(inbox)).not.toMatch(/private text|Jane|Hello/)
    const creative: any = await reads.readDepartmentCreativeInventory(ctx, { clientId: A }, deps)
    expect(creative.clients[0]).toMatchObject({ banners: { total: 2, inReview: 1 }, video: { assets: 1 }, brandKits: 1, proofs: { open: 1, overdue: 1 } })
    const work: any = await reads.readDepartmentWorkCoverage(ctx, {}, deps)
    expect(work.clients.find((c: any) => c.name === 'Alpha')).toMatchObject({ tasks: { open: 2, overdue: 1, blocked: 1, unassigned: 1, dueSoon: 1 }, briefs: { open: 1, awaitingReview: 1, pastDeadline: 1 } })
    expect(work.workload.assignees).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'Pat', openTasks: 1 }), expect.objectContaining({ name: 'Unassigned', openTasks: 1 })]))
    const brief: any = await reads.readDepartmentDailyBrief(ctx, {}, deps)
    expect(brief.coverage).toMatchObject({ totalActiveClients: 3, evaluatedClients: 3, complete: true })
    expect(brief.exceptions.map((e: any) => `${e.clientName}:${e.signal}`)).toEqual(expect.arrayContaining(['Alpha:over_budget', 'Alpha:lead_deliveries_failed', 'Alpha:social_sla_breached', 'Bravo:ad_connection_inactive', 'Bravo:paid_media_stale']))
    expect(brief.exceptions.some((e: any) => e.clientName === 'Inactive')).toBe(false)
  })
})
