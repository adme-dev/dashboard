import { defineEventHandler } from 'h3'
import type { H3Event } from 'h3'
import { getRouteRules } from 'nitropack/runtime'

type RouteRuleLookup = (path: string) => { ssr?: unknown }

// Vue Router matches page paths case-insensitively, but Nitro route rules are
// case-sensitive. A mixed-case URL such as `/AGENCY` therefore resolved the
// client-only agency page while missing the `/agency/**` `ssr: false` rule, so
// it was server-rendered even though the canonical route never is.
//
// Serve such a case variant exactly as its canonical lowercase route is served:
// Nuxt's supported per-request `noSSR` flag returns the same SPA shell. This adds
// no route, redirect or rule. It applies only when the request's own merged rules
// do not decide `ssr` at all (an explicit `ssr: true` or `false` always wins) and
// the canonical lowercase path explicitly disables SSR.
export function shouldServeCaseVariantAsSpa(method: string, path: string, rulesFor: RouteRuleLookup): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (path.startsWith('/api/') || path.startsWith('/_') || path.startsWith('/__')) return false
  const canonical = path.toLowerCase()
  if (canonical === path) return false
  if (rulesFor(path).ssr !== undefined) return false
  return rulesFor(canonical).ssr === false
}

/** Decoded (h3 decodes event.path before middleware), query-free request path. */
export function requestPagePath(event: Pick<H3Event, 'path'>): string {
  return (event.path || '/').split('?')[0] || '/'
}

export default defineEventHandler((event) => {
  const path = requestPagePath(event)
  const rulesFor: RouteRuleLookup = candidate => candidate === path
    ? getRouteRules(event)
    : getRouteRules({ path: candidate, context: {} } as unknown as H3Event)
  if (!shouldServeCaseVariantAsSpa(event.method, path, rulesFor)) return
  const context = event.context as { nuxt?: { noSSR?: boolean } }
  context.nuxt ||= {}
  context.nuxt.noSSR = true
})
