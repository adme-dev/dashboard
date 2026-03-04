import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const row = await queryOne(`
    SELECT i.id, i.template_id AS "templateId", i.name,
      i.html_override AS "htmlOverride",
      i.css_override AS "cssOverride",
      i.js_override AS "jsOverride",
      i.variable_values AS "variableValues",
      i.width, i.height,
      i.published_url AS "publishedUrl",
      i.r2_key AS "r2Key",
      i.is_published AS "isPublished",
      i.click_url AS "clickUrl",
      i.impression_pixel AS "impressionPixel",
      i.click_pixel AS "clickPixel",
      i.client_id AS "clientId",
      i.created_by AS "createdBy",
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt",
      t.name AS "templateName",
      t.category AS "templateCategory",
      t.html AS "templateHtml",
      t.css AS "templateCss",
      t.js AS "templateJs",
      t.variables AS "templateVariables",
      t.width AS "templateWidth",
      t.height AS "templateHeight",
      t.external_scripts AS "templateExternalScripts",
      t.external_styles AS "templateExternalStyles"
    FROM banner_custom_instances i
    JOIN banner_custom_templates t ON t.id = i.template_id
    WHERE i.id = $1
  `, [id])

  if (!row) throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  return row
})
