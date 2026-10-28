// Keep an already-open project in memory while fresh XeroFlow authority is restored.
// This is a usability guard; HTTP authorization remains enforced by the Worker.
let busy = false
let blocked = false
let priorFocus = null
const priorInert = new Map()
const host = document.createElement('div')
host.id = 'xf-creative-session-guard'
const shadow = host.attachShadow({ mode: 'open' })
shadow.innerHTML = `<style>:host{position:fixed;inset:0;z-index:2147483647;display:none;font:15px/1.6 system-ui;color:#fff}:host([data-blocked]){display:grid;place-items:center;background:rgba(10,11,14,.96)}section{max-width:410px;margin:20px;padding:28px;border:1px solid #ffffff20;border-radius:18px;background:#14151a;box-shadow:0 20px 80px #0008}.mark{display:grid;place-items:center;width:36px;height:36px;background:#fff;color:#121317;font-weight:700;border-radius:8px}h1{font-size:23px;font-weight:500;margin:20px 0 12px}p{color:#b7b7c2;margin:12px 0}a,button{font:inherit;border-radius:24px;padding:9px 17px;border:1px solid #ffffff26;cursor:pointer;text-decoration:none;display:inline-block}a{color:#121317;background:#fff}button{background:transparent;color:#fff;margin-left:8px}a:focus-visible,button:focus-visible{outline:2px solid #67e8f9;outline-offset:4px}small{display:block;color:#a1a1aa;margin-top:18px}</style><section role="alertdialog" aria-modal="true" aria-labelledby="heading" aria-describedby="message"><span class="mark">XF</span><h1 id="heading">Design your world with XeroFlow</h1><p id="message"></p><a href="/__auth/start?return=%2F" target="_blank" rel="noopener noreferrer">Sign in to XeroFlow</a><button type="button">Retry</button><small>Your current project stays open in this window.</small></section>`
const message = shadow.querySelector('#message')
const heading = shadow.querySelector('#heading')
const signIn = shadow.querySelector('a')
const retry = shadow.querySelector('button')
function block(status) {
  heading.textContent = status === 503 ? 'Connection to XeroFlow interrupted' : status === 403 ? 'Account access required' : 'Design your world with XeroFlow'
  message.textContent = status === 503 ? 'XeroFlow could not verify your session. Retry when the connection is available.' : status === 403 ? 'This signed-in XeroFlow account does not have access to Creative Suite. Sign in with an authorized account.' : 'Your XeroFlow session has ended. Sign in again, then return here to continue working.'
  if (blocked) return
  blocked = true
  priorFocus = document.activeElement
  for (const child of document.body.children) {
    if (child === host) continue
    priorInert.set(child, child.inert)
    child.inert = true
  }
  host.setAttribute('data-blocked', '')
  signIn.focus()
}
function unblock() {
  if (!blocked) return
  blocked = false
  host.removeAttribute('data-blocked')
  for (const [child, inert] of priorInert) if (child.isConnected) child.inert = inert
  priorInert.clear()
  if (priorFocus?.isConnected && typeof priorFocus.focus === 'function') priorFocus.focus()
}
async function check() {
  if (busy || document.hidden) return
  busy = true
  try {
    const response = await fetch('/__auth/session', { credentials: 'same-origin', cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(10000) })
    if (response.status === 204) unblock()
    else block(response.status === 401 || response.status === 403 ? response.status : 503)
  } catch { block(503) } finally { busy = false }
}
retry.addEventListener('click', check)
window.addEventListener('keydown', event => {
  if (!blocked) return
  event.stopImmediatePropagation()
  if (event.key !== 'Tab') return
  const current = shadow.activeElement
  if (event.shiftKey && current === signIn) { event.preventDefault(); retry.focus() }
  else if (!event.shiftKey && current === retry) { event.preventDefault(); signIn.focus() }
}, true)
document.body.append(host)
window.addEventListener('focus', check)
document.addEventListener('visibilitychange', check)
setInterval(check, 60000)
check()
