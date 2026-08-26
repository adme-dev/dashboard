import { ANALYTICS_ROLES, accessibleClientIds } from '~~/server/utils/tracking/analytics-access'
import { requireRole } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { listSearchAuthorityClientIds } from '~~/server/utils/searchAuthority/feature'

export default eventHandler(async (event) => {
  const user = await requireRole(event, ANALYTICS_ROLES)
  const entitledClientIds = await listSearchAuthorityClientIds()
  if (entitledClientIds.length === 0) return { sites: [] }

  const accessibleIds = await accessibleClientIds(user)
  const clientIds = accessibleIds === null
    ? entitledClientIds
    : entitledClientIds.filter(id => accessibleIds.includes(id))
  if (clientIds.length === 0) return { sites: [] }

  const sites = await queryRows<{
    id: string
    client_id: string
    client_name: string
    canonical_hostname: string
    content_hostname: string | null
    status: string
    public_id: string
    publishing_mode: 'subdomain' | 'same_host'
  }>(
    `SELECT
       site.id,
       site.client_id,
       client.name AS client_name,
       site.canonical_hostname,
       site.content_hostname,
       site.status,
       site.public_id,
       site.publishing_mode
     FROM search_authority_sites site
     JOIN agency_clients client ON client.id = site.client_id
     WHERE site.client_id = ANY($1::uuid[])
     ORDER BY client.name`,
    [clientIds]
  )

  return {
    sites: sites.map(site => ({
      id: site.id,
      clientId: site.client_id,
      clientName: site.client_name,
      canonicalHostname: site.canonical_hostname,
      contentHostname: site.content_hostname,
      status: site.status,
      publicId: site.public_id,
      publishingMode: site.publishing_mode
    }))
  }
})
