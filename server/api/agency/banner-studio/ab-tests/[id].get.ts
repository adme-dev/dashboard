/**
 * Get a specific A/B test with results
 * GET /api/agency/banner-studio/ab-tests/:id
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')

  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Test ID is required' })
  }

  const test = await queryOne(`
    SELECT
      t.id, t.project_id AS "projectId",
      t.format_key AS "formatKey",
      t.name, t.status, t.variants,
      t.winner_id AS "winnerId",
      t.created_at AS "createdAt",
      t.updated_at AS "updatedAt"
    FROM banner_ab_tests t
    WHERE t.id = $1
  `, [id]) as any

  if (!test) {
    throw createError({ statusCode: 404, statusMessage: 'A/B test not found' })
  }

  // Get analytics for each variant
  const variantIds = (test.variants || []).map((v: any) => v.variantId)
  let variantResults: any[] = []

  if (variantIds.length) {
    const placeholders = variantIds.map((_: string, i: number) => `$${i + 1}`).join(', ')
    variantResults = await queryRows(`
      SELECT
        p.id AS "variantId",
        p.format_key AS "formatKey",
        COALESCE(SUM(a.impressions), 0)::int AS "impressions",
        COALESCE(SUM(a.clicks), 0)::int AS "clicks",
        CASE
          WHEN COALESCE(SUM(a.impressions), 0) > 0
          THEN ROUND(SUM(a.clicks)::numeric / SUM(a.impressions) * 100, 2)
          ELSE 0
        END AS "ctr"
      FROM banner_published p
      LEFT JOIN banner_analytics a ON a.published_id = p.id
      WHERE p.id IN (${placeholders})
      GROUP BY p.id, p.format_key
    `, variantIds) as any[]
  }

  // Merge results into variants
  const variantsWithResults = (test.variants || []).map((v: any) => {
    const result = variantResults.find((r: any) => r.variantId === v.variantId) || {}
    return {
      ...v,
      impressions: Number(result.impressions || 0),
      clicks: Number(result.clicks || 0),
      ctr: Number(result.ctr || 0),
    }
  })

  // Calculate statistical significance (simplified z-test for proportions)
  let confidence = 0
  if (variantsWithResults.length === 2) {
    const [a, b] = variantsWithResults
    if (a.impressions > 0 && b.impressions > 0) {
      const pA = a.clicks / a.impressions
      const pB = b.clicks / b.impressions
      const pPool = (a.clicks + b.clicks) / (a.impressions + b.impressions)
      const se = Math.sqrt(pPool * (1 - pPool) * (1 / a.impressions + 1 / b.impressions))
      if (se > 0) {
        const z = Math.abs(pA - pB) / se
        // Approximate p-value from z-score
        confidence = Math.min(99.9, Math.round(zToConfidence(z) * 10) / 10)
      }
    }
  }

  return {
    ...test,
    variants: variantsWithResults,
    confidence,
  }
})

function zToConfidence(z: number): number {
  // Simplified lookup for common z values → confidence %
  if (z >= 2.576) return 99
  if (z >= 1.96) return 95
  if (z >= 1.645) return 90
  if (z >= 1.28) return 80
  if (z >= 0.84) return 60
  return Math.min(50, z * 30)
}
