import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { uploadFile } from '~~/server/utils/storage'
import { assembleCustomBannerHTML } from '~~/server/utils/customTemplateUtils'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const body = await readBody(event)
  const { clickUrl, impressionPixel, clickPixel } = body || {}

  // Validate URLs
  if (clickUrl && !isValidHttpUrl(clickUrl)) {
    throw createError({ statusCode: 400, statusMessage: 'clickUrl must be a valid HTTP(S) URL' })
  }
  if (impressionPixel && !isValidHttpUrl(impressionPixel)) {
    throw createError({ statusCode: 400, statusMessage: 'impressionPixel must be a valid HTTP(S) URL' })
  }
  if (clickPixel && !isValidHttpUrl(clickPixel)) {
    throw createError({ statusCode: 400, statusMessage: 'clickPixel must be a valid HTTP(S) URL' })
  }

  // Load instance + template
  const instance = await queryOne(`
    SELECT i.id, i.template_id,
      i.html_override, i.css_override, i.js_override,
      i.variable_values, i.width, i.height,
      i.click_url, i.impression_pixel, i.click_pixel,
      i.created_by,
      t.html, t.css, t.js, t.variables,
      t.width AS t_width, t.height AS t_height,
      t.external_scripts, t.external_styles
    FROM banner_custom_instances i
    JOIN banner_custom_templates t ON t.id = i.template_id
    WHERE i.id = $1
  `, [id])

  if (!instance) throw createError({ statusCode: 404, statusMessage: 'Instance not found' })
  if (instance.created_by !== user.id && !['admin', 'owner'].includes(user.role)) {
    throw createError({ statusCode: 403, statusMessage: 'Not authorized' })
  }

  const variables = typeof instance.variables === 'string'
    ? JSON.parse(instance.variables) : (instance.variables || [])
  const variableValues = typeof instance.variable_values === 'string'
    ? JSON.parse(instance.variable_values) : (instance.variable_values || {})

  const finalClickUrl = clickUrl ?? instance.click_url
  const finalImpressionPixel = impressionPixel ?? instance.impression_pixel
  const finalClickPixel = clickPixel ?? instance.click_pixel

  const w = instance.width || instance.t_width
  const h = instance.height || instance.t_height

  // Assemble the HTML
  const finalHtml = assembleCustomBannerHTML({
    html: instance.html_override || instance.html,
    css: instance.css_override || instance.css,
    js: instance.js_override || instance.js,
    width: w,
    height: h,
    variables,
    variableValues,
    externalScripts: instance.external_scripts || [],
    externalStyles: instance.external_styles || [],
    clickUrl: finalClickUrl || undefined,
    impressionPixel: finalImpressionPixel || undefined,
    clickPixel: finalClickPixel || undefined,
  })

  // Upload to R2 at isolated path
  const r2Key = `banner-custom/${id}/index.html`
  const buffer = Buffer.from(finalHtml, 'utf-8')
  const { url } = await uploadFile(buffer, r2Key, 'text/html')

  // Update instance record
  const row = await queryOne(`
    UPDATE banner_custom_instances
    SET published_url = $1, r2_key = $2, is_published = TRUE,
      click_url = $3, impression_pixel = $4, click_pixel = $5,
      updated_at = NOW()
    WHERE id = $6
    RETURNING id, name, published_url AS "publishedUrl",
      r2_key AS "r2Key", is_published AS "isPublished",
      click_url AS "clickUrl",
      width, height, updated_at AS "updatedAt"
  `, [url, r2Key, finalClickUrl || null, finalImpressionPixel || null, finalClickPixel || null, id])

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
