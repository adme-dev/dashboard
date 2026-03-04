import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { detectVariables, CUSTOM_TEMPLATE_CATEGORIES } from '~~/server/utils/customTemplateUtils'

/**
 * Promote a custom banner instance to a reusable template.
 * Merges instance overrides with the base template to create a standalone template.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  // Fetch instance + base template data
  const instance = await queryOne(`
    SELECT i.id, i.name, i.html_override, i.css_override, i.js_override,
      i.variable_values, i.width, i.height, i.created_by,
      t.category, t.html, t.css, t.js, t.variables,
      t.width AS template_width, t.height AS template_height,
      t.external_scripts, t.external_styles, t.description, t.tags
    FROM banner_custom_instances i
    JOIN banner_custom_templates t ON t.id = i.template_id
    WHERE i.id = $1
  `, [id])

  if (!instance) throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  if (instance.created_by !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const body = await readBody(event)

  // Allow overriding name and category
  const name = body.name || instance.name
  const category = body.category || instance.category
  const description = body.description ?? instance.description ?? null

  if (!CUSTOM_TEMPLATE_CATEGORIES.includes(category)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid category' })
  }

  // Merge: instance overrides take priority over base template
  const finalHtml = instance.html_override ?? instance.html
  const finalCss = instance.css_override ?? instance.css
  const finalJs = instance.js_override ?? instance.js
  const finalWidth = instance.width || instance.template_width
  const finalHeight = instance.height || instance.template_height

  // Detect variables from merged code
  const defaults: Record<string, string> = {}
  const vars = typeof instance.variables === 'string' ? JSON.parse(instance.variables) : (instance.variables || [])
  for (const v of vars) {
    defaults[v.name] = v.default || ''
  }
  // Merge instance variable values as new defaults
  const instanceVals = typeof instance.variable_values === 'string'
    ? JSON.parse(instance.variable_values) : (instance.variable_values || {})
  for (const [k, v] of Object.entries(instanceVals)) {
    if (v) defaults[k] = v as string
  }
  const detectedVars = detectVariables(finalHtml, finalCss, finalJs, defaults)

  const row = await queryOne(`
    INSERT INTO banner_custom_templates
      (name, category, description, tags, html, css, js, variables,
       width, height, external_scripts, external_styles,
       is_system, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, FALSE, $13)
    RETURNING id, name, category, created_at AS "createdAt"
  `, [
    name,
    category,
    description,
    instance.tags || [],
    finalHtml,
    finalCss || '',
    finalJs || '',
    JSON.stringify(detectedVars),
    finalWidth,
    finalHeight,
    instance.external_scripts || [],
    instance.external_styles || [],
    user.id,
  ])

  return row
})
