// The folder page is a client-rendered shell. Start the normal cookie-authenticated
// session check during HTML parsing so the creative route guard can consume it.
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:html', (html, { event }) => {
    if (!/^\/agency\/banner-studio\/folders(?:\/|$)/.test(getRequestURL(event).pathname)) return
    // Header-only sessions must keep their original authenticated request.
    if (!getCookie(event, 'auth_token') && !getCookie(event, 'auth_token_client')) return
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    html.head.unshift('<link rel="preload" as="fetch" href="/api/auth/me" crossorigin>')
  })
})
