/**
 * Sync Monday.com users to local database
 * POST /api/monday/users/sync
 * 
 * Fetches users from Monday.com and upserts them to team_members table
 */

import { requireAuth } from '../../../utils/auth'
import { queryRows, queryOne } from '../../../utils/db'
import { MondayClient } from '../../../utils/mondayClient'

interface SyncResult {
  summary: {
    total: number
    created: number
    updated: number
    skipped: number
    errors: number
  }
  users: Array<{
    mondayId: string
    name: string
    email: string
    status: 'created' | 'updated' | 'skipped' | 'error'
    error?: string
  }>
}

export default eventHandler(async (event) => {
  await requireAuth(event)

  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    throw createError({ statusCode: 500, statusMessage: 'MONDAY_API_TOKEN not configured' })
  }

  const result: SyncResult = {
    summary: { total: 0, created: 0, updated: 0, skipped: 0, errors: 0 },
    users: []
  }

  try {
    const client = new MondayClient(apiToken)

    // Fetch users from Monday
    const mondayUsers = await client.getUsers({ limit: 500 })
    result.summary.total = mondayUsers.length

    // Get ADME Everyone team ID (default team for all users)
    const defaultTeam = await queryOne<{ id: string }>(
      'SELECT id FROM teams WHERE name = $1',
      ['ADME Everyone']
    )
    const defaultTeamId = defaultTeam?.id

    // Process each user
    for (const mondayUser of mondayUsers) {
      try {
        if (!mondayUser.email) {
          result.summary.skipped++
          result.users.push({
            mondayId: mondayUser.id || 'unknown',
            name: mondayUser.name,
            email: '',
            status: 'skipped'
          })
          continue
        }

        // Check if user already exists by Monday ID or email
        const existingMember = await queryOne<{ id: string; name: string; email: string; avatar_url?: string }>(
          'SELECT id, name, email, avatar_url FROM team_members WHERE monday_user_id = $1 OR email = $2',
          [mondayUser.id, mondayUser.email.toLowerCase()]
        )

        let status: 'created' | 'updated' | 'skipped' = 'skipped'

        if (existingMember) {
          // Check if update needed
          const needsUpdate = 
            existingMember.name !== mondayUser.name ||
            existingMember.avatar_url !== mondayUser.photo_thumb ||
            !existingMember.monday_user_id

          if (needsUpdate) {
            await queryOne(
              `UPDATE team_members 
               SET name = $1, 
                   avatar_url = $2, 
                   monday_user_id = COALESCE($3, monday_user_id),
                   updated_at = NOW()
               WHERE id = $4
               RETURNING id`,
              [mondayUser.name, mondayUser.photo_thumb, mondayUser.id, existingMember.id]
            )
            result.summary.updated++
            status = 'updated'
          } else {
            result.summary.skipped++
            status = 'skipped'
          }

          // Ensure membership in default team
          if (defaultTeamId) {
            await queryOne(
              `INSERT INTO team_memberships (team_id, team_member_id, role)
               VALUES ($1, $2, 'member')
               ON CONFLICT (team_id, team_member_id) DO NOTHING`,
              [defaultTeamId, existingMember.id]
            )
          }

        } else {
          // Create new team member
          const newMember = await queryOne<{ id: string }>(
            `INSERT INTO team_members (name, email, avatar_url, monday_user_id, is_active)
             VALUES ($1, $2, $3, $4, true)
             RETURNING id`,
            [mondayUser.name, mondayUser.email.toLowerCase(), mondayUser.photo_thumb, mondayUser.id]
          )

          if (newMember && defaultTeamId) {
            await queryOne(
              `INSERT INTO team_memberships (team_id, team_member_id, role)
               VALUES ($1, $2, 'member')`,
              [defaultTeamId, newMember.id]
            )
          }

          result.summary.created++
          status = 'created'
        }

        result.users.push({
          mondayId: mondayUser.id || 'unknown',
          name: mondayUser.name,
          email: mondayUser.email,
          status
        })

      } catch (userError: any) {
        console.error(`[Sync] Error processing user ${mondayUser.email}:`, userError)
        result.summary.errors++
        result.users.push({
          mondayId: mondayUser.id || 'unknown',
          name: mondayUser.name,
          email: mondayUser.email || '',
          status: 'error',
          error: userError.message
        })
      }
    }

    console.log('[Sync] Complete:', result.summary)
    return result

  } catch (error: any) {
    console.error('[Sync] Fatal error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Sync failed: ${error.message}`
    })
  }
})
