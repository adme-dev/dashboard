import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { buildPlatformHTML, validateForPlatform, buildExportZip } from '~~/server/utils/adPlatformExporter'

const VALID_PLATFORMS = [
  'generic_iab', 'google_ads', 'dv360', 'google_ad_manager', 'cm360',
  'google_adsense', 'amazon_dsp', 'trade_desk', 'xandr', 'sizmek',
  'flashtalking', 'adroll', 'criteo', 'yahoo_dsp',
]

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)

  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'ID required' })

  const body = await readBody(event)
  const { platform } = body || {}

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    throw createError({ statusCode: 400, statusMessage: `Invalid platform. Valid: ${VALID_PLATFORMS.join(', ')}` })
  }

  // Load instance + template (same query as publish.post.ts)
  const instance = await queryOne(`
    SELECT i.id, i.name, i.template_id,
      i.html_override, i.css_override, i.js_override,
      i.variable_values, i.width, i.height,
      i.click_url, i.created_by,
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

  const w = instance.width || instance.t_width
  const h = instance.height || instance.t_height

  // Build platform-compliant HTML
  const html = buildPlatformHTML({
    html: instance.html_override || instance.html,
    css: instance.css_override || instance.css,
    js: instance.js_override || instance.js,
    width: w,
    height: h,
    variables,
    variableValues,
    externalScripts: instance.external_scripts || [],
    externalStyles: instance.external_styles || [],
    platformId: platform,
    clickUrl: instance.click_url || undefined,
  })

  // Validate
  const validation = validateForPlatform(html, platform)

  // Build ZIP
  const zipBuffer = await buildExportZip(html)

  // Generate filename
  const safeName = (instance.name || 'banner')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
  const filename = `${safeName}_${w}x${h}_${platform}.zip`

  return {
    zipBase64: zipBuffer.toString('base64'),
    filename,
    htmlSize: validation.htmlSize,
    zipSize: zipBuffer.length,
    warnings: validation.warnings,
  }
})
