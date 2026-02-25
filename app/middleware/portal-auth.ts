/**
 * Portal Auth Middleware (named)
 * Applied to portal pages via definePageMeta({ middleware: 'portal-auth' })
 */

export default defineNuxtRouteMiddleware(async (to, from) => {
  const { user, fetchUser } = usePortalAuth()

  if (!user.value) {
    const data = await fetchUser()
    if (!data) {
      return navigateTo({
        path: '/portal/login',
        query: { redirect: encodeURIComponent(to.fullPath) }
      })
    }
  }
})
