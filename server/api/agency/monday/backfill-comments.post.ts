/**
 * Backfill Monday.com Updates (Comments) for Already-Migrated Items
 * POST /api/agency/monday/backfill-comments
 *
 * Goes through monday_item_mappings and imports updates/comments
 * for items that were migrated without importUpdates enabled.
 * Processes one Monday item at a time to maintain item→update mapping.
 *
 * Body: { batchSize?: number }
 */

import { createError } from 'h3'
import { requireRole } from '~~/server/utils/auth'
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { createMondayClient } from '~~/server/utils/mondayClient'

export default eventHandler(async (event) => {
  await requireRole(event, ['admin', 'owner'])

  const body = await readBody(event)
  const batchSize = Math.min(Number(body.batchSize) || 50, 200)

  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    throw createError({ statusCode: 500, statusMessage: 'Monday API token not configured' })
  }

  const client = await createMondayClient(apiToken)

  // Get items that haven't had updates imported yet
  const items = await queryRows(`
    SELECT mim.monday_item_id, mim.task_id, mim.id as mapping_id, mim.monday_item_name
    FROM monday_item_mappings mim
    LEFT JOIN monday_update_mappings mum ON mum.item_mapping_id = mim.id
    WHERE mum.id IS NULL
    ORDER BY mim.created_at ASC
    LIMIT $1
  `, [batchSize])

  if (items.length === 0) {
    return { success: true, message: 'All items already backfilled', imported: 0, failed: 0, remaining: 0 }
  }

  // Total remaining
  const remainingResult = await queryOne(`
    SELECT COUNT(*) as total
    FROM monday_item_mappings mim
    LEFT JOIN monday_update_mappings mum ON mum.item_mapping_id = mim.id
    WHERE mum.id IS NULL
  `)
  const totalRemaining = Number(remainingResult?.total) || 0

  // Pre-fetch Monday users for name lookup
  const mondayUsers = new Map<string, string>()
  try {
    const users = await client.getUsers({ limit: 200 })
    for (const u of users) {
      mondayUsers.set(u.id, u.name)
    }
  } catch {
    // Non-critical
  }

  let imported = 0
  let skipped = 0
  let failed = 0
  const errors: string[] = []

  // Process one item at a time to maintain item→update association
  for (const item of items) {
    try {
      // Fetch updates for this single item
      const updates = await client.getUpdates([item.monday_item_id])

      if (updates.length === 0) {
        // Mark as processed with sentinel
        await execute(`
          INSERT INTO monday_update_mappings
          (migration_session_id, item_mapping_id, monday_update_id, monday_creator_id, source_data, body_text, created_at)
          VALUES (NULL, $1, $2, '0', '{}'::jsonb, '', NOW())
          ON CONFLICT DO NOTHING
        `, [item.mapping_id, `no-updates-${item.monday_item_id}`])
        skipped++
        continue
      }

      for (const update of updates) {
        try {
          const creatorName = mondayUsers.get(update.creator_id) || `Monday User ${update.creator_id}`
          const userId = await findOrCreateUser(update.creator_id, creatorName)

          const content = update.text_body || update.body || ''
          if (!content.trim()) continue

          // Insert top-level comment
          const activity = await queryOne(`
            INSERT INTO task_activities (task_id, user_id, activity_type, content, created_at)
            VALUES ($1, $2, 'comment', $3, $4)
            RETURNING id
          `, [item.task_id, userId, content, update.created_at])

          if (!activity) continue

          // Record mapping
          await execute(`
            INSERT INTO monday_update_mappings
            (migration_session_id, item_mapping_id, monday_update_id, monday_creator_id, monday_creator_name, activity_id, source_data, body_text, created_at)
            VALUES (NULL, $1, $2, $3, $4, $5, $6::jsonb, $7, $8)
            ON CONFLICT DO NOTHING
          `, [
            item.mapping_id,
            update.id,
            update.creator_id,
            creatorName,
            activity.id,
            JSON.stringify({ backfill: true, original_body: update.body?.substring(0, 500) }),
            content,
            update.created_at,
          ])

          // Import replies as threaded comments
          if (update.replies?.length) {
            for (const reply of update.replies) {
              const replyName = mondayUsers.get(reply.creator_id) || `Monday User ${reply.creator_id}`
              const replyUserId = await findOrCreateUser(reply.creator_id, replyName)
              const replyContent = reply.text_body || ''
              if (!replyContent.trim()) continue

              await execute(`
                INSERT INTO task_activities (task_id, user_id, activity_type, content, parent_id, created_at)
                VALUES ($1, $2, 'comment', $3, $4, $5)
              `, [item.task_id, replyUserId, replyContent, activity.id, reply.created_at])
            }
          }

          imported++
        } catch (err: any) {
          failed++
          if (errors.length < 20) errors.push(`Update ${update.id} for ${item.monday_item_name}: ${err.message}`)
        }
      }
    } catch (err: any) {
      // Mark as processed even on API error to avoid infinite retries
      await execute(`
        INSERT INTO monday_update_mappings
        (migration_session_id, item_mapping_id, monday_update_id, monday_creator_id, source_data, body_text, created_at)
        VALUES (NULL, $1, $2, '0', '{}'::jsonb, $3, NOW())
        ON CONFLICT DO NOTHING
      `, [item.mapping_id, `error-${item.monday_item_id}`, `API error: ${err.message}`.slice(0, 500)])
      failed++
      if (errors.length < 20) errors.push(`Item ${item.monday_item_name}: ${err.message}`)
    }

    // Rate limit: 200ms pause between items
    await new Promise(resolve => setTimeout(resolve, 200))
  }

  return {
    success: true,
    imported,
    skipped,
    failed,
    remaining: totalRemaining - items.length,
    batchProcessed: items.length,
    errors: errors.length > 0 ? errors : undefined,
  }
})

async function findOrCreateUser(mondayUserId: string, name: string): Promise<string | null> {
  // Try matching by name first (real team members)
  const byName = await queryOne(
    `SELECT id FROM team_members WHERE LOWER(name) = LOWER($1) AND email NOT LIKE '%@placeholder.local' LIMIT 1`,
    [name]
  )
  if (byName) return byName.id

  const email = `monday-${mondayUserId}@placeholder.local`
  const existing = await queryOne('SELECT id FROM team_members WHERE email = $1', [email])
  if (existing) return existing.id

  // Create placeholder
  const user = await queryOne(`
    INSERT INTO team_members (name, email, is_active)
    VALUES ($1, $2, false)
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `, [name, email])

  return user?.id || null
}
