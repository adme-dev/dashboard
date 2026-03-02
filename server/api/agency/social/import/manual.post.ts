/**
 * POST /api/agency/social/import/manual
 * Single manual spend entry for any platform.
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const { platform, campaignName, date, spend, impressions, clicks, conversions, clientId, period } = body

  if (!platform || !campaignName || !date || spend == null || !period) {
    throw createError({ statusCode: 400, statusMessage: 'Missing required fields: platform, campaignName, date, spend, period' })
  }

  const spendNum = parseFloat(spend)
  if (isNaN(spendNum) || spendNum < 0) {
    throw createError({ statusCode: 400, statusMessage: 'Spend must be a non-negative number' })
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw createError({ statusCode: 400, statusMessage: 'Date must be in YYYY-MM-DD format' })
  }

  // Validate period format
  if (!/^\d{4}-\d{2}$/.test(period)) {
    throw createError({ statusCode: 400, statusMessage: 'Period must be in YYYY-MM format' })
  }

  // Upsert media_spend (manual imports have connection_id = NULL)
  const row = await queryOne<{ id: string }>(
    `INSERT INTO media_spend (platform, campaign_name, campaign_id, period, actual_spend, budget_allocated, client_id, impressions, clicks, conversions, synced_at)
     VALUES ($1, $2, $3, $4, $5, 0, $6, $7, $8, $9, NOW())
     ON CONFLICT (platform, campaign_id, period) WHERE connection_id IS NULL
     DO UPDATE SET actual_spend = EXCLUDED.actual_spend,
                   impressions = EXCLUDED.impressions,
                   clicks = EXCLUDED.clicks,
                   conversions = EXCLUDED.conversions,
                   synced_at = NOW()
     RETURNING id`,
    [
      platform,
      campaignName,
      `manual_${platform}_${campaignName.replace(/\s+/g, '_').toLowerCase()}`,
      period,
      spendNum,
      clientId || null,
      impressions ? parseInt(impressions) : 0,
      clicks ? parseInt(clicks) : 0,
      conversions ? parseInt(conversions) : 0,
    ]
  )

  if (!row) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to insert spend record' })
  }

  // Upsert daily_spend
  await execute(
    `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (media_spend_id, spend_date)
     DO UPDATE SET spend = EXCLUDED.spend,
                   impressions = EXCLUDED.impressions,
                   clicks = EXCLUDED.clicks,
                   conversions = EXCLUDED.conversions`,
    [
      row.id,
      date,
      spendNum,
      impressions ? parseInt(impressions) : 0,
      clicks ? parseInt(clicks) : 0,
      conversions ? parseInt(conversions) : 0,
    ]
  )

  return { success: true, id: row.id }
})
