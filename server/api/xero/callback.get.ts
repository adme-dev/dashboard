import { createError, getRequestURL } from 'h3'
import { setTokenForSession } from '../../utils/tokenStore'
import { createXeroClient, toStoredTokenSet } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const code = String(query.code || '')
  const state = String(query.state || '')
  const expectedState = getCookie(event, 'xero_oauth_state')

  if (!code || !state || !expectedState || state !== expectedState) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid OAuth state or code' })
  }

  deleteCookie(event, 'xero_oauth_state', { path: '/' })

  const client = await createXeroClient({ state: expectedState, event })
  const requestUrl = getRequestURL(event).href
  await client.apiCallback(requestUrl)
  const tokenSet = client.readTokenSet()
  await setTokenForSession(event, toStoredTokenSet(tokenSet))

  return sendRedirect(event, '/settings', 302)
})
