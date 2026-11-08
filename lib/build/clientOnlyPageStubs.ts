// Build-time helper: keep page components whose every route is served as the
// client-only SPA shell out of the Cloudflare Pages server bundle.
//
// Nitro never executes these modules: for a route whose merged route rules
// resolve to `ssr: false`, the Nuxt renderer returns the SPA template without
// creating the Vue app. Their compiled SSR output still occupies the immutable
// Pages Worker budget because the generated router imports every page file.
//
// The selection is deliberately fail-closed:
// - coverage is computed with the same radix3 `matchAll` + defu merge Nitro uses
//   at runtime, for every route that renders the file (its own route, aliases
//   and every descendant route), with concrete probes for dynamic segments;
// - any rule that explicitly sets `ssr` to anything other than `false` underneath
//   a dynamic route's static prefix disqualifies it;
// - a file used by any page that is not proven client-only is kept;
// - pages with named views or server/island mode are kept;
// - only the generated router's plain import is replaced (never `?macro=true`
//   page meta, and never an import from any other module).
// - selection uses Nitro's final route rules at the start of the server bundle
//   and is re-verified against the rules Nitro serializes; a mismatch fails the build.
//
// Vue Router matches paths case-insensitively while Nitro route rules do not, so
// e.g. `/AGENCY` is still server-rendered. The stub therefore renders the same
// empty placeholder Nuxt uses for client-only pages on the server (the client then
// renders the real page) and logs a warning, rather than failing the request.
import { createRouter as createRadixRouter, toRouteMatcher } from 'radix3'
import defu from 'defu'

export interface StubbablePage {
  path: string
  file?: string
  mode?: string
  alias?: string | string[]
  components?: Record<string, unknown>
  children?: StubbablePage[]
}

type RouteRules = Record<string, Record<string, unknown>>

const PARAM = /:([A-Za-z0-9_]+)(\([^)]*\))?([?*+]?)/g

/** Concrete URLs that a vue-router path pattern can produce, incl. optional/catch-all edges. */
export function probePaths(pattern: string): string[] {
  let variants = ['']
  const segments = pattern.split('/').filter(segment => segment.length > 0)
  for (const segment of segments) {
    PARAM.lastIndex = 0
    const match = PARAM.exec(segment)
    if (!match) {
      variants = variants.map(v => `${v}/${segment}`)
      continue
    }
    const repeat = match[3]
    const sample = segment.replace(PARAM, 'probe')
    const next: string[] = []
    for (const v of variants) {
      next.push(`${v}/${sample}`)
      if (repeat === '*' || repeat === '+' || (match[2] ?? '').includes('.*')) next.push(`${v}/${sample}/deep/nested`)
      if (repeat === '?' || repeat === '*') next.push(v)
    }
    variants = next
  }
  return [...new Set(variants.map(v => v || '/'))]
}

function staticPrefix(pattern: string): string {
  const index = pattern.search(/:/)
  return index < 0 ? pattern : pattern.slice(0, index)
}

function joinPath(parent: string, child: string): string {
  if (child.startsWith('/')) return child
  if (!child) return parent || '/'
  return `${parent.replace(/\/$/, '')}/${child}`
}

export function createSsrDisabledChecker(routeRules: RouteRules) {
  const matcher = toRouteMatcher(createRadixRouter({ routes: routeRules }))
  const ssrOverrides = Object.entries(routeRules)
    .filter(([, rule]) => rule && 'ssr' in rule && rule.ssr !== false)
    .map(([pattern]) => pattern)

  return function isClientOnlyRoute(pattern: string): boolean {
    for (const path of probePaths(pattern)) {
      const merged = defu({}, ...matcher.matchAll(path).reverse()) as { ssr?: unknown }
      if (merged.ssr !== false) return false
    }
    if (pattern.includes(':')) {
      const prefix = staticPrefix(pattern)
      // Broader rules are already merged by matchAll above; a more specific rule
      // under the dynamic part could re-enable SSR for URLs the probes missed.
      if (ssrOverrides.some(rule => rule.startsWith(prefix))) return false
    }
    return true
  }
}

/** Returns the absolute page files that can be stubbed out of the server bundle. */
export function selectClientOnlyPageFiles(pages: StubbablePage[], routeRules: RouteRules): Set<string> {
  const isClientOnlyRoute = createSsrDisabledChecker(routeRules)
  const verdict = new Map<string, boolean>()

  const visit = (page: StubbablePage, parentPath: string): string[] => {
    const fullPath = joinPath(parentPath, page.path)
    const aliases = (Array.isArray(page.alias) ? page.alias : page.alias ? [page.alias] : []).map(alias => joinPath(parentPath, alias))
    const descendantPaths = (page.children ?? []).flatMap(child => visit(child, fullPath))
    const rendersFor = [fullPath, ...aliases, ...descendantPaths]
    if (page.file) {
      const eligible = !page.components && page.mode !== 'server' && page.mode !== 'client'
        && rendersFor.every(isClientOnlyRoute)
      verdict.set(page.file, (verdict.get(page.file) ?? true) && eligible)
    }
    return rendersFor
  }
  for (const page of pages) visit(page, '')
  return new Set([...verdict].filter(([, ok]) => ok).map(([file]) => file))
}

export const CLIENT_ONLY_PAGE_STUB_PREFIX = '\0client-only-page-stub:'

export function clientOnlyPageStubSource(file: string): string {
  const page = JSON.stringify(file.split('/pages/').pop())
  return `import { h } from 'vue'
let warned = false
export default {
  name: 'ServerStubbedClientOnlyPage',
  setup() {
    if (!warned) { warned = true; console.warn('[client-only-pages] server placeholder rendered for ' + ${page} + ' (non-canonical path casing or rule drift)') }
    return () => h('div')
  }
}
`
}

export function isGeneratedRoutesModule(importer: string | undefined): boolean {
  if (!importer) return false
  const id = importer.split('?')[0]!
  return /(^|[/\\])routes\.m?js$/.test(id) || /virtual:nuxt:.*routes/.test(id)
}

/** Vite plugin for the server build only. `files` is filled by the `pages:resolved` hook. */
export function clientOnlyPageStubPlugin(files: Set<string>, stats: { stubbed: Set<string> }) {
  return {
    name: 'xeroflow:server-stub-client-only-pages',
    enforce: 'pre' as const,
    resolveId(source: string, importer: string | undefined) {
      if (source.includes('?') || !files.has(source) || !isGeneratedRoutesModule(importer)) return null
      stats.stubbed.add(source)
      return CLIENT_ONLY_PAGE_STUB_PREFIX + source
    },
    load(id: string) {
      if (!id.startsWith(CLIENT_ONLY_PAGE_STUB_PREFIX)) return null
      return clientOnlyPageStubSource(id.slice(CLIENT_ONLY_PAGE_STUB_PREFIX.length))
    }
  }
}

interface MinimalNitro {
  options: { routeRules?: RouteRules }
  hooks: { hook(name: 'rollup:before', fn: () => void): void }
}

interface MinimalNuxt {
  hook(name: 'pages:resolved', fn: (pages: StubbablePage[]) => void): void
  hook(name: 'nitro:init', fn: (nitro: MinimalNitro) => void): void
  hook(name: 'vite:extendConfig', fn: (config: { plugins?: unknown[] }, env: { isServer: boolean }) => void): void
}

/**
 * Inline Nuxt module. Set XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER=true to disable
 * (restores the previous server bundle exactly).
 */
export function serverStubClientOnlyPagesModule(_options: unknown, nuxt: MinimalNuxt) {
  if (process.env.XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER === 'true') return
  let pages: StubbablePage[] | null = null
  let nitro: MinimalNitro | null = null
  const files = new Set<string>()
  const stats = { stubbed: new Set<string>() }
  const select = () => (pages && nitro ? selectClientOnlyPageFiles(pages, nitro.options.routeRules ?? {}) : new Set<string>())

  nuxt.hook('pages:resolved', (resolved) => {
    pages = resolved
  })
  nuxt.hook('nitro:init', (instance) => {
    nitro = instance
    // Nitro serializes these rules into the runtime after the Vite server build.
    // Any stubbed page that would no longer be client-only under them fails the build.
    instance.hooks.hook('rollup:before', () => {
      const final = select()
      const drifted = [...stats.stubbed].filter(file => !final.has(file))
      if (drifted.length) throw new Error(`[client-only-pages] route rules changed after selection; rebuild without stubbing: ${drifted.join(', ')}`)
    })
  })
  nuxt.hook('vite:extendConfig', (config, { isServer }) => {
    if (!isServer) return
    config.plugins ??= []
    config.plugins.push({
      ...clientOnlyPageStubPlugin(files, stats),
      buildStart() {
        // Select with Nitro's final rules (after modules and inline page rules); no Nitro → nothing stubbed.
        files.clear()
        stats.stubbed.clear()
        for (const file of select()) files.add(file)
        writeReport(pages ?? [], nitro?.options.routeRules ?? {}, files)
      },
      buildEnd() {
        console.info(`[client-only-pages] server bundle stubbed ${stats.stubbed.size} of ${files.size} client-only page files`)
      }
    })
  })
}

function writeReport(pages: StubbablePage[], routeRules: RouteRules, files: Set<string>) {
  const reportPath = process.env.XEROFLOW_CLIENT_ONLY_PAGES_REPORT
  if (!reportPath) return
  const routes: Array<{ path: string, file?: string, stubbed: boolean }> = []
  const walk = (list: StubbablePage[], parent: string) => list.forEach((page) => {
    const full = joinPath(parent, page.path)
    routes.push({ path: full, file: page.file, stubbed: !!page.file && files.has(page.file) })
    walk(page.children ?? [], full)
  })
  walk(pages, '')
  void import('node:fs').then(fs => fs.writeFileSync(reportPath, JSON.stringify({ routeRules, routes }, null, 2)))
}
