/**
 * Preview Monday.com users before syncing
 * GET /api/monday/users/preview
 * 
 * Shows what users exist in Monday.com and their sync status
 */

import { requireAuth } from '../../../utils/auth'
import { queryRows } from '../../../utils/db'
import { MondayClient } from '../../../utils/mondayClient'

export default eventHandler(async (event) => {
  await requireAuth(event)

  const apiToken = process.env.MONDAY_API_TOKEN
  if (!apiToken) {
    throw createError({ statusCode: 500, statusMessage: 'MONDAY_API_TOKEN not configured' })
  }

  try {
    const client = new MondayClient(apiToken)

    // Fetch users from Monday
    const mondayUsers = await client.getUsers({ limit: 500 })

    // Get existing local users
    const existingMembers = await queryRows<{ 
      id: string
      name: string
      email: string
      monday_user_id?: string
      avatar_url?: string
    }>('SELECT id, name, email, monday_user_id, avatar_url FROM team_members WHERE is_active = true')

    const existingByEmailMap = new Map(existingMembers.map(m => [m.email.toLowerCase(), m]))
    const existingByMondayId = new Map(existingMembers.filter(m => m.monday_user_id).map(m => [m.monday_user_id!, m]))

    // Compare and categorize
    const preview = mondayUsers.map(mondayUser => {
      const existingByMonday = mondayUser.id ? existingByMondayId.get(mondayUser.id) : null
      const existingByEmail = mondayUser.email ? existingByEmailMap.get(mondayUser.email.toLowerCase()) : null
      const existing = existingByMonday || existingByEmail

      if (existing) {
        const willUpdate = existing.name !== mondayUser.name || 
                          existing.avatar_url !== mondayUser.photo_thumb
        
        return {
          mondayId: mondayUser.id,
          name: mondayUser.name,
          email: mondayUser.email,
          photoUrl: mondayUser.photo_thumb,
          status: willUpdate ? 'will_update' : 'exists',
          existingId: existing.id,
          changes: willUpdate ? {
            name: existing.name !== mondayUser.name ? { from: existing.name, to: mondayUser.name } : null,
            avatar: existing.avatar_url !== mondayUser.photo_thumb ? { from: existing.avatar_url, to: mondayUser.photo_thumb } : null
          } : null
        }
      } else {
        return {
          mondayId: mondayUser.id,
          name: mondayUser.name,
          email: mondayUser.email,
          photoUrl: mondayUser.photo_thumb,
          status: 'will_create'
        }
      }
    })

    // Find local users not in Monday (orphaned)
    const mondayEmails = new Set(mondayUsers.filter(u => u.email).map(u => u.email!.toLowerCase()))
    const mondayIds = new Set(mondayUsers.filter(u => u.id).map(u => u.id))
    
    const orphaned = existingMembers.filter(existing => {
      const hasMondayId = existing.monday_user_id && mondayIds.has(existing.monday_user_id)
      const hasMatchingEmail = existing.email && mondayEmails.has(existing.email.toLowerCase())
      return !hasMondayId && !hasMatchingEmail
    })

    return {
      preview: preview.sort((a, b) => {
        // Sort by status: will_create first, then will_update, then exists
        const statusOrder = { will_create: 0, will_update: 1, exists: 2 }
        return statusOrder[a.status] - statusOrder[b.status]
      }),
      orphaned: orphaned.map(o => ({
        id: o.id,
        name: o.name,
        email: o.email
      })),
      summary: {
        mondayTotal: mondayUsers.length,
        willCreate: preview.filter(p => p.status === 'will_create').length,
        willUpdate: preview.filter(p => p.status === 'will_update').length,
        exists: preview.filter(p => p.status === 'exists').length,
        orphaned: orphaned.length
      }
    }

  } catch (error: any) {
    console.error('[Monday Preview] Error:', error)
    throw createError({
      statusCode: 500,
      statusMessage: `Failed to preview users: ${error.message}`
    })
  }
})
