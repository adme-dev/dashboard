import { readBody, createError } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, queryRows } from '~~/server/utils/db'
import { getSelectedTenant } from '~~/server/utils/session'

const MAX_SAVED = 50

export default eventHandler(async (event) => {
  const user = requireAuth(event)
  const tenantId = getSelectedTenant(event)
  const body = await readBody(event)

  if (!body?.sourceTitle || !body?.planData) {
    throw createError({ statusCode: 400, statusMessage: 'sourceTitle and planData are required' })
  }

  // Enforce limit
  const existing = await queryRows(
    `SELECT id FROM saved_action_plans WHERE user_id = $1 AND status IN ('active', 'in_progress')`,
    [user.id]
  )
  if (existing.length >= MAX_SAVED) {
    throw createError({ statusCode: 409, statusMessage: `Maximum ${MAX_SAVED} saved plans allowed. Resolve or dismiss older plans first.` })
  }

  const row = await queryOne(
    `INSERT INTO saved_action_plans (user_id, tenant_id, source_type, source_title, source_description, source_severity, source_category, plan_data, note)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING id, source_type, source_title, source_severity, source_category, plan_data, note, status, created_at`,
    [
      user.id,
      tenantId || null,
      body.sourceType || 'recommendation',
      body.sourceTitle,
      body.sourceDescription || null,
      body.sourceSeverity || null,
      body.sourceCategory || null,
      JSON.stringify(body.planData),
      body.note || null,
    ]
  )

  return row
})
