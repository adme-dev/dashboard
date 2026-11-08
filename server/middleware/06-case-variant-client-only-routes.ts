import { defineEventHandler, getRequestURL } from 'h3'
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
// no route, redirect or rule; it only applies when the request's own rules leave
// SSR enabled and the canonical lowercase path explicitly disables it.
export function shouldServeCaseVariantAsSpa(method: string, pathname: string, rulesFor: RouteRuleLookup): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false
  if (pathname.startsWith('/api/') || pathname.startsWith('/_') || pathname.startsWith('/__')) return false
  const canonical = pathname.toLowerCase()
  if (canonical === pathname) return false
  if (rulesFor(pathname).ssr === false) return false
  return rulesFor(canonical).ssr === false
}

export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)
  const rulesFor: RouteRuleLookup = path => path === pathname
    ? getRouteRules(event)
    : getRouteRules({ path, context: {} } as unknown as H3Event)
  if (!shouldServeCaseVariantAsSpa(event.method, pathname, rulesFor)) return
  const context = event.context as { nuxt?: { noSSR?: boolean } }
  context.nuxt ||= {}
  context.nuxt.noSSR = true
})
