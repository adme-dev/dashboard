/** Same-tab transport only: never expose the one-use credential in a URL or storage. */
export function openCustomerStudio(session: { token: string, editorOrigin: string, expiresAt: string }) {
  const origin = new URL(session.editorOrigin)
  const expiry = Date.parse(session.expiresAt)
  if (origin.protocol !== 'https:' || origin.origin !== session.editorOrigin || origin.origin === window.location.origin
    || !/^[A-Za-z0-9_-]{64}$/.test(session.token) || !Number.isFinite(expiry) || expiry <= Date.now()) {
    throw new Error('Editor access expired or is unavailable.')
  }
  const form = document.createElement('form')
  form.method = 'POST'
  form.action = `${origin.origin}/customer/launch`
  form.target = '_self'
  form.hidden = true
  const ticket = document.createElement('input')
  ticket.type = 'hidden'
  ticket.name = 'ticket'
  ticket.value = session.token
  form.append(ticket)
  document.body.append(form)
  try {
    form.submit()
  } finally {
    ticket.value = ''
    form.remove()
  }
}
