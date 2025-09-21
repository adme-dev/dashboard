export default defineNuxtRouteMiddleware(async (to) => {
  const protectedPaths = ['/reports', '/invoices', '/expenses', '/cashflow', '/insights', '/anomalies', '/recommendations', '/chat']
  const isProtected = protectedPaths.some(p => to.path === p || to.path.startsWith(`${p}/`))
  if (!isProtected) return

  const { data } = await useFetch('/api/xero/status')
  if (!data.value?.connected) {
    return navigateTo('/settings')
  }
})
