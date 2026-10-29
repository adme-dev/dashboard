import { bannerThemeCookie, bannerThemeCookieOptions, isBannerStudioRoute, resolveBannerTheme } from '~/utils/banner-theme'

export default defineNuxtRouteMiddleware((to) => {
  if (!isBannerStudioRoute(to.path)) return
  const preference = useCookie(bannerThemeCookie, bannerThemeCookieOptions)
  to.meta.colorMode = resolveBannerTheme(preference.value)
})
