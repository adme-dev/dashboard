/**
 * Public A/B test routing endpoint.
 * GET /api/public/banner-ab/:testId
 * Returns HTML that picks a variant based on traffic split weights.
 * No auth required.
 */
import { queryOne } from '~~/server/utils/db'

export default defineEventHandler(async (event) => {
  const testId = getRouterParam(event, 'testId')

  if (!testId) {
    throw createError({ statusCode: 400, statusMessage: 'Test ID is required' })
  }

  const test = await queryOne(`
    SELECT status, variants
    FROM banner_ab_tests
    WHERE id = $1
  `, [testId]) as any

  if (!test) {
    throw createError({ statusCode: 404, statusMessage: 'A/B test not found' })
  }

  if (test.status !== 'running') {
    throw createError({ statusCode: 410, statusMessage: 'A/B test is not running' })
  }

  const variants = test.variants || []
  if (!variants.length) {
    throw createError({ statusCode: 500, statusMessage: 'No variants configured' })
  }

  // Weighted random selection
  const selected = weightedRandom(variants)

  // Fetch the banner URL for the selected variant
  const published = await queryOne(`
    SELECT url, width, height
    FROM banner_published
    WHERE id = $1 AND is_live = TRUE
  `, [selected.variantId]) as any

  if (!published) {
    throw createError({ statusCode: 404, statusMessage: 'Selected variant not found or not live' })
  }

  // Return HTML that loads the selected variant in an iframe
  setResponseHeader(event, 'Content-Type', 'text/html')
  setResponseHeader(event, 'Cache-Control', 'no-store')

  return `<!DOCTYPE html>
<html><head><style>*{margin:0;padding:0;}iframe{border:none;display:block;}</style></head>
<body><iframe src="${escapeHtml(published.url)}" width="${published.width}" height="${published.height}" scrolling="no"></iframe></body></html>`
})

function weightedRandom(variants: Array<{ variantId: string; weight: number }>): { variantId: string; weight: number } {
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0)
  let random = Math.random() * totalWeight
  for (const v of variants) {
    random -= v.weight || 0
    if (random <= 0) return v
  }
  return variants[variants.length - 1]
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
