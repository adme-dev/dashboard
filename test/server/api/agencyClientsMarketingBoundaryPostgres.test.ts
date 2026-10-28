/* eslint-disable @typescript-eslint/no-explicit-any -- Partial Nitro and PostgreSQL fixture shapes. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import pg from 'pg'
import { permissionGroupsForRoles } from '~~/server/utils/permissions'

// Browser client directory/detail boundary for the explicit MARKETING_MANAGEMENT department role.
// Routes run against a scratch PostgreSQL schema so the fresh role/client SQL is exercised for real.

const ids = {
  marketer: '10000000-0000-4000-8000-000000000001',
  marketerNoClients: '10000000-0000-4000-8000-000000000002',
  financeMarketer: '10000000-0000-4000-8000-000000000003',
  accountManager: '10000000-0000-4000-8000-000000000004',
  inactiveMarketer: '10000000-0000-4000-8000-000000000005',
  danglingRole: '10000000-0000-4000-8000-000000000006',
  unseededSales: '10000000-0000-4000-8000-000000000007',
  marketingRole: '20000000-0000-4000-8000-000000000001',
  marketingOnlyRole: '20000000-0000-4000-8000-000000000002',
  financeMarketingRole: '20000000-0000-4000-8000-000000000003',
  accountManagerSystemRole: '20000000-0000-4000-8000-000000000004',
  activeClient: '30000000-0000-4000-8000-000000000001',
  inactiveClient: '30000000-0000-4000-8000-000000000002',
  missingClient: '30000000-0000-4000-8000-0000000000ff',
  project: '40000000-0000-4000-8000-000000000001',
  inactiveProject: '40000000-0000-4000-8000-000000000002',
  board: '60000000-0000-4000-8000-000000000001'
}

const h = vi.hoisted(() => ({
  client: null as null | import('pg').Client,
  cachedKeys: [] as string[],
  financials: [] as unknown[],
  allocations: [] as unknown[],
  sql: [] as string[]
}))

const FINANCIAL_KEYS = [
  'billingType', 'retainerAmount', 'paymentTerms', 'hourlyRate', 'mediaCommissionRate', 'xeroContactId',
  'notes', 'address', 'totalRevenue', 'totalCost', 'grossProfit', 'grossMargin'
]

const testGlobal = globalThis as any
testGlobal.defineEventHandler = (handler: unknown) => handler
testGlobal.getRouterParam = (event: any, name: string) => event.params?.[name]
testGlobal.getQuery = (event: any) => event.query ?? {}
testGlobal.readBody = async (event: any) => event.body
testGlobal.setResponseHeader = (event: any, name: string, value: string) => {
  event.headers[name.toLowerCase()] = value
}
testGlobal.createError = (input: { statusCode: number, statusMessage: string }) =>
  Object.assign(new Error(input.statusMessage), input)

vi.mock('~~/server/utils/auth', async () => {
  const { permissionGroupsForRoles: groupsFor } = await import('~~/server/utils/permissions')
  const deny = () => Object.assign(new Error('Forbidden'), { statusCode: 403 })
  const allowed = (user: any, roles: readonly string[]) =>
    roles.includes(user.role) || groupsFor(roles).some(group => user.permissionGroups?.includes(group))
  return {
    requireAuth: async (event: any) => event.context.user,
    requireRole: async (event: any, roles: readonly string[]) => {
      if (!allowed(event.context.user, roles)) throw deny()
      return event.context.user
    },
    requirePermission: async (event: any, group: string) => {
      if (!event.context.user.permissionGroups?.includes(group)) throw deny()
      return event.context.user
    },
    requireWriteAccess: async (event: any) => event.context.user
  }
})

vi.mock('~~/server/utils/kv', () => ({
  cachedFetch: async (_event: unknown, key: string, _ttl: number, load: () => Promise<unknown>) => {
    h.cachedKeys.push(key)
    return load()
  }
}))

vi.mock('~~/server/utils/db', () => {
  const rows = async (sql: string, params?: unknown[]) => {
    h.sql.push(sql)
    return (await h.client!.query(sql, params as any[])).rows
  }
  const one = async (sql: string, params?: unknown[]) => (await rows(sql, params))[0] ?? null
  return {
    db: {},
    queryRows: rows,
    queryRowsFresh: rows,
    queryOne: one,
    queryOneFresh: one
  }
})

vi.mock('~~/server/utils/clients/godModeMutations', () => ({
  executeGodModeAgencyClientUpdate: async (_event: unknown, mutate: (db: unknown) => Promise<unknown>) =>
    mutate(h.client)
}))

vi.mock('~~/server/utils/session', () => ({ getSelectedTenant: async () => 'tenant-1' }))

vi.mock('~~/server/utils/clientFinancials', () => ({
  getClientFinancials: async (input: unknown) => {
    h.financials.push(input)
    return { summary: { xeroRevenue: 12500 } }
  }
}))

vi.mock('~~/server/utils/clientFinancialAllocations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~~/server/utils/clientFinancialAllocations')>()
  return {
    ...actual,
    applyClientFinancialAllocation: async (input: unknown) => {
      h.allocations.push(input)
      return { ok: true }
    }
  }
})

const url = process.env.CLIENT_MARKETING_BOUNDARY_TEST_DATABASE_URL?.trim()

// The department branch must not read accounting columns or tables at all, not just drop them.
const ACCOUNTING_SQL = /\bc\.\*|hourly_rate|retainer_amount|media_commission|commission_rate|billing_type|payment_terms|xero_contact_id|notes|address|budget_amount|time_entries|project_expenses|invoices|target_utilization/i
function expectNoAccountingSql() {
  expect(h.sql.length).toBeGreaterThan(0)
  for (const sql of h.sql) expect(sql).not.toMatch(ACCOUNTING_SQL)
}
const schema = `client_mm_boundary_${process.pid}_${Date.now()}`

type SessionUser = { id: string, role: string, permissionGroups: string[] }
const sessions: Record<string, SessionUser> = {
  marketer: { id: ids.marketer, role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS', 'MEDIA_BUYING'] },
  marketerNoClients: { id: ids.marketerNoClients, role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT'] },
  financeMarketer: { id: ids.financeMarketer, role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS', 'FINANCE'] },
  accountManager: { id: ids.accountManager, role: 'account_manager', permissionGroups: ['CLIENTS', 'MEDIA_BUYING'] },
  // KV-cached session groups predate the department grant; fresh storage must still win.
  staleMarketer: { id: ids.marketer, role: 'media_buyer', permissionGroups: ['CLIENTS', 'FINANCE'] },
  inactiveMarketer: { id: ids.inactiveMarketer, role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS'] },
  danglingRole: { id: ids.danglingRole, role: 'media_buyer', permissionGroups: ['MARKETING_MANAGEMENT', 'CLIENTS'] },
  unseededSales: { id: ids.unseededSales, role: 'sales', permissionGroups: ['SALES', 'CLIENTS'] }
}

function event(as: keyof typeof sessions, input: { id?: string, query?: Record<string, unknown>, body?: unknown } = {}) {
  return {
    context: { user: { ...sessions[as], permissionGroups: [...sessions[as].permissionGroups] } },
    params: input.id ? { id: input.id } : {},
    query: input.query ?? {},
    body: input.body,
    headers: {} as Record<string, string>
  }
}

async function load<T = any>(path: string): Promise<(e: any) => Promise<T>> {
  return (await import(path)).default
}

async function status(promise: Promise<unknown>): Promise<number> {
  try {
    await promise
    return 200
  } catch (error: any) {
    return error.statusCode ?? 500
  }
}

async function clientRow(id: string) {
  return (await h.client!.query('SELECT * FROM agency_clients WHERE id = $1', [id])).rows[0]
}

describe.runIf(Boolean(url))('agency client marketing boundary on disposable PostgreSQL', () => {
  beforeAll(async () => {
    expect(['localhost', '127.0.0.1']).toContain(new URL(url!).hostname)
    h.client = new pg.Client({ connectionString: url })
    await h.client.connect()
    await h.client.query(`CREATE SCHEMA ${schema}`)
    await h.client.query(`SET search_path TO ${schema}`)
    await h.client.query(`
    CREATE TABLE custom_roles (id uuid PRIMARY KEY, slug text, is_system boolean NOT NULL DEFAULT FALSE, is_read_only boolean NOT NULL DEFAULT FALSE);
    CREATE TABLE role_permission_groups (role_id uuid REFERENCES custom_roles(id), permission_group text NOT NULL);
    CREATE TABLE team_members (
      id uuid PRIMARY KEY, name text, email text, role text, user_role text NOT NULL, custom_role_id uuid,
      default_hourly_rate numeric, target_utilization numeric, is_active boolean NOT NULL DEFAULT TRUE
    );
    CREATE TABLE department_members (id serial PRIMARY KEY, department_id uuid, team_member_id uuid, role text, joined_at timestamptz DEFAULT now());
    CREATE TABLE task_statuses (id serial PRIMARY KEY);
    CREATE TABLE tasks (id serial PRIMARY KEY, department_id uuid, assignee_id uuid, status_id integer, status_is_final boolean, due_date date, estimated_hours numeric);
    CREATE TABLE departments (id uuid PRIMARY KEY, name text, is_active boolean DEFAULT TRUE);
    CREATE TABLE agency_clients (
      id uuid PRIMARY KEY, name text NOT NULL, xero_contact_id text, billing_type text, retainer_amount numeric,
      payment_terms integer, hourly_rate numeric, media_commission_rate numeric, is_active boolean NOT NULL DEFAULT TRUE,
      logo_url text, notes text, contact_email text, contact_phone text, address text, reporting_timezone text,
      lead_capture_mode text, portal_board_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
    );
    CREATE TABLE projects (
      id uuid PRIMARY KEY, client_id uuid, name text, status text, budget_type text, budget_amount numeric,
      start_date date, end_date date, created_at timestamptz DEFAULT now()
    );
    CREATE TABLE time_entries (id serial PRIMARY KEY, project_id uuid, user_id uuid, date date, hours numeric, hourly_rate numeric, description text, billable boolean);
    CREATE TABLE project_expenses (id serial PRIMARY KEY, project_id uuid, amount numeric);
    CREATE TABLE invoices (id serial PRIMARY KEY, client_id uuid, invoice_number text, status text, issue_date date, due_date date, subtotal numeric, tax numeric, total numeric);
    CREATE TABLE media_spend (id serial PRIMARY KEY, client_id uuid, platform text, period text, budget_allocated numeric, actual_spend numeric, commission_rate numeric);
    CREATE TABLE client_sessions (id serial PRIMARY KEY, client_user_id uuid);
    CREATE TABLE client_users (id uuid PRIMARY KEY, client_id uuid);
  `)
    for (const [id, slug, system] of [
      [ids.marketingRole, 'marketing-management', false],
      [ids.marketingOnlyRole, 'marketing-only', false],
      [ids.financeMarketingRole, 'finance-marketing', false],
      [ids.accountManagerSystemRole, 'account_manager', true]
    ] as const) {
      await h.client.query('INSERT INTO custom_roles (id, slug, is_system) VALUES ($1, $2, $3)', [id, slug, system])
    }
    const grant = async (roleId: string, groups: string[]) => {
      for (const group of groups) {
        await h.client!.query('INSERT INTO role_permission_groups (role_id, permission_group) VALUES ($1, $2)', [roleId, group])
      }
    }
    await grant(ids.marketingRole, ['MARKETING_MANAGEMENT', 'CLIENTS', 'MEDIA_BUYING'])
    await grant(ids.marketingOnlyRole, ['MARKETING_MANAGEMENT'])
    await grant(ids.financeMarketingRole, ['MARKETING_MANAGEMENT', 'CLIENTS', 'FINANCE'])
    await grant(ids.accountManagerSystemRole, ['CLIENTS', 'MEDIA_BUYING', 'INVOICE_OWN_CLIENTS'])
    await h.client.query(`
    INSERT INTO team_members (id, name, user_role, custom_role_id, is_active) VALUES
      ('${ids.marketer}', 'Marketer', 'media_buyer', '${ids.marketingRole}', TRUE),
      ('${ids.marketerNoClients}', 'Marketer two', 'media_buyer', '${ids.marketingOnlyRole}', TRUE),
      ('${ids.financeMarketer}', 'Finance marketer', 'media_buyer', '${ids.financeMarketingRole}', TRUE),
      ('${ids.accountManager}', 'Account manager', 'account_manager', NULL, TRUE),
      ('${ids.inactiveMarketer}', 'Gone', 'media_buyer', '${ids.marketingRole}', FALSE),
      ('${ids.danglingRole}', 'Dangling', 'media_buyer', '20000000-0000-4000-8000-0000000000ff', TRUE),
      ('${ids.unseededSales}', 'Sales', 'sales', NULL, TRUE);
    INSERT INTO agency_clients (id, name, xero_contact_id, billing_type, retainer_amount, payment_terms, hourly_rate,
      media_commission_rate, is_active, notes, contact_email, contact_phone, address, reporting_timezone, lead_capture_mode) VALUES
      ('${ids.activeClient}', 'Acme Motors', 'xero-1', 'retainer', 6000, 30, 180, 10, TRUE, 'Private margin note',
        'hello@acme.test', '0400 000 000', '1 Billing St', 'Australia/Melbourne', 'capture_only'),
      ('${ids.inactiveClient}', 'Dormant Dealer', 'xero-2', 'project', 900, 14, 150, 12, FALSE, 'Inactive note',
        'old@dormant.test', NULL, NULL, NULL, NULL);
    INSERT INTO projects (id, client_id, name, status, budget_type, budget_amount, start_date) VALUES
      ('${ids.project}', '${ids.activeClient}', 'Launch campaign', 'active', 'fixed', 50000, '2026-08-01'),
      ('${ids.inactiveProject}', '${ids.inactiveClient}', 'Old campaign', 'completed', 'fixed', 1000, '2025-01-01');
    INSERT INTO time_entries (project_id, user_id, date, hours, hourly_rate, description, billable) VALUES
      ('${ids.project}', '${ids.accountManager}', '2026-08-14', 3.5, 180, 'Campaign build', TRUE);
    INSERT INTO project_expenses (project_id, amount) VALUES ('${ids.project}', 400);
    UPDATE team_members SET email = 'am@agency.test', role = 'Account manager', default_hourly_rate = 95, target_utilization = 80
     WHERE id = '${ids.accountManager}';
    INSERT INTO departments (id, name) VALUES ('${ids.board}', 'Marketing operations');
    INSERT INTO department_members (department_id, team_member_id, role) VALUES ('${ids.board}', '${ids.accountManager}', 'member');
    INSERT INTO task_statuses (id) VALUES (1);
    INSERT INTO tasks (department_id, assignee_id, status_id, status_is_final, due_date, estimated_hours) VALUES
      ('${ids.board}', '${ids.accountManager}', 1, FALSE, '2020-01-01', 6);
    INSERT INTO invoices (client_id, invoice_number, status, issue_date, total) VALUES
      ('${ids.activeClient}', 'INV-42', 'AUTHORISED', '2026-08-10', 8800);
    INSERT INTO media_spend (client_id, platform, period, budget_allocated, actual_spend, commission_rate) VALUES
      ('${ids.activeClient}', 'google_ads', '2026-08', 5000, 1250, 15);
  `)
  })

  afterAll(async () => {
    if (!h.client) return
    await h.client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
    await h.client.end()
  })

  beforeEach(() => {
    h.cachedKeys = []
    h.financials = []
    h.allocations = []
    h.sql = []
  })

  describe('GET /api/agency/clients for explicit marketing management', () => {
    it('returns only active clients with identity and project counts, never financial fields or shared cache', async () => {
      const handler = await load('~~/server/api/agency/clients/index.get')
      for (const query of [{}, { active: 'false' }, { active: 'true' }]) {
        const e = event('marketer', { query })
        const rows = await handler(e) as any[]
        expect(rows.map(row => row.id)).toEqual([ids.activeClient])
        expect(rows[0]).toMatchObject({ id: ids.activeClient, name: 'Acme Motors', isActive: true, projectCount: 1, activeProjects: 1 })
        for (const key of FINANCIAL_KEYS) expect(rows[0]).not.toHaveProperty(key)
        expect(JSON.stringify(rows)).not.toMatch(/Private margin note|xero-1|6000|50000/)
        expect(e.headers['x-client-financial-access']).toBe('marketing')
        expect(e.headers['cache-control']).toBe('private, no-store')
      }
      expect(h.cachedKeys).toEqual([])
      expectNoAccountingSql()
    })

    it('uses fresh role policy rather than KV-cached session groups', async () => {
      const handler = await load('~~/server/api/agency/clients/index.get')
      const rows = await handler(event('staleMarketer')) as any[]
      expect(rows.map(row => row.id)).toEqual([ids.activeClient])
      expect(rows[0]).not.toHaveProperty('totalRevenue')
      expect(h.cachedKeys).toEqual([])
    })

    it('keeps the legacy cached financial list for non-department and finance-holding users', async () => {
      const handler = await load('~~/server/api/agency/clients/index.get')
      for (const as of ['accountManager', 'financeMarketer'] as const) {
        h.cachedKeys = []
        const e = event(as)
        const rows = await handler(e) as any[]
        // Legacy default (active param absent) is the pre-existing inverted filter: all clients.
        expect(rows.map(row => row.id).sort()).toEqual([ids.activeClient, ids.inactiveClient].sort())
        const acme = rows.find(row => row.id === ids.activeClient)
        expect(acme).toMatchObject({ totalRevenue: 50000, hourlyRate: 180, retainerAmount: 6000, notes: 'Private margin note' })
        expect(h.cachedKeys).toEqual(['agency:clients:true'])
        expect(e.headers['x-client-financial-access']).toBeUndefined()
      }
    })

    it('fails closed for a deactivated actor or a dangling custom role policy', async () => {
      const handler = await load('~~/server/api/agency/clients/index.get')
      expect(await status(handler(event('inactiveMarketer')))).toBe(403)
      expect(await status(handler(event('danglingRole')))).toBe(403)
      expect(h.cachedKeys).toEqual([])
    })

    it('treats an unseeded system role by its static defaults, which never grant the department view', async () => {
      const handler = await load('~~/server/api/agency/clients/index.get')
      const rows = await handler(event('unseededSales')) as any[]
      expect(rows.find(row => row.id === ids.activeClient)).toHaveProperty('totalRevenue', 50000)
      expect(h.cachedKeys).toEqual(['agency:clients:true'])
    })
  })

  describe('GET /api/agency/clients/:id for explicit marketing management', () => {
    it('returns minimized active client detail with projects and media spend, without accounting data', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].get')
      for (const as of ['marketer', 'marketerNoClients', 'staleMarketer'] as const) {
        const e = event(as, { id: ids.activeClient })
        const body = await handler(e) as any
        expect(e.headers['cache-control']).toBe('private, no-store')
        expect(body.access).toEqual({ financial: false, scope: 'marketing_management' })
        expect(body.client).toMatchObject({
          id: ids.activeClient, name: 'Acme Motors', isActive: true,
          contactEmail: 'hello@acme.test', contactPhone: '0400 000 000', reportingTimezone: 'Australia/Melbourne'
        })
        for (const key of FINANCIAL_KEYS) expect(body.client).not.toHaveProperty(key)
        expect(body.projects).toEqual([{
          id: ids.project, name: 'Launch campaign', status: 'active', startDate: expect.anything(), endDate: null
        }])
        expect(body.mediaSpend).toEqual([{
          id: expect.anything(), platform: 'google_ads', period: '2026-08', budgetAllocated: 5000, actualSpend: 1250
        }])
        expect(body).not.toHaveProperty('invoices')
        expect(body).not.toHaveProperty('recentTimeEntries')
        expect(body.summary).toEqual({
          totalProjects: 1, activeProjects: 1, completedProjects: 0, totalMediaSpend: 1250, totalMediaBudget: 5000
        })
        expect(JSON.stringify(body)).not.toMatch(/INV-42|Private margin note|xero-1|commission|labor|hourly/i)
      }
      expectNoAccountingSql()
    })

    it('fails closed on inactive, missing and malformed client IDs', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].get')
      for (const id of [ids.inactiveClient, ids.missingClient, 'not-a-uuid']) {
        expect(await status(handler(event('marketer', { id })))).toBe(404)
      }
    })

    it('keeps legacy full detail for CLIENTS staff and finance-holding department staff', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].get')
      for (const as of ['accountManager', 'financeMarketer'] as const) {
        const body = await handler(event(as, { id: ids.activeClient })) as any
        expect(body.access).toEqual({ financial: true })
        expect(body.client).toMatchObject({ hourlyRate: 180, mediaCommissionRate: 10, notes: 'Private margin note' })
        expect(body.invoices.map((invoice: any) => invoice.invoiceNumber)).toEqual(['INV-42'])
        expect(body.summary.totalMediaCommission).toBeCloseTo(187.5)
      }
      // Legacy CLIENTS staff still see inactive client detail.
      expect(await status(handler(event('accountManager', { id: ids.inactiveClient })))).toBe(200)
    })
  })

  describe('PUT /api/agency/clients/:id for explicit marketing management', () => {
    it('rejects financial and administrative fields without mutating the client', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].put')
      const before = await clientRow(ids.activeClient)
      for (const body of [
        { hourlyRate: 1 }, { retainerAmount: 1 }, { mediaCommissionRate: 0 }, { billingType: 'project' },
        { paymentTerms: 7 }, { xeroContactId: null }, { notes: 'x' }, { isActive: false }, { address: 'x' },
        { leadCaptureMode: 'full_crm' }, { portalBoardId: null }, { contactPhone: '1', hourlyRate: 1 }
      ]) {
        expect(await status(handler(event('marketer', { id: ids.activeClient, body })))).toBe(403)
      }
      expect(await clientRow(ids.activeClient)).toEqual(before)
    })

    it('allows contact edits on active clients only and returns the minimized client', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].put')
      const result = await handler(event('marketer', { id: ids.activeClient, body: { contactPhone: '0499 999 999' } })) as any
      expect(result.client).toMatchObject({ id: ids.activeClient, contactPhone: '0499 999 999' })
      for (const key of FINANCIAL_KEYS) expect(result.client).not.toHaveProperty(key)

      const inactiveBefore = await clientRow(ids.inactiveClient)
      expect(await status(handler(event('marketer', { id: ids.inactiveClient, body: { contactPhone: '1' } })))).toBe(404)
      expect(await clientRow(ids.inactiveClient)).toEqual(inactiveBefore)
    })

    it('keeps legacy financial edits for CLIENTS staff', async () => {
      const handler = await load('~~/server/api/agency/clients/[id].put')
      const result = await handler(event('accountManager', { id: ids.inactiveClient, body: { hourlyRate: 155 } })) as any
      expect(result.client.hourlyRate).toBe(155)
    })
  })

  describe('client financial routes for explicit marketing management', () => {
    it('denies the financial façade instead of returning restricted or zero values', async () => {
      const handler = await load('~~/server/api/agency/clients/[id]/financials.get')
      const query = { from: '2026-08-01', to: '2026-08-22' }
      for (const as of ['marketer', 'staleMarketer'] as const) {
        expect(await status(handler(event(as, { id: ids.activeClient, query })))).toBe(403)
      }
      expect(h.financials).toEqual([])
      await expect(handler(event('accountManager', { id: ids.activeClient, query }))).resolves.toEqual({ summary: { xeroRevenue: 12500 } })
      expect(h.financials).toHaveLength(1)
    })

    it('denies financial allocation when fresh policy is department-only despite cached FINANCE', async () => {
      const handler = await load('~~/server/api/agency/clients/[id]/financial-allocations.patch')
      const body = { sourceType: 'media_spend', sourceId: '50000000-0000-4000-8000-000000000001', projectId: null }
      expect(await status(handler(event('staleMarketer', { id: ids.activeClient, body })))).toBe(403)
      expect(h.allocations).toEqual([])
      await expect(handler(event('financeMarketer', { id: ids.activeClient, body }))).resolves.toEqual({ ok: true })
    })
  })

  describe('GET /api/agency/departments/:id/members for explicit marketing management', () => {
    it('omits hourly rate and utilization targets while keeping identity and task workload', async () => {
      const handler = await load('~~/server/api/agency/departments/[id]/members/index.get')
      const [member] = await handler(event('marketer', { id: ids.board })) as any[]
      expect(member).toMatchObject({
        id: ids.accountManager, name: 'Account manager', email: 'am@agency.test', departmentRole: 'member',
        isActive: true, activeTaskCount: 1, overdueTaskCount: 1, estimatedHours: 6
      })
      expect(member).not.toHaveProperty('defaultHourlyRate')
      expect(member).not.toHaveProperty('targetUtilization')
      expect(h.sql.some(sql => /department_members/.test(sql))).toBe(true)
      expect(h.sql.join('\n')).not.toMatch(/default_hourly_rate|target_utilization/)

      const [legacy] = await handler(event('accountManager', { id: ids.board })) as any[]
      expect(legacy).toMatchObject({ defaultHourlyRate: 95, targetUtilization: 80, activeTaskCount: 1 })
    })
  })
})

// Sanity: the fixture's mocked requireRole uses the same reverse group mapping as production.
it('maps CLIENTS role arrays to the CLIENTS group', () => {
  expect(permissionGroupsForRoles(['owner', 'admin', 'lead', 'project_manager', 'account_manager', 'sales'])).toContain('CLIENTS')
})
