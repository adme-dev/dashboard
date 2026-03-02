import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, clientId, colors, fonts, logos, guidelines } = body

  if (!name?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Brand kit name is required' })
  }

  try {
    const row = await queryOne(`
      INSERT INTO brand_kits (name, client_id, colors, fonts, logos, guidelines, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING
        id, name,
        client_id AS "clientId",
        colors, fonts, logos,
        guidelines,
        created_by AS "createdBy",
        created_at AS "createdAt",
        updated_at AS "updatedAt"
    `, [
      name.trim(),
      clientId || null,
      JSON.stringify(colors || []),
      JSON.stringify(fonts || []),
      JSON.stringify(logos || []),
      guidelines || null,
      user.id,
    ])

    return row
  } catch (error: any) {
    console.error('Failed to create brand kit:', error)
    throw createError({ statusCode: 500, statusMessage: 'Failed to create brand kit' })
  }
})
