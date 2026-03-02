import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import type { Layer, DissectorManifest, DissectorLayer } from '~/types/banner-studio'

/**
 * Import a completed dissection into a Banner Studio project.
 * Converts DissectorLayers → Banner Studio Layers and creates/updates a project.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const { FORMATS } = await import('~~/app/utils/banner-constants')

  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) {
    throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  }

  const body = await readBody(event)
  const { projectId, formatKey, layerTypeOverrides } = body || {}

  // Load manifest
  const record = await queryOne(
    `SELECT manifest, status FROM banner_dissections WHERE job_id = $1`,
    [jobId]
  )

  if (!record || record.status !== 'complete' || !record.manifest) {
    throw createError({ statusCode: 400, statusMessage: 'Dissection is not complete' })
  }

  const manifest: DissectorManifest = record.manifest

  // Determine target format
  const targetKey = formatKey || 'mrec'
  const format = FORMATS[targetKey]
  if (!format) {
    throw createError({ statusCode: 400, statusMessage: `Unknown format: ${targetKey}` })
  }

  // Convert dissector layers to Banner Studio layers
  const layers = convertLayers(manifest.layers, manifest.tokens, format.w, format.h, layerTypeOverrides)

  if (projectId) {
    // Update existing project's canvas data with new layers for this format
    const existing = await queryOne(
      `SELECT canvas_data FROM banner_projects WHERE id = $1`,
      [projectId]
    )
    if (!existing) {
      throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    }

    const canvasData = existing.canvas_data || {}
    canvasData[targetKey] = { layers }

    await execute(
      `UPDATE banner_projects SET canvas_data = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(canvasData), projectId]
    )

    // Link dissection to project
    await execute(
      `UPDATE banner_dissections SET project_id = $1, updated_at = NOW() WHERE job_id = $2`,
      [projectId, jobId]
    )

    return { projectId, formatKey: targetKey, layers }
  }

  // Create new project
  const project = await queryOne(`
    INSERT INTO banner_projects (name, canvas_data, tags, created_by)
    VALUES ($1, $2, $3, $4)
    RETURNING id, name
  `, [
    `Dissected — ${manifest.brand || 'Banner'}`,
    JSON.stringify({ [targetKey]: { layers } }),
    ['dissected', manifest.brand].filter(Boolean),
    user.id,
  ])

  // Link dissection to project
  await execute(
    `UPDATE banner_dissections SET project_id = $1, updated_at = NOW() WHERE job_id = $2`,
    [project.id, jobId]
  )

  return { projectId: project.id, formatKey: targetKey, layers }
})

function convertLayers(
  dissectorLayers: DissectorLayer[],
  tokens: Record<string, any>,
  targetW: number,
  targetH: number,
  typeOverrides?: Record<string, string>
): Layer[] {
  let idCounter = 1
  const layers: Layer[] = []

  // Sort by z_index
  const sorted = [...dissectorLayers].sort((a, b) => a.z_index - b.z_index)

  for (const dl of sorted) {
    const id = idCounter++
    const x = Math.round(dl.region.x * targetW)
    const y = Math.round(dl.region.y * targetH)
    const w = Math.round(dl.region.width * targetW)
    const h = Math.round(dl.region.height * targetH)

    // Use override type if provided, otherwise auto-map from dissector type
    const editorType = typeOverrides?.[dl.id] || autoMapType(dl.type)

    switch (editorType) {
      case 'bg': {
        layers.push({
          id,
          type: 'bg',
          name: dl.description || 'Background',
          x: 0, y: 0, w: targetW, h: targetH,
          zIndex: dl.z_index,
          opacity: 1,
          src: dl.r2_url,
          fit: 'cover',
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
        })
        break
      }

      case 'text': {
        const tokenValue = findTokenValue(dl, tokens)
        const typo = dl.typography ? Object.values(dl.typography)[0] : undefined

        // Scale fontSize proportionally to target canvas height
        // AI reports font sizes relative to the original banner; scale to target
        let fontSize = typo ? parseInt(typo.font_size) || 24 : 24
        // Estimate: use layer height to guess a reasonable font size for the target
        if (!typo?.font_size && h > 0) {
          fontSize = Math.max(12, Math.min(72, Math.round(h * 0.6)))
        }

        layers.push({
          id,
          type: 'text',
          name: dl.description || 'Text',
          x, y, w, h,
          zIndex: dl.z_index,
          opacity: 1,
          text: tokenValue || dl.description || 'Text',
          fontSize,
          fontWeight: typo ? parseInt(typo.font_weight) || 700 : 700,
          color: typo?.color || '#ffffff',
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
        })
        break
      }

      case 'button': {
        const tokenValue = findTokenValue(dl, tokens)
        layers.push({
          id,
          type: 'button',
          name: dl.description || 'Button',
          x, y, w, h,
          zIndex: dl.z_index,
          opacity: 1,
          text: tokenValue || dl.description || 'Click Here',
          bgColor: '#000000',
          color: '#FFFFFF',
          borderRadius: 4,
          fontSize: 16,
          fontWeight: 700,
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
        })
        break
      }

      case 'rect': {
        layers.push({
          id,
          type: 'rect',
          name: dl.description || 'Rectangle',
          x, y, w, h,
          zIndex: dl.z_index,
          opacity: 1,
          fillColor: '#CCCCCC',
          borderRadius: 0,
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
        })
        break
      }

      case 'image':
      default: {
        layers.push({
          id,
          type: 'image',
          name: dl.description || dl.type,
          x, y, w, h,
          zIndex: dl.z_index,
          opacity: 1,
          src: dl.r2_url,
          fit: 'cover',
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5,
        })
        break
      }
    }
  }

  return layers
}

/** Map dissector layer types to editor layer types */
function autoMapType(dissectorType: string): string {
  switch (dissectorType) {
    case 'background': return 'bg'
    case 'live_text': return 'text'
    case 'graphic_text': return 'text'
    case 'vehicle':
    case 'logo':
    default:
      return 'image'
  }
}

function findTokenValue(layer: DissectorLayer, tokens: Record<string, any>): string | null {
  if (!layer.token_bindings?.length) return null

  for (const binding of layer.token_bindings) {
    // token_bindings now use token IDs (e.g. "token.price") — look up directly
    if (tokens[binding]) {
      return tokens[binding].value
    }
  }

  return null
}
