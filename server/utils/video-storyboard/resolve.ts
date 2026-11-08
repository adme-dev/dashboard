import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import type { AssetBinding } from '~~/shared/video/storyboard'
import { storyboardFormats, type StoryboardFormat, type ResolvedStoryboard, type ResolvedOverlay } from '~~/shared/video/storyboardCompile'
import { requireStoryboardProjectIn } from './access'
import { getStoryboardIn, resolveReferenceSetIn } from './store'
import { canonicalReferenceIn, storyboardFileMetadata, type ReferenceDependencies } from './references'
import { probeStoryboardMedia } from './mediaProbe'
import { storyboardHash } from './hash'

export interface ResolveStoryboardInput { actor: MediaProjectActor, projectId: string, revisionId: string, formats: readonly StoryboardFormat[] }
const tables = { video_asset: 'video_assets', audio_asset: 'audio_assets', source_asset: 'video_gen_source_assets', banner_project: 'banner_projects' } as const

/** Read-only readiness, not an application token. T06 must re-resolve under its
 * own source/revision fences before persisting a timeline and obligations. */
export async function resolveStoryboardIn(db: Db, input: ResolveStoryboardInput, deps: ReferenceDependencies = {}, measure = probeStoryboardMedia): Promise<ResolvedStoryboard> {
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const saved = await getStoryboardIn(db, input.projectId, input.actor, input.revisionId)
  if (!saved.revision) throw createError({ statusCode: 404, statusMessage: 'Storyboard revision not found' })
  const references = await resolveReferenceSetIn(db, input, deps)
  const plan = saved.revision.plan
  const result: ResolvedStoryboard = { plan, formats: [...new Set(input.formats)], assets: {}, overlays: {}, findings: [...(references?.findings ?? [])] }
  const block = (code: string) => result.findings.push({ code, severity: 'blocker', message: `Storyboard is not ready: ${code.replaceAll('_', ' ')}.` })
  if (!result.formats.length || !result.formats.includes(plan.targetFormat) || result.formats.some(f => !storyboardFormats[f])) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard formats' })
  if (!references) block('reference_set_missing')
  const bindings = new Map<string, Extract<AssetBinding, { status: 'bound' }>>()
  for (const shot of plan.shots) for (const asset of [shot.visual, ...shot.audioCues.map(c => c.asset), ...shot.overlayCues.map(c => c.asset)]) {
    if (asset.status === 'bound') bindings.set(`${asset.sourceKind}:${asset.assetId}`, asset)
  }
  for (const [key, binding] of bindings) {
    const pin = references?.referenceSet.references.find(ref => ref.sourceKind === binding.sourceKind && ref.assetId === binding.assetId && ref.contentHash === binding.contentHash)
    if (!pin || pin.decision !== 'approved' || pin.approval?.contentHash !== binding.contentHash) {
      block('usage_approval_required')
      continue
    }
    try {
      const identity = await canonicalReferenceIn(db, project, input.actor, binding.sourceKind, binding.assetId, deps)
      if (identity.contentHash !== binding.contentHash) throw new Error('changed')
      const row = (await db.query(`SELECT * FROM ${tables[binding.sourceKind]} WHERE id = $1`, [binding.assetId])).rows[0]
      if (!row) throw new Error('missing')
      if (binding.sourceKind === 'banner_project') {
        for (const shot of plan.shots) for (const cue of shot.overlayCues) {
          if (cue.asset.status !== 'bound' || cue.asset.assetId !== binding.assetId) continue
          const copy = plan.copy.cues.find(c => c.id === cue.copyCueId)
          if (!copy) throw new Error('copy')
          const layouts: ResolvedOverlay['layouts'] = {}
          for (const format of result.formats) {
            const spec = storyboardFormats[format]
            // Existing loader enforces actual Banner format and managed font access.
            const canvas = await loadBannerLayers(binding.assetId, spec.banner, deps.event, { clientId: row.client_id ?? null, canvasData: row.canvas_data })
            const matches = canvas.layers.filter(layer => layer.type === 'text' && layer.text === copy.text && !layer.hidden && layer.opacity === 1)
            if (matches.length !== 1) throw new Error('exact copy')
            const layer = matches[0]!
            // R1 resolver accepts a static, fully visible layer for the full cue.
            // Rendered glyph overflow/safe-area inspection remains T08's gate.
            if (layer.x < 0 || layer.y < 0 || !(layer.w > 0 && layer.h > 0) || layer.x + layer.w > canvas.width || layer.y + layer.h > canvas.height
              || (layer.rotation ?? 0) !== 0 || (layer.keyframes && Object.keys(layer.keyframes).length) || layer.motionPath?.length
              || (layer.animIn && layer.animIn !== 'none') || (layer.animOut && layer.animOut !== 'none')
              || (layer.textTransform && layer.textTransform !== 'none') || layer.feedBindings?.length
              || layer.startTime > 0 || layer.endTime < cue.durationFrames / plan.fps) throw new Error('layout')
            layouts[format] = { formatKey: spec.banner, layoutHash: storyboardHash({ canvas: row.canvas_data?.[spec.banner], fonts: canvas.customFonts ?? [], width: canvas.width, height: canvas.height, copyId: copy.id }) }
          }
          result.overlays[`${shot.id}:${cue.id}`] = { assetId: binding.assetId, contentHash: binding.contentHash, copyCueId: copy.id, text: copy.text, layouts }
        }
      } else {
        const r2Key = binding.sourceKind === 'audio_asset' ? row.r2_key_master : row.r2_key
        if (typeof r2Key !== 'string' || !r2Key || /^https?:/i.test(r2Key)) throw new Error('locator')
        const object = await storyboardFileMetadata(r2Key, deps)
        if (!object?.etag || object.size <= 0) throw new Error('object')
        const measured = await measure({ r2Key, expectedEtag: object.etag.replace(/^"|"$/g, ''), expectedSize: object.size }, deps)
        result.assets[key] = { ...measured, assetId: binding.assetId, contentHash: binding.contentHash, r2Key,
          ...(binding.sourceKind === 'audio_asset' && row.kind === 'voiceover' && typeof row.prompt === 'string' ? { speechText: row.prompt } : {}) }
      }
      // Catch changed bytes/record associations during preparation. This still
      // is not a transactional apply fence and never claims to be one.
      if ((await canonicalReferenceIn(db, project, input.actor, binding.sourceKind, binding.assetId, deps)).contentHash !== binding.contentHash) throw new Error('changed')
    } catch {
      result.assets = Object.fromEntries(Object.entries(result.assets).filter(([assetKey]) => assetKey !== key))
      result.overlays = Object.fromEntries(Object.entries(result.overlays).filter(([, overlay]) => overlay.assetId !== binding.assetId))
      block('source_unavailable')
    }
  }
  return result
}
export function resolveStoryboard(input: ResolveStoryboardInput, deps: ReferenceDependencies = {}) {
  return transaction(db => resolveStoryboardIn(db, input, deps))
}
