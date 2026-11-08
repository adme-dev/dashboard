import { describe, expect, it } from 'vitest'
import {
  CLIENT_ONLY_PAGE_STUB_PREFIX,
  clientOnlyPageStubPlugin,
  clientOnlyPageStubSource,
  createSsrDisabledChecker,
  probePaths,
  selectClientOnlyPageFiles
} from '../../lib/build/clientOnlyPageStubs'

const rules = {
  '/pricing': { prerender: true },
  '/features/**': { prerender: true },
  '/agency': { ssr: false },
  '/agency/**': { ssr: false },
  '/office': { ssr: false },
  '/portal/**': { ssr: false },
  '/portal/public/**': { ssr: true },
  '/q/**': { proxy: '/api/q/**' }
}

const page = (path: string, file: string, extra: Record<string, unknown> = {}) => ({ path, file: `/app/pages/${file}`, ...extra })

describe('probePaths', () => {
  it('expands static, dynamic, optional and catch-all segments', () => {
    expect(probePaths('/agency/leads')).toEqual(['/agency/leads'])
    expect(probePaths('/agency/leads/:id()')).toEqual(['/agency/leads/probe'])
    expect(probePaths('/office/:id?')).toEqual(['/office/probe', '/office'])
    expect(probePaths('/:slug(.*)*')).toEqual(['/probe', '/probe/deep/nested', '/'])
  })
})

describe('createSsrDisabledChecker', () => {
  const isClientOnly = createSsrDisabledChecker(rules)
  it('accepts routes whose every probe merges to ssr:false', () => {
    expect(isClientOnly('/agency')).toBe(true)
    expect(isClientOnly('/agency/boards/:id()')).toBe(true)
  })
  it('rejects public, prerendered, unruled and partially covered routes', () => {
    expect(isClientOnly('/pricing')).toBe(false)
    expect(isClientOnly('/features/:slug()')).toBe(false)
    expect(isClientOnly('/')).toBe(false)
    expect(isClientOnly('/q/:code()')).toBe(false)
    // '/office' exact covers only the bare path; the optional param's '/office/probe' is unruled.
    expect(isClientOnly('/office/:id?')).toBe(false)
    // catch-all can produce '/' which is SSR.
    expect(isClientOnly('/:slug(.*)*')).toBe(false)
  })
  it('rejects a dynamic route when a more specific rule re-enables SSR underneath it', () => {
    expect(isClientOnly('/portal/:section()')).toBe(false)
    expect(isClientOnly('/portal/:section()/:id()')).toBe(false)
    expect(isClientOnly('/portal/private/settings')).toBe(true)
  })
})

describe('selectClientOnlyPageFiles', () => {
  it('selects only files whose own route, aliases and descendants are all client-only', () => {
    const selected = selectClientOnlyPageFiles([
      page('/agency', 'agency.vue', { children: [page('', 'agency/index.vue'), page('leads/:id()', 'agency/leads/[id].vue')] }),
      page('/pricing', 'pricing.vue'),
      page('/agency/aliased', 'agency/aliased.vue', { alias: '/pricing-alias' }),
      page('/agency/views', 'agency/views.vue', { components: { sidebar: 'x' } }),
      page('/agency/island', 'agency/island.vue', { mode: 'server' }),
      page('/portal/public/docs', 'portal/docs.vue')
    ], rules)
    expect([...selected].sort()).toEqual([
      '/app/pages/agency.vue',
      '/app/pages/agency/index.vue',
      '/app/pages/agency/leads/[id].vue'
    ])
  })
  it('keeps a parent whose descendant is server-rendered', () => {
    const selected = selectClientOnlyPageFiles([
      page('/agency', 'agency.vue', { children: [page('/pricing', 'pricing.vue')] })
    ], rules)
    expect(selected.size).toBe(0)
  })
  it('keeps a file shared with any non-client-only page', () => {
    const selected = selectClientOnlyPageFiles([
      page('/agency/a', 'shared.vue'),
      page('/pricing', 'shared.vue')
    ], rules)
    expect(selected.size).toBe(0)
  })
})

describe('clientOnlyPageStubPlugin', () => {
  const file = '/app/pages/agency/index.vue'
  const plugin = clientOnlyPageStubPlugin(new Set([file]), { stubbed: new Set() })
  it('stubs only the generated router import without a query', () => {
    expect(plugin.resolveId(file, '/repo/.nuxt/routes.mjs')).toBe(CLIENT_ONLY_PAGE_STUB_PREFIX + file)
    expect(plugin.resolveId(`${file}?macro=true`, '/repo/.nuxt/routes.mjs')).toBeNull()
    expect(plugin.resolveId(file, '/repo/app/components/Thing.vue')).toBeNull()
    expect(plugin.resolveId(file, undefined)).toBeNull()
    expect(plugin.resolveId('/app/pages/pricing.vue', '/repo/.nuxt/routes.mjs')).toBeNull()
  })
  it('loads a stub that fails loudly if ever rendered on the server', async () => {
    const source = plugin.load(CLIENT_ONLY_PAGE_STUB_PREFIX + file)!
    expect(source).toBe(clientOnlyPageStubSource(file))
    const mod = await import(`data:text/javascript,${encodeURIComponent(source)}`)
    expect(() => mod.default.setup()).toThrow('Client-only page was rendered on the server: agency/index.vue')
    expect(plugin.load('/app/pages/agency/index.vue')).toBeNull()
  })
})
