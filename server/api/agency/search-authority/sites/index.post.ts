import { isIP } from 'node:net'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { SEARCH_AUTHORITY_FEATURE } from '~~/server/utils/searchAuthority/feature'

const Body = z.object({
  clientId: z.string().uuid(),
  canonicalHostname: z.string().trim().min(1).max(253),
  contentHostname: z.string().trim().min(1).max(253).nullable().optional()
})

function normalizePublicRootHostname(value: string): string {
  let url: URL
  try {
    url = new URL(value.includes('://') ? value : `https://${value}`)
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid hostname' })
  }

  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    !['http:', 'https:'].includes(url.protocol)
    || url.username
    || url.password
    || url.port
    || (url.pathname !== '' && url.pathname !== '/')
    || url.search
    || url.hash
    || hostname === 'localhost'
    || !hostname.includes('.')
    || isIP(hostname) !== 0
  ) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Hostname must be a public website root'
    })
  }
  return hostname
}

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid Search Authority site'
    })
  }

  const user = await requireAgencySearchAuthorityAccess(
    event,
    parsed.data.clientId,
    { requireEntitlement: false }
  )
  const canonicalHostname = normalizePublicRootHostname(
    parsed.data.canonicalHostname
  )
  const contentHostname = parsed.data.contentHostname
    ? normalizePublicRootHostname(parsed.data.contentHostname)
    : null

  const site = await transaction(async (db) => {
    const siteResult = await db.query<{
      id: string
      client_id: string
      canonical_hostname: string
      content_hostname: string | null
      status: string
    }>(
      `INSERT INTO search_authority_sites (
         client_id, canonical_hostname, content_hostname, status, created_by
       )
       VALUES ($1, $2, $3, 'active', $4)
       ON CONFLICT (client_id)
       DO UPDATE SET
         canonical_hostname = EXCLUDED.canonical_hostname,
         content_hostname = EXCLUDED.content_hostname,
         status = 'active',
         updated_at = NOW()
       RETURNING
         id, client_id, canonical_hostname, content_hostname, status`,
      [parsed.data.clientId, canonicalHostname, contentHostname, user.id]
    )

    await db.query(
      `INSERT INTO client_feature_entitlements (
         client_id, feature_key, status, source
       )
       VALUES ($1, $2, 'trial', 'search_authority_pilot')
       ON CONFLICT (client_id, feature_key)
       DO UPDATE SET
         status = CASE
           WHEN client_feature_entitlements.status = 'active' THEN 'active'
           ELSE 'trial'
         END,
         source = CASE
           WHEN client_feature_entitlements.status = 'active'
             THEN client_feature_entitlements.source
           ELSE 'search_authority_pilot'
         END,
         updated_at = NOW()`,
      [parsed.data.clientId, SEARCH_AUTHORITY_FEATURE]
    )

    const row = siteResult.rows[0]
    if (!row) throw new Error('Unable to configure Search Authority site')
    return row
  })

  return {
    site: {
      id: site.id,
      clientId: site.client_id,
      canonicalHostname: site.canonical_hostname,
      contentHostname: site.content_hostname,
      status: site.status
    }
  }
})
