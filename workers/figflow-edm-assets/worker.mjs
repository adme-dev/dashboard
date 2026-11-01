// Private service only. The creative host checks the existing staff session
// before forwarding this one immutable editor path, without its credentials.
export const PREFIX = '/figflow/0.11.2-edm1/'
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
    if (url.hostname !== 'creative.xeroflow.io' || !url.pathname.startsWith(PREFIX)
      || /[%\\]/.test(url.pathname) || !env.ASSETS) return new Response('Not found', { status: 404 })
    url.search = ''
    const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store')
    headers.set('Content-Security-Policy', "frame-ancestors 'self' https://app.xeroflow.io")
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('X-Content-Type-Options', 'nosniff')
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers })
  }
}
