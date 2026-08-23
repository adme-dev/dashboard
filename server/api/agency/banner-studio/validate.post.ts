/**
 * Validate banner formats against platform specs.
 * POST /api/agency/banner-studio/validate
 * Body: { projectId } or { formats: [{ formatKey, width, height, fileSize?, ... }] }
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { validateBanner } from '~~/server/utils/bannerValidator'
import { getDefaultBrandKitForClient } from '~~/server/utils/banner/brandKits'
import { brandDriftRules } from '~~/server/utils/banner/brandDrift'
import type { BannerValidationInput } from '~~/server/utils/bannerValidator'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formats: directFormats } = body as {
    projectId?: string
    formats?: BannerValidationInput[]
  }

  let inputs: BannerValidationInput[] = []
  let brandKit: Awaited<ReturnType<typeof getDefaultBrandKitForClient>> = null
  let brandLayersByFormat: Record<string, any[]> = {}

  if (directFormats?.length) {
    inputs = directFormats
  } else if (projectId) {
    // Build validation inputs from project data
    const project = await queryOne(`
      SELECT canvas_data AS "canvasData", client_id AS "clientId"
      FROM banner_projects WHERE id = $1
    `, [projectId]) as any

    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    const canvasData = typeof project.canvasData === 'string'
      ? JSON.parse(project.canvasData)
      : project.canvasData || {}
    brandKit = await getDefaultBrandKitForClient(project.clientId)
    brandLayersByFormat = Object.fromEntries(Object.keys(canvasData).map(k => [k, canvasData[k]?.layers || []]))

    // Get published banner file sizes
    const published = await queryRows(`
      SELECT format_key AS "formatKey", file_size AS "fileSize", click_url AS "clickUrl"
      FROM banner_published WHERE project_id = $1
    `, [projectId]) as any[]

    const publishedMap = new Map(published.map((p: any) => [p.formatKey, p]))

    // Get format specs
    const { FORMATS } = await import('~~/app/utils/banner-constants')

    for (const key of Object.keys(canvasData)) {
      const fmt = FORMATS[key]
      if (!fmt) continue

      const layers = canvasData[key]?.layers || []
      const pub = publishedMap.get(key)

      // Estimate text ratio (approximate: sum of text layer areas / format area)
      const formatArea = fmt.w * fmt.h
      const textArea = layers
        .filter((l: any) => l.type === 'text' || l.type === 'button')
        .reduce((sum: number, l: any) => sum + (l.w || 0) * (l.h || 0), 0)

      // Calculate max animation duration from layer delays + assumed 1s each
      const maxDelay = layers.reduce((max: number, l: any) => Math.max(max, (l.delay || 0) + 1), 0)

      inputs.push({
        formatKey: key,
        width: fmt.w,
        height: fmt.h,
        fileSize: pub?.fileSize || undefined,
        animationDuration: maxDelay > 0 ? maxDelay : undefined,
        hasClickTag: pub?.clickUrl ? true : false,
        layerCount: layers.length,
        hasText: layers.some((l: any) => l.type === 'text' || l.type === 'button'),
        textRatio: formatArea > 0 ? textArea / formatArea : 0,
      })
    }
  } else {
    throw createError({ statusCode: 400, statusMessage: 'projectId or formats are required' })
  }

  const results = inputs.map((input) => {
    const r = validateBanner(input)
    // Brand-drift warnings against the client's default kit (only when validating a project)
    const drift = brandDriftRules(brandLayersByFormat[input.formatKey] || [], brandKit as any)
    if (drift.length) {
      r.rules.push(...drift)
      r.warnings += drift.length
    }
    return r
  })

  const totalErrors = results.reduce((sum, r) => sum + r.errors, 0)
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings, 0)

  return {
    results,
    summary: {
      formats: results.length,
      errors: totalErrors,
      warnings: totalWarnings,
      allPassed: totalErrors === 0,
    },
  }
})
