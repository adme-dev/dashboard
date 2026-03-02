/**
 * Create a new A/B test
 * POST /api/agency/banner-studio/ab-tests
 * Body: { projectId, formatKey, name, variants: [{ variantId, label, weight }] }
 */
import { queryOne } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formatKey, name, variants } = body as {
    projectId: string
    formatKey: string
    name: string
    variants: Array<{ variantId: string; label: string; weight: number }>
  }

  if (!projectId || !formatKey || !name) {
    throw createError({ statusCode: 400, statusMessage: 'projectId, formatKey, and name are required' })
  }

  if (!Array.isArray(variants) || variants.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'At least 2 variants are required' })
  }

  // Normalize weights to sum to 100
  const totalWeight = variants.reduce((sum, v) => sum + (v.weight || 0), 0)
  const normalized = variants.map(v => ({
    ...v,
    weight: totalWeight > 0 ? Math.round((v.weight / totalWeight) * 100) : Math.round(100 / variants.length),
  }))

  return queryOne(`
    INSERT INTO banner_ab_tests (project_id, format_key, name, variants, created_by)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING
      id, project_id AS "projectId", format_key AS "formatKey",
      name, status, variants, created_at AS "createdAt"
  `, [projectId, formatKey, name.trim(), JSON.stringify(normalized), user.id])
})
