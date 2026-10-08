import { resolveStudioTheme, studioThemeCookie, studioThemeCookieOptions } from '~/utils/studioTheme'

export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/studio' && !to.path.startsWith('/studio/')) return
  const preference = useCookie(studioThemeCookie, studioThemeCookieOptions)
  // Force only Studio routes; the agency's existing preference stays independent.
  to.meta.colorMode = resolveStudioTheme(preference.value)
})
