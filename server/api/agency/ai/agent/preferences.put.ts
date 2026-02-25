/**
 * PUT /api/agency/ai/agent/preferences
 * Update current user's AI agent preferences
 */

import { execute } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  if (!body || typeof body !== 'object') {
    throw createError({ statusCode: 400, statusMessage: 'Invalid preferences body' })
  }

  // Whitelist allowed preference keys
  const allowed: Record<string, string> = {
    dailyDigest: 'boolean',
    weeklyReport: 'boolean',
    anomalyAlerts: 'boolean',
    digestTime: 'string',
    timezone: 'string',
    reportFocus: 'object'  // array
  }

  const cleaned: Record<string, any> = {}
  for (const [key, expectedType] of Object.entries(allowed)) {
    if (key in body && typeof body[key] === expectedType) {
      cleaned[key] = body[key]
    }
  }

  await execute(`
    UPDATE team_members
    SET ai_agent_preferences = COALESCE(ai_agent_preferences, '{}'::jsonb) || $1::jsonb
    WHERE id = $2
  `, [JSON.stringify(cleaned), user.id])

  return { success: true, preferences: cleaned }
})
