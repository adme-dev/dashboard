/**
 * Update current client portal user profile.
 * PUT /api/portal/profile
 */

import { queryOne } from '~~/server/utils/db'
import { requireClientAuth } from '~~/server/utils/clientAuth'

interface UpdatePortalProfileBody {
  name?: string
  title?: string
  phone?: string
  timezone?: string
}

const MAX_NAME_LENGTH = 120
const MAX_TITLE_LENGTH = 120
const MAX_PHONE_LENGTH = 60
const MAX_TIMEZONE_LENGTH = 80

const cleanOptional = (value: unknown, maxLength: number) => {
  if (value == null) return null
  if (typeof value !== 'string') return null
  const cleaned = value.trim()
  return cleaned ? cleaned.slice(0, maxLength) : null
}

export default defineEventHandler(async (event) => {
  const clientUser = await requireClientAuth(event)

  if (clientUser.agencyAccess) {
    throw createError({
      statusCode: 403,
      statusMessage: 'Agency preview profiles are read-only'
    })
  }

  const body = await readBody<UpdatePortalProfileBody>(event)

  const name = cleanOptional(body.name, MAX_NAME_LENGTH)
  if (!name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Name is required'
    })
  }

  try {
    const user = await queryOne(`
      UPDATE client_users
      SET
        name = $1,
        title = $2,
        phone = $3,
        timezone = $4,
        updated_at = NOW()
      WHERE id = $5
        AND client_id = $6
        AND status = 'active'
      RETURNING id, email, name, title, phone, timezone, updated_at
    `, [
      name,
      cleanOptional(body.title, MAX_TITLE_LENGTH),
      cleanOptional(body.phone, MAX_PHONE_LENGTH),
      cleanOptional(body.timezone, MAX_TIMEZONE_LENGTH) || 'UTC',
      clientUser.id,
      clientUser.clientId
    ])

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Client user not found'
      })
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        title: user.title,
        phone: user.phone,
        timezone: user.timezone,
        updatedAt: user.updated_at
      }
    }
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'statusCode' in error) throw error
    console.error('Failed to update portal profile:', error)
    throw createError({
      statusCode: 500,
      statusMessage: 'Failed to update profile'
    })
  }
})
