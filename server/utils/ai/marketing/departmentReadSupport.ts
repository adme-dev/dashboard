import { createError } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

/** Agency reporting timezone; every period/window boundary is derived in this zone. */
export const DEPARTMENT_TIMEZONE = 'Australia/Melbourne'
/** Same threshold the existing spend contract uses (responseContract.STALENESS_THRESHOLD_HOURS). */
export const DEPARTMENT_STALE_HOURS = 48
export const DEPARTMENT_MAX_PAGE = 50
/** Portfolio-wide passes evaluate at most this many active clients and report incompleteness above it. */
export const DEPARTMENT_PORTFOLIO_CAP = 1000

export type DepartmentReadScope = Readonly<{
  actorUserId: string
  /** null = every active client; otherwise the explicit ids (still filtered to active clients in SQL). */
  clientIds: readonly string[] | null
}>
export type DepartmentReadDeps = {
  /** Fresh entry boundary; production uses requireMarketingDepartment (root-owned). */
  authorize?: (ctx: ToolContext) => Promise<ToolContext>
  now?: () => Date
}

const deny = (statusMessage: string): never => {
  throw createError({ statusCode: 403, statusMessage })
}

async function defaultAuthorize(ctx: ToolContext): Promise<ToolContext> {
  const { requireMarketingDepartment } = await import('./departmentAuthority')
  return requireMarketingDepartment(ctx)
}

/**
 * Resolve the department read scope from a FRESH authority context. The authorize step re-reads
 * identity/roles/grants; the checks below re-assert the dedicated group and grant on its result so
 * an injected or future authorizer can never widen access silently.
 */
export async function resolveDepartmentReadScope(ctx: ToolContext, deps: DepartmentReadDeps = {}): Promise<DepartmentReadScope> {
  const fresh = await (deps.authorize ?? defaultAuthorize)(ctx)
  if (fresh.mcpStaffAuthority !== 'fresh' || fresh.userId !== ctx.userId) deny('Fresh marketing authority required')
  if (!((fresh.permissionGroups ?? []) as readonly string[]).includes('MARKETING_MANAGEMENT')) deny('Marketing management permission required')
  if (!((fresh.marketingCapabilities ?? []) as readonly string[]).includes('department_management')) deny('Marketing department capability required')
  const access = fresh.assistantScope
  if (!access) deny('Marketing client scope required')
  let clientIds: readonly string[] | null = access!.clientAccessMode === 'all_active' ? null : [...access!.assignedClientIds]
  const narrow = fresh.clientScope ?? ctx.clientScope
  if (narrow) clientIds = clientIds === null || clientIds.includes(narrow) ? [narrow] : []
  return Object.freeze({ actorUserId: fresh.userId, clientIds })
}

/** Optional single-client narrowing inside the authorised scope (never a widening). */
export function narrowScope(scope: DepartmentReadScope, clientId?: string): DepartmentReadScope {
  if (!clientId) return scope
  const allowed = scope.clientIds === null || scope.clientIds.includes(clientId)
  return Object.freeze({ actorUserId: scope.actorUserId, clientIds: allowed ? [clientId] : [] })
}

/**
 * `scoped` = authorised ACTIVE clients. Every department aggregate joins through this CTE (or the
 * page derived from it), so inactive or unassigned clients never reach a SUM/COUNT.
 */
export function scopedClientsCte(scope: DepartmentReadScope, params: unknown[]): string {
  const conditions = ['c.is_active = true']
  if (scope.clientIds !== null) {
    params.push([...scope.clientIds])
    conditions.push(`c.id = ANY($${params.length}::uuid[])`)
  }
  return `scoped AS (SELECT c.id, c.name FROM agency_clients c WHERE ${conditions.join(' AND ')})`
}

export type ClientCursor = { name: string, id: string }
/** Keyset page over `scoped`, ordered by (name, id); fetches limit+1 to detect hasMore. */
export function clientPageCte(params: unknown[], cursor: ClientCursor | null, limit: number): string {
  let after = ''
  if (cursor) {
    params.push(cursor.name, cursor.id)
    after = `WHERE (s.name, s.id) > ($${params.length - 1}, $${params.length}::uuid)`
  }
  params.push(limit + 1)
  return `page AS (SELECT s.id, s.name FROM scoped s ${after} ORDER BY s.name, s.id LIMIT $${params.length})`
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
function encode(value: object): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url')
}
type CursorShape = { k?: unknown, n?: unknown, i?: unknown, o?: unknown }
function decode(cursor: string): CursorShape | null {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
    return value && typeof value === 'object' ? value as CursorShape : null
  } catch {
    return null
  }
}
const badCursor = (): never => {
  throw createError({ statusCode: 400, statusMessage: 'Invalid cursor' })
}
export function encodeClientCursor(row: { id: string, name: string }): string {
  return encode({ k: 'client', n: row.name, i: row.id })
}
export function decodeClientCursor(cursor?: string): ClientCursor | null {
  if (!cursor) return null
  const value = decode(cursor)
  if (value?.k !== 'client' || typeof value.n !== 'string' || value.n.length > 500 || typeof value.i !== 'string' || !UUID.test(value.i)) return badCursor()
  return { name: value.n, id: value.i }
}
export function encodeOffsetCursor(offset: number): string {
  return encode({ k: 'offset', o: offset })
}
export function decodeOffsetCursor(cursor?: string): number {
  if (!cursor) return 0
  const value = decode(cursor)
  if (value?.k !== 'offset' || typeof value.o !== 'number' || !Number.isInteger(value.o) || value.o < 0 || value.o > 100_000) return badCursor()
  return value.o
}

export function clampLimit(limit: number | undefined, fallback = 25): number {
  const n = Number.isInteger(limit) ? Number(limit) : fallback
  return Math.min(Math.max(n, 1), DEPARTMENT_MAX_PAGE)
}

/** Count of authorised active clients; a requested clientId that is out of scope is a 404. */
export async function countScopedClients(scope: DepartmentReadScope, requestedClientId?: string): Promise<number> {
  if (scope.clientIds?.length === 0) {
    if (requestedClientId) throw createError({ statusCode: 404, statusMessage: 'Client not found in marketing scope' })
    return 0
  }
  const params: unknown[] = []
  const row = await queryOneFresh<{ total: number }>(`/* dept:scope:count */ WITH ${scopedClientsCte(scope, params)} SELECT COUNT(*)::int AS total FROM scoped`, params)
  const total = Number(row?.total) || 0
  if (requestedClientId && total === 0) throw createError({ statusCode: 404, statusMessage: 'Client not found in marketing scope' })
  return total
}

/** Split a fetched limit+1 page into items and the next keyset cursor. */
export function finishClientPage<T extends { id: string, name: string }>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  const hasMore = rows.length > limit
  return { items, hasMore, nextCursor: hasMore && items.length ? encodeClientCursor(items.at(-1)!) : null }
}

function zonedParts(now: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: DEPARTMENT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now).map(p => [p.type, p.value]))
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day) }
}
/** Local calendar date (YYYY-MM-DD) in the reporting timezone. */
export function localDate(now: Date): string {
  const { year, month, day } = zonedParts(now)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
export function currentPeriod(now: Date): string {
  return localDate(now).slice(0, 7)
}
export function daysInPeriod(period: string): number {
  const [y, m] = period.split('-').map(Number)
  return new Date(Date.UTC(y!, m!, 0)).getUTCDate()
}
/** Local date `days` before today (inclusive window start). */
export function windowStartDate(now: Date, days: number): string {
  const [y, m, d] = localDate(now).split('-').map(Number)
  return new Date(Date.UTC(y!, m! - 1, d! - (days - 1))).toISOString().slice(0, 10)
}

export function isStale(timestamp: string | Date | null | undefined, now: Date): boolean {
  if (!timestamp) return true
  const t = new Date(timestamp).getTime()
  return !Number.isFinite(t) || now.getTime() - t > DEPARTMENT_STALE_HOURS * 3_600_000
}
export function iso(value: unknown): string | null {
  if (value == null) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isFinite(date.getTime()) ? date.toISOString() : null
}
export function int(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : 0
}
export function num(value: unknown): number | null {
  if (value == null) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
/** Ratio of compatible totals; a zero/absent denominator is undefined, never 0. */
export function ratio(numerator: number | null, denominator: number | null): number | null {
  if (numerator == null || denominator == null || denominator <= 0) return null
  return Math.round((numerator / denominator) * 10_000) / 10_000
}
export function counts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, int(v)]))
}

export function departmentMeta(now: Date) {
  return { asOf: now.toISOString(), timezone: DEPARTMENT_TIMEZONE, source: 'stored_records' as const, providerRefresh: false as const }
}

/** Tool boundary: recoverable typed failures; no internal detail beyond the status message. */
export async function runDepartmentRead(read: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await read())
  } catch (error) {
    const { statusCode, statusMessage } = (error ?? {}) as { statusCode?: unknown, statusMessage?: unknown }
    const status = Number(statusCode)
    const message = (fallback: string) => typeof statusMessage === 'string' && statusMessage ? statusMessage : fallback
    if (status === 403) return fail(message('Marketing department access denied'), 'DEPARTMENT_ACCESS_DENIED')
    if (status === 404) return fail(message('Client not found in marketing scope'), 'CLIENT_NOT_IN_SCOPE')
    if (status === 400) return fail(message('Invalid request'), 'INVALID_INPUT')
    return fail('Could not load the stored marketing data for this report.', 'DEPARTMENT_READ_FAILED')
  }
}
