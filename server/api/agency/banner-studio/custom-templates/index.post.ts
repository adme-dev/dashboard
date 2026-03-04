import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import {
  detectVariables,
  CUSTOM_TEMPLATE_CATEGORIES,
  CODE_SIZE_LIMITS,
} from '~~/server/utils/customTemplateUtils'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { name, category, description, tags, html, css, js, width, height,
    externalScripts, externalStyles, variables, isSystem } = body

  if (!name || !category || !html) {
    throw createError({ statusCode: 400, statusMessage: 'name, category, and html are required' })
  }

  if (!CUSTOM_TEMPLATE_CATEGORIES.includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
  }

  // Dimension bounds
  const w = Number(width) || 300
  const h = Number(height) || 250
  if (w < 1 || w > 4096 || h < 1 || h > 4096) {
    throw createError({ statusCode: 400, statusMessage: 'width and height must be between 1 and 4096' })
  }

  // Size limits
  if (html && new TextEncoder().encode(html).length > CODE_SIZE_LIMITS.html) {
    throw createError({ statusCode: 400, statusMessage: 'HTML exceeds 500KB limit' })
  }
  if (css && new TextEncoder().encode(css).length > CODE_SIZE_LIMITS.css) {
    throw createError({ statusCode: 400, statusMessage: 'CSS exceeds 200KB limit' })
  }
  if (js && new TextEncoder().encode(js).length > CODE_SIZE_LIMITS.js) {
    throw createError({ statusCode: 400, statusMessage: 'JS exceeds 200KB limit' })
  }

  // Validate external URLs — HTTPS only
  const safeScripts = (externalScripts || []).filter((u: string) => /^https:\/\//.test(u))
  const safeStyles = (externalStyles || []).filter((u: string) => /^https:\/\//.test(u))

  // Auto-detect variables from code if not provided
  const defaults: Record<string, string> = {}
  if (variables) {
    for (const v of variables) {
      defaults[v.name] = v.default || ''
    }
  }
  const detectedVars = variables || detectVariables(html || '', css || '', js || '', defaults)

  // Only admin/owner can set isSystem
  const systemFlag = isSystem && ['admin', 'owner'].includes(user.role) ? true : false

  const row = await queryOne(`
    INSERT INTO banner_custom_templates
      (name, category, description, tags, html, css, js, variables,
       width, height, external_scripts, external_styles,
       is_system, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id, name, category, description, tags,
      html, css, js, variables,
      width, height, thumbnail_url AS "thumbnailUrl",
      external_scripts AS "externalScripts",
      external_styles AS "externalStyles",
      is_system AS "isSystem", usage_count AS "usageCount",
      created_by AS "createdBy", created_at AS "createdAt"
  `, [
    name,
    category,
    description || null,
    tags || [],
    html,
    css || '',
    js || '',
    JSON.stringify(detectedVars),
    w,
    h,
    safeScripts,
    safeStyles,
    systemFlag,
    user.id,
  ])

  return row
})
