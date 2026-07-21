export const PRERENDER_PUBLIC_EXACT_ROUTES = [
  '/pricing',
  '/terms',
  '/privacy',
  '/support',
  '/about',
  '/landing',
  '/creativity',
  '/ai-training',
  '/ai-assistants',
  '/voice-ai',
  '/sign-in'
] as const

export const PRERENDER_PUBLIC_ROUTE_ROOTS = [
  '/features',
  '/resources',
  '/platform',
  '/banner-studio'
] as const

export const NUXT_PAYLOAD_EXTRACTION = false as const

export function shouldIgnorePrerenderRoute(route: string): boolean {
  if (route === '/') return true

  if (PRERENDER_PUBLIC_EXACT_ROUTES.some(publicRoute => route === publicRoute)) {
    return false
  }

  return !PRERENDER_PUBLIC_ROUTE_ROOTS.some(
    publicRoot => route === publicRoot || route.startsWith(`${publicRoot}/`)
  )
}
