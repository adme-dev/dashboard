/* eslint-disable @typescript-eslint/no-explicit-any -- Partial Nitro and PostgreSQL fixture shapes. */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ids = {
  client: '11111111-1111-4111-8111-111111111111',
  lead: '22222222-2222-4222-8222-222222222222',
  proposer: '33333333-3333-4333-8333-333333333333',
  reviewer: '44444444-4444-4444-8444-444444444444',
  assignee: '55555555-5555-4555-8555-555555555555',
  rule: '66666666-6666-4666-8666-666666666666',
  slack: '77777777-7777-4777-8777-777777777777',
  portal: '88888888-8888-4888-8888-888888888888'
}
const h = vi.hoisted(() => ({
  client: null as null | pg.Client,
  revoked: [] as string[]
}))
function actor(userId: string): ToolContext {
  return {
    userId,
    userRole: 'member',
    source: 'mcp',
    event: { context: {} } as never,
    mcpScopes: new Set(['mcp:read', 'mcp:write']),
    mcpStaffAuthority: 'fresh',
    permissionGroups: h.revoked.includes(userId) ? [] : ['MARKETING_MANAGEMENT'],
    marketingCapabilities: h.revoked.includes(userId) ? [] : ['department_management'],
    assistantReadOnly: false,
    assistantScope: { clientAccessMode: 'all_active', assignedClientIds: [], departmentIds: [], catalogReleaseIds: [] }
  }
}
vi.mock('~~/server/utils/ai/marketing/departmentAuthority', () => ({
  requireMarketingDepartment: vi.fn(async (ctx: ToolContext, write = false) => {
    if (h.revoked.includes(ctx.userId) || (write && !ctx.mcpScopes.has('mcp:write'))) {
      throw Object.assign(new Error('revoked'), { statusCode: 403 })
    }
    return ctx
  })
}))
vi.mock('~~/server/utils/ai/marketing/readScope', () => ({
  resolveMarketingReadScope: async (ctx: ToolContext) => ctx,
  requireScopedClient: vi.fn(async (_scope: unknown, clientId: string) => {
    const result = await h.client!.query('SELECT id FROM agency_clients WHERE id=$1 AND is_active=TRUE', [clientId])
    if (!result.rows[0]) throw Object.assign(new Error('not found'), { statusCode: 404 })
  })
}))
vi.mock('~~/server/utils/ai/mcp/staffAuthority', () => ({
  resolveMcpStaffContext: vi.fn(async (_event: unknown, userId: string) => actor(userId))
}))
vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params as any[])).rows
  const tx = async (callback: (db: unknown) => Promise<unknown>) => {
    await h.client!.query('BEGIN')
    try {
      const result = await callback(h.client)
      await h.client!.query('COMMIT')
      return result
    } catch (error) {
      await h.client!.query('ROLLBACK')
      throw error
    }
  }
  return {
    queryRows: rows,
    queryRowsFresh: rows,
    queryOne: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null,
    queryOneFresh: async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null,
    transaction: tx,
    transactionWithoutRetry: tx,
    execute: async (sql: string, params?: unknown[]) => (await h.client!.query(sql, params as any[])).rowCount ?? 0
  }
})

const { runDepartmentLeadOperation } = await import('~~/server/utils/ai/marketing/departmentLeadOperations')
const url = process.env.DEPARTMENT_LEAD_PG_URL
if (url) {
  const parsed = new URL(url)
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname) || parsed.searchParams.has('host'))
    throw new Error('DEPARTMENT_LEAD_PG_URL must identify a disposable local PostgreSQL database')
}
const schema = `dept_lead_${process.pid}_${Date.now()}`
const digest = 'f'.repeat(64)
let keyCounter = 0
const key = () => `mcp:${(++keyCounter).toString(16).padStart(64, '0')}`
const run = (name: string, args: unknown, as = ids.proposer, requestKey = key()) =>
  runDepartmentLeadOperation(name, args, actor(as), requestKey, digest)
const count = async (sql: string, params: unknown[] = []) => Number((await h.client!.query(sql, params)).rows[0].n)
const routingInput = () => ({
  clientId: ids.client,
  ruleId: ids.rule,
  source: 'meta',
  formId: 'form-1',
  formName: 'Reviewed name',
  enabled: true,
  destinations: [{
    destinationId: ids.slack,
    destinationType: 'slack',
    config: { webhook_url: 'https://hooks.slack.com/services/reviewed-test-only' },
    filter: { field: 'field_data.budget', op: 'gt', value: 5000 },
    delayMinutes: 0,
    enabled: true,
    sortOrder: 0
  }]
})
async function propose() {
  const result = await run('marketing_propose_lead_routing_change', routingInput())
  expect(result).toMatchObject({ ok: true })
  return (result as any).data
}
async function approve(proposal: any) {
  const result = await run('marketing_review_lead_routing_change', {
    clientId: ids.client,
    proposalId: proposal.proposalId,
    expectedRevision: proposal.revision,
    decision: 'approved'
  }, ids.reviewer)
  expect(result).toMatchObject({ ok: true })
}
async function seed() {
  await h.client!.query(`INSERT INTO agency_clients (id,name,is_active) VALUES ($1,'Disposable client',TRUE)`, [ids.client])
  await h.client!.query(`INSERT INTO team_members (id,name,is_active) VALUES
    ($1,'Proposer',TRUE),($2,'Reviewer',TRUE),($3,'Assignee',TRUE)`, [ids.proposer, ids.reviewer, ids.assignee])
  await h.client!.query(`INSERT INTO leads
    (id,client_id,source,source_lead_id,form_id,form_name,campaign_id,campaign_name,status,assigned_to,submitted_at,field_data,notes)
    VALUES ($1,$2,'meta','disposable-lead','form-1','Original form','campaign-1','Campaign','new',NULL,NOW(),'{}','not projected')`, [ids.lead, ids.client])
  await h.client!.query(`INSERT INTO lead_form_rules (id,client_id,source,form_id,form_name,enabled,created_by)
    VALUES ($1,$2,'meta','form-1','Original form',TRUE,$3)`, [ids.rule, ids.client, ids.proposer])
  await h.client!.query(`INSERT INTO lead_rule_destinations
    (id,rule_id,destination_type,config,filter,delay_minutes,enabled,sort_order) VALUES
    ($1,$2,'slack','{"webhook_url":"https://hooks.slack.com/services/original-test-only"}',NULL,0,TRUE,0),
    ($3,$2,'portal','{}',NULL,0,TRUE,1)`, [ids.slack, ids.rule, ids.portal])
}

describe.skipIf(!url)('disposable PostgreSQL lead assignment and reviewed routing', () => {
  beforeAll(async () => {
    h.client = new pg.Client({ connectionString: url })
    await h.client.connect()
    await h.client.query(`CREATE SCHEMA ${schema}`)
    await h.client.query(`SET search_path TO ${schema}`)
    await h.client.query(`
      CREATE TABLE agency_clients (id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE team_members (id uuid PRIMARY KEY, name text NOT NULL, is_active boolean NOT NULL DEFAULT TRUE);
      CREATE TABLE leads (
        id uuid PRIMARY KEY, client_id uuid REFERENCES agency_clients(id), source text NOT NULL, source_lead_id text NOT NULL,
        form_id text, form_name text, campaign_id text, campaign_name text, status text NOT NULL DEFAULT 'new',
        assigned_to uuid REFERENCES team_members(id), contacted_at timestamptz, contacted_by uuid REFERENCES team_members(id),
        submitted_at timestamptz NOT NULL, deleted_at timestamptz, is_test boolean NOT NULL DEFAULT FALSE,
        field_data jsonb NOT NULL DEFAULT '{}', notes text
      );
      CREATE TABLE lead_form_rules (
        id uuid PRIMARY KEY, client_id uuid NOT NULL REFERENCES agency_clients(id), source text NOT NULL,
        form_id text NOT NULL, form_name text, enabled boolean NOT NULL DEFAULT TRUE,
        created_by uuid REFERENCES team_members(id), created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
        UNIQUE(source,form_id)
      );
      CREATE TABLE lead_rule_destinations (
        id uuid PRIMARY KEY, rule_id uuid NOT NULL REFERENCES lead_form_rules(id) ON DELETE CASCADE,
        destination_type text NOT NULL, config jsonb NOT NULL, filter jsonb,
        delay_minutes integer NOT NULL DEFAULT 0, enabled boolean NOT NULL DEFAULT TRUE, sort_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE lead_deliveries (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        rule_destination_id uuid REFERENCES lead_rule_destinations(id) ON DELETE SET NULL,
        destination_type text NOT NULL, status text NOT NULL DEFAULT 'pending', scheduled_at timestamptz NOT NULL DEFAULT NOW(),
        claimed_at timestamptz, attempted_at timestamptz, retry_count integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE lead_email_endpoints (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id uuid NOT NULL, form_id text NOT NULL, retired_at timestamptz);
      CREATE TABLE ai_pending_actions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, tool_name text NOT NULL,
        resolved_payload jsonb NOT NULL, status text NOT NULL DEFAULT 'proposed', source text NOT NULL,
        conversation_id uuid, expires_at timestamptz NOT NULL DEFAULT NOW()+INTERVAL '30 minutes',
        confirmed_by uuid, executed_at timestamptz, result_payload jsonb, result_ref text,
        created_at timestamptz NOT NULL DEFAULT NOW()
      );
      CREATE TABLE god_mode_execution_ledger (
        actor_user_id uuid NOT NULL, channel text NOT NULL, idempotency_key text NOT NULL,
        state text NOT NULL, correlation_id uuid NOT NULL, route_or_tool text NOT NULL,
        executor_class text NOT NULL, session_digest text NOT NULL, execution_phase text NOT NULL DEFAULT 'claimed',
        client_id uuid, result_reference text, result_digest text, execution_metadata jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(), updated_at timestamptz NOT NULL DEFAULT NOW(),
        PRIMARY KEY(actor_user_id,channel,idempotency_key), UNIQUE(correlation_id)
      );
    `)
  })
  beforeEach(async () => {
    h.revoked = []
    await h.client!.query(`TRUNCATE god_mode_execution_ledger,ai_pending_actions,lead_deliveries,
      lead_rule_destinations,lead_form_rules,leads,team_members,agency_clients CASCADE`)
    await seed()
  })
  afterEach(async () => {
    await h.client!.query('DROP TRIGGER IF EXISTS fail_destination_write ON lead_rule_destinations')
  })
  afterAll(async () => {
    await h.client!.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await h.client!.end()
  })

  it('commits assignment atomically, rejects stale revision, and replays without another execution', async () => {
    const detail = await run('marketing_get_lead_followup', { clientId: ids.client, leadId: ids.lead })
    expect(detail).toMatchObject({ ok: true })
    const revision = (detail as any).data.revision
    const args = { clientId: ids.client, leadId: ids.lead, assigneeId: ids.assignee, expectedRevision: revision }
    const requestKey = key()
    expect(await run('marketing_assign_lead_followup', args, ids.proposer, requestKey)).toMatchObject({
      ok: true,
      data: { leadId: ids.lead, assigneeId: ids.assignee, committed: true }
    })
    expect((await h.client!.query('SELECT assigned_to FROM leads WHERE id=$1', [ids.lead])).rows[0].assigned_to).toBe(ids.assignee)
    expect(await run('marketing_assign_lead_followup', { ...args, assigneeId: null }, ids.proposer, key())).toMatchObject({
      ok: false,
      code: 'conflict'
    })
    expect((await h.client!.query('SELECT assigned_to FROM leads WHERE id=$1', [ids.lead])).rows[0].assigned_to).toBe(ids.assignee)
    expect(await run('marketing_assign_lead_followup', args, ids.proposer, requestKey)).toMatchObject({
      ok: true,
      data: { assigneeId: ids.assignee, replayed: true }
    })
    expect(await count('SELECT COUNT(*)::int AS n FROM god_mode_execution_ledger')).toBe(1)
  })

  it('requires independent review, applies exact replacement and replays its receipt without lead delivery', async () => {
    const proposal = await propose()
    expect(await run('marketing_review_lead_routing_change', {
      clientId: ids.client,
      proposalId: proposal.proposalId,
      expectedRevision: proposal.revision,
      decision: 'approved'
    })).toMatchObject({ ok: false, code: 'not_found' })
    await approve(proposal)
    const args = { clientId: ids.client, proposalId: proposal.proposalId, expectedRevision: proposal.revision, ack: true }
    const requestKey = key()
    expect(await run('marketing_execute_lead_routing_change', args, ids.proposer, requestKey)).toMatchObject({
      ok: true,
      data: { committed: true, destinationsUpdated: 1, destinationsDeleted: 1, deliveriesCreated: 0, leadsReplayed: 0 }
    })
    const rule = (await h.client!.query('SELECT form_name FROM lead_form_rules WHERE id=$1', [ids.rule])).rows[0]
    expect(rule.form_name).toBe('Reviewed name')
    const destinations = (await h.client!.query('SELECT id,config FROM lead_rule_destinations WHERE rule_id=$1', [ids.rule])).rows
    expect(destinations).toHaveLength(1)
    expect(destinations[0].id).toBe(ids.slack)
    expect(destinations[0].config.webhook_url).toContain('reviewed-test-only')
    expect(await count('SELECT COUNT(*)::int AS n FROM lead_deliveries')).toBe(0)
    expect((await h.client!.query('SELECT status FROM ai_pending_actions WHERE id=$1', [proposal.proposalId])).rows[0].status).toBe('executed')
    expect(await run('marketing_execute_lead_routing_change', args, ids.proposer, requestKey)).toMatchObject({
      ok: true,
      data: { replayed: true, leadsReplayed: 0 }
    })
    expect(await count('SELECT COUNT(*)::int AS n FROM god_mode_execution_ledger')).toBe(1)
  })

  it('rejects post-approval drift, revoked reviewer, and inactive client before changing routing', async () => {
    const drift = await propose()
    await approve(drift)
    await h.client!.query('UPDATE lead_form_rules SET form_name=$1 WHERE id=$2', ['External drift', ids.rule])
    expect(await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: drift.proposalId,
      expectedRevision: drift.revision,
      ack: true
    })).toMatchObject({ ok: false, code: 'conflict' })
    expect((await h.client!.query('SELECT form_name FROM lead_form_rules WHERE id=$1', [ids.rule])).rows[0].form_name).toBe('External drift')

    await h.client!.query('TRUNCATE god_mode_execution_ledger,ai_pending_actions,lead_rule_destinations,lead_form_rules CASCADE')
    await h.client!.query(`INSERT INTO lead_form_rules (id,client_id,source,form_id,form_name,enabled,created_by)
      VALUES ($1,$2,'meta','form-1','Original form',TRUE,$3)`, [ids.rule, ids.client, ids.proposer])
    await h.client!.query(`INSERT INTO lead_rule_destinations
      (id,rule_id,destination_type,config,filter,delay_minutes,enabled,sort_order) VALUES
      ($1,$2,'slack','{"webhook_url":"https://hooks.slack.com/services/original-test-only"}',NULL,0,TRUE,0),
      ($3,$2,'portal','{}',NULL,0,TRUE,1)`, [ids.slack, ids.rule, ids.portal])
    const revoked = await propose()
    await approve(revoked)
    h.revoked = [ids.reviewer]
    expect(await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: revoked.proposalId,
      expectedRevision: revoked.revision,
      ack: true
    })).toMatchObject({ ok: false, code: 'forbidden' })
    expect((await h.client!.query('SELECT status FROM ai_pending_actions WHERE id=$1', [revoked.proposalId])).rows[0].status).toBe('approved')

    h.revoked = []
    await h.client!.query('UPDATE agency_clients SET is_active=FALSE WHERE id=$1', [ids.client])
    expect(await run('marketing_execute_lead_routing_change', {
      clientId: ids.client,
      proposalId: revoked.proposalId,
      expectedRevision: revoked.revision,
      ack: true
    })).toMatchObject({ ok: false, code: 'not_found' })
    expect(await count('SELECT COUNT(*)::int AS n FROM god_mode_execution_ledger')).toBe(0)
  })

  it('rolls back the rule, proposal and ledger on destination write failure, then commits once the definitive failure is fixed', async () => {
    const proposal = await propose()
    await approve(proposal)
    await h.client!.query(`CREATE FUNCTION fail_destination_write() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'definitive destination write failure'; END;
    $$`)
    await h.client!.query(`CREATE TRIGGER fail_destination_write BEFORE UPDATE ON lead_rule_destinations
      FOR EACH ROW EXECUTE FUNCTION fail_destination_write()`)
    const args = { clientId: ids.client, proposalId: proposal.proposalId, expectedRevision: proposal.revision, ack: true }
    const requestKey = key()
    expect(await run('marketing_execute_lead_routing_change', args, ids.proposer, requestKey)).toMatchObject({ ok: false })
    expect((await h.client!.query('SELECT form_name FROM lead_form_rules WHERE id=$1', [ids.rule])).rows[0].form_name).toBe('Original form')
    expect((await h.client!.query('SELECT config FROM lead_rule_destinations WHERE id=$1', [ids.slack])).rows[0].config.webhook_url).toContain('original-test-only')
    expect((await h.client!.query('SELECT status FROM ai_pending_actions WHERE id=$1', [proposal.proposalId])).rows[0].status).toBe('approved')
    expect(await count('SELECT COUNT(*)::int AS n FROM god_mode_execution_ledger')).toBe(0)

    await h.client!.query('DROP TRIGGER fail_destination_write ON lead_rule_destinations')
    expect(await run('marketing_execute_lead_routing_change', args, ids.proposer, requestKey)).toMatchObject({
      ok: true,
      data: { committed: true }
    })
    expect((await h.client!.query('SELECT form_name FROM lead_form_rules WHERE id=$1', [ids.rule])).rows[0].form_name).toBe('Reviewed name')
    expect(await count('SELECT COUNT(*)::int AS n FROM god_mode_execution_ledger')).toBe(1)
  })
})
