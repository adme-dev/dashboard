import test from 'node:test'
import assert from 'node:assert/strict'
import { createAuth, CREATIVE_ALLOWED_EMAILS } from './auth.mjs'

const CREATIVE = 'https://creative.xeroflow.io'
const APP = 'https://app.xeroflow.io'
const env = { CREATIVE_AUTH_KEY: Buffer.alloc(32, 71).toString('base64url') }
function harness() {
  let clock = 1800000000
  const calls = []
  const users = new Map(CREATIVE_ALLOWED_EMAILS.map((email, i) => ['token-' + i, { id: 'user-' + i, email, is_active: true }]))
  let responseOverride = null
  const api = createAuth({
    now: () => clock,
    fetcher: async (url, init) => {
      assert.equal(url, APP + '/api/auth/me')
      assert.equal(init.method, 'GET')
      assert.equal(init.redirect, 'manual')
      assert.equal(init.cache, 'no-store')
      assert.equal(init.headers.Cookie, undefined)
      assert.equal(init.headers['X-User-Email'], undefined)
      calls.push(init)
      if (responseOverride) return responseOverride()
      const user = users.get(init.headers.Authorization.slice(7))
      return user ? Response.json({ success: true, user }) : new Response(null, { status: 401 })
    },
  })
  return { api, users, calls, advance: n => { clock += n }, override: fn => { responseOverride = fn } }
}
function req(path, options = {}, origin = CREATIVE) { return new Request(origin + path, options) }
function setCookie(response, name) {
  const value = response.headers.getSetCookie().find(x => x.startsWith(name + '='))
  assert.ok(value, `Missing ${name}`)
  assert.match(value, /Path=\/; HttpOnly; Secure; SameSite=Lax/)
  return value.split(';')[0]
}
async function handoff(h, token = 'token-0', returnPath = '/photoflow/0.16.0-flow1/?demo=1') {
  const start = await h.api.handleAuthRoute(req('/__auth/start?return=' + encodeURIComponent(returnPath)), env)
  assert.equal(start.status, 303)
  const stateCookie = setCookie(start, '__Host-xf_creative_state')
  const location = start.headers.get('Location')
  assert.equal(new URL(location).origin, APP)
  const bridge = await h.api.handleAuthRoute(new Request(location, { headers: { Cookie: 'auth_token=' + encodeURIComponent(token) } }), env)
  assert.equal(bridge.status, 303)
  return { start, stateCookie, bridge, callback: bridge.headers.get('Location') }
}

test('all four registered active accounts complete an encrypted browser-bound handoff', async () => {
  for (let i = 0; i < CREATIVE_ALLOWED_EMAILS.length; i++) {
    const h = harness(), flow = await handoff(h, 'token-' + i)
    assert.ok(!flow.callback.includes('token-' + i))
    assert.ok(!flow.callback.includes(CREATIVE_ALLOWED_EMAILS[i]))
    const done = await h.api.handleAuthRoute(new Request(flow.callback, { headers: { Cookie: flow.stateCookie } }), env)
    assert.equal(done.status, 303)
    assert.equal(done.headers.get('Location'), CREATIVE + '/photoflow/0.16.0-flow1/?demo=1')
    assert.equal(done.headers.get('Referrer-Policy'), 'no-referrer')
    assert.match(done.headers.get('Cache-Control'), /no-store/)
    const session = setCookie(done, '__Host-xf_creative_session')
    assert.ok(done.headers.getSetCookie().some(x => x.startsWith('__Host-xf_creative_state=') && x.includes('Max-Age=0')))
    assert.deepEqual(await h.api.authorize(req('/photoflow/file.wasm', { headers: { Cookie: session } }), env), { ok: true, status: 204 })
    assert.equal(h.calls.length, 3, 'bridge, callback and protected request each revalidate authority')
  }
})

test('email casing is normalized only after server authority proves the active user', async () => {
  const h = harness(); h.users.set('token-0', { id: 'paul', email: 'Paul@adme.net.au', is_active: true })
  assert.equal((await h.api.authorize(req('/app', { headers: { Cookie: '__Host-xf_creative_session=token-0' } }), env)).status, 204)
})

test('incoming identity headers, query emails and fallback cookies do not grant access', async () => {
  const h = harness()
  const forged = req('/photoflow/?email=paul@adme.net.au', { headers: { Authorization: 'Bearer token-0', 'X-User-Email': 'paul@adme.net.au', 'Cf-Access-Authenticated-User-Email': 'paul@adme.net.au', Cookie: 'auth_token=token-0; auth_token_client=token-0' } })
  assert.deepEqual(await h.api.authorize(forged, env), { ok: false, status: 401 })
  assert.equal(h.calls.length, 0)
  const flow = await h.api.handleAuthRoute(req('/__auth/start'), env)
  const bridge = await h.api.handleAuthRoute(new Request(flow.headers.get('Location'), { headers: { Authorization: 'Bearer token-0', Cookie: 'auth_token_client=token-0' } }), env)
  assert.equal(bridge.status, 200)
  assert.match(await bridge.text(), /Sign in to XeroFlow/)
  assert.equal(h.calls.length, 0)
})

test('unknown, inactive, revoked and malformed server identities fail closed', async () => {
  const h = harness(), headers = { Cookie: '__Host-xf_creative_session=token-0' }
  h.users.set('token-0', { id: 'other', email: 'unknown@adme.net.au', is_active: true })
  assert.equal((await h.api.authorize(req('/app', { headers }), env)).status, 403)
  h.users.set('token-0', { id: 'paul', email: CREATIVE_ALLOWED_EMAILS[0], is_active: false })
  assert.equal((await h.api.authorize(req('/app', { headers }), env)).status, 403)
  h.users.delete('token-0')
  assert.equal((await h.api.authorize(req('/app', { headers }), env)).status, 401)
  h.override(() => Response.json({ user: { id: 'paul', email: CREATIVE_ALLOWED_EMAILS[0], is_active: true } }))
  assert.equal((await h.api.authorize(req('/app', { headers }), env)).status, 503)
})

test('callback rejects tampered tickets, a missing state cookie and a different browser state', async () => {
  const h = harness(), flow = await handoff(h)
  assert.equal((await h.api.handleAuthRoute(new Request(flow.callback), env)).status, 401)
  const wrong = await h.api.handleAuthRoute(req('/__auth/start'), env)
  assert.equal((await h.api.handleAuthRoute(new Request(flow.callback, { headers: { Cookie: setCookie(wrong, '__Host-xf_creative_state') } }), env)).status, 401)
  const changed = new URL(flow.callback); const value = changed.searchParams.get('ticket')
  changed.searchParams.set('ticket', (value[0] === 'A' ? 'B' : 'A') + value.slice(1))
  assert.equal((await h.api.handleAuthRoute(new Request(changed, { headers: { Cookie: flow.stateCookie } }), env)).status, 401)
})

test('callback binds ticket audience to its exact origin and never accepts a different purpose envelope', async () => {
  const h = harness(), flow = await handoff(h)
  const alien = new URL(flow.callback); alien.hostname = 'xeroflow-creative-tools.adme-dev.workers.dev'
  assert.equal((await h.api.handleAuthRoute(new Request(alien, { headers: { Cookie: flow.stateCookie } }), env)).status, 401)
  const wrongPurpose = new URL(flow.callback); wrongPurpose.searchParams.set('ticket', decodeURIComponent(flow.stateCookie.split('=')[1]))
  assert.equal((await h.api.handleAuthRoute(new Request(wrongPurpose, { headers: { Cookie: flow.stateCookie } }), env)).status, 401)
})

test('expired state or ticket and a future handoff timestamp are refused', async () => {
  for (const delta of [121, 601, -10]) {
    const h = harness(), flow = await handoff(h); h.advance(delta)
    assert.equal((await h.api.handleAuthRoute(new Request(flow.callback, { headers: { Cookie: flow.stateCookie } }), env)).status, 401)
  }
})

test('state allows a delayed email sign-in but expires after ten minutes even with a fresh ticket', async () => {
  for (const [delay, expected] of [[599, 303], [600, 401]]) {
    const h = harness()
    const start = await h.api.handleAuthRoute(req('/__auth/start'), env)
    assert.match(start.headers.getSetCookie()[0], /Max-Age=600/)
    const stateCookie = setCookie(start, '__Host-xf_creative_state')
    h.advance(delay)
    const bridge = await h.api.handleAuthRoute(new Request(start.headers.get('Location'), { headers: { Cookie: 'auth_token=token-0' } }), env)
    assert.equal(bridge.status, 303)
    const callback = await h.api.handleAuthRoute(new Request(bridge.headers.get('Location'), { headers: { Cookie: stateCookie } }), env)
    assert.equal(callback.status, expected)
  }
})

test('logged-out bridge embeds only canonical same-origin sign-in with a new-tab fallback', async () => {
  const h = harness(), flow = await handoff(h)
  const response = await h.api.handleAuthRoute(new Request(flow.start.headers.get('Location')), env)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.match(html, /<iframe src="\/auth\/login\/"/)
  assert.match(html, /target="_blank" rel="noopener noreferrer"/)
  assert.match(response.headers.get('Content-Security-Policy'), /frame-src 'self'/)
  assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/)
  assert.doesNotMatch(html, /<form|<input|token-0/)
  h.users.set('token-other', { id: 'other', email: 'other@adme.net.au', is_active: true })
  const denied = await h.api.handleAuthRoute(new Request(flow.start.headers.get('Location'), { headers: { Cookie: 'auth_token=token-other' } }), env)
  assert.equal(denied.status, 403)
  assert.doesNotMatch(await denied.text(), /<iframe/)
})

test('callback and subsequent asset requests revalidate revoked authority rather than trusting the ticket', async () => {
  const h = harness(), flow = await handoff(h)
  h.users.delete('token-0')
  const done = await h.api.handleAuthRoute(new Request(flow.callback, { headers: { Cookie: flow.stateCookie } }), env)
  assert.equal(done.status, 401)
  assert.ok(!done.headers.getSetCookie().some(x => x.startsWith('__Host-xf_creative_session=')))
  const h2 = harness(), f2 = await handoff(h2)
  const ok = await h2.api.handleAuthRoute(new Request(f2.callback, { headers: { Cookie: f2.stateCookie } }), env)
  h2.users.delete('token-0')
  assert.equal((await h2.api.authorize(req('/app.wasm', { headers: { Cookie: setCookie(ok, '__Host-xf_creative_session') } }), env)).status, 401)
})

test('only known HTTPS hosts and exact bridge path are accepted; a missing key denies access', async () => {
  const h = harness()
  assert.equal((await h.api.authorize(req('/app', { headers: { Cookie: '__Host-xf_creative_session=token-0' } }), {})).status, 503)
  assert.equal((await h.api.handleAuthRoute(req('/__auth/start'), {})).status, 503)
  assert.equal((await h.api.handleAuthRoute(req('/__auth/start', {}, 'https://creative.xeroflow.io.evil.test'), env)).status, 403)
  assert.equal((await h.api.handleAuthRoute(req('/creative-launch-extra', {}, APP), env)).status, 404)
  assert.equal((await h.api.handleAuthRoute(req('/creative-launch?origin=https://evil.test&state=' + 'a'.repeat(43), {}, APP), env)).status, 400)
  assert.equal((await h.api.handleAuthRoute(req('/creative-launch?origin=' + encodeURIComponent(CREATIVE) + '&state=bad', {}, APP), env)).status, 400)
})

test('return targets are local known app routes, including legacy Craft paths', async () => {
  for (const [input, expected] of [['https://evil.test/x', '/'], ['//evil.test', '/'], ['/photoflow/../../evil', '/'], ['/photoflow/%2e%2e/%2e%2e/evil', '/'], ['/\\evil.test', '/'], ['/auth/login', '/'], ['/photocraft/0.16.0/?demo=1', '/photocraft/0.16.0/?demo=1']]) {
    const h = harness(), flow = await handoff(h, 'token-0', input)
    const done = await h.api.handleAuthRoute(new Request(flow.callback, { headers: { Cookie: flow.stateCookie } }), env)
    assert.equal(done.headers.get('Location'), CREATIVE + expected)
  }
})

test('authority failures, redirects, invalid JSON and oversized bodies deny without clearing an existing session', async () => {
  for (const response of [() => { throw new Error('Offline') }, () => new Response(null, { status: 503 }), () => new Response(null, { status: 302, headers: { Location: 'https://evil.test' } }), () => new Response('not-json'), () => new Response('x'.repeat(65537)), () => new Response('{}', { headers: { 'Content-Length': '65537' } })]) {
    const h = harness(); h.override(response)
    const result = await h.api.handleAuthRoute(req('/__auth/session', { headers: { Cookie: '__Host-xf_creative_session=token-0' } }), env)
    assert.equal(result.status, 503)
    assert.equal(result.headers.getSetCookie().length, 0)
    assert.equal(await result.text(), '')
  }
})

test('duplicate credential cookies are rejected rather than accepting an ambiguous value', async () => {
  const h = harness()
  assert.equal((await h.api.authorize(req('/app', { headers: { Cookie: '__Host-xf_creative_session=bad; __Host-xf_creative_session=token-0' } }), env)).status, 401)
  assert.equal(h.calls.length, 0)
})

test('bridge polling is same-origin and discloses no user identity or token', async () => {
  const h = harness(), flow = await handoff(h)
  const url = new URL(flow.start.headers.get('Location')); url.searchParams.set('check', '1')
  const ok = await h.api.handleAuthRoute(new Request(url, { headers: { Cookie: 'auth_token=token-0' } }), env)
  assert.equal(ok.status, 204); assert.equal(await ok.text(), '')
  const no = await h.api.handleAuthRoute(new Request(url), env)
  assert.equal(no.status, 401); assert.equal(await no.text(), '')
  h.users.set('token-other', { id: 'other', email: 'no@adme.net.au', is_active: true })
  const denied = await h.api.handleAuthRoute(new Request(url, { headers: { Cookie: 'auth_token=token-other' } }), env)
  assert.equal(denied.status, 403); assert.equal(await denied.text(), '')
})

test('logout requires same-origin POST and removes only creative authentication cookies', async () => {
  const h = harness()
  assert.equal((await h.api.handleAuthRoute(req('/__auth/logout'), env)).status, 405)
  assert.equal((await h.api.handleAuthRoute(req('/__auth/logout', { method: 'POST' }), env)).status, 403)
  assert.equal((await h.api.handleAuthRoute(req('/__auth/logout', { method: 'POST', headers: { Origin: 'https://evil.test' } }), env)).status, 403)
  const ok = await h.api.handleAuthRoute(req('/__auth/logout', { method: 'POST', headers: { Origin: CREATIVE } }), env)
  assert.equal(ok.status, 204)
  const cookies = ok.headers.getSetCookie(); assert.equal(cookies.length, 2)
  assert.ok(cookies.every(x => x.startsWith('__Host-xf_creative_') && x.includes('Max-Age=0')))
})
