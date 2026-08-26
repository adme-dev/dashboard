import { z } from 'zod'

import { execute, queryRows } from '~~/server/utils/db'
import { requireAgencySearchAuthorityAccess } from '~~/server/utils/searchAuthority/access'
import { executeSearchAuthorityExternalMutation } from '~~/server/utils/searchAuthority/godModeMutations'
import { collectPageSpeedEvidence } from '~~/server/utils/searchAuthority/performanceEvidence'

const Body = z.object({
  clientId: z.string().uuid(),
  pageLimit: z.number().int().min(1).max(3).default(3)
})

interface OwnedPageRow {
  page_id: string
  domain_id: string
  canonical_url: string
  origin: string
}

export default eventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid trust refresh request' })
  }
  const user = await requireAgencySearchAuthorityAccess(event, parsed.data.clientId)
  if (!import.meta.dev && !['owner', 'admin'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Owner or admin access is required' })
  }

  return executeSearchAuthorityExternalMutation(event, 'trust-refresh', async (run) => {
    if (run.replay && run.replayResult) return run.replayResult
    const pages = await queryRows<OwnedPageRow>(`
    SELECT page.id AS page_id,
           page.domain_id,
           page.canonical_url,
           domain.origin
    FROM site_intelligence_pages page
    JOIN site_intelligence_domains domain
      ON domain.client_id = page.client_id
     AND domain.id = page.domain_id
    WHERE page.client_id = $1
      AND page.status = 'completed'
      AND domain.lane = 'owned'
      AND domain.status = 'active'
    ORDER BY page.last_seen_at DESC, page.id DESC
    LIMIT $2
  `, [parsed.data.clientId, parsed.data.pageLimit])

    const runtimeConfig = useRuntimeConfig() as { pagespeedApiKey?: string }
    const evidence = await Promise.all(pages.map(page => collectPageSpeedEvidence({
      url: page.canonical_url,
      ownedOrigin: page.origin,
      apiKey: runtimeConfig.pagespeedApiKey ?? ''
    })))
    await run.markDispatched()

    for (const [index, observation] of evidence.entries()) {
      const page = pages[index]
      if (!page) continue
      await execute(`
      INSERT INTO search_authority_performance_evidence (
        client_id, domain_id, page_id, page_url, strategy, status,
        reason_code, provider_at, provider_version, evidence
      ) VALUES ($1, $2, $3, $4, 'mobile', $5, $6, $7, $8, $9::jsonb)
    `, [
        parsed.data.clientId,
        page.domain_id,
        page.page_id,
        page.canonical_url,
        observation.status,
        observation.reasonCode,
        observation.providerAt,
        observation.providerVersion,
        JSON.stringify(observation)
      ])
    }

    return {
      clientId: parsed.data.clientId,
      requested: pages.length,
      stored: evidence.length,
      available: evidence.filter(item => item.status === 'available').length,
      partial: evidence.filter(item => item.status === 'partial').length,
      unavailable: evidence.filter(item => item.status === 'unavailable').length,
      collectedAt: new Date().toISOString()
    }
  })
})
