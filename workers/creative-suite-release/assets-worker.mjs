import inventory from './inventory.json' with { type: 'json' }
import compressed from './compressed.json' with { type: 'json' }

export default {
  async fetch(request, env) {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', { status: 405 })
    const url = new URL(request.url)
    if (/%|\\/.test(url.pathname)) return new Response('Not found', { status: 404 })
    let path = url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname
    const encoded = Object.hasOwn(compressed, path) ? compressed[path] : null
    path = encoded || path
    if (!Object.hasOwn(inventory, path) || (path.endsWith('.br') && !encoded)) return new Response('Not found', { status: 404 })
    url.pathname = path
    url.search = ''
    const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
    if (!response.ok) return new Response('Asset unavailable', { status: 503 })
    const headers = new Headers(response.headers)
    headers.set('Cache-Control', 'private, no-store')
    headers.set('Referrer-Policy', 'no-referrer')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Content-Security-Policy', "frame-ancestors 'self' https://app.xeroflow.io")
    if (encoded) {
      headers.set('Content-Type', 'application/wasm')
      headers.set('Content-Encoding', 'br')
      headers.set('Vary', 'Accept-Encoding')
      headers.delete('Content-Length')
    }
    return new Response(request.method === 'HEAD' ? null : response.body, { status: response.status, headers, ...(encoded ? { encodeBody: 'manual' } : {}) })
  }
}
