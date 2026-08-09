import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  collectCrmSearchCallerViolations,
  inspectCrmSearchCallerSource
} from '../../support/crmSearchCallerGuard'

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

describe('retired CRM search transport', () => {
  it('has POST handlers only and no compatibility alias for the unsafe semantic route', () => {
    expect(existsSync('server/api/crm/search.post.ts')).toBe(true)
    expect(existsSync('server/api/client-portal/crm/search.post.ts')).toBe(true)
    expect(existsSync('server/api/crm/search.get.ts')).toBe(false)
    expect(existsSync('server/api/client-portal/crm/search.get.ts')).toBe(false)
    expect(existsSync('server/api/agency/search/semantic.get.ts')).toBe(false)
    expect(readdirSync('server/api/agency/search').filter(name => name.startsWith('semantic.'))).toEqual([])
  })

  it('accepts only POST body callers across every production source root', () => {
    expect(collectCrmSearchCallerViolations(['app', 'server', 'shared', 'scripts', 'workers'])).toEqual([])
  })

  it.each([
    [
      'template query transport',
      'const query = \'Acme\'; $fetch(`/api/crm/search?q=${query}`)'
    ],
    [
      'composed implicit GET',
      'const endpoint = \'/api/\' + \'crm/search\'; $fetch(endpoint)'
    ],
    [
      'portal options query',
      'const endpoint = `/api/client-portal/crm/${\'search\'}`; apiFetch(endpoint, { method: \'POST\', query: { q: term } })'
    ],
    [
      'dynamic template suffix',
      'const suffix = makeQuery(term); $fetch(`/api/crm/search${suffix}`, { method: \'POST\', body: { query: term } })'
    ]
  ])('detects synthetic %s', (_label, source) => {
    expect(inspectCrmSearchCallerSource(source, 'scripts/synthetic.mjs')).not.toEqual([])
  })

  it('accepts synthetic explicit POST bodies for both routes', () => {
    const source = `
      $fetch('/api/crm/search', { method: 'POST', body: { clientId, query } })
      apiFetch('/api/client-portal/crm/search', { method: 'POST', body: { query } })
    `
    expect(inspectCrmSearchCallerSource(source, 'workers/valid.ts')).toEqual([])
  })

  it.each([
    [
      'proxy endpoint containing the target',
      `$fetch('/proxy?next=/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      'params transport',
      `$fetch('/api/crm/search', { method: 'POST', body: { query }, params: new URLSearchParams({ q: query }) })`
    ],
    [
      'unsafe known object spread',
      `const defaults = { method: 'GET', query: { q: query } }; $fetch('/api/crm/search', { ...defaults, body: { query } })`
    ],
    [
      'block-shadowed implicit GET',
      `const endpoint = '/api/crm/search'; { const endpoint = '/api/health'; console.log(endpoint) } $fetch(endpoint)`
    ],
    [
      'undefined shorthand body',
      `const body = undefined; $fetch('/api/crm/search', { method: 'POST', body })`
    ],
    [
      'object-property endpoint implicit GET',
      `const routes = { crmSearch: '/api/crm/search' }; $fetch(routes.crmSearch)`
    ],
    [
      'unresolved target-bearing endpoint',
      `const endpoint = choose('/api/crm/search'); $fetch(endpoint, { method: 'POST', body: { query } })`
    ]
  ])('rejects synthetic %s', (_label, source) => {
    expect(inspectCrmSearchCallerSource(source, 'scripts/synthetic.mjs')).not.toEqual([])
  })

  it('accepts a known safe options object spread', () => {
    const source = `
      const request = { method: 'POST', body: { query } }
      $fetch('/api/crm/search', { ...request })
    `
    expect(inspectCrmSearchCallerSource(source, 'app/safe.ts')).toEqual([])
  })

  it.each([
    [
      'direct transport alias with query transport',
      `const transport = $fetch; transport('/api/crm/search', { method: 'POST', body: { query }, query: { q: query } })`,
      'CRM search callers must not use options.query'
    ],
    [
      'approved transport property alias with implicit GET',
      `const transports = { request: $fetch }; transports.request('/api/crm/search')`,
      'CRM search callers must use explicit POST'
    ],
    [
      'nested endpoint member with implicit GET',
      `const routes = { crm: { search: '/api/crm/search' } }; $fetch(routes.crm.search)`,
      'CRM search callers must use explicit POST'
    ],
    [
      'destructured endpoint alias with implicit GET',
      `const routes = { search: '/api/crm/search' }; const { search: endpoint } = routes; $fetch(endpoint)`,
      'CRM search callers must use explicit POST'
    ],
    [
      'nested destructured endpoint alias with implicit GET',
      `const routes = { crm: { search: '/api/crm/search' } }; const { crm: { search: endpoint } } = routes; $fetch(endpoint)`,
      'CRM search callers must use explicit POST'
    ],
    [
      'nested destructured transport alias with implicit GET',
      `const transports = { http: { request: $fetch } }; const { http: { request: transport } } = transports; transport('/api/crm/search')`,
      'CRM search callers must use explicit POST'
    ],
    [
      'unresolved wrapper around a known target alias',
      `const target = '/api/crm/search'; const endpoint = choose(target); $fetch(endpoint, { method: 'POST', body: { query } })`,
      'CRM search transport endpoint containing the target could not be resolved safely'
    ],
    [
      'unresolved object wrapper around a known target alias',
      `const target = '/api/crm/search'; const endpoint = choose({ route: target }); $fetch(endpoint, { method: 'POST', body: { query } })`,
      'CRM search transport endpoint containing the target could not be resolved safely'
    ],
    [
      'unresolved array wrapper around a known target alias',
      `const target = '/api/crm/search'; const endpoint = choose([target]); $fetch(endpoint, { method: 'POST', body: { query } })`,
      'CRM search transport endpoint containing the target could not be resolved safely'
    ]
  ])('rejects synthetic %s', (_label, source, reason) => {
    expect(inspectCrmSearchCallerSource(source, 'scripts/alias-synthetic.mjs'))
      .toContainEqual({ filePath: 'scripts/alias-synthetic.mjs', reason })
  })

  it.each([
    [
      'function wrapper receiving endpoint and options',
      `function request(endpoint, options) { return $fetch(endpoint, options) }
       request('/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      'IIFE wrapper receiving endpoint and options',
      `((endpoint, options) => $fetch(endpoint, options))(
        '/api/crm/search',
        { method: 'POST', body: { query } }
      )`
    ],
    [
      'destructured parameter wrapper',
      `function request({ endpoint, options }) { return $fetch(endpoint, options) }
       request({
         endpoint: '/api/crm/search',
         options: { method: 'POST', body: { query } }
       })`
    ],
    [
      'wrapper receiving transport, endpoint, and options',
      `function invoke(transport, endpoint, options) { return transport(endpoint, options) }
       invoke($fetch, '/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      'transport alias assigned after declaration',
      `let transport
       transport = $fetch
       transport('/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      'bound transport alias',
      `const transport = $fetch.bind(null)
       transport('/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      '$fetch.call indirection',
      `$fetch.call(null, '/api/crm/search', { method: 'POST', body: { query } })`
    ],
    [
      '$fetch.apply indirection',
      `$fetch.apply(null, [
        '/api/crm/search',
        { method: 'POST', body: { query } }
      ])`
    ],
    [
      'nested object target wrapper',
      `invoke({
        request: {
          endpoint: '/api/crm/search',
          options: { method: 'POST', body: { query } }
        }
      })`
    ],
    [
      'nested array target wrapper',
      `invoke([
        { transport: $fetch },
        ['/api/crm/search', { method: 'POST', body: { query } }]
      ])`
    ]
  ])('rejects higher-order %s', (_label, source) => {
    expect(inspectCrmSearchCallerSource(source, 'scripts/higher-order-synthetic.mjs'))
      .toContainEqual({
        filePath: 'scripts/higher-order-synthetic.mjs',
        reason: 'CRM search target must be passed directly to an approved transport call'
      })
  })

  it.each([
    [
      'nested object and array endpoint alias',
      `const routes = { crm: { endpoints: ['/api/crm/search'] } }
       const endpoint = routes.crm.endpoints[0]
       $fetch(endpoint, { method: 'POST', body: { query } })`
    ],
    [
      'nested destructured object and array endpoint alias',
      `const routes = { crm: [{ search: '/api/crm/search' }] }
       const { crm: [{ search: endpoint }] } = routes
       $fetch(endpoint, { method: 'POST', body: { query } })`
    ],
    [
      'non-target wrapper arguments',
      `invoke({ endpoint: '/api/health', options: { method: 'GET' } })`
    ]
  ])('accepts the %s control', (_label, source) => {
    expect(inspectCrmSearchCallerSource(source, 'scripts/higher-order-control.mjs')).toEqual([])
  })

  it('ignores unrelated member fetch methods even when their argument mentions CRM search', () => {
    expect(inspectCrmSearchCallerSource(
      `logger.fetch('/api/crm/search')`,
      'scripts/logger.mjs'
    )).toEqual([])
  })

  it('honors lexical shadowing of a recognized transport alias', () => {
    const source = `
      const transport = $fetch
      {
        const transport = logger.fetch
        transport('/api/crm/search')
      }
    `
    expect(inspectCrmSearchCallerSource(source, 'app/shadowed.ts')).toEqual([])
  })

  it('does not treat a non-transport console string as a caller', () => {
    expect(inspectCrmSearchCallerSource(
      `console.log('/api/crm/search')`,
      'scripts/log-route.mjs'
    )).toEqual([])
  })

  it('scans production directories named test instead of excluding them as fixtures', () => {
    const root = mkdtempSync(join(tmpdir(), 'crm-search-caller-guard-'))
    const appFile = join(root, 'app/pages/test/search.ts')
    const serverFile = join(root, 'server/api/test/search.cjs')
    try {
      mkdirSync(join(root, 'app/pages/test'), { recursive: true })
      mkdirSync(join(root, 'server/api/test'), { recursive: true })
      writeFileSync(appFile, `$fetch('/api/crm/search')`)
      writeFileSync(serverFile, `useFetch('/api/client-portal/crm/search')`)

      expect(collectCrmSearchCallerViolations([
        join(root, 'app'),
        join(root, 'server')
      ]).map(violation => relative(root, join(process.cwd(), violation.filePath))).sort()).toEqual([
        'app/pages/test/search.ts',
        'app/pages/test/search.ts',
        'server/api/test/search.cjs',
        'server/api/test/search.cjs'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
