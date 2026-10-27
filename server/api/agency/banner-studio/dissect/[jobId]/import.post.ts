import { requireWriteAccess } from '~~/server/utils/auth'
import { transaction } from '~~/server/utils/db'
import { createHash, randomUUID } from 'node:crypto'
import { dissectionResultId } from '~~/server/utils/banner/dissectionJobs'
import { hasAllSocialClientAccess, requireSocialClientAccess } from '~~/server/utils/social/clientAccess'
import { z } from 'zod'
import { canImportDissection } from '../../../../../../shared/bannerDissectionReadiness'
import { assertManagedQrTransition } from '../../../../../../shared/bannerQrProtection'
import { FORMATS } from '../../../../../../shared/bannerFormats'
import type { Layer, DissectorManifest, DissectorLayer, DesignToken } from '~~/app/types/banner-studio'

/**
 * Import a completed dissection into a Banner Studio project.
 * Converts DissectorLayers → Banner Studio Layers and creates/updates a project.
 */
const importSchema = z.object({
  expectedResultId: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.string().uuid().optional(),
  formatKey: z.string().min(1).optional(),
  expectedRevision: z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid project revision').optional(),
  layerTypeOverrides: z.record(z.string(), z.enum(['bg', 'text', 'button', 'rect', 'image'])).optional()
}).strict()

interface ImportResponse { projectId: string, formatKey: string, layers: Layer[], revision: string, receiptId: string }
interface ImportReceipt { intentHash: string, sourceResultId: string, response: ImportResponse }

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  const parsed = importSchema.safeParse(await readBody(event) || {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid dissection import options' })
  const { projectId, expectedRevision, layerTypeOverrides } = parsed.data
  const targetKey = parsed.data.formatKey || 'mrec'
  const format = Object.prototype.hasOwnProperty.call(FORMATS, targetKey) ? FORMATS[targetKey] : undefined
  if (!format) throw createError({ statusCode: 400, statusMessage: 'Unknown format' })
  if (projectId && !expectedRevision) throw createError({ statusCode: 409, statusMessage: 'Reload and review the saved project before importing; its expectedRevision is required' })
  if (!projectId && expectedRevision) throw createError({ statusCode: 400, statusMessage: 'A project revision requires an existing target' })

  return await transaction(async (db): Promise<ImportResponse> => {
    // Job lock serializes duplicate imports, cancellation, retry and their receipts.
    const { rows: [record] } = await db.query(
      'SELECT * FROM banner_dissections WHERE job_id = $1 AND user_id = $2 FOR UPDATE', [jobId, user.id]
    )
    if (!record) throw createError({ statusCode: 404, statusMessage: 'Dissection job not found' })
    if (typeof record.source_r2_key !== 'string' || !record.source_r2_key.startsWith(`banner-dissector/${jobId}/original.`)) {
      throw createError({ statusCode: 409, statusMessage: 'The original source is not owned by this job' })
    }
    const manifest = record.manifest as DissectorManifest & { execution?: Record<string, unknown>, importReceipt?: ImportReceipt }
    if (!manifest) throw createError({ statusCode: 409, statusMessage: 'This job has no reviewed result' })
    const sourceResultId = dissectionResultId(manifest, manifest.execution?.attemptId as string | undefined)
    if (parsed.data.expectedResultId !== sourceResultId) throw createError({ statusCode: 409, statusMessage: 'The analysis result changed since review. Reload and review before importing again.' })
    const overrides = Object.fromEntries(Object.entries(layerTypeOverrides || {}).sort(([a], [b]) => a.localeCompare(b)))
    const intentHash = createHash('sha256').update(JSON.stringify({
      jobId, source: record.source_r2_key, sourceResultId, projectId: projectId || null,
      expectedRevision: expectedRevision ? new Date(expectedRevision).toISOString() : null,
      formatKey: targetKey, layerTypeOverrides: overrides
    })).digest('hex')
    const receipt = manifest.importReceipt
    const targetId = record.status === 'imported' ? record.project_id : projectId
    let existing: { canvas_data: Record<string, unknown>, client_id: string | null, created_by: string, updated_at: string } | undefined
    if (targetId) {
      const result = await db.query('SELECT canvas_data, client_id, created_by, updated_at FROM banner_projects WHERE id = $1 FOR UPDATE', [targetId])
      existing = result.rows[0]
      if (!existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
      if (existing.client_id) await requireSocialClientAccess(event, existing.client_id)
      else if (existing.created_by !== user.id && !hasAllSocialClientAccess(user)) throw createError({ statusCode: 403, statusMessage: 'No access to this project' })
    }
    if (record.status === 'imported') {
      if (!targetId || !receipt || receipt.intentHash !== intentHash || receipt.sourceResultId !== sourceResultId || receipt.response.projectId !== targetId) {
        throw createError({ statusCode: 409, statusMessage: 'This result was already imported with a different intent' })
      }
      return receipt.response
    }
    if (record.status !== 'complete' || !canImportDissection(manifest)) {
      throw createError({ statusCode: 409, statusMessage: 'This analysis needs reconstruction before it can be imported. No artwork was changed.' })
    }
    if (existing && new Date(existing.updated_at).getTime() !== Date.parse(expectedRevision!)) {
      throw createError({ statusCode: 409, statusMessage: 'Artwork changed since review. Reload and review before importing again.' })
    }
    const layers = convertLayers(manifest.layers, manifest.tokens, format.w, format.h, layerTypeOverrides)
    let importedProjectId: string
    let revision: string
    if (existing && projectId) {
      const canvasData = structuredClone(existing.canvas_data || {})
      canvasData[targetKey] = { layers }
      try {
        assertManagedQrTransition(existing.canvas_data, canvasData)
      } catch {
        throw createError({ statusCode: 409, statusMessage: 'This import would alter a managed QR code. Import into a new project or remove that code explicitly first.' })
      }
      const { rows: [updated] } = await db.query(
        `UPDATE banner_projects SET canvas_data = $1,
         updated_at = GREATEST(date_trunc('milliseconds', clock_timestamp()), date_trunc('milliseconds', updated_at) + interval '1 millisecond')
         WHERE id = $2 AND date_trunc('milliseconds', updated_at) = date_trunc('milliseconds', $3::timestamptz) RETURNING id, updated_at`,
        [JSON.stringify(canvasData), projectId, expectedRevision]
      )
      if (!updated) throw createError({ statusCode: 409, statusMessage: 'Artwork changed during import. Reload and review before importing again.' })
      importedProjectId = updated.id
      revision = new Date(updated.updated_at).toISOString()
    } else {
      const { rows: [created] } = await db.query(
        `INSERT INTO banner_projects (name, canvas_data, tags, created_by)
         VALUES ($1, $2, $3, $4) RETURNING id, updated_at`,
        [`Dissected — ${manifest.brand || 'Banner'}`, JSON.stringify({ [targetKey]: { layers } }), ['dissected', manifest.brand].filter(Boolean), user.id]
      )
      importedProjectId = created.id
      revision = new Date(created.updated_at).toISOString()
    }
    const response: ImportResponse = { projectId: importedProjectId, formatKey: targetKey, layers, revision, receiptId: randomUUID() }
    const importedManifest = {
      ...manifest, status: 'imported',
      ...(manifest.execution ? { execution: { ...manifest.execution, stage: 'imported', updatedAt: new Date().toISOString() } } : {}),
      importReceipt: { intentHash, sourceResultId, response } satisfies ImportReceipt
    }
    // This write and the project mutation commit or roll back together.
    await db.query(
      `UPDATE banner_dissections SET project_id = $1, manifest = $2::jsonb, status = 'imported', updated_at = NOW()
       WHERE job_id = $3 AND user_id = $4`,
      [importedProjectId, JSON.stringify(importedManifest), jobId, user.id]
    )
    return response
  })
})

function convertLayers(
  dissectorLayers: DissectorLayer[],
  tokens: Record<string, DesignToken>,
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
    if (!['bg', 'text', 'button', 'rect', 'image'].includes(editorType)) {
      throw createError({ statusCode: 400, statusMessage: 'Unsupported layer type' })
    }
    if (editorType === 'rect' || (editorType === 'bg' && dl.type !== 'background')
      || ((editorType === 'image' || editorType === 'bg') && !dl.r2_url)) {
      throw createError({ statusCode: 409, statusMessage: 'This conversion has no extracted artwork. Reconstruct the element separately.' })
    }
    if ((editorType === 'text' || editorType === 'button') && !findTokenValue(dl, tokens)) {
      throw createError({ statusCode: 409, statusMessage: 'This layer has no verified text. Keep it as an image and reconstruct its copy separately.' })
    }

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
          endTime: 5
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
          text: tokenValue!,
          fontSize,
          fontWeight: typo ? parseInt(typo.font_weight) || 700 : 700,
          color: typo?.color || '#ffffff',
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5
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
          text: tokenValue!,
          bgColor: '#000000',
          color: '#FFFFFF',
          borderRadius: 4,
          fontSize: 16,
          fontWeight: 700,
          animIn: 'none',
          animInDur: 0,
          startTime: 0,
          endTime: 5
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
          endTime: 5
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
          endTime: 5
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
    case 'graphic_text': return 'image'
    case 'vehicle':
    case 'logo':
    default:
      return 'image'
  }
}

function findTokenValue(layer: DissectorLayer, tokens: Record<string, DesignToken>): string | null {
  if (layer.token_bindings?.length !== 1) return null

  for (const binding of layer.token_bindings) {
    // token_bindings now use token IDs (e.g. "token.price") — look up directly
    if (typeof tokens[binding]?.value === 'string' && tokens[binding].value.trim()) {
      return tokens[binding].value
    }
  }

  return null
}
