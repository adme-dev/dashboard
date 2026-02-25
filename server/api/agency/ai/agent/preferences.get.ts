/**
 * GET /api/agency/ai/agent/preferences
 * Get current user's AI agent preferences
 */

import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const member = await queryOne(`
    SELECT ai_agent_preferences FROM team_members WHERE id = $1
  `, [user.id])

  // Return stored preferences merged with defaults
  const defaults = {
    dailyDigest: true,
    weeklyReport: true,
    anomalyAlerts: true,
    digestTime: '08:00',
    timezone: 'Australia/Sydney',
    reportFocus: []
  }

  const stored = member?.ai_agent_preferences || {}

  return { ...defaults, ...stored }
})
