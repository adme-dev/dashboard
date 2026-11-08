/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_ONLY_PAGE_STUB_PREFIX,
  clientOnlyPageStubPlugin,
  clientOnlyPageStubSource,
  createSsrDisabledChecker,
  probePaths,
  selectClientOnlyPageFiles,
  serverStubClientOnlyPagesModule
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
  it('loads a server placeholder that renders an empty element and warns once', async () => {
    const source = plugin.load(CLIENT_ONLY_PAGE_STUB_PREFIX + file)!
    expect(source).toBe(clientOnlyPageStubSource(file))
    const mod = await import(`data:text/javascript,${encodeURIComponent(source.replace('import { h } from \'vue\'', 'const h = (tag) => ({ tag })'))}`)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(mod.default.setup()()).toEqual({ tag: 'div' })
    mod.default.setup()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]![0]).toContain('agency/index.vue')
    warn.mockRestore()
    expect(plugin.load('/app/pages/agency/index.vue')).toBeNull()
  })
})

describe('serverStubClientOnlyPagesModule', () => {
  function harness() {
    const hooks: Record<string, (...args: any[]) => any> = {}
    const nitroHooks: Record<string, () => void> = {}
    const nuxt = {
      hook: (name: string, fn: (...args: any[]) => any) => {
        hooks[name] = fn
      }
    }
    serverStubClientOnlyPagesModule({}, nuxt as any)
    const nitro = {
      options: { routeRules: { ...rules } as Record<string, Record<string, unknown>> },
      hooks: {
        hook: (name: string, fn: () => void) => {
          nitroHooks[name] = fn
        }
      }
    }
    const serverPlugin = () => {
      const config: { plugins?: any[] } = {}
      hooks['vite:extendConfig']!(config, { isServer: true })
      return config.plugins![0]
    }
    return { hooks, nitroHooks, nitro, serverPlugin }
  }
  const pages = [page('/agency', 'agency.vue'), page('/pricing', 'pricing.vue')]

  it('selects at server buildStart with the final Nitro rules', () => {
    const { hooks, nitro, serverPlugin } = harness()
    hooks['pages:resolved']!(pages)
    hooks['nitro:init']!(nitro)
    const plugin = serverPlugin()
    plugin.buildStart()
    expect(plugin.resolveId('/app/pages/agency.vue', '/r/.nuxt/routes.mjs')).toBe(CLIENT_ONLY_PAGE_STUB_PREFIX + '/app/pages/agency.vue')
    expect(plugin.resolveId('/app/pages/pricing.vue', '/r/.nuxt/routes.mjs')).toBeNull()
  })

  it('stubs nothing when Nitro rules are unavailable, and never touches the client build', () => {
    const { hooks, serverPlugin } = harness()
    hooks['pages:resolved']!(pages)
    const plugin = serverPlugin()
    plugin.buildStart()
    expect(plugin.resolveId('/app/pages/agency.vue', '/r/.nuxt/routes.mjs')).toBeNull()
    const client: { plugins?: any[] } = {}
    hooks['vite:extendConfig']!(client, { isServer: false })
    expect(client.plugins).toBeUndefined()
  })

  it('fails the build when Nitro rules drift after selection', () => {
    const { hooks, nitroHooks, nitro, serverPlugin } = harness()
    hooks['pages:resolved']!(pages)
    hooks['nitro:init']!(nitro)
    const plugin = serverPlugin()
    plugin.buildStart()
    plugin.resolveId('/app/pages/agency.vue', '/r/.nuxt/routes.mjs')
    expect(() => nitroHooks['rollup:before']!()).not.toThrow()
    nitro.options.routeRules['/agency'] = { ssr: true }
    expect(() => nitroHooks['rollup:before']!()).toThrow('route rules changed after selection')
  })

  it('is disabled by XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER=true', () => {
    vi.stubEnv('XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER', 'true')
    const hook = vi.fn()
    serverStubClientOnlyPagesModule({}, { hook } as any)
    expect(hook).not.toHaveBeenCalled()
    vi.unstubAllEnvs()
  })
})
