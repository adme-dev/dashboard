import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

// A restricted row's stored name must never influence which rows a search
// returns, how pages are filled, or how much authority work is done.
const m = vi.hoisted(() => ({ rows: vi.fn(), access: vi.fn(), denied: new Set<string>() }))
vi.mock('~~/server/utils/auth', () => ({ requireAuth: async () => ({ id: 'staff-id' }) }))
vi.mock('~~/server/utils/db', () => ({ queryRowsFresh: m.rows }))
vi.mock('~~/server/utils/social/clientAccess', () => ({
  hasAllSocialClientAccess: () => true, hasSocialClientPermission: () => true, requireSocialClientAccess: async () => {}
}))
vi.mock('~~/server/utils/banner/scopedCanvasAccess', () => ({ assertScopedCanvasAccess: m.access }))
vi.stubGlobal('defineEventHandler', (handler: unknown) => handler)
vi.stubGlobal('getQuery', (event: { query: unknown }) => event.query)
vi.stubGlobal('setHeader', vi.fn())
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
const list = (await import('~~/server/api/agency/banner-studio/projects/index.get')).default

const protectedCanvas = { square: { dissectionSource: { jobId: '44444444-4444-4444-8444-444444444444', sourceSha256: 'a'.repeat(64) } } }
const row = (id: string, name: string, canvasData: unknown = {}) => ({ id, name, clientId: null, clientName: null, canvasData, thumbnailUrl: 'https://thumb.invalid/x.png', status: 'draft', tags: [], createdBy: 'staff-id' })
let table: ReturnType<typeof row>[]

// Minimal PostgreSQL stand-in for this route's SQL: ILIKE (with ESCAPE '\'),
// status, LIMIT and OFFSET over rows already in ORDER BY updated_at DESC order.
function like(pattern: string, value: string) {
  let source = ''
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern[i]!
    if (char === '\\') source += (pattern[++i] ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (char === '%') source += '[\\s\\S]*'
    else if (char === '_') source += '[\\s\\S]'
    else source += char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${source}$`, 'i').test(value)
}
function fakeSql(sql: string, params: unknown[]) {
  const at = (expression: RegExp) => {
    const match = sql.match(expression)
    return match ? params[Number(match[1]) - 1] : undefined
  }
  let result = [...table]
  const status = at(/p\.status = \$(\d+)/)
  if (status !== undefined) result = result.filter(r => r.status === status)
  const pattern = at(/p\.name ILIKE \$(\d+)/)
  if (pattern !== undefined) result = result.filter(r => like(String(pattern), r.name))
  const offset = at(/OFFSET \$(\d+)/)
  if (offset !== undefined) result = result.slice(Number(offset))
  const limit = at(/LIMIT \$(\d+)/)
  if (limit !== undefined) result = result.slice(0, Number(limit))
  return result.map(r => structuredClone(r))
}
const request = (query: Record<string, string>) => ({ query }) as unknown as H3Event

beforeEach(() => {
  vi.clearAllMocks()
  m.denied = new Set(['hidden'])
  table = [
    row('ordinary-a', 'Spring sale'),
    row('hidden', 'Dissected — Toyota Secret', protectedCanvas),
    row('readable', 'Dissected — Toyota Public', protectedCanvas),
    row('ordinary-b', 'Toyota service'),
    row('ordinary-c', '100% off_season')
  ]
  m.rows.mockImplementation(async (sql: string, params: unknown[]) => fakeSql(sql, params))
  m.access.mockImplementation(async (_actor: string, _canvas: unknown, id: string) => {
    if (m.denied.has(id)) throw Object.assign(new Error('No access to protected artwork'), { statusCode: 403 })
  })
})

describe('project list search never probes redacted names', () => {
  it('returns the same rows and authority work whether or not a probe matches a hidden name', async () => {
    const matching = await list(request({ search: 'Toyota Secret' }))
    const accessCalls = m.access.mock.calls.length
    m.access.mockClear()
    const missing = await list(request({ search: 'Toyota Zzzzz' }))
    expect(matching).toEqual([])
    expect(missing).toEqual(matching)
    expect(m.access.mock.calls.length).toBe(accessCalls)
  })

  it('matches restricted rows only through their visible placeholder', async () => {
    const result = await list(request({ search: 'restricted ART' }))
    expect(result).toEqual([{ id: 'hidden', name: 'Restricted artwork', status: 'restricted', restricted: true }])
    expect(JSON.stringify(result)).not.toContain('Toyota')
  })

  it('still finds readable protected and ordinary rows by their real names', async () => {
    const result = await list(request({ search: 'toyota' }))
    expect(result.map((r: { id: string }) => r.id)).toEqual(['readable', 'ordinary-b'])
    expect(result[0]).toMatchObject({ name: 'Dissected — Toyota Public', thumbnailUrl: null })
  })

  it('paginates over visible matches so a hidden match never leaves a gap', async () => {
    const pages = []
    for (let offset = 0; offset < 3; offset++) pages.push(await list(request({ search: 'Toyota', limit: '1', offset: String(offset) })))
    expect(pages.map(page => page.map((r: { id: string }) => r.id))).toEqual([['readable'], ['ordinary-b'], []])
    m.denied = new Set()
    const all = await list(request({ search: 'Toyota', limit: '1', offset: '0' }))
    expect(all.map((r: { id: string }) => r.id)).toEqual(['hidden'])
  })

  it.each([
    ['%', ['ordinary-c']],
    ['_', ['ordinary-c']],
    ['0% off_s', ['ordinary-c']],
    ['\\', []],
    ['T_yota', []]
  ])('treats %j as literal text, not a wildcard', async (search, ids) => {
    const result = await list(request({ search }))
    expect(result.map((r: { id: string }) => r.id)).toEqual(ids)
  })

  it('keeps unsearched listing paginated in SQL with every slot preserved', async () => {
    const result = await list(request({ limit: '2', offset: '1' }))
    expect(result).toEqual([{ id: 'hidden', name: 'Restricted artwork', status: 'restricted', restricted: true }, expect.objectContaining({ id: 'readable' })])
    const [sql, params] = m.rows.mock.calls[0]!
    expect(sql).toMatch(/LIMIT \$1/)
    expect(sql).toMatch(/OFFSET \$2/)
    expect(params).toEqual([2, 1])
  })

  it('rejects malformed pagination instead of failing in SQL', async () => {
    for (const query of [{ limit: 'abc' }, { offset: '-1' }, { search: 'x', limit: '1.5' }]) {
      await expect(list(request(query))).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(m.rows).not.toHaveBeenCalled()
  })

  it('propagates authority outages instead of redacting them', async () => {
    m.access.mockRejectedValueOnce(Object.assign(new Error('unavailable'), { statusCode: 503 }))
    await expect(list(request({ search: 'zzz' }))).rejects.toMatchObject({ statusCode: 503 })
  })
})
