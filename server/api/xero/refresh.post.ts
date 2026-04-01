import { createError } from 'h3'
import { getTokenForSession, setTokenForSession } from '../../utils/tokenStore'
import { refreshXeroToken } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const current = await getTokenForSession(event)
  if (!current?.refresh_token) {
    throw createError({ statusCode: 401, statusMessage: 'No refresh token available' })
  }

  const next = await refreshXeroToken({
    refreshToken: current.refresh_token,
    event
  })

  await setTokenForSession(event, next)

  return { ok: true, expires_at: next.expires_at }
})
