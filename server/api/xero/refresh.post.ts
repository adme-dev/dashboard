import { createError } from 'h3'
import { getTokenForSession, setTokenForSession } from '../../utils/tokenStore'
import { createXeroClient, toStoredTokenSet } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const current = await getTokenForSession(event)
  if (!current?.refresh_token) {
    throw createError({ statusCode: 401, statusMessage: 'No refresh token available' })
  }
  const client = await createXeroClient({ tokenSet: current })
  await client.refreshToken()
  const latest = client.readTokenSet()
  const next = toStoredTokenSet({
    ...latest,
    refresh_token: latest.refresh_token || current.refresh_token
  })

  await setTokenForSession(event, next)

  return { ok: true, expires_at: next.expires_at }
})
