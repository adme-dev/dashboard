import { getQuery } from 'h3'
import { z } from 'zod'
import { queryOne } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'

const Query = z.object({ clientId: z.string().uuid(), siteId: z.string().uuid() })
const PUBLISH_HOST = 'publish.xeroflowpages.com'

/**
 * Same-host readiness check: the client's website must forward `/guides/healthz` to the
 * publisher, which answers with this site's public id. Only the stored canonical hostname
 * is fetched (a validated public root), never a caller-supplied URL.
 */
export default eventHandler(async (event) => {
  const parsed = Query.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid site verification request' })
  await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  const site = await queryOne<{ canonical_hostname: string, public_id: string, publishing_mode: string }>(`
    SELECT canonical_hostname, public_id, publishing_mode
    FROM search_authority_sites WHERE id = $1 AND client_id = $2
  `, [parsed.data.siteId, parsed.data.clientId])
  if (!site) throw createError({ statusCode: 404, statusMessage: 'Search Authority site not found' })

  const target = `https://${site.canonical_hostname}/guides/healthz`
  const checkedAt = new Date().toISOString()
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    const upstream = await fetch(target, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'XeroFlow-SearchAuthority-Verify/1', 'accept': 'application/json' }
    }).finally(() => clearTimeout(timer))
    const publisherId = upstream.headers.get('x-xeroflow-publisher')?.toLowerCase() ?? null
    const ok = upstream.status === 200 && publisherId === site.public_id
    return {
      ok,
      status: upstream.status,
      publisherId,
      expectedPublicId: site.public_id,
      target,
      checkedAt,
      rewriteTarget: `https://${PUBLISH_HOST}/s/${site.public_id}/guides`,
      reason: ok
        ? null
        : upstream.status !== 200
          ? `The website answered ${upstream.status} for /guides/healthz; the rewrite is not in place yet.`
          : publisherId
            ? 'The rewrite reaches a publisher for a different site.'
            : 'The website answered but not from the XeroFlow publisher.'
    }
  } catch (error: unknown) {
    return {
      ok: false,
      status: null,
      publisherId: null,
      expectedPublicId: site.public_id,
      target,
      checkedAt,
      rewriteTarget: `https://${PUBLISH_HOST}/s/${site.public_id}/guides`,
      reason: error instanceof Error && error.name === 'AbortError'
        ? 'The website did not answer within 8 seconds.'
        : 'The website could not be reached.'
    }
  }
})
