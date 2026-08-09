import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  requireClientCrmAccess,
  resolveAgencyCrmSearchContext,
  resolvePortalCrmSearchContext,
  runCrmKeywordSearch
} = vi.hoisted(() => ({
  requireClientCrmAccess: vi.fn(),
  resolveAgencyCrmSearchContext: vi.fn(),
  resolvePortalCrmSearchContext: vi.fn(),
  runCrmKeywordSearch: vi.fn()
}))

vi.mock('~~/server/utils/crm/clientCrmAccess', () => ({
  requireClientCrmAccess: (...args: unknown[]) => requireClientCrmAccess(...args)
}))
vi.mock('~~/server/utils/crm/searchContext', () => ({
  resolveAgencyCrmSearchContext: (...args: unknown[]) => resolveAgencyCrmSearchContext(...args),
  resolvePortalCrmSearchContext: (...args: unknown[]) => resolvePortalCrmSearchContext(...args)
}))
vi.mock('~~/server/utils/crm/search', () => ({
  CRM_KEYWORD_POOL_LIMIT: 50,
  runCrmKeywordSearch: (...args: unknown[]) => runCrmKeywordSearch(...args)
}))

const globals = globalThis as typeof globalThis & {
  defineEventHandler: <T>(handler: T) => T
  readBody: (event: { body?: unknown }) => Promise<unknown>
}
globals.defineEventHandler = handler => handler
globals.readBody = async event => event.body

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const agencyContext = { clientId: CLIENT_ID, surface: 'agency_global' }
const portalContext = { clientId: CLIENT_ID, surface: 'portal_global' }
const rows = [
  { type: 'company', id: 'company-1', title: 'Acme', subtitle: null, rank: 1 },
  { type: 'person', id: 'person-1', title: 'Alice', subtitle: null, rank: 0.8 },
  { type: 'task', id: 'task-1', title: 'Call Alice', subtitle: 'open', rank: 0.7 }
]

describe('CRM POST search endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    requireClientCrmAccess.mockResolvedValue({ clientId: CLIENT_ID })
    resolveAgencyCrmSearchContext.mockResolvedValue(agencyContext)
    resolvePortalCrmSearchContext.mockResolvedValue(portalContext)
    runCrmKeywordSearch.mockResolvedValue(rows)
  })

  it('normalizes an agency JSON body, resolves fresh authority, and limits after the stable pool', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default
    const event = { context: {}, body: { clientId: CLIENT_ID, query: '  Ａcme\u202e ', limit: 2 } }

    await expect(handler(event as never)).resolves.toEqual({ results: rows.slice(0, 2) })
    expect(resolveAgencyCrmSearchContext).toHaveBeenCalledWith(event, {
      clientId: CLIENT_ID,
      surface: 'agency_global'
    })
    expect(runCrmKeywordSearch).toHaveBeenCalledWith(agencyContext, 'Acme', 50)
  })

  it('requires an agency client selector and rejects unknown boundary fields', async () => {
    const handler = (await import('~~/server/api/crm/search.post')).default

    await expect(handler({ context: {}, body: { query: 'Acme' } } as never))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(handler({ context: {}, body: { clientId: CLIENT_ID, query: 'Acme', namespace: 'foreign' } } as never))
      .rejects.toMatchObject({ name: 'ZodError' })
    expect(resolveAgencyCrmSearchContext).not.toHaveBeenCalled()
    expect(runCrmKeywordSearch).not.toHaveBeenCalled()
  })

  it('requires explicit portal view authority and derives client scope only from the fresh session', async () => {
    const handler = (await import('~~/server/api/client-portal/crm/search.post')).default
    const event = { context: {}, body: { query: 'Acme', limit: 1 } }

    await expect(handler(event as never)).resolves.toEqual({ results: rows.slice(0, 1) })
    expect(requireClientCrmAccess).toHaveBeenCalledWith(event, 'view')
    expect(resolvePortalCrmSearchContext).toHaveBeenCalledWith(event, { surface: 'portal_global' })
    expect(runCrmKeywordSearch).toHaveBeenCalledWith(portalContext, 'Acme', 50)
  })

  it('rejects a portal caller-supplied client before context resolution or retrieval', async () => {
    const handler = (await import('~~/server/api/client-portal/crm/search.post')).default
    const event = { context: {}, body: { clientId: CLIENT_ID, query: 'Acme' } }

    await expect(handler(event as never)).rejects.toMatchObject({ statusCode: 400 })
    expect(resolvePortalCrmSearchContext).not.toHaveBeenCalled()
    expect(runCrmKeywordSearch).not.toHaveBeenCalled()
  })
})

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|vue|mjs)$/.test(entry.name) ? [path] : []
  })
}

describe('retired CRM search transport', () => {
  it('has POST handlers only and no compatibility alias for the unsafe semantic route', () => {
    expect(existsSync('server/api/crm/search.post.ts')).toBe(true)
    expect(existsSync('server/api/client-portal/crm/search.post.ts')).toBe(true)
    expect(existsSync('server/api/crm/search.get.ts')).toBe(false)
    expect(existsSync('server/api/client-portal/crm/search.get.ts')).toBe(false)
    expect(existsSync('server/api/agency/search/semantic.get.ts')).toBe(false)
    expect(readdirSync('server/api/agency/search').filter(name => name.startsWith('semantic.'))).toEqual([])
  })

  it('leaves no production caller that can send CRM search text through a URL', () => {
    const offenders = ['app', 'server', 'shared']
      .flatMap(sourceFiles)
      .filter(path => /['"`]\/api\/(?:client-portal\/)?crm\/search(?:['"`?])/u.test(readFileSync(path, 'utf8')))
      .map(path => relative(process.cwd(), path))
      .sort()

    expect(offenders).toEqual([])
  })
})
