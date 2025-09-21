import { createXeroClient } from '../../utils/xeroClient'
import { getActiveTokenForSession } from '../../utils/tokenStore'

export default eventHandler(async (event) => {
  const token = await getActiveTokenForSession(event)
  const client = await createXeroClient({ tokenSet: token })
  const tenants = await client.updateTenants(false)
  return tenants
})
