import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { CODE_SIZE_LIMITS } from '~~/server/utils/customTemplateUtils'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  // Verify ownership
  const existing = await queryOne(`
    SELECT created_by AS "createdBy" FROM banner_custom_instances WHERE id = $1
  `, [id])
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  if (existing.createdBy !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  let idx = 1

  if (body.name !== undefined) {
    sets.push(`name = $${idx}`); params.push(body.name); idx++
  }
  if (body.htmlOverride !== undefined) {
    if (body.htmlOverride && new TextEncoder().encode(body.htmlOverride).length > CODE_SIZE_LIMITS.html) {
      throw createError({ statusCode: 400, statusMessage: 'HTML exceeds 500KB limit' })
    }
    sets.push(`html_override = $${idx}`); params.push(body.htmlOverride || null); idx++
  }
  if (body.cssOverride !== undefined) {
    if (body.cssOverride && new TextEncoder().encode(body.cssOverride).length > CODE_SIZE_LIMITS.css) {
      throw createError({ statusCode: 400, statusMessage: 'CSS exceeds 200KB limit' })
    }
    sets.push(`css_override = $${idx}`); params.push(body.cssOverride || null); idx++
  }
  if (body.jsOverride !== undefined) {
    if (body.jsOverride && new TextEncoder().encode(body.jsOverride).length > CODE_SIZE_LIMITS.js) {
      throw createError({ statusCode: 400, statusMessage: 'JS exceeds 200KB limit' })
    }
    sets.push(`js_override = $${idx}`); params.push(body.jsOverride || null); idx++
  }
  if (body.variableValues !== undefined) {
    sets.push(`variable_values = $${idx}`); params.push(JSON.stringify(body.variableValues)); idx++
  }
  if (body.width !== undefined) {
    sets.push(`width = $${idx}`); params.push(body.width); idx++
  }
  if (body.height !== undefined) {
    sets.push(`height = $${idx}`); params.push(body.height); idx++
  }
  if (body.clickUrl !== undefined) {
    if (body.clickUrl && !isValidHttpUrl(body.clickUrl)) {
      throw createError({ statusCode: 400, statusMessage: 'clickUrl must be a valid HTTP(S) URL' })
    }
    sets.push(`click_url = $${idx}`); params.push(body.clickUrl || null); idx++
  }
  if (body.impressionPixel !== undefined) {
    if (body.impressionPixel && !isValidHttpUrl(body.impressionPixel)) {
      throw createError({ statusCode: 400, statusMessage: 'impressionPixel must be a valid HTTP(S) URL' })
    }
    sets.push(`impression_pixel = $${idx}`); params.push(body.impressionPixel || null); idx++
  }
  if (body.clickPixel !== undefined) {
    if (body.clickPixel && !isValidHttpUrl(body.clickPixel)) {
      throw createError({ statusCode: 400, statusMessage: 'clickPixel must be a valid HTTP(S) URL' })
    }
    sets.push(`click_pixel = $${idx}`); params.push(body.clickPixel || null); idx++
  }
  if (body.clientId !== undefined) {
    sets.push(`client_id = $${idx}`); params.push(body.clientId || null); idx++
  }

  if (!sets.length) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')

  const row = await queryOne(`
    UPDATE banner_custom_instances
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING id, name, variable_values AS "variableValues",
      html_override AS "htmlOverride",
      css_override AS "cssOverride",
      js_override AS "jsOverride",
      width, height,
      click_url AS "clickUrl",
      impression_pixel AS "impressionPixel",
      click_pixel AS "clickPixel",
      is_published AS "isPublished",
      updated_at AS "updatedAt"
  `, [...params, id])

  return row
})

function isValidHttpUrl(str: string): boolean {
  try {
    const u = new URL(str)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
