import { describe, it, expect } from 'vitest'
import { portalRegistry, buildPortalTools, assertPortalScope } from '~~/server/utils/ai/portalTools'
import type { PortalDb, PortalToolContext } from '~~/server/utils/ai/portalTools/portalContext'
import { getMySocialReport } from '~~/server/utils/ai/portalTools/socialReport'

const TENANT_A = 'client-aaaa'
const TENANT_B = 'client-bbbb'

/**
 * Fake DB that simulates Postgres tenant filtering: it returns rows tagged with the client_id that the
 * query BOUND as $1 (the portal convention). If a tool ever bound the wrong scope, the returned rows'
 * client_id wouldn't match the caller's clientScope and the fuzz assertion below would fail.
 */
function makeFakeDb(calls: { sql: string, params: any[] }[]): PortalDb {
  const rowsFor = (scope: string) => ([{
    id: `${scope}-row1`, client_id: scope, title: 'x', name: 'x',
    form_name: 'x', reference_number: 'x', invoice_number: 'x', source: 'x',
  }])
  const run = async (sql: string, params: any[] = []) => {
    calls.push({ sql, params })
    const scope = params[0] // convention: clientScope is ALWAYS $1
    return (scope === TENANT_A || scope === TENANT_B) ? rowsFor(scope) : []
  }
  return {
    queryRows: run as any,
    queryOne: (async (s: string, p: any[]) => (await run(s, p))[0] ?? null) as any,
  }
}

const ctxFor = (scope: string, db: PortalDb): PortalToolContext => ({
  clientScope: scope, clientUserId: 'cu-1', event: {} as any, db,
})

// Arg probes: benign, plus ones that try to smuggle the OTHER tenant via every plausible field.
const ARG_PROBES: any[] = [
  {},
  { status: 'all' },
  { status: TENANT_B }, // injection-via-status (rejected by schema → defaults apply)
  { client_id: TENANT_B, clientId: TENANT_B, clientScope: TENANT_B, clientName: TENANT_B },
]

describe('portal registry — cross-tenant isolation (fuzz, the §12 gate)', () => {
  it('every read tool binds clientScope as $1 and never touches/returns another tenant', async () => {
    for (const t of portalRegistry.filter(t => !t.mutates)) {
      for (const probe of ARG_PROBES) {
        const calls: { sql: string, params: any[] }[] = []
        const ctx = ctxFor(TENANT_A, makeFakeDb(calls))
        const parsed = t.parameters.safeParse(probe)
        const res = await t.handler(parsed.success ? (parsed.data as any) : {}, ctx)

        expect(res.ok).toBe(true)
        expect(calls.length).toBeGreaterThan(0)
        for (const c of calls) {
          // 1. The tenant key is bound as $1 = clientScope (TENANT_A) — never the smuggled TENANT_B.
          //    (A smuggled id may appear as a later param IFF it's a benign value filter, e.g. status;
          //    what matters is it is NEVER the tenant key, and the rows come back scoped — asserted below.)
          expect(c.params[0]).toBe(TENANT_A)
          // 2. The query is physically scoped by client_id = $1.
          expect(c.sql).toContain('client_id = $1')
        }
        // 3. No returned row belongs to another tenant.
        const data: any = (res as any).data
        for (const list of Object.values(data).filter(Array.isArray) as any[][]) {
          for (const row of list) {
            if (row && typeof row === 'object' && 'client_id' in row) {
              expect(row.client_id).toBe(TENANT_A)
            }
          }
        }
      }
    }
  })

  it('a tool run as tenant B returns only tenant B rows (symmetry)', async () => {
    const calls: { sql: string, params: any[] }[] = []
    const ctx = ctxFor(TENANT_B, makeFakeDb(calls))
    const res: any = await portalRegistry[0]!.handler({} as any, ctx)
    expect(res.ok).toBe(true)
    expect(calls[0]!.params[0]).toBe(TENANT_B)
    const rows = (Object.values(res.data).find(Array.isArray) as any[]) ?? []
    for (const row of rows) expect(row.client_id).toBe(TENANT_B)
  })
})

describe('get_my_social_report', () => {
  it('scopes the period query to clientScope and rolls up totals + top content', async () => {
    const calls: { sql: string, params: any[] }[] = []
    const db: PortalDb = {
      queryRows: (async (sql: string, params: any[] = []) => {
        calls.push({ sql, params })
        return [
          { post_id: 'p1', platform: 'facebook', published_at: '2026-06-10', content: 'hello world',
            impressions: 1000, reach: 800, engagements: 80, clicks: 5, likes: 60, comments_count: 10, shares: 5, saves: 5, video_views: 0, reactions: 0 },
          { post_id: 'p2', platform: 'instagram', published_at: '2026-06-12', content: 'second',
            impressions: 500, reach: 400, engagements: 200, clicks: 2, likes: 150, comments_count: 30, shares: 10, saves: 10, video_views: 0, reactions: 0 },
        ]
      }) as any,
      queryOne: (async () => null) as any,
    }
    const ctx: PortalToolContext = { clientScope: TENANT_A, clientUserId: 'cu', event: {} as any, db }
    const res: any = await getMySocialReport({ days: 30 } as any, ctx, { now: () => new Date('2026-06-20T00:00:00Z') })

    expect(res.ok).toBe(true)
    expect(calls[0]!.params[0]).toBe(TENANT_A)              // tenant key bound first
    expect(calls[0]!.sql).toContain('p.client_id = $1')
    expect(res.data.postCount).toBe(2)
    expect(res.data.totals.engagements).toBe(280)          // 80 + 200
    // p2 has the higher engagement rate (200/400) → ranked first
    expect(res.data.topContent[0].postId).toBe('p2')
    expect(res.data.topContent[0].preview).toBe('second')
  })
})

describe('portal scope guard (§12 #1 — refuses to run without clientScope)', () => {
  it('assertPortalScope throws on missing/blank clientScope', () => {
    expect(() => assertPortalScope({ clientScope: '' })).toThrow(/refusing to run/)
    expect(() => assertPortalScope({} as any)).toThrow(/refusing to run/)
    expect(() => assertPortalScope({ clientScope: undefined })).toThrow()
  })

  it('assertPortalScope passes with a real scope', () => {
    expect(() => assertPortalScope({ clientScope: TENANT_A })).not.toThrow()
  })

  it('buildPortalTools refuses to construct tools without scope', () => {
    expect(() => buildPortalTools({ clientScope: '', clientUserId: 'x', event: {} as any }, 'seed')).toThrow()
  })

  it('buildPortalTools omits Tier-2 writes by default (doubly dormant)', () => {
    const tools = buildPortalTools(ctxFor(TENANT_A, makeFakeDb([])), 'seed')
    expect(Object.keys(tools).sort()).toEqual(portalRegistry.filter(t => !t.mutates).map(t => t.name).sort())
    expect(Object.keys(tools)).not.toContain('respond_to_approval')
  })

  it('buildPortalTools exposes writes only when allowWrites is set', () => {
    const tools = buildPortalTools(ctxFor(TENANT_A, makeFakeDb([])), 'seed', { allowWrites: true })
    expect(Object.keys(tools).sort()).toEqual(portalRegistry.map(t => t.name).sort())
    expect(Object.keys(tools)).toContain('respond_to_approval')
  })
})

describe('portal registry — only portal-safe tools', () => {
  it('contains the Tier-1 reads + the single Tier-2 write, no agency tools', () => {
    const names = portalRegistry.map(t => t.name)
    expect(names).toEqual([
      'get_my_approvals', 'get_my_invoices', 'get_project_status_portal', 'get_my_briefs', 'get_my_leads', 'get_my_social_report',
      'respond_to_approval',
    ])
    for (const banned of ['get_finance_snapshot', 'get_client_profitability', 'create_task', 'propose_budget_change', 'search_knowledge']) {
      expect(names).not.toContain(banned)
    }
  })

  it('respond_to_approval is the ONLY mutating tool (everything else is read-only)', () => {
    expect(portalRegistry.filter(t => t.mutates).map(t => t.name)).toEqual(['respond_to_approval'])
  })
})
