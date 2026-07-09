export default defineEventHandler((event) => {
  const { pathname } = getRequestURL(event)

  if (pathname === '/admin/connections/integrations') {
    return sendRedirect(event, '/agency/dealer-feeds', 302)
  }
})
