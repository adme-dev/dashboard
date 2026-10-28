// Registered-user authority stays with XeroFlow. This Worker never verifies JWT claims itself.
const APP_ORIGIN = 'https://app.xeroflow.io'
const CREATIVE_ORIGINS = Object.freeze([
  'https://creative.xeroflow.io',
  'https://xeroflow-creative-tools.adme-dev.workers.dev',
  'https://xeroflow-craft-editors.adme-dev.workers.dev',
])
export const CREATIVE_ALLOWED_EMAILS = Object.freeze([
  'paul@adme.net.au', 'robert@adme.net.au', 'tina@adme.net.au', 'kristi@adme.net.au',
])
const SESSION = '__Host-xf_creative_session'
const STATE = '__Host-xf_creative_state'
const STATE_LIFETIME = 600
const encoder = new TextEncoder()
const decoder = new TextDecoder()
const NO_STORE = { 'Cache-Control': 'no-store, private', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }

function reply(status, body = null, extra = {}) {
  return new Response(body, { status, headers: { ...NO_STORE, ...extra } })
}
function cookieValue(request, name) {
  const found = (request.headers.get('Cookie') || '').split(';').map(x => x.trim()).filter(x => x.startsWith(name + '='))
  if (found.length !== 1) return null
  try { return decodeURIComponent(found[0].slice(name.length + 1)) } catch { return null }
}
// Match the canonical main-app cookie precedence without accepting duplicate credentials.
// Only the exact APP_ORIGIN bridge invokes this; creative endpoints never accept main cookies.
function mainSessionToken(request) {
  const cookies = (request.headers.get('Cookie') || '').split(';').map(value => value.trim())
  for (const name of ['auth_token', 'auth_token_client']) {
    const matches = cookies.filter(value => value.startsWith(name + '='))
    if (matches.length > 1) return null
    if (matches.length === 1) {
      const value = cookieValue(request, name)
      if (value === null) return null
      if (value) return value
    }
  }
  return null
}
function cookie(name, value, age) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`
}
function redirect(location, cookies = []) {
  const headers = new Headers({ ...NO_STORE, Location: location })
  for (const value of cookies) headers.append('Set-Cookie', value)
  return new Response(null, { status: 303, headers })
}
function b64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}
function unb64(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid encoding')
  const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - value.length % 4) % 4))
  return Uint8Array.from(binary, c => c.charCodeAt(0))
}
async function keyFor(env) {
  const raw = unb64(env?.CREATIVE_AUTH_KEY)
  if (raw.length !== 32) throw new Error('Auth key unavailable')
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
async function seal(key, purpose, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('xf-creative/v1/' + purpose) }, key, encoder.encode(JSON.stringify(data))))
  const bytes = new Uint8Array(iv.length + encrypted.length)
  bytes.set(iv); bytes.set(encrypted, iv.length)
  return b64(bytes)
}
async function open(key, purpose, value) {
  if (!value || value.length > 8192) throw new Error('Invalid envelope')
  const bytes = unb64(value)
  if (bytes.length < 29) throw new Error('Invalid envelope')
  const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode('xf-creative/v1/' + purpose) }, key, bytes.slice(12))
  return JSON.parse(decoder.decode(clear))
}
function alive(data, now, lifetime) {
  return Number.isInteger(data?.iat) && Number.isInteger(data?.exp) && data.iat <= now + 5 && data.exp > now && data.exp - data.iat === lifetime
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const x = encoder.encode(a), y = encoder.encode(b)
  let mismatch = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) mismatch |= (x[i] || 0) ^ (y[i] || 0)
  return mismatch === 0
}
function safeReturn(value, origin) {
  if (typeof value !== 'string' || value.length > 2048 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/'
  try {
    const url = new URL(value, origin)
    if (url.origin !== origin || (url.pathname !== '/' && !/^\/(?:photo|vector|effect|film|sound|fig)(?:flow|craft)(?:\/|$)/.test(url.pathname))) return '/'
    return url.pathname + url.search + url.hash
  } catch { return '/' }
}
async function boundedJSON(response) {
  if (!response.body || Number(response.headers.get('Content-Length')) > 65536) throw new Error('Invalid authority response')
  const reader = response.body.getReader(); let count = 0; const chunks = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      count += value.length
      if (count > 65536) throw new Error('Invalid authority response')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  const bytes = new Uint8Array(count); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return JSON.parse(decoder.decode(bytes))
}

// Explicit dependency injection is only a test API. Production exports always use global fetch.
export function createAuth({ fetcher = (...args) => fetch(...args), now = () => Math.floor(Date.now() / 1000) } = {}) {
  async function authority(token) {
    if (typeof token !== 'string' || !token || token.length > 4096 || /[\r\n]/.test(token)) return { ok: false, status: 401 }
    try {
      const response = await fetcher(APP_ORIGIN + '/api/auth/me', {
        method: 'GET', headers: { Authorization: 'Bearer ' + token, Accept: 'application/json', 'Cache-Control': 'no-cache' },
        redirect: 'manual', cache: 'no-store', signal: AbortSignal.timeout(8000),
      })
      if (response.status === 401) return { ok: false, status: 401 }
      if (response.status === 403) return { ok: false, status: 403 }
      if (response.status !== 200) return { ok: false, status: 503 }
      const data = await boundedJSON(response)
      if (data?.success !== true || typeof data.user?.id !== 'string' || !data.user.id || typeof data.user?.email !== 'string') return { ok: false, status: 503 }
      if (data.user.is_active !== true || !CREATIVE_ALLOWED_EMAILS.includes(data.user.email.trim().toLowerCase())) return { ok: false, status: 403 }
      return { ok: true, status: 204 }
    } catch { return { ok: false, status: 503 } }
  }
  async function authorize(request, env) {
    const url = new URL(request.url)
    if (!CREATIVE_ORIGINS.includes(url.origin)) return { ok: false, status: 403 }
    try { await keyFor(env) } catch { return { ok: false, status: 503 } }
    return authority(cookieValue(request, SESSION))
  }
  function loginPage(url, status) {
    const resume = new URL(url); resume.searchParams.delete('check')
    const check = new URL(resume); check.searchParams.set('check', '1')
    const esc = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
    const nonce = b64(crypto.getRandomValues(new Uint8Array(18)))
    const denied = status === 403
    const message = denied ? 'This XeroFlow account does not have access to Creative Suite.' : status === 503 ? 'XeroFlow could not verify your session. Please try again shortly.' : 'Sign in with your existing XeroFlow account to open Creative Suite.'
    const embedded = status === 401
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · XeroFlow Creative</title><style>html{color-scheme:dark;font:15px/1.6 system-ui;background:#0a0b0e;color:white}body{margin:0}main{max-width:${embedded ? '1000' : '520'}px;margin:${embedded ? '24px' : '12vh'} auto;padding:20px}header{display:flex;align-items:center;gap:12px}.mark{display:inline-grid;place-items:center;width:36px;height:36px;background:white;color:#121317;border-radius:8px;font-weight:700}header strong{font-size:18px;font-weight:500}h1{font-size:clamp(25px,4vw,38px);line-height:1.2;font-weight:500;letter-spacing:-.03em;margin:28px 0 12px}p,small{color:#a1a1aa}a{color:white}.actions{display:flex;flex-wrap:wrap;align-items:center;gap:16px}.action{display:inline-block;background:white;color:#121317;padding:9px 18px;border-radius:24px;text-decoration:none}.continue{padding:10px 0}iframe{display:block;width:100%;height:min(720px,75vh);min-height:570px;border:1px solid #27272a;border-radius:16px;background:#0a0b0e;margin:18px 0}small{display:block;margin-top:12px}@media(max-width:600px){main{padding:14px;margin:10px auto}iframe{min-height:650px;height:80vh}}</style><main><header><span class="mark">XF</span><strong>XeroFlow Creative Suite</strong></header><h1>Design your world with XeroFlow</h1><p>${message}</p>${embedded ? '<iframe src="/auth/login/" title="Sign in to XeroFlow" referrerpolicy="no-referrer"></iframe>' : ''}<div class="actions"><a class="action" href="${APP_ORIGIN}/auth/login/" target="_blank" rel="noopener noreferrer">${embedded ? 'Open sign-in in a new tab' : 'Sign in to XeroFlow'}</a><a class="continue" href="${esc(resume.href)}">Continue</a></div><small>${embedded ? 'Use your usual XeroFlow sign-in above. If it does not load, open sign-in in a new tab.' : 'After signing in, return here.'} Access will continue automatically.</small><p role="status" id="status"></p></main><script nonce="${nonce}">const target=${JSON.stringify(check.href)},resume=${JSON.stringify(resume.href)};let busy=false;async function verify(){if(busy)return;busy=true;try{const r=await fetch(target,{credentials:'same-origin',cache:'no-store',redirect:'error'});if(r.status===204)location.replace(resume)}catch{}finally{busy=false}}const timer=setInterval(verify,2500);window.addEventListener('focus',verify);setTimeout(()=>{clearInterval(timer);document.getElementById('status').textContent='If this sign-in has expired, return to Creative Suite and start again.'},600000);</script></html>`
    return reply(denied ? 403 : status === 503 ? 503 : 200, html, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src 'self'; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'` })
  }
  async function handleAuthRoute(request, env) {
    const url = new URL(request.url)
    if (url.origin === APP_ORIGIN) {
      if (url.pathname !== '/creative-launch' && url.pathname !== '/creative-launch/') return reply(404, 'Not found')
      if (request.method !== 'GET') return reply(405, 'Method not allowed', { Allow: 'GET' })
      const origin = url.searchParams.get('origin'), state = url.searchParams.get('state')
      if (!CREATIVE_ORIGINS.includes(origin) || !/^[A-Za-z0-9_-]{43}$/.test(state || '')) return reply(400, 'Invalid sign-in request')
      let key
      try { key = await keyFor(env) } catch { return reply(503, 'Sign-in temporarily unavailable') }
      const token = mainSessionToken(request)
      const result = await authority(token)
      if (url.searchParams.get('check') === '1') return reply(result.status)
      if (!result.ok) return loginPage(url, result.status)
      const timestamp = now()
      const ticket = await seal(key, 'ticket', { token, state, origin, iat: timestamp, exp: timestamp + 120 })
      const callback = new URL('/__auth/callback', origin); callback.searchParams.set('ticket', ticket)
      return redirect(callback.href)
    }
    if (!CREATIVE_ORIGINS.includes(url.origin)) return reply(403, 'Host not allowed')
    if (!url.pathname.startsWith('/__auth/')) return null
    if (url.pathname === '/__auth/logout') {
      if (request.method !== 'POST') return reply(405, 'Method not allowed', { Allow: 'POST' })
      if (request.headers.get('Origin') !== url.origin) return reply(403, 'Request origin not allowed')
      const headers = new Headers(NO_STORE); headers.append('Set-Cookie', cookie(SESSION, '', 0)); headers.append('Set-Cookie', cookie(STATE, '', 0))
      return new Response(null, { status: 204, headers })
    }
    if (request.method !== 'GET') return reply(405, 'Method not allowed', { Allow: 'GET' })
    if (url.pathname === '/__auth/session') {
      const result = await authorize(request, env)
      return reply(result.status)
    }
    let key
    try { key = await keyFor(env) } catch { return reply(503, 'Sign-in temporarily unavailable') }
    if (url.pathname === '/__auth/start') {
      const state = b64(crypto.getRandomValues(new Uint8Array(32))), timestamp = now()
      const encoded = await seal(key, 'state', { origin: url.origin, state, returnPath: safeReturn(url.searchParams.get('return') || '/', url.origin), iat: timestamp, exp: timestamp + STATE_LIFETIME })
      const launch = new URL('/creative-launch', APP_ORIGIN); launch.searchParams.set('origin', url.origin); launch.searchParams.set('state', state)
      return redirect(launch.href, [cookie(STATE, encoded, STATE_LIFETIME)])
    }
    if (url.pathname === '/__auth/callback') {
      try {
        const stored = await open(key, 'state', cookieValue(request, STATE))
        const ticket = await open(key, 'ticket', url.searchParams.get('ticket'))
        if (!alive(stored, now(), STATE_LIFETIME) || !alive(ticket, now(), 120) || stored.origin !== url.origin || ticket.origin !== url.origin || !equal(stored.state, ticket.state)) throw new Error('Invalid handoff')
        const result = await authority(ticket.token)
        if (!result.ok) return reply(result.status, 'XeroFlow could not authorize this account')
        return redirect(new URL(safeReturn(stored.returnPath, url.origin), url.origin).href, [cookie(SESSION, ticket.token, 8 * 60 * 60), cookie(STATE, '', 0)])
      } catch { return reply(401, 'Sign-in expired. Open Creative Suite and sign in again.', { 'Set-Cookie': cookie(STATE, '', 0) }) }
    }
    return reply(404, 'Not found')
  }
  return { authorize, handleAuthRoute }
}
const production = createAuth()
export const authorize = production.authorize
export const handleAuthRoute = production.handleAuthRoute
