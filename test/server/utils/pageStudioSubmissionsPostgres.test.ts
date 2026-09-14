import { insertLeadWithDedup, type InsertLeadInput } from '~~/server/utils/leads/db'
import pg from 'pg'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { acceptPageStudioPublicLead, acceptPageStudioPublicAnalyticsEvent } from '~~/server/utils/pageStudio/publicBoundary'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPageStudioSubmissions } from '~~/server/utils/pageStudio/siteOperations'

const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
const intake = vi.hoisted(() => ({ accept: vi.fn(), mode: vi.fn(), assign: vi.fn(), metadata: vi.fn() }))
vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead: intake.accept, resolveLeadCaptureMode: intake.mode }))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: intake.assign }))
vi.mock('~~/server/utils/leads/db', async original => ({ ...await original<typeof import('~~/server/utils/leads/db')>(), upsertFormMetadata: intake.metadata }))
vi.mock('~~/server/utils/measurement/outbox', () => ({ appendCanonicalConversionEvent: vi.fn() }))
vi.mock('~~/server/utils/measurement/publisher', () => ({ conversionOutboxPublisher: { publishEvent: vi.fn() } }))
const databaseUrl = process.env.PAGE_STUDIO_GRANT_DATABASE_TEST_URL

describe.runIf(Boolean(databaseUrl))('Page Studio submissions on disposable PostgreSQL', () => {
  let client: pg.Client
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    // Temporary relations model the production lead schema, which has no page_name.
    await client.query(`CREATE TEMP TABLE leads (
      id uuid PRIMARY KEY, form_id text, form_name text, page_id text,
      field_data jsonb, attribution jsonb, submitted_at timestamptz,
      is_test boolean, deleted_at timestamptz
    ); CREATE TEMP TABLE page_studio_audit_events (
      tenant_id text, site_id text, resource_id text, resource_type text,
      action text, metadata jsonb, occurred_at timestamptz
    ); INSERT INTO leads VALUES
      ('10000000-0000-4000-8000-000000000001','contact','Contact','home','{"email":"test@example.invalid"}','{}',NOW(),true,NULL),
      ('10000000-0000-4000-8000-000000000002','contact','Deleted','home','{}','{}',NOW(),true,NOW());
    INSERT INTO page_studio_audit_events VALUES
      ('tenant-a','site-a','10000000-0000-4000-8000-000000000001','lead','lead.created','{"pageRoute":"/old","releaseId":"release-old"}','2026-09-01'),
      ('tenant-a','site-a','10000000-0000-4000-8000-000000000001','lead','lead.duplicate','{"pageRoute":"/forms","releaseId":"release-current"}','2026-09-02'),
      ('tenant-a','site-b','10000000-0000-4000-8000-000000000001','lead','lead.created','{"pageRoute":"/other-site"}','2026-09-03'),
      ('tenant-b','site-a','10000000-0000-4000-8000-000000000001','lead','lead.created','{"pageRoute":"/other-tenant"}','2026-09-04'),
      ('tenant-a','site-a','10000000-0000-4000-8000-000000000002','lead','lead.created','{"pageRoute":"/deleted"}','2026-09-05')`)
    db.queryOne.mockResolvedValue({ tenant_id: 'tenant-a', client_id: 'client-a', entitlement_id: 'access-a', custom_domain_limit: 1 })
    db.queryRows.mockImplementation(async (sql: string, params: unknown[]) => (await client.query(sql, params)).rows)
  })
  afterAll(async () => {
    await client?.end()
  })

  it('loads the latest scoped submission route and release without an optional lead column', async () => {
    const rows = await listPageStudioSubmissions('tenant-a', 'site-a')
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      id: '10000000-0000-4000-8000-000000000001', pageRoute: '/forms',
      releaseId: 'release-current', isTest: true, fields: { email: 'test@example.invalid' }
    })
  })
})

describe.runIf(Boolean(databaseUrl))('public intake receipts and fresh authority on disposable PostgreSQL', () => {
  let client: pg.Client
  let pool: pg.Pool
  const schema = `public_intake_${randomUUID().replaceAll('-', '')}`
  const input = {
    attribution: { utm_source: 'fixture' }, fields: { field_name: 'Synthetic Visitor', vehicle_count: '2', requests: 'All dynamic values retained' },
    formId: 'quote', idempotencyKey: 'synthetic-public-request', occurredAt: '2026-09-14T00:00:00.000Z', pageId: 'quote', pageRoute: '/quote',
    releaseId: 'release', versionDigest: 'a'.repeat(64), scope: { tenantId: 'tenant', clientId: 'client', siteId: 'site' }
  }
  const event = (environment: unknown = 'production') => ({ context: { cloudflare: { env: { PAGE_STUDIO_RELEASE_ENVIRONMENT: environment } } } }) as H3Event
  const submit = (value = input, environment: unknown = 'production') => acceptPageStudioPublicLead(event(environment), value)
  const analytics = (environment: unknown = 'production') => acceptPageStudioPublicAnalyticsEvent(event(environment), { eventId: 'page_view', kind: 'page_view', occurredAt: input.occurredAt, pageId: input.pageId, pageRoute: input.pageRoute, releaseId: input.releaseId, scope: input.scope, versionDigest: input.versionDigest, idempotencyKey: 'analytics-request' })
  async function withLeadTransaction<T>(operation: (connection: pg.PoolClient) => Promise<T>) {
    const connection = await pool.connect()
    try {
      await connection.query('BEGIN')
      const result = await operation(connection)
      await connection.query('COMMIT')
      return result
    } catch (error) {
      await connection.query('ROLLBACK')
      throw error
    } finally { connection.release() }
  }
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(databaseUrl!).hostname)
    client = new pg.Client({ connectionString: databaseUrl })
    await client.connect()
    await client.query(`CREATE SCHEMA "${schema}"`)
    await client.query(`SET search_path TO "${schema}",public`)
    pool = new pg.Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema},public` })
    await client.query(`
      CREATE TABLE agency_clients (id text PRIMARY KEY, is_active boolean);
      CREATE TABLE page_studio_sites (tenant_id text, client_id text, id text, entitlement_id text, current_release_id text, status text, integrations jsonb);
      CREATE TABLE page_studio_entitlements (tenant_id text, client_id text, id text, status text, effective_from timestamptz, effective_until timestamptz);
      CREATE TABLE page_studio_releases (tenant_id text, client_id text, site_id text, id text, build_id text, environment text);
      CREATE TABLE page_studio_builds (tenant_id text, client_id text, site_id text, id text, version_digest text, state text);
      CREATE TABLE page_studio_release_pointers (tenant_id text, client_id text, site_id text, environment text, active_release_id text);
      CREATE TABLE page_studio_analytics_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id text, client_id text, site_id text, release_id text, version_digest text, event_id text, kind text, page_id text, page_route text, occurred_at timestamptz, idempotency_key text UNIQUE, delivery_status text, canonical_event_id text, updated_at timestamptz);
      CREATE TABLE leads (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), client_id text, source text, source_lead_id text, form_id text, form_name text, ad_id text, ad_name text, campaign_id text, campaign_name text, page_id text, field_data jsonb, attribution jsonb, submitted_at timestamptz, deleted_at timestamptz, assigned_to text, created_by text, is_test boolean, test_run_id text);
      CREATE UNIQUE INDEX lead_source_identity ON leads (source, source_lead_id) WHERE deleted_at IS NULL;
      CREATE TABLE page_studio_audit_events (tenant_id text, client_id text, site_id text, actor_id text, actor_role text, action text, resource_type text, resource_id text, idempotency_key text, metadata jsonb, occurred_at timestamptz);
      CREATE UNIQUE INDEX audit_scope_identity ON page_studio_audit_events (tenant_id, client_id, site_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    `)
    await client.query(readFileSync('server/database/migrations/417_page_studio_lead_receipt_indexes.sql', 'utf8'))
  })
  beforeEach(async () => {
    await client.query(`TRUNCATE page_studio_analytics_events, agency_clients, page_studio_sites, page_studio_entitlements, page_studio_releases, page_studio_builds, page_studio_release_pointers, leads, page_studio_audit_events;
      INSERT INTO agency_clients VALUES ('client',true);
      INSERT INTO page_studio_sites VALUES ('tenant','client','site','access','release','active','{"synthetic":true}');
      INSERT INTO page_studio_entitlements VALUES ('tenant','client','access','active',NOW()-INTERVAL '1 day',NULL);
      INSERT INTO page_studio_releases VALUES ('tenant','client','site','release','build','production');
      INSERT INTO page_studio_builds VALUES ('tenant','client','site','build',repeat('a',64),'succeeded');
      INSERT INTO page_studio_release_pointers VALUES ('tenant','client','site','production','release');`)
    db.queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows[0] ?? null)
    db.execute.mockImplementation(async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rowCount)
    db.transaction.mockImplementation(withLeadTransaction)
    intake.accept.mockReset()
    intake.accept.mockImplementation(async (_event: unknown, { lead }: { lead: InsertLeadInput & { client_id: string } }) => {
      const leadId = await withLeadTransaction(connection => insertLeadWithDedup(lead, connection))
      return leadId ? { status: 'created', leadId } : { status: 'duplicate' }
    })
  })
  afterAll(async () => {
    await pool?.end()
    if (client) {
      await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      await client.end()
    }
  })
  it.each(['staging', 'production'])('accepts lead and analytics only for the configured %s release', async (environment) => {
    await client.query('UPDATE page_studio_releases SET environment=$1', [environment])
    await client.query('UPDATE page_studio_release_pointers SET environment=$1', [environment])
    const other = environment === 'staging' ? 'production' : 'staging'
    await expect(submit(input, other)).rejects.toMatchObject({ statusCode: 403 })
    await expect(analytics(other)).rejects.toMatchObject({ statusCode: 403 })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
    await expect(submit(input, environment)).resolves.toMatchObject({ duplicate: false })
    await expect(analytics(environment)).resolves.toEqual({ accepted: true })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_analytics_events')).rows[0].count).toBe(1)
    await client.query('DELETE FROM page_studio_release_pointers')
    await expect(submit(input, environment)).rejects.toMatchObject({ statusCode: 403 })
    await expect(analytics(environment)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([null, '', 'preview', 'invalid'])('rejects missing or invalid trusted configuration %s before intake', async (environment) => {
    await expect(submit(input, environment)).rejects.toMatchObject({ statusCode: 503 })
    await expect(analytics(environment)).rejects.toMatchObject({ statusCode: 503 })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events')).rows[0].count).toBe(0)
  })
  it.each(['staging', 'production'])('requires the release and pointer environments both match %s', async (environment) => {
    const other = environment === 'staging' ? 'production' : 'staging'
    await client.query('UPDATE page_studio_releases SET environment=$1', [environment])
    await client.query('UPDATE page_studio_release_pointers SET environment=$1', [other])
    await expect(submit(input, environment)).rejects.toMatchObject({ statusCode: 403 })
    await expect(analytics(environment)).rejects.toMatchObject({ statusCode: 403 })
    await client.query('UPDATE page_studio_releases SET environment=$1', [other])
    await client.query('UPDATE page_studio_release_pointers SET environment=$1', [environment])
    await expect(submit(input, environment)).rejects.toMatchObject({ statusCode: 403 })
    await expect(analytics(environment)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['staging', 'production'])('rechecks %s analytics authority inside its transaction after pointer revocation', async (environment) => {
    await client.query('UPDATE page_studio_releases SET environment=$1', [environment])
    await client.query('UPDATE page_studio_release_pointers SET environment=$1', [environment])
    db.transaction.mockImplementationOnce(async (operation) => {
      await client.query('DELETE FROM page_studio_release_pointers')
      return withLeadTransaction(operation)
    })
    await expect(analytics(environment)).rejects.toMatchObject({ statusCode: 403 })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_analytics_events')).rows[0].count).toBe(0)
  })
  it.each(['staging', 'production'])('rechecks %s lead authority after reservation before insertion', async (environment) => {
    await client.query('UPDATE page_studio_releases SET environment=$1', [environment])
    await client.query('UPDATE page_studio_release_pointers SET environment=$1', [environment])
    const execute = db.execute.getMockImplementation()!
    db.execute.mockImplementationOnce(async (sql, params) => {
      const result = await execute(sql, params)
      await client.query('DELETE FROM page_studio_release_pointers')
      return result
    })
    await expect(submit(input, environment)).rejects.toMatchObject({ statusCode: 403 })
    expect(intake.accept).not.toHaveBeenCalled()
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
  })
  it('cannot redirect a staging request to production authority using a forged payload environment', async () => {
    const forged = { ...input, environment: 'production' }
    await expect(submit(forged, 'staging')).rejects.toMatchObject({ statusCode: 403 })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
  })
  it('uses actual scoped receipt and lead uniqueness across concurrent requests', async () => {
    const results = await Promise.allSettled([submit(), submit(), submit({ ...input, fields: { ...input.fields, vehicle_count: '3' } })])
    const rows = (await client.query('SELECT * FROM leads')).rows
    expect(rows).toHaveLength(1)
    // Either distinct payload may win the actual database race. Only requests
    // matching that winner may acknowledge the one persisted lead.
    const winner = rows[0].field_data.vehicle_count
    expect(['2', '3']).toContain(winner)
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(winner === '2' ? 2 : 1)
    for (const result of results.filter(result => result.status === 'rejected')) {
      expect(result).toMatchObject({ reason: { statusCode: 409 } })
    }
    expect(rows[0].field_data).toMatchObject({ ...input.fields, vehicle_count: winner })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'lead.submission_reserved\'')).rows[0].count).toBe(1)
  })
  it.each(['soft', 'hard'] as const)('does not recreate a lead after %s deletion while a matching request waits to insert', async (deletion) => {
    const reachedInsertion = Promise.withResolvers<undefined>()
    const resumeInsertion = Promise.withResolvers<undefined>()
    const accept = intake.accept.getMockImplementation()!
    intake.accept.mockImplementationOnce(async (...args: Parameters<typeof accept>) => {
      reachedInsertion.resolve(undefined)
      await resumeInsertion.promise
      return accept(...args)
    })
    // Retain the result immediately so the intentionally rejected retry cannot
    // become an unhandled rejection while the other request commits.
    const delayed = submit().then(value => ({ value }), error => ({ error }))
    try {
      await reachedInsertion.promise
      const winner = await submit()
      await client.query(deletion === 'soft' ? 'UPDATE leads SET deleted_at=NOW() WHERE id=$1' : 'DELETE FROM leads WHERE id=$1', [winner.leadId])
      resumeInsertion.resolve(undefined)
      expect(await delayed).toMatchObject({ error: { statusCode: 409 } })
      const rows = (await client.query('SELECT id,deleted_at FROM leads')).rows
      expect(rows).toHaveLength(deletion === 'soft' ? 1 : 0)
      if (deletion === 'soft') {
        expect(rows[0]).toMatchObject({ id: winner.leadId })
        expect(rows[0].deleted_at).not.toBeNull()
      }
      expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'lead.submission_reserved\'')).rows[0].count).toBe(1)
    } finally {
      resumeInsertion.resolve(undefined)
      await delayed
    }
  })
  it('protects direct Page Studio inserts that do not supply a transaction', async () => {
    const first = (await submit()).leadId
    const lead: InsertLeadInput = intake.accept.mock.calls[0][1].lead
    expect(await insertLeadWithDedup(lead)).toBeNull()
    await client.query('UPDATE leads SET deleted_at=NOW() WHERE id=$1', [first])
    expect(await insertLeadWithDedup(lead)).toBeNull()
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads WHERE source_lead_id=$1', [lead.source_lead_id])).rows[0].count).toBe(1)
  })
  it('preserves non-Studio ingestion policy after a soft deletion', async () => {
    await submit()
    const lead: InsertLeadInput = { ...intake.accept.mock.calls[0][1].lead, source: 'manual', source_lead_id: 'manual-request' }
    const insert = () => withLeadTransaction(connection => insertLeadWithDedup(lead, connection))
    const first = await insert()
    await client.query('UPDATE leads SET deleted_at=NOW() WHERE id=$1', [first])
    const second = await insert()
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads WHERE source=\'manual\'')).rows[0].count).toBe(2)
  })
  it('recovers a matching lead committed between initial lookup and legacy audit read', async () => {
    const reachedLookup = Promise.withResolvers<undefined>()
    const resumeLookup = Promise.withResolvers<undefined>()
    const query = db.queryOneFresh.getMockImplementation()!
    let paused = false
    db.queryOneFresh.mockImplementation(async (sql: string, params: unknown[]) => {
      const result = await query(sql, params)
      if (sql.includes('FROM leads') && !paused) {
        paused = true
        reachedLookup.resolve(undefined)
        await resumeLookup.promise
      }
      return result
    })
    const delayed = submit().then(value => ({ value }), error => ({ error }))
    try {
      await reachedLookup.promise
      const winner = await submit()
      resumeLookup.resolve(undefined)
      expect(await delayed).toEqual({ value: { duplicate: true, leadId: winner.leadId } })
    } finally {
      resumeLookup.resolve(undefined)
      await delayed
    }
  })
  it('retains accepted identity after a purge even without the later boundary audit acknowledgement', async () => {
    const accepted = await submit()
    await client.query('DELETE FROM page_studio_audit_events WHERE resource_type=\'lead\'')
    await client.query('DELETE FROM leads WHERE id=$1', [accepted.leadId])
    await expect(submit()).rejects.toMatchObject({ statusCode: 409 })
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'lead.submission_accepted\'')).rows[0].count).toBe(1)
  })
  it('does not commit accepted identity when the surrounding intake transaction rolls back', async () => {
    intake.accept.mockImplementationOnce(async (_event: unknown, { lead }: { lead: InsertLeadInput }) => {
      return withLeadTransaction(async (connection) => {
        await insertLeadWithDedup(lead, connection)
        throw new Error('synthetic rollback after insert')
      })
    })
    await expect(submit()).rejects.toThrow('synthetic rollback after insert')
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events WHERE action=\'lead.submission_accepted\'')).rows[0].count).toBe(0)
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
    await expect(submit()).resolves.toMatchObject({ duplicate: false })
  })
  it('denies a purged historical lead identified only by its legacy accepted audit key', async () => {
    await client.query(`INSERT INTO page_studio_audit_events (tenant_id,client_id,site_id,action,resource_type,resource_id,idempotency_key,metadata,occurred_at)
      VALUES ('tenant','client','site','lead.created','lead','purged-lead',$1,'{}',NOW())`, [`public-lead:${input.idempotencyKey}`])
    await expect(submit()).rejects.toMatchObject({ statusCode: 409 })
    expect(intake.accept).not.toHaveBeenCalled()
  })
  it('rejects an accepted identity whose digest no longer matches its reservation', async () => {
    const accepted = await submit()
    await client.query('DELETE FROM page_studio_audit_events WHERE resource_type=\'lead\'')
    await client.query('DELETE FROM leads WHERE id=$1', [accepted.leadId])
    await client.query(`UPDATE page_studio_audit_events SET metadata='{"payloadDigest":"mismatch"}' WHERE action='lead.submission_accepted'`)
    await expect(submit()).rejects.toThrow('Page Studio submission receipt could not be verified')
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(0)
  })
  it('requires a verified reservation before a direct Page Studio insert', async () => {
    await submit()
    const lead: InsertLeadInput = { ...intake.accept.mock.calls[0][1].lead, source_lead_id: 'unreserved-request' }
    await expect(insertLeadWithDedup(lead)).rejects.toThrow('Page Studio submission receipt could not be verified')
    expect((await client.query('SELECT COUNT(*)::int AS count FROM leads')).rows[0].count).toBe(1)
  })
  it('uses selective indexes for deleted lead history and immutable receipts at volume', async () => {
    await client.query(`INSERT INTO leads (client_id,source,source_lead_id,deleted_at)
      SELECT 'client','page_studio','volume-'||n,CASE WHEN n%2=0 THEN NOW() END FROM generate_series(1,50000) n;
      INSERT INTO page_studio_audit_events (tenant_id,client_id,site_id,action,resource_type,resource_id,idempotency_key,metadata,occurred_at)
      SELECT 'tenant','client','site','lead.submission_reserved','lead_submission','volume-'||n,'volume-key-'||n,'{}',NOW() FROM generate_series(1,50000) n;
      ANALYZE leads; ANALYZE page_studio_audit_events;`)
    const queries = {
      history: `SELECT id::text,client_id::text,source,source_lead_id,attribution,submitted_at::text,deleted_at::text FROM leads WHERE client_id='client' AND source='page_studio' AND source_lead_id='volume-50000' ORDER BY deleted_at NULLS FIRST LIMIT 1`,
      guard: `SELECT id FROM leads WHERE source='page_studio' AND source_lead_id='volume-50000' LIMIT 1`,
      receipt: `SELECT tenant_id,client_id,site_id,action,metadata,occurred_at::text FROM page_studio_audit_events WHERE resource_type='lead_submission' AND resource_id='volume-50000' AND client_id='client' AND action IN ('lead.submission_reserved','lead.submission_accepted')`
    }
    const explain = async () => {
      const plans: Record<string, { Plan: Record<string, unknown> }> = {}
      for (const [name, sql] of Object.entries(queries)) {
        plans[name] = (await client.query('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' + sql)).rows[0]['QUERY PLAN'][0]
      }
      return plans
    }
    const indexed = await explain()
    for (const [name, plan] of Object.entries(indexed)) {
      const serialized = JSON.stringify(plan)
      expect(serialized).toContain(name === 'receipt' ? 'idx_page_studio_lead_submission_identity' : 'idx_page_studio_lead_source_history')
      expect(serialized).not.toContain('Seq Scan')
      expect(plan.Plan['Actual Rows']).toBe(1)
    }
    await client.query('DROP INDEX idx_page_studio_lead_source_history; DROP INDEX idx_page_studio_lead_submission_identity')
    try {
      const withoutIndexes = await explain()
      for (const plan of Object.values(withoutIndexes)) expect(JSON.stringify(plan)).toContain('Seq Scan')
      if (process.env.PAGE_STUDIO_INDEX_PLAN_EVIDENCE) writeFileSync(process.env.PAGE_STUDIO_INDEX_PLAN_EVIDENCE, JSON.stringify({ syntheticRowsPerTable: 50000, indexed, withoutIndexes }, null, 2) + '\n')
    } finally { await client.query(readFileSync('server/database/migrations/417_page_studio_lead_receipt_indexes.sql', 'utf8')) }
  })
  it.each([
    'UPDATE agency_clients SET is_active=false',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_sites SET current_release_id=\'old\'',
    'UPDATE page_studio_entitlements SET status=\'suspended\'',
    'UPDATE page_studio_entitlements SET effective_until=NOW()-INTERVAL \'1 second\'',
    'UPDATE page_studio_entitlements SET effective_from=NOW()+INTERVAL \'1 day\'',
    'UPDATE page_studio_entitlements SET client_id=\'foreign\'',
    'UPDATE page_studio_release_pointers SET active_release_id=\'old\'',
    'UPDATE page_studio_releases SET environment=\'staging\'',
    'UPDATE page_studio_builds SET state=\'failed\''
  ])('denies fresh authority changes before reserving or writing: %s', async (sql) => {
    await client.query(sql)
    await expect(submit()).rejects.toMatchObject({ statusCode: 403 })
    expect(intake.accept).not.toHaveBeenCalled()
    expect((await client.query('SELECT COUNT(*)::int AS count FROM page_studio_audit_events')).rows[0].count).toBe(0)
  })
  it.each(['trial', 'active', 'past_due'])('preserves eligible general-form entitlement status %s', async (status) => {
    await client.query('UPDATE page_studio_entitlements SET status=$1', [status])
    await expect(submit()).resolves.toMatchObject({ duplicate: false })
  })
  it('rejects a different site or digest and a revoked retry after initial persistence', async () => {
    await submit()
    await expect(submit({ ...input, scope: { ...input.scope, siteId: 'foreign' } })).rejects.toMatchObject({ statusCode: 403 })
    await expect(submit({ ...input, versionDigest: 'b'.repeat(64) })).rejects.toMatchObject({ statusCode: 403 })
    await client.query('UPDATE page_studio_entitlements SET status=\'cancelled\'')
    await expect(submit()).rejects.toMatchObject({ statusCode: 403 })
  })
})
