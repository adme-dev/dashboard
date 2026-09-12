import pg from 'pg'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { listPageStudioSubmissions } from '~~/server/utils/pageStudio/siteOperations'

const db = vi.hoisted(() => ({ queryOne: vi.fn(), queryRows: vi.fn(), execute: vi.fn(), transaction: vi.fn() }))
vi.mock('~~/server/utils/db', () => db)
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
