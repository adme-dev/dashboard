export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = usePortalAuth()
  if (!user.value && !await fetchUser()) {
    return navigateTo({ path: '/studio', query: { redirect: to.fullPath } })
  }
})
