import compressed from './compressed.json'
import appRoutes from './app-routes.json'
import { authorize, handleAuthRoute } from './auth.mjs'
import { handleMotorstack } from './motorstack.mjs'

// Marketing/share assets are public. Every editor file passes fresh XeroFlow authority first.
const publicFiles = new Set([
  '/', '/index.html', '/credits.html', '/social-preview.png', '/xeroflow-logo.svg',
  '/starfield.js', '/card-tilt.js', '/fonts/geist-latin-variable.woff2',
  '/manifest.webmanifest', '/xeroflow-icon-192.png', '/xeroflow-icon-512.png',
  '/xeroflow-maskable-512.png', '/apple-touch-icon.png', '/install-app.js', '/install-app.css',
  ...['photo', 'vector', 'effect', 'film', 'sound', 'fig'].map(name => '/images/' + name + 'flow.png'),
  ...['photo', 'vector', 'effect', 'film', 'sound', 'fig'].map(name => '/' + name + 'flow/manifest.webmanifest'),
])
function blocked(status, message, documentRequest, returnTo) {
  if (documentRequest) {
    const title = status === 503 ? 'Reconnecting to XeroFlow' : 'Create with XeroFlow'
    const next = '/__auth/start?return=' + encodeURIComponent(returnTo || '/')
    message = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>html{color-scheme:dark;background:#0a0b0e;color:white;font:16px/1.6 system-ui}main{max-width:460px;margin:16vh auto;padding:32px}.brand{display:flex;align-items:center;gap:12px;font-size:20px}.mark{display:grid;place-items:center;width:36px;height:36px;border-radius:8px;background:white;color:#121317;font-size:14px;font-weight:700}h1{font-size:38px;font-weight:450;letter-spacing:-1.2px;line-height:1.15;margin:38px 0 20px}p{color:#a1a1aa}a{display:inline-block;margin-top:20px;padding:10px 20px;border-radius:99px;background:white;color:#121317;text-decoration:none}small{display:block;margin-top:30px;color:#71717a}</style><main><div class="brand"><span class="mark">XF</span>XeroFlow</div><h1>${title}</h1><p>${message}</p><a href="${next}">Continue with XeroFlow</a><small>Creative Suite · Your creative tools, in one flow.</small></main></html>`
  }
  return new Response(message, { status, headers: {
    'Content-Type': documentRequest ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
  } })
}
export default {
  async fetch(request, env) {
    const authRoute = await handleAuthRoute(request, env)
    if (authRoute) return authRoute
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { Allow: 'GET, HEAD' } })
    }
    const url = new URL(request.url)
    // Upstream Effect service-worker caches are retired even for signed-out browsers.
    if (url.pathname.endsWith('/sw.js')) {
      const response = await env.ASSETS.fetch(request)
      const update = new Response(response.body, response)
      update.headers.set('Cache-Control', 'no-store')
      return update
    }
    if (publicFiles.has(url.pathname)) {
      if (url.hostname === 'xeroflow-craft-editors.adme-dev.workers.dev' && url.pathname === '/') {
        return Response.redirect('https://creative.xeroflow.io/', 302)
      }
      return env.ASSETS.fetch(request)
    }
    const access = await authorize(request, env)
    if (!access.ok) {
      if ([401, 403].includes(access.status) && request.method === 'GET' && (request.headers.get('Sec-Fetch-Dest') === 'document' || request.headers.get('Accept')?.includes('text/html'))) {
        const login = new URL('/__auth/start', url.origin)
        login.searchParams.set('return', url.pathname + url.search)
        return new Response(null, {status: 303, headers: {Location: login.href, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer'}})
      }
      return blocked(access.status, access.status === 503 ? 'XeroFlow could not verify access. Please try again shortly.' : 'Sign in with an authorised XeroFlow account to use the creative editors.', request.headers.get('Sec-Fetch-Dest') === 'document' || request.headers.get('Accept')?.includes('text/html'), url.pathname + url.search)
    }
    const assetsResponse = await handleMotorstack(request, env)
    if (assetsResponse) return assetsResponse
    if (Object.hasOwn(appRoutes, url.pathname)) {
      url.pathname = appRoutes[url.pathname]
      return Response.redirect(url.href, 302)
    }
    const asset = Object.hasOwn(compressed, url.pathname) ? compressed[url.pathname] : null
    if (!asset) {
      const response = await env.ASSETS.fetch(request)
      const privateResponse = new Response(response.body, response)
      privateResponse.headers.set('Cache-Control', 'private, no-store')
      privateResponse.headers.set('Referrer-Policy', 'no-referrer')
      return privateResponse
    }

    // Precompressed binaries stay below the static asset limit. Stream the bytes
    // unchanged; manual encoding prevents Cloudflare from compressing them twice.
    url.pathname = asset
    url.search = ''
    const response = await env.ASSETS.fetch(new Request(url, { method: request.method }))
    if (!response.ok) return new Response('Editor asset unavailable', { status: 503 })
    const headers = new Headers(response.headers)
    headers.set('Content-Type', 'application/wasm')
    headers.set('Content-Encoding', 'br')
    headers.set('Cache-Control', 'private, no-store')
    headers.set('X-Content-Type-Options', 'nosniff')
    headers.set('Vary', 'Accept-Encoding')
    headers.delete('Content-Length')
    return new Response(response.body, { status: response.status, headers, encodeBody: 'manual' })
  },
}
