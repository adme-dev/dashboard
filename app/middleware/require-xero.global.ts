export default defineNuxtRouteMiddleware(async (to) => {
  // Financial data pages that require Xero connection (dashboard excluded — it handles disconnected state with Demo Mode)
  const protectedPaths = ['/expenses', '/reports', '/invoices', '/cashflow', '/insights', '/anomalies', '/recommendations', '/chat']
  const isProtected = protectedPaths.some(p => to.path === p || to.path.startsWith(`${p}/`))
  
  if (!isProtected) return

  const { data } = await useFetch('/api/xero/status')
  
  // Redirect to settings if not connected to Xero
  if (!data.value?.connected) {
    return navigateTo('/settings')
  }
})
