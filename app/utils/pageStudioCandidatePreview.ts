/** Transport-only form in a new tab; the credential never enters the address
 * bar, persistent browser storage, or the customer page's script context. */
export function openPageStudioCandidatePreview(hostname: string, session: { token: string, expiresAt: number }) {
  if (!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9-]+$/.test(hostname)
    || hostname.length > 253 || !session.token || session.token.length > 8192 || session.expiresAt <= Date.now() / 1000) {
    throw new Error('Preview access expired or is unavailable. Prepare the preview again.')
  }
  const tab = window.open('about:blank', `page-studio-review-${crypto.randomUUID()}`)
  if (!tab) throw new Error('Allow pop-ups for XeroFlow to open the website preview.')
  try {
    tab.document.title = 'Opening website preview'
    tab.document.body.textContent = 'Opening the approved website preview…'
    const form = tab.document.createElement('form')
    form.method = 'POST'
    form.action = `https://${hostname}/__page-studio/preview-session`
    form.hidden = true
    const token = tab.document.createElement('input')
    token.type = 'hidden'
    token.name = 'token'
    token.value = session.token
    form.append(token)
    tab.document.body.append(form)
    tab.opener = null
    form.submit()
    tab.focus()
  } catch (error) {
    tab.close()
    throw error
  }
}
