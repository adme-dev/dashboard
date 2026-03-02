/**
 * Validate banner formats against platform specs.
 * POST /api/agency/banner-studio/validate
 * Body: { projectId } or { formats: [{ formatKey, width, height, fileSize?, ... }] }
 */
import { queryOne, queryRows } from '~~/server/utils/db'
import { requireAuth } from '~~/server/utils/auth'
import { validateBanner } from '~~/server/utils/bannerValidator'
import type { BannerValidationInput } from '~~/server/utils/bannerValidator'

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const body = await readBody(event)

  const { projectId, formats: directFormats } = body as {
    projectId?: string
    formats?: BannerValidationInput[]
  }

  let inputs: BannerValidationInput[] = []

  if (directFormats?.length) {
    inputs = directFormats
  } else if (projectId) {
    // Build validation inputs from project data
    const project = await queryOne(`
      SELECT canvas_data AS "canvasData"
      FROM banner_projects WHERE id = $1
    `, [projectId]) as any

    if (!project) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    const canvasData = typeof project.canvasData === 'string'
      ? JSON.parse(project.canvasData)
      : project.canvasData || {}

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

  const results = inputs.map(input => validateBanner(input))

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
