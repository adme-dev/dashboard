import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')
  const body = await readBody(event)

  const sets: string[] = []
  const params: any[] = []

  if (body.name !== undefined) {
    if (!body.name?.trim()) {
      throw createError({ statusCode: 400, statusMessage: 'Brand kit name cannot be empty' })
    }
    params.push(body.name.trim())
    sets.push(`name = $${params.length}`)
  }
  if (body.clientId !== undefined) {
    params.push(body.clientId || null)
    sets.push(`client_id = $${params.length}`)
  }
  if (body.colors !== undefined) {
    params.push(JSON.stringify(body.colors))
    sets.push(`colors = $${params.length}`)
  }
  if (body.fonts !== undefined) {
    params.push(JSON.stringify(body.fonts))
    sets.push(`fonts = $${params.length}`)
  }
  if (body.logos !== undefined) {
    params.push(JSON.stringify(body.logos))
    sets.push(`logos = $${params.length}`)
  }
  if (body.guidelines !== undefined) {
    params.push(body.guidelines || null)
    sets.push(`guidelines = $${params.length}`)
  }

  if (sets.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')
  params.push(id)

  const row = await queryOne(`
    UPDATE brand_kits
    SET ${sets.join(', ')}
    WHERE id = $${params.length}
    RETURNING
      id, name,
      client_id AS "clientId",
      colors, fonts, logos,
      guidelines,
      created_by AS "createdBy",
      created_at AS "createdAt",
      updated_at AS "updatedAt"
  `, params)

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Brand kit not found' })
  }

  return row
})
