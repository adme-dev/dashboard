import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  CUSTOM_TEMPLATE_CATEGORIES,
  CODE_SIZE_LIMITS,
} from '~~/server/utils/customTemplateUtils'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  // Verify ownership or admin
  const existing = await queryOne(`
    SELECT created_by AS "createdBy", is_system AS "isSystem"
    FROM banner_custom_templates WHERE id = $1
  `, [id])
  if (!existing) throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  if (existing.createdBy !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized to edit this template' })
  }

  const body = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  let idx = 1

  if (body.name !== undefined) {
    sets.push(`name = $${idx}`); params.push(body.name); idx++
  }
  if (body.category !== undefined) {
    if (!CUSTOM_TEMPLATE_CATEGORIES.includes(body.category)) {
      throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
    }
    sets.push(`category = $${idx}`); params.push(body.category); idx++
  }
  if (body.description !== undefined) {
    sets.push(`description = $${idx}`); params.push(body.description || null); idx++
  }
  if (body.tags !== undefined) {
    sets.push(`tags = $${idx}`); params.push(body.tags); idx++
  }
  if (body.html !== undefined) {
    if (new TextEncoder().encode(body.html).length > CODE_SIZE_LIMITS.html) {
      throw createError({ statusCode: 400, statusMessage: 'HTML exceeds 500KB limit' })
    }
    sets.push(`html = $${idx}`); params.push(body.html); idx++
  }
  if (body.css !== undefined) {
    if (new TextEncoder().encode(body.css).length > CODE_SIZE_LIMITS.css) {
      throw createError({ statusCode: 400, statusMessage: 'CSS exceeds 200KB limit' })
    }
    sets.push(`css = $${idx}`); params.push(body.css); idx++
  }
  if (body.js !== undefined) {
    if (new TextEncoder().encode(body.js).length > CODE_SIZE_LIMITS.js) {
      throw createError({ statusCode: 400, statusMessage: 'JS exceeds 200KB limit' })
    }
    sets.push(`js = $${idx}`); params.push(body.js); idx++
  }
  if (body.variables !== undefined) {
    sets.push(`variables = $${idx}`); params.push(JSON.stringify(body.variables)); idx++
  }
  if (body.width !== undefined) {
    sets.push(`width = $${idx}`); params.push(body.width); idx++
  }
  if (body.height !== undefined) {
    sets.push(`height = $${idx}`); params.push(body.height); idx++
  }
  if (body.externalScripts !== undefined) {
    const safe = (body.externalScripts || []).filter((u: string) => /^https:\/\//.test(u))
    sets.push(`external_scripts = $${idx}`); params.push(safe); idx++
  }
  if (body.externalStyles !== undefined) {
    const safe = (body.externalStyles || []).filter((u: string) => /^https:\/\//.test(u))
    sets.push(`external_styles = $${idx}`); params.push(safe); idx++
  }
  if (body.thumbnailUrl !== undefined) {
    sets.push(`thumbnail_url = $${idx}`); params.push(body.thumbnailUrl || null); idx++
  }

  if (!sets.length) {
    throw createError({ statusCode: 400, statusMessage: 'No fields to update' })
  }

  sets.push('updated_at = NOW()')

  const row = await queryOne(`
    UPDATE banner_custom_templates
    SET ${sets.join(', ')}
    WHERE id = $${idx}
    RETURNING id, name, category, description, tags,
      html, css, js, variables,
      width, height, thumbnail_url AS "thumbnailUrl",
      external_scripts AS "externalScripts",
      external_styles AS "externalStyles",
      is_system AS "isSystem", usage_count AS "usageCount",
      created_by AS "createdBy", updated_at AS "updatedAt"
  `, [...params, id])

  return row
})
