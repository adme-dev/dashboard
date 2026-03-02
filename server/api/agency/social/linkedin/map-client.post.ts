import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/**
 * POST /api/agency/social/linkedin/map-client
 * Creates or updates a campaign -> Xero client mapping
 * Body: { connectionId, campaignId?, campaignNamePattern?, xeroClientName, xeroClientCode? }
 */
export default eventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)

  if (!body?.connectionId || !body?.xeroClientName) {
    throw createError({ statusCode: 400, statusMessage: 'connectionId and xeroClientName are required' })
  }

  // Verify connection exists
  const conn = await queryOne(
    `SELECT id FROM social_connections WHERE id = $1`,
    [body.connectionId]
  )
  if (!conn) {
    throw createError({ statusCode: 404, statusMessage: 'Connection not found' })
  }

  // Check for existing mapping (to update rather than duplicate)
  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM ad_account_client_map
     WHERE connection_id = $1
       AND COALESCE(campaign_id, '') = COALESCE($2, '')
       AND COALESCE(campaign_name_pattern, '') = COALESCE($3, '')`,
    [body.connectionId, body.campaignId || null, body.campaignNamePattern || null]
  )

  if (existing) {
    // Update existing mapping
    await queryOne(
      `UPDATE ad_account_client_map SET
         xero_client_name = $1,
         xero_client_code = $2
       WHERE id = $3
       RETURNING id`,
      [body.xeroClientName, body.xeroClientCode || null, existing.id]
    )
    return { id: existing.id, updated: true }
  }

  // Create new mapping
  const row = await queryOne<{ id: string }>(
    `INSERT INTO ad_account_client_map (connection_id, campaign_id, campaign_name_pattern, xero_client_name, xero_client_code)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      body.connectionId,
      body.campaignId || null,
      body.campaignNamePattern || null,
      body.xeroClientName,
      body.xeroClientCode || null
    ]
  )

  return { id: row!.id, updated: false }
})
