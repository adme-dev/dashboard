import { requireWriteAccess } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { createHash, randomUUID } from 'node:crypto'
import { dissectionResultId } from '~~/server/utils/banner/dissectionJobs'
import { assertDissectionAccess, resolveDissectionContext } from '~~/server/utils/banner/dissectionAccess'
import { assertScopedCanvasAccessInTransaction, assertScopedCanvasLineage, assertScopedProjectUnchanged } from '~~/server/utils/banner/scopedCanvasAccess'
import { collectScopedCanvasLocators, collectScopedCanvasSources, hasScopedCanvas } from '../../../../../../shared/bannerScopedCanvas'
import { dissectionSourceSchema, type DissectionIngestion } from '../../../../../../shared/bannerDissectionIngestion'
import { z } from 'zod'
import { dissectionDeliverySchema, parseScopedDissectionAssetLocator, scopedDissectionAssetKey } from '../../../../../../shared/bannerDissectionDelivery'
import { canImportDissection } from '../../../../../../shared/bannerDissectionReadiness'
import { assertManagedQrTransition } from '../../../../../../shared/bannerQrProtection'
import { resolveBannerFormat } from '../../../../../../shared/bannerFormats'
import type { Layer, DissectorManifest, DissectorLayer, DesignToken } from '~~/app/types/banner-studio'

/**
 * Import a completed dissection into a Banner Studio project.
 * Converts DissectorLayers → Banner Studio Layers and creates/updates a project.
 */
const importSchema = z.object({
  expectedResultId: z.string().regex(/^[a-f0-9]{64}$/),
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  formatKey: z.string().min(1).optional(),
  expectedRevision: z.string().refine(value => Number.isFinite(Date.parse(value)), 'Invalid project revision').optional(),
  layerTypeOverrides: z.record(z.string(), z.enum(['bg', 'text', 'button', 'rect', 'image'])).optional()
}).strict()

interface ImportResponse { projectId: string, formatKey: string, layers: Layer[], revision: string, receiptId: string, dissectionSource?: { jobId: string, sourceSha256: string } }
interface ImportReceipt { intentHash: string, sourceResultId: string, response: ImportResponse, target?: { clientId: string | null, createdBy: string } }
interface ImportProject { canvas_data: Record<string, unknown>, client_id: string | null, created_by: string, updated_at: string }

/** Preflight only: source authority is checked under the complete job lock union. */
function canvasJobIds(canvas: unknown): string[] {
  if (!hasScopedCanvas(canvas)) return []
  try {
    const value = typeof canvas === 'string' ? JSON.parse(canvas) : canvas
    const ids = [...new Set([
      ...collectScopedCanvasSources(value).map(source => source.jobId),
      ...collectScopedCanvasLocators(value).map(locator => parseScopedDissectionAssetLocator(locator)!.jobId)
    ])]
    if (!ids.length || ids.length > 8) throw new Error('Invalid protected dependencies')
    return ids
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'No access to protected artwork' })
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const jobId = getRouterParam(event, 'jobId')
  if (!jobId) throw createError({ statusCode: 400, statusMessage: 'Missing jobId' })
  const parsed = importSchema.safeParse(await readBody(event) || {})
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid dissection import options' })
  const { projectId, clientId, expectedRevision, layerTypeOverrides } = parsed.data
  const targetKey = parsed.data.formatKey || 'mrec'
  const format = resolveBannerFormat(targetKey)
  if (!format || format.w > 4096 || format.h > 4096 || format.w * format.h > 10_000_000) throw createError({ statusCode: 400, statusMessage: 'Unknown format' })
  if (projectId && !expectedRevision) throw createError({ statusCode: 409, statusMessage: 'Reload and review the saved project before importing; its expectedRevision is required' })
  if (!projectId && expectedRevision) throw createError({ statusCode: 400, statusMessage: 'A project revision requires an existing target' })

  return await transactionWithoutRetry(async (db): Promise<ImportResponse> => {
    // Unlocked preflight discovers the entire source set before actor/project locks.
    // A new-project receipt can have acquired its target while this request waited.
    const observedTargetId = projectId || (await db.query(
      "SELECT project_id FROM banner_dissections WHERE job_id = $1 AND user_id = $2 AND status = 'imported'", [jobId, user.id]
    )).rows[0]?.project_id
    const readProject = async (id: string): Promise<ImportProject | undefined> =>
      (await db.query('SELECT canvas_data, client_id, created_by, updated_at FROM banner_projects WHERE id = $1', [id])).rows[0] as ImportProject | undefined
    let existing = observedTargetId ? await readProject(observedTargetId) : undefined
    const lockedJobIds = [...new Set([jobId, ...canvasJobIds(existing?.canvas_data)])].sort()
    let record
    for (const sourceJobId of lockedJobIds) {
      const incoming = sourceJobId === jobId
      const { rows: [row] } = await db.query(
        `SELECT * FROM banner_dissections WHERE job_id = $1${incoming ? ' AND user_id = $2' : ''} FOR UPDATE`,
        incoming ? [sourceJobId, user.id] : [sourceJobId]
      )
      if (incoming) record = row
      else if (!row) throw createError({ statusCode: 403, statusMessage: 'No access to protected artwork' })
    }
    if (!record) throw createError({ statusCode: 404, statusMessage: 'Dissection job not found' })
    const targetId = record.status === 'imported' ? record.project_id : projectId
    // Replay is against today's canvas, not the revision used for the original
    // write. Only already-locked sources may be discovered after waiting.
    if (record.status === 'imported' && targetId) existing = await readProject(targetId)
    if (targetId && !existing) throw createError({ statusCode: 404, statusMessage: 'Project not found' })
    if (canvasJobIds(existing?.canvas_data).some(id => !lockedJobIds.includes(id))) {
      throw createError({ statusCode: 409, statusMessage: 'Artwork sources changed elsewhere. Reload before importing.' })
    }
    if (existing) await assertScopedCanvasAccessInTransaction(db, user.id, existing.canvas_data, targetId, 'write')
    await assertDissectionAccess(db, user.id, record, 'write')
    if (typeof record.source_r2_key !== 'string' || !record.source_r2_key.startsWith(`banner-dissector/${jobId}/original.`)) {
      throw createError({ statusCode: 409, statusMessage: 'The original source is not owned by this job' })
    }
    const manifest = record.manifest as DissectorManifest & { execution?: Record<string, unknown>, ingestion?: DissectionIngestion, importReceipt?: ImportReceipt }
    if (!manifest) throw createError({ statusCode: 409, statusMessage: 'This job has no reviewed result' })
    const sourceResultId = dissectionResultId(manifest, manifest.execution?.attemptId as string | undefined)
    if (parsed.data.expectedResultId !== sourceResultId) throw createError({ statusCode: 409, statusMessage: 'The analysis result changed since review. Reload and review before importing again.' })
    const overrides = Object.fromEntries(Object.entries(layerTypeOverrides || {}).sort(([a], [b]) => a.localeCompare(b)))
    const intentHash = createHash('sha256').update(JSON.stringify({
      jobId, source: record.source_r2_key, sourceResultId, projectId: projectId || null,
      ...(clientId ? { clientId } : {}),
      expectedRevision: expectedRevision ? new Date(expectedRevision).toISOString() : null,
      formatKey: targetKey, layerTypeOverrides: overrides
    })).digest('hex')
    const receipt = manifest.importReceipt
    // The uploaded ownership never changes to follow a requested destination.
    const owner = manifest.ingestion?.owner
    const expectedClient = owner && owner.kind !== 'user' ? owner.clientId : null
    if ((owner?.kind === 'project' && targetId !== owner.projectId)
      || (clientId !== undefined && clientId !== expectedClient)
      || (existing && existing.client_id !== expectedClient)) {
      throw createError({ statusCode: 403, statusMessage: 'Import target differs from the original ownership context' })
    }
    const target = await resolveDissectionContext(db, user.id, {
      ...(targetId ? { projectId: targetId } : {}),
      ...(expectedClient ? { clientId: expectedClient } : {})
    }, 'write')
    const targetIdentity = { clientId: expectedClient, createdBy: existing?.created_by || user.id }
    if (target.owner.kind === 'project' && target.owner.clientId !== expectedClient) {
      throw createError({ statusCode: 403, statusMessage: 'Import target ownership changed' })
    }
    if (receipt?.target && (receipt.target.clientId !== targetIdentity.clientId || receipt.target.createdBy !== targetIdentity.createdBy)) {
      throw createError({ statusCode: 403, statusMessage: 'Imported project ownership changed' })
    }
    if (targetId && existing) await assertScopedProjectUnchanged(db, targetId, {
      canvasData: existing.canvas_data, clientId: existing.client_id, createdBy: existing.created_by, updatedAt: existing.updated_at
    })
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
    const scoped = owner && owner.kind !== 'user'
    const source = scoped ? dissectionSourceSchema.parse((manifest as unknown as { source: unknown }).source) : null
    if (scoped) {
      const visual = manifest.layers.filter(layer => layer.r2_url || layer.asset_path)
      const registry = visual.length ? dissectionDeliverySchema.parse((manifest as unknown as { delivery: unknown }).delivery) : null
      for (const layer of visual) {
        const ref = parseScopedDissectionAssetLocator(layer.r2_url)
        const entry = ref && registry?.assets[ref.assetId]
        if (!ref || ref.jobId !== jobId || !entry || entry.attemptId !== manifest.execution?.attemptId
          || entry.key !== scopedDissectionAssetKey(jobId, entry.attemptId, entry.assetId)
          || layer.asset_path !== entry.key) {
          throw createError({ statusCode: 409, statusMessage: 'Reviewed asset provenance differs from this result' })
        }
        const { rows: [asset] } = await db.query(
          'SELECT id, r2_key, uploaded_by, client_id, mime_type, file_size, url FROM banner_assets WHERE id = $1 FOR SHARE', [entry.assetId]
        )
        if (!asset || asset.r2_key !== entry.key || asset.uploaded_by !== user.id || asset.client_id !== expectedClient
          || asset.url !== layer.r2_url || asset.mime_type !== entry.mimeType || asset.file_size !== entry.byteLength) {
          throw createError({ statusCode: 409, statusMessage: 'Reviewed asset is unavailable' })
        }
      }
    }
    const dissectionSource = source ? { jobId, sourceSha256: source.sha256 } : undefined
    const layers = convertLayers(manifest.layers, manifest.tokens, format.w, format.h, layerTypeOverrides)
    let importedProjectId: string
    let revision: string
    if (existing && projectId) {
      const canvasData = structuredClone(existing.canvas_data || {})
      canvasData[targetKey] = { layers, ...(dissectionSource ? { dissectionSource } : {}) }
      assertScopedCanvasLineage(existing.canvas_data, canvasData)
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
        `INSERT INTO banner_projects (name, canvas_data, tags, created_by, client_id)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, updated_at`,
        [`Dissected — ${manifest.brand || 'Banner'}`, JSON.stringify({ [targetKey]: { layers, ...(dissectionSource ? { dissectionSource } : {}) } }), ['dissected', manifest.brand].filter(Boolean), user.id, expectedClient]
      )
      importedProjectId = created.id
      revision = new Date(created.updated_at).toISOString()
    }
    const response: ImportResponse = { projectId: importedProjectId, formatKey: targetKey, layers, revision, receiptId: randomUUID(), ...(dissectionSource ? { dissectionSource } : {}) }
    const importedManifest = {
      ...manifest, status: 'imported',
      ...(manifest.execution ? { execution: { ...manifest.execution, stage: 'imported', updatedAt: new Date().toISOString() } } : {}),
      importReceipt: { intentHash, sourceResultId, response, target: targetIdentity } satisfies ImportReceipt
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
