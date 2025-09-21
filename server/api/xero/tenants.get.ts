import { $fetch } from 'ofetch'
import { getTokenForSession } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  const token = await getTokenForSession(event)
  if (!token?.access_token) {
    throw createError({ statusCode: 401, statusMessage: 'Not connected' })
  }

  const tenants = await $fetch<any>('https://api.xero.com/connections', {
    headers: {
      Authorization: `Bearer ${token.access_token}`
    }
  })

  return tenants
})
