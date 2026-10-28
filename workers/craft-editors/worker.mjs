import compressed from './compressed.json'

// The editors execute in the browser. This Worker only serves pinned public assets.
export default {
  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const url = new URL(request.url)
    const asset = Object.hasOwn(compressed, url.pathname) ? compressed[url.pathname] : null
    if (!asset) return env.ASSETS.fetch(request)

    // Precompressed binaries stay below the static asset limit. Stream the bytes
    // unchanged; manual encoding prevents Cloudflare from compressing them twice.
    url.pathname = asset
    url.search = ''
    const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
    if (!response.ok) return new Response('Editor asset unavailable', { status: 503 })
    const headers = new Headers(response.headers)
    headers.set('Content-Type', 'application/wasm')
    headers.set('Content-Encoding', 'br')
    headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Vary', 'Accept-Encoding')
    headers.delete('Content-Length')
    return new Response(response.body, { status: response.status, headers, encodeBody: 'manual' })
  },
}
