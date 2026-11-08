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
//   page meta, and never an import from any other module), and the stub throws
//   if it is ever rendered on the server instead of silently rendering nothing.
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
  return `export default { name: 'ServerStubbedClientOnlyPage', setup() { throw new Error(${JSON.stringify(`Client-only page was rendered on the server: ${file.split('/pages/').pop()}`)}) } }\n`
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

interface MinimalNuxt {
  options: { routeRules?: RouteRules, nitro?: { routeRules?: RouteRules } }
  hook(name: 'pages:resolved', fn: (pages: StubbablePage[]) => void): void
  hook(name: 'vite:extendConfig', fn: (config: { plugins?: unknown[] }, env: { isServer: boolean }) => void): void
}

/**
 * Inline Nuxt module. Set XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER=true to disable
 * (restores the previous server bundle exactly).
 */
export function serverStubClientOnlyPagesModule(_options: unknown, nuxt: MinimalNuxt) {
  if (process.env.XEROFLOW_KEEP_CLIENT_PAGES_IN_SERVER === 'true') return
  const files = new Set<string>()
  const stats = { stubbed: new Set<string>() }
  nuxt.hook('pages:resolved', (pages) => {
    files.clear()
    // Resolved after modules ran, so module- and nitro-provided rules are included.
    // A nitro-level rule that enables SSR always wins, keeping every page it touches.
    const routeRules: RouteRules = { ...nuxt.options.nitro?.routeRules, ...nuxt.options.routeRules }
    for (const [pattern, rule] of Object.entries(nuxt.options.nitro?.routeRules ?? {})) {
      if (rule && 'ssr' in rule && rule.ssr !== false) routeRules[pattern] = { ...routeRules[pattern], ssr: rule.ssr }
    }
    for (const file of selectClientOnlyPageFiles(pages, routeRules)) files.add(file)
    const reportPath = process.env.XEROFLOW_CLIENT_ONLY_PAGES_REPORT
    if (reportPath) {
      const routes: Array<{ path: string, file?: string }> = []
      const walk = (list: StubbablePage[], parent: string) => list.forEach((p) => {
        const full = joinPath(parent, p.path)
        routes.push({ path: full, file: p.file })
        walk(p.children ?? [], full)
      })
      walk(pages, '')
      const report = routes.map(r => ({ ...r, stubbed: !!r.file && files.has(r.file) }))
      void import('node:fs').then(fs => fs.writeFileSync(reportPath, JSON.stringify({ routeRules, routes: report }, null, 2)))
    }
  })
  nuxt.hook('vite:extendConfig', (config, { isServer }) => {
    if (!isServer) return
    config.plugins ??= []
    config.plugins.push({
      ...clientOnlyPageStubPlugin(files, stats),
      buildEnd() {
        console.info(`[client-only-pages] server bundle stubbed ${stats.stubbed.size} of ${files.size} client-only page files`)
      }
    })
  })
}
