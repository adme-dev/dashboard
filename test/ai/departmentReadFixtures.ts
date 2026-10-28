/* eslint-disable @typescript-eslint/no-explicit-any -- Partial database and H3 dependency doubles exercise runtime authority boundaries. */
/**
 * SQL-contract fake for department reads. It does not pattern-match on intent: it applies the
 * actual scope predicates found in the emitted SQL (active filter, ANY(uuid[]) id list, keyset
 * cursor and LIMIT parameter positions) to an in-memory client table, then asks per-label row
 * builders for each surviving client. A query that forgets the active predicate or the id list
 * therefore leaks fixture rows and fails the assertions.
 */
export type FixtureClient = { id: string, name: string, is_active: boolean }
export type Call = { kind: 'rows' | 'one', label: string, sql: string, params: unknown[] }
type PerClient = (client: FixtureClient, params: unknown[], sql: string) => Record<string, unknown> | Record<string, unknown>[] | null
type Whole = (clients: FixtureClient[], params: unknown[], sql: string) => Record<string, unknown>[]
export type Handlers = Record<string, { perClient?: PerClient, whole?: Whole }>

export function fixtureClientId(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
}
export function makeFixtureClients(active: number, inactive = 0): FixtureClient[] {
  const rows: FixtureClient[] = []
  for (let i = 1; i <= active + inactive; i++)
    rows.push({ id: fixtureClientId(i), name: `Client ${String(i).padStart(3, '0')}`, is_active: i <= active })
  return rows
}

function label(sql: string): string {
  const match = /\/\* (dept:[a-z_]+:[a-z_]+) \*\//.exec(sql)
  if (!match) throw new Error(`Unlabelled department SQL: ${sql.slice(0, 80)}`)
  return match[1]!
}
function param(params: unknown[], ref: string | undefined): unknown {
  return ref ? params[Number(ref) - 1] : undefined
}
const cmp = (a: FixtureClient, b: FixtureClient) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/** Applies the `scoped` CTE predicates the SQL actually contains. */
export function scopedClients(clients: FixtureClient[], sql: string, params: unknown[]): FixtureClient[] {
  const cte = /scoped AS \(SELECT c\.id, c\.name FROM agency_clients c WHERE (.+?)\)(?=,\s*page AS|\s)/s.exec(sql)
  if (!cte) throw new Error('Department SQL missing scoped CTE')
  let rows = [...clients]
  if (cte[1]!.includes('c.is_active = true')) rows = rows.filter(c => c.is_active)
  const any = /c\.id = ANY\(\$(\d+)::uuid\[\]\)/.exec(cte[1]!)
  if (any) {
    const ids = param(params, any[1]) as string[]
    rows = rows.filter(c => ids.includes(c.id))
  }
  return rows.sort(cmp)
}
function paged(clients: FixtureClient[], sql: string, params: unknown[]): FixtureClient[] {
  let rows = clients
  const page = /page AS \(SELECT s\.id, s\.name FROM scoped s (.*?) ORDER BY s\.name, s\.id LIMIT \$(\d+)\)/.exec(sql)
  if (page) {
    const keyset = /\(s\.name, s\.id\) > \(\$(\d+), \$(\d+)::uuid\)/.exec(page[1]!)
    if (keyset) {
      const after = { name: String(param(params, keyset[1])), id: String(param(params, keyset[2])), is_active: true }
      rows = rows.filter(c => cmp(c, after) > 0)
    }
    return rows.slice(0, Number(param(params, page[2])))
  }
  const tail = /ORDER BY s\.name, s\.id\s+LIMIT \$(\d+)\s*$/.exec(sql.trim())
  return tail ? rows.slice(0, Number(param(params, tail[1]))) : rows
}

export function departmentReadDb(clients: FixtureClient[], handlers: Handlers) {
  const calls: Call[] = []
  const run = (kind: Call['kind'], sql: string, params: unknown[] = []) => {
    const name = label(sql)
    calls.push({ kind, label: name, sql, params })
    const scoped = scopedClients(clients, sql, params)
    if (name === 'dept:scope:count') return [{ total: scoped.length }]
    const handler = handlers[name]
    if (!handler) throw new Error(`No fixture handler for ${name}`)
    if (handler.whole) return handler.whole(scoped, params, sql)
    return paged(scoped, sql, params).flatMap((client) => {
      const built = handler.perClient!(client, params, sql)
      const list = built == null ? [{}] : Array.isArray(built) ? built : [built]
      return list.map(row => ({ id: client.id, name: client.name, client_id: client.id, client_name: client.name, ...row }))
    })
  }
  return {
    calls,
    queryRowsFresh: async (sql: string, params?: unknown[]) => run('rows', sql, params),
    queryOneFresh: async (sql: string, params?: unknown[]) => run('one', sql, params)[0] ?? null
  }
}

export const DEPARTMENT_NOW = new Date('2026-10-15T01:00:00.000Z') // 12:00 Melbourne, 15 Oct 2026

/** A fresh marketing-management MCP context as resolved by the root authority boundary. */
export function departmentReadContext(overrides: Record<string, unknown> = {}): any {
  return {
    userId: 'staff-1', userRole: 'media_buyer', source: 'mcp', mcpStaffAuthority: 'fresh',
    mcpScopes: new Set(['mcp:read']),
    permissionGroups: ['CLIENTS', 'CREATIVE', 'MEDIA_BUYING', 'MARKETING_MANAGEMENT'],
    marketingCapabilities: ['reporting', 'department_management'],
    assistantScope: { departmentIds: [], clientAccessMode: 'all_active', assignedClientIds: [], catalogReleaseIds: [] },
    event: {},
    ...overrides
  }
}
