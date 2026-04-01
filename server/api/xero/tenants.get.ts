import { getActiveTokenForSession } from '../../utils/tokenStore'
import { fetchXeroTenants } from '../../utils/xeroClient'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  return await fetchXeroTenants(token.access_token)
})
