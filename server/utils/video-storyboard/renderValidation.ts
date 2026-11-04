import { createError } from 'h3'
import type { ReadinessFinding } from '~~/shared/video/storyboard'
import { storyboardApprovalChanges, type StoryboardObligations, storyboardFormats, type StoryboardFormat } from '~~/shared/video/storyboardCompile'
import type { TimelineState } from '~~/server/utils/audio/timelineSchema'

import { transaction } from '~~/server/utils/db'
import type { GodModeTransactionDb as Db } from '~~/server/utils/godMode/transactionCoordinator'
import { TimelineStateSchema } from '~~/server/utils/audio/timelineSchema'
import type { MediaProjectActor } from '~~/server/utils/audio/projects'
import { loadTimelineObligationsIn, type TimelineObligationRecord } from './lineage'
import { requireStoryboardProjectIn } from './access'
import { getStoryboardIn } from './store'
import { canonicalReferenceIn, storyboardFileMetadata, checkReferencesIn, type ReferenceDependencies } from './references'
import { probeStoryboardMedia } from './mediaProbe'
import { loadBannerLayers } from '~~/server/utils/audio/bannerOverlay'
import { buildBannerHTML } from '~~/server/utils/banner/htmlBuilder'
import { applyOverlayPlacement } from '~~/shared/utils/overlayPlacement'
import { lintBannerRenderFormat, hasRenderLintErrors } from '~~/server/utils/banner/renderLinter'
import { measureStoryboardCopy } from './copyMeasurement'
import { storyboardHash } from './hash'
import { loadApprovedCopyIn, resolveTimelineReferenceSetIn } from './reviewRecovery'
import type { CopyRequirement } from '~~/shared/video-storyboard/renderManifest'

export interface ObligationMapping { clipId: string, replacementClipId: string }
export function remapObligations(contract: StoryboardObligations, mappings: ObligationMapping[]): StoryboardObligations {
  const ids = new Set([...contract.sources, ...contract.cues].map(c => c.clipId))
  const map = new Map(mappings.map(m => [m.clipId, m.replacementClipId]))
  if (map.size !== mappings.length || mappings.some(m => !ids.has(m.clipId) || !m.replacementClipId)
    || new Set([...ids].map(id => map.get(id) ?? id)).size !== ids.size) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid obligation mapping' })
  }
  const result = structuredClone(contract)
  for (const item of [...result.sources, ...result.cues]) item.clipId = map.get(item.clipId) ?? item.clipId
  return result
}

/** Pure content gate. The baseline and contract must come from immutable server
 * history; an edited baseline only suppresses review findings, never validity. */
export function validateObligatedTimeline(state: TimelineState, baseline: TimelineState, contract: StoryboardObligations): ReadinessFinding[] {
  const findings: ReadinessFinding[] = []
  const block = (code: string, shotId?: string) => findings.push({ code, severity: 'blocker', shotId, message: code.replaceAll('_', ' ') })
  for (const change of storyboardApprovalChanges(baseline, state, contract)) block('adjusted_edit_review_required', [...contract.cues, ...contract.sources].find(c => c.clipId === change.clipId)?.shotId)
  const ids = new Set([...contract.sources, ...contract.cues].map(c => c.clipId))
  for (const id of ids) {
    const matches = state.tracks.flatMap(track => track.clips.filter(c => c.id === id).map(clip => ({ track, clip })))
    if (matches.length !== 1) {
      block('required_clip_missing')
      continue
    }
    const { track, clip } = matches[0]!
    if (track.hidden || track.muted) block('required_clip_hidden')
    const duration = clip.type === 'audio' ? (clip.source_out_sec ?? 0) - clip.source_in_sec : clip.duration_sec
    if (!(duration > 0) || clip.timeline_start_sec < 0 || clip.timeline_start_sec + duration > state.duration_sec + 1e-6) block('required_clip_outside_timeline')
    if ((clip.type === 'caption' || clip.type === 'overlay') && contract.cues.some(cue => cue.clipId === clip.id) && clip.duration_sec > 60) findings.push({ code: 'copy_clip_duration_unsupported', severity: 'blocker', message: 'Required copy clips support at most 60 seconds each. Shorten this clip to 60 seconds or less and review the adjusted edit. The storyboard may still total 120 seconds when each required-copy clip stays within this limit.' })
    if (clip.type === 'caption' && clip.style !== 'platform_default') block('caption_style_unsupported')
    if (clip.type === 'overlay' && clip.opacity !== 1) block('required_copy_invisible')
    if (clip.type === 'audio' && (track.gain_db + clip.gain_db < -30 || clip.fade_in_sec > 0 || clip.fade_out_sec > 0)) block('required_audio_inaudible')
    for (const cue of contract.cues.filter(c => c.clipId === id)) {
      if (clip.type === 'caption' && clip.text !== cue.text) block('exact_copy_mismatch', cue.shotId)
      if (clip.type !== 'caption' && clip.type !== 'overlay') block('required_copy_missing', cue.shotId)
    }
  }
  const visible = state.tracks.filter(t => !t.hidden && !t.muted).flatMap(t => t.clips)
  for (const clip of visible) {
    if ((clip.type === 'video' || clip.type === 'audio' || clip.type === 'overlay') && !contract.sources.some(s => s.clipId === clip.id)) block('unreviewed_source')
  }
  // Independently measured surfaces cannot certify cross-surface occlusion.
  // R1 conservatively requires non-overlapping copy intervals until composite
  // glyph visibility is measured; no invisible-copy approval shortcut.
  const surfaces = visible.filter(c => c.type === 'caption' || c.type === 'overlay')
  for (const cue of contract.cues) {
    const clip = surfaces.find(c => c.id === cue.clipId)
    if (!clip || (clip.type !== 'caption' && clip.type !== 'overlay')) continue
    if (surfaces.some(other => other.id !== clip.id && (other.type === 'caption' || other.type === 'overlay') && other.timeline_start_sec < clip.timeline_start_sec + clip.duration_sec && other.timeline_start_sec + other.duration_sec > clip.timeline_start_sec)) block('required_copy_overlap', cue.shotId)
  }
  return findings
}

export interface RenderValidationInput { actor: MediaProjectActor, projectId: string, timelineId: string, editRevision: number, formats: readonly StoryboardFormat[] }
export interface ValidatedStoryboardRender {
  findings: ReadinessFinding[]
  state: TimelineState
  lineage: TimelineObligationRecord | null
  objects: Array<{ key: string, etag: string, size: number }>
  overlays: Record<string, Array<{ clipId: string, html: string, timeline_start_sec: number, duration_sec: number, requiredCopy: CopyRequirement[] }>>
}
const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
/** Captions share the measured Chromium overlay path in obligated renders. */
function captionHtml(clipId: string, text: string, width: number, height: number) {
  return `<!doctype html><html><head><style>html,body{margin:0;width:100%;height:100%;background:transparent}.caption{position:absolute;left:8%;right:8%;bottom:10%;font:600 ${Math.round(height * 0.035)}px/${Math.round(height * 0.045)}px Arial,sans-serif;color:white;background:#000;white-space:pre-wrap;text-align:center;text-shadow:0 2px 4px black;overflow:visible}</style></head><body><div class="caption" data-storyboard-copy-id="${escape(clipId)}">${escape(text)}</div><!-- window.__engagrFrame static measured overlay --></body></html>`
}

/** Load all authority from persistence. override is only constructed by the
 * transactional human-review service, never from a client contract. */
export async function prepareStoryboardRenderIn(db: Db, input: RenderValidationInput, deps: ReferenceDependencies = {}, override?: TimelineObligationRecord): Promise<ValidatedStoryboardRender> {
  const project = await requireStoryboardProjectIn(db, input.projectId, input.actor)
  const row = (await db.query('SELECT * FROM media_timelines WHERE id = $1 AND project_id = $2', [input.timelineId, input.projectId])).rows[0]
  if (!row || row.edit_revision !== input.editRevision) throw createError({ statusCode: 409, statusMessage: 'Timeline changed; reload and review' })
  const state = TimelineStateSchema.parse(row.state)
  const lineage = override ?? await loadTimelineObligationsIn(db, input.projectId, input.timelineId, input.editRevision)
  const result: ValidatedStoryboardRender = { state, lineage, findings: [], objects: [], overlays: {} }
  if (!lineage) return result
  if (!input.formats.length || input.formats.some(f => !storyboardFormats[f])) throw createError({ statusCode: 400, statusMessage: 'Invalid render formats' })
  result.findings.push(...validateObligatedTimeline(state, lineage.baseline, lineage.contract))
  const block = (code: string, message = code.replaceAll('_', ' ')) => result.findings.push({ code, severity: 'blocker', message })
  const saved = await getStoryboardIn(db, input.projectId, input.actor)
  const original = await getStoryboardIn(db, input.projectId, input.actor, lineage.contract.revisionId)
  const globalRefs = saved.referenceSet
  const scoped = globalRefs ? await resolveTimelineReferenceSetIn(db, globalRefs, lineage.referenceSetId) : null
  const refs = scoped?.referenceSet
  if (!refs) {
    block('reference_set_missing')
    return result
  }
  if (!scoped?.current) block('reference_review_required')
  const copy = await loadApprovedCopyIn(db, input.projectId, lineage.contract.copyRevisionId)
  if (!copy?.approval || copy.contentHash !== lineage.contract.copyHash || copy.approval.contentHash !== copy.contentHash) block('copy_not_approved')
  const spokenIds = original.revision?.plan.shots.flatMap(shot => shot.spokenSegmentIds) ?? []
  if (copy && (copy.scriptSegments.some(segment => !spokenIds.includes(segment.id)) || spokenIds.some(id => !copy.scriptSegments.some(segment => segment.id === id)))) block('spoken_copy_unmapped')
  if (copy?.cues.some(cue => cue.required && !lineage.contract.cues.some(mapped => mapped.copyId === cue.id && mapped.text === cue.text))) block('required_copy_unmapped')
  const relevantRefs = refs.references.filter(ref => lineage.contract.sources.some(source => source.sourceKind === ref.sourceKind && source.assetId === ref.assetId))
  result.findings.push(...await checkReferencesIn(db, project, input.actor, { references: relevantRefs, brandKit: refs.brandKit }, deps))
  const tables: Record<string, string> = { video_asset: 'video_assets', audio_asset: 'audio_assets', source_asset: 'video_gen_source_assets', banner_project: 'banner_projects' }
  const media = new Map<string, { row: Record<string, unknown>, measured: Awaited<ReturnType<typeof probeStoryboardMedia>> }>()
  for (const source of lineage.contract.sources) {
    const clip = state.tracks.flatMap(t => t.clips).find(c => c.id === source.clipId)
    if (!clip) continue
    const ref = relevantRefs.find(r => r.sourceKind === source.sourceKind && r.assetId === source.assetId)
    if (!ref || ref.contentHash !== source.contentHash || ref.decision !== 'approved' || ref.approval?.contentHash !== source.contentHash) {
      block('usage_approval_required')
      continue
    }
    try {
      const identity = await canonicalReferenceIn(db, project, input.actor, ref.sourceKind, ref.assetId, deps)
      if (identity.contentHash !== source.contentHash) throw new Error('changed')
      const sourceRow = (await db.query(`SELECT * FROM ${tables[ref.sourceKind]} WHERE id = $1`, [ref.assetId])).rows[0]
      if (clip.type === 'overlay') {
        if (ref.sourceKind !== 'banner_project' || clip.gsap_project_id !== ref.assetId) throw new Error('binding')
      } else if (clip.type === 'video' || clip.type === 'audio') {
        const key = ref.sourceKind === 'audio_asset' ? sourceRow.r2_key_master : sourceRow.r2_key
        if (clip.r2_key !== key || (ref.sourceKind !== 'source_asset' && clip.asset_id !== ref.assetId)) throw new Error('binding')
        const cacheKey = `${ref.sourceKind}:${ref.assetId}`
        let asset = media.get(cacheKey)
        if (!asset) {
          const object = await storyboardFileMetadata(key, deps)
          if (!object?.etag || !object.size) throw new Error('object')
          const measured = await probeStoryboardMedia({ r2Key: key, expectedEtag: object.etag.replace(/^"|"$/g, ''), expectedSize: object.size }, deps)
          asset = { row: sourceRow, measured }
          media.set(cacheKey, asset)
          result.objects.push({ key, etag: object.etag.replace(/^"|"$/g, ''), size: object.size })
        }
        const end = clip.source_out_sec
        if (asset.measured.kind !== 'image' && (end === null || end > (asset.measured.durationSeconds ?? 0) + 1e-6 || clip.source_in_sec < 0)) throw new Error('bounds')
        if (clip.type === 'video' && asset.measured.kind !== 'image' && end !== null && Math.abs(end - clip.source_in_sec - clip.duration_sec) > 1e-6) throw new Error('source range mismatch')
        const track = state.tracks.find(t => t.clips.some(c => c.id === clip.id))!
        if (track.kind === 'voiceover') {
          const shot = original.revision?.plan.shots.find(s => s.id === source.shotId)
          const speech = shot?.spokenSegmentIds.map(id => copy?.scriptSegments.find(s => s.id === id)?.text).join('\n')
          if (!speech || asset.row.prompt !== speech || clip.source_in_sec !== 0 || end !== Math.floor((asset.measured.durationSeconds ?? 0) * state.fps + 1e-6) / state.fps) throw new Error('speech')
        }
      } else throw new Error('binding')
    } catch { block('source_unavailable', 'A mapped source changed, is unavailable, or no longer matches its approved content and measured bounds.') }
  }
  for (const format of [...new Set(input.formats)]) {
    const spec = storyboardFormats[format]
    result.overlays[format] = []
    for (const track of state.tracks) for (const clip of track.clips) {
      if (clip.type !== 'overlay' && clip.type !== 'caption') continue
      if (track.hidden || track.muted) continue
      const cues = lineage.contract.cues.filter(c => c.clipId === clip.id)
      if (cues.length && clip.duration_sec > 60) continue
      const required = cues.map(c => ({ clipId: storyboardHash({ clipId: clip.id, copyId: c.copyId }), text: c.text, startSec: 0, durationSec: clip.duration_sec }))
      try {
        let html: string
        if (clip.type === 'caption') {
          if (cues.length !== 1) {
            block('unreviewed_caption')
            continue
          }
          html = captionHtml(required[0]!.clipId, clip.text, spec.width, spec.height)
        } else {
          const source = lineage.contract.sources.find(s => s.clipId === clip.id && s.sourceKind === 'banner_project')
          if (!source) {
            block('unreviewed_overlay')
            continue
          }
          const banner = (await db.query('SELECT * FROM banner_projects WHERE id = $1', [source.assetId])).rows[0]
          if (!banner) throw new Error('banner')
          const canvas = await loadBannerLayers(source.assetId, spec.banner, deps.event, { clientId: banner.client_id, canvasData: banner.canvas_data })
          // Each output owns its layout; a portrait format pin is never reused.
          const layers = canvas.layers
          if (layers.some(l => (l.keyframes && Object.keys(l.keyframes).length) || l.motionPath?.length || (l.animIn && l.animIn !== 'none') || (l.animOut && l.animOut !== 'none') || l.type === 'video')) throw new Error('Animated required copy is unsupported')
          html = buildBannerHTML(spec.banner, layers, { includeAnimations: false, baseUrl: process.env.NUXT_PUBLIC_APP_URL ?? '', playback: canvas.playback, customFonts: canvas.customFonts })
          html = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<meta charset="utf-8">/g, '').replace(/<meta name="ad.size" content="width=\d+,height=\d+">/g, '') + '<!-- window.__engagrFrame static measured overlay -->'
          for (const [index, cue] of cues.entries()) {
            const matches = layers.filter(l => l.type === 'text' && l.text === cue.text && !l.hidden && l.opacity === 1)
            if (matches.length !== 1) throw new Error('exact copy')
            const l = matches[0]!
            if ((l.textTransform && l.textTransform !== 'none') || l.feedBindings?.length || l.startTime > 0 || l.endTime < clip.duration_sec) throw new Error('copy transform/timing')
            const marker = `data-id="${l.id}"`
            html = html.replace(marker, `${marker} data-storyboard-copy-id="${escape(required[index]!.clipId)}"`)
          }
          html = applyOverlayPlacement(html, clip.placement ?? null, spec, canvas)
        }
        const lint = lintBannerRenderFormat({ key: spec.banner, html, width: spec.width, height: spec.height }, { fps: state.fps, crf: 23, quality: 1 })
        if (hasRenderLintErrors(lint)) throw new Error('lint')
        if (required.length) result.findings.push(...await measureStoryboardCopy({ html, width: spec.width, height: spec.height, durationSec: clip.duration_sec, fps: state.fps, required }, deps))
        result.overlays[format]!.push({ clipId: clip.id, html, timeline_start_sec: clip.timeline_start_sec, duration_sec: clip.duration_sec, requiredCopy: required })
      } catch { block('copy_layout_unavailable', `Exact copy could not be verified for ${format}. Correct its text, font, timing or output layout.`) }
    }
  }
  return result
}
export async function validateStoryboardRender(input: RenderValidationInput, deps: ReferenceDependencies = {}): Promise<ReadinessFinding[]> {
  return transaction(async db => (await prepareStoryboardRenderIn(db, input, deps)).findings)
}
