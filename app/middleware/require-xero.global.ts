export default defineNuxtRouteMiddleware(async (to) => {
  // All financial data pages now require Xero connection
  const protectedPaths = ['/dashboard', '/expenses', '/reports', '/invoices', '/cashflow', '/insights', '/anomalies', '/recommendations', '/chat']
  const isProtected = protectedPaths.some(p => to.path === p || to.path.startsWith(`${p}/`))
  
  if (!isProtected) return

  const { data } = await useFetch('/api/xero/status')
  
  // Redirect to settings if not connected to Xero
  if (!data.value?.connected) {
    return navigateTo('/settings')
  }
})
