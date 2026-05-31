/**
 * Rule-based attribution
 * GET /api/agency/analytics/attribution?startDate=&endDate=&clientId=&model=
 *
 * Applies an auditable attribution model (server/utils/attribution.ts) over the
 * conversions (owned leads) in the window and returns channel credit.
 *
 * DATA NOTE: the leads table records a single `source` per lead and there is no
 * per-user touchpoint/journey stream today, so each conversion is a SINGLE-TOUCH
 * journey (its source). Under single-touch journeys every model yields the same
 * credit (this is correct). The model toggle + engine are wired and ready for
 * real multi-touch journeys (Phase 3.1 richer GA4 ingestion / a touchpoint
 * table) — at which point switching models will re-weight credit. We do not
 * fabricate multi-touch paths from aggregate data.
 */
import { queryRows } from '~~/server/utils/db'
import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { resolveCanonicalChannel } from '~~/server/utils/channelTaxonomy'
import {
  attributeConversions,
  isAttributionModel,
  type AttributionModel,
  type Touchpoint
} from '~~/server/utils/attribution'

export default defineEventHandler(async (event) => {
  await requireRole(event, [...new Set([...PERMISSIONS.CLIENTS, ...PERMISSIONS.MEDIA_BUYING])])
  const q = getQuery(event)
  const startDate = q.startDate as string
  const endDate = q.endDate as string
  const clientId = (q.clientId as string) || undefined
  if (!startDate || !endDate) {
    throw createError({ statusCode: 400, statusMessage: 'startDate and endDate are required' })
  }
  const model: AttributionModel = isAttributionModel(q.model) ? q.model : 'position'

  try {
    const leadParams: unknown[] = clientId ? [clientId, startDate, endDate] : [startDate, endDate]
    const leadWhere = clientId
      ? `l.client_id = $1 AND l.deleted_at IS NULL AND l.submitted_at::date BETWEEN $2 AND $3`
      : `l.deleted_at IS NULL AND l.submitted_at::date BETWEEN $1 AND $2`
    const leadRows = await queryRows<{ source: string; submitted_at: string }>(
      `SELECT l.source AS source, l.submitted_at AS submitted_at
       FROM leads l
       WHERE ${leadWhere}`,
      leadParams
    )

    // One single-touch journey per conversion (lead): its source channel.
    const journeys: Touchpoint[][] = []
    for (const r of leadRows) {
      const channel = (await resolveCanonicalChannel('lead_source', r.source)) ?? 'Other'
      journeys.push([{ channel, timestamp: new Date(r.submitted_at).getTime() }])
    }

    const byChannel = attributeConversions(journeys, model)

    return {
      model,
      byChannel,
      totalConversions: journeys.length,
      basis: 'single-touch',
      note: 'Each conversion is a single-touch journey (lead source); all models converge until per-user multi-touch journey data is ingested (Phase 3.1).'
    }
  } catch (error) {
    console.error('Analytics attribution failed:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to compute attribution' })
  }
})
