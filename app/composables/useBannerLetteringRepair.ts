import { computed, effectScope, getCurrentScope, onScopeDispose, ref, watch } from 'vue'
import type { Layer } from '~/types/banner-studio'
import { useBannerStudio } from './useBannerStudio'
import { letteringRepairEligibilityIssue, letteringRepairRegionSchema, type LetteringRepairProposal, type LetteringRepairRegion } from '../../shared/bannerLetteringRepair'
import { isProtectedBannerCopy, isSafeBannerRewrite } from '../../shared/bannerCopyProtection'

export interface RepairImage { width: number, height: number, sha256: string }
/** Bind the proposal to the bytes actually shown, not just a mutable asset URL. */
export async function readLetteringRepairImage(url: string, signal: AbortSignal): Promise<RepairImage> {
  if (!url || !/^(https?:\/\/|\/(?!\/))/.test(url)) throw new Error('Invalid image URL.')
  const response = await fetch(url, { signal, cache: 'no-store' })
  if (!response.ok) throw new Error('The source image could not be loaded.')
  const byteLimit = 32 * 1024 * 1024
  if (Number(response.headers.get('content-length')) > byteLimit) {
    await response.body?.cancel()
    throw new Error('Image is too large to review.')
  }
  if (!response.body) throw new Error('The image response is empty.')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > byteLimit) {
        await reader.cancel()
        throw new Error('Image is too large to review.')
      }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  if (!size) throw new Error('The image response is empty.')
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(v => v.toString(16).padStart(2, '0')).join('')
  const objectUrl = URL.createObjectURL(new Blob([bytes]))
  try {
    const image = new Image()
    image.src = objectUrl
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 4_000_000) throw new Error('Repair supports images up to four megapixels.')
    return { width: image.naturalWidth, height: image.naturalHeight, sha256 }
  } finally { URL.revokeObjectURL(objectUrl) }
}

export function letteringRepairBlockReason(layer: Layer | null, layers: Layer[]): string {
  if (!layer) return 'Select a flat image first.'
  return letteringRepairEligibilityIssue(layer as unknown as Record<string, unknown>, layers as unknown as Record<string, unknown>[]) || ''
}

const opened = ref(false), loading = ref(false), error = ref('')
const region = ref<LetteringRepairRegion>({ x: 0.1, y: 0.1, w: 0.8, h: 0.25 })
const sourceWording = ref(''), wording = ref(''), instruction = ref('Reconstruct the background beneath the selected lettering.')
const regionReviewed = ref(false), reviewed = ref(false), showOriginal = ref(false)
const proposal = ref<LetteringRepairProposal | null>(null)
const fontFamily = ref('Arial'), fontSize = ref(24), color = ref('#111111')
const fonts = ['Arial', 'Georgia', 'Impact']
let target: { snapshot: string, projectId: string, revision: string, key: string, layer: Layer, textId: number, textZ: number } | null = null
let controller: AbortController | null = null
let generation = 0, watching = false, consumers = 0
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const boundedText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max

export function useBannerLetteringRepair(fetcher: typeof $fetch = $fetch, inspectImage = readLetteringRepairImage) {
  const studio = useBannerStudio()
  const snapshot = () => JSON.stringify([studio.state.project, studio.state.activeKey, studio.state.selectedLayerId, studio.state.sets, studio.state.isDirty])
  function discard() {
    generation++
    controller?.abort()
    controller = null
    target = null
    proposal.value = null
    reviewed.value = false
    showOriginal.value = false
    loading.value = false
  }
  function close() {
    discard()
    opened.value = false
  }
  if (!watching) {
    watching = true
    effectScope(true).run(() => {
      watch([() => studio.state.project, snapshot], () => {
        if (target) {
          discard()
          error.value = 'Artwork changed. Save it and generate a new preview.'
        }
      }, { flush: 'sync' })
      watch([() => studio.state.project, () => studio.state.activeKey, () => studio.state.selectedLayerId], close, { flush: 'sync' })
      watch([region, sourceWording, wording, instruction], () => {
        regionReviewed.value = false
        if (target) {
          discard()
          error.value = 'Repair inputs changed. Review the region and generate again.'
        }
      }, { deep: true, flush: 'sync' })
      watch(regionReviewed, (value) => {
        if (!value && target) discard()
      }, { flush: 'sync' })
      watch([fontFamily, fontSize, color, showOriginal], () => {
        reviewed.value = false
      }, { flush: 'sync' })
    })
  }
  const scoped = !!getCurrentScope()
  let disposed = false
  if (scoped) consumers++
  function dispose() {
    if (!scoped || disposed) return
    disposed = true
    if (--consumers === 0) close()
  }
  if (scoped) onScopeDispose(dispose)
  const blockReason = computed(() => letteringRepairBlockReason(studio.selectedLayer.value, studio.activeLayers.value))
  const validRegion = computed(() => letteringRepairRegionSchema.safeParse(region.value).success)
  function open(layer: Layer) {
    close()
    studio.selectLayer(layer.id)
    error.value = letteringRepairBlockReason(studio.selectedLayer.value, studio.activeLayers.value)
    if (error.value) return
    region.value = { x: 0.1, y: 0.1, w: 0.8, h: 0.25 }
    sourceWording.value = ''
    wording.value = ''
    regionReviewed.value = false
    fontFamily.value = 'Arial'
    color.value = '#111111'
    opened.value = true
  }
  const candidate = computed(() => {
    if (!proposal.value || !target) return null
    const source = target.layer, p = proposal.value, r = p.region
    // Persist only named, bounded provenance fields, never an opaque response or prior history.
    const letteringRepair: NonNullable<Layer['letteringRepair']> = {
      version: 1, proposalId: p.proposalId, projectId: p.projectId, sourceRevision: p.sourceRevision,
      formatKey: p.formatKey, layerId: p.layerId, sourceUrl: source.src!, sourceAssetId: p.sourceAssetId,
      sourceImageHash: p.sourceImageHash, region: { x: r.x, y: r.y, w: r.w, h: r.h },
      pixelRegion: { x: p.pixelRegion.x, y: p.pixelRegion.y, w: p.pixelRegion.w, h: p.pixelRegion.h },
      sourceWording: p.sourceWording, wording: p.wording,
      backgroundAsset: { id: p.backgroundAsset.id, url: p.backgroundAsset.url, width: p.backgroundAsset.width,
        height: p.backgroundAsset.height, sha256: p.backgroundAsset.sha256 },
      evidence: { provider: p.evidence.provider, model: p.evidence.model, requestId: p.evidence.requestId ?? null, cost: null },
      verification: p.verification, backgroundLayerId: source.id, textLayerId: target.textId
    }
    const background: Layer = { ...clone(source), src: p.backgroundAsset.url, letteringRepair }
    delete background.letteringRecipe
    const text: Layer = {
      id: target.textId, type: 'text', name: 'Rebuilt lettering', text: proposal.value.wording, letteringRepair: clone(letteringRepair),
      x: source.x + source.w * r.x, y: source.y + source.h * r.y, w: source.w * r.w, h: source.h * r.h,
      zIndex: target.textZ, opacity: 1, fontFamily: fontFamily.value, fontSize: Number(fontSize.value), fontWeight: 700,
      color: color.value, textTransform: 'none', textAlign: 'left', lineHeight: 1.1, letterSpacing: '0',
      clipToBounds: true, animIn: 'none', animInDur: 0, animOut: 'none', outDur: 0,
      startTime: 0, endTime: studio.state.sets[target.key]?.playback?.duration || studio.state.duration
    }
    return { background, text }
  })
  const textFits = computed(() => {
    const text = candidate.value?.text
    if (!text || !Number.isFinite(text.fontSize) || text.fontSize! < 4) return false
    const lines = (text.text || '').split('\n')
    const context = typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null
    if (context) context.font = `700 ${text.fontSize}px ${text.fontFamily}`
    return lines.length * text.fontSize! * 1.1 <= text.h
      && lines.every(line => (context ? context.measureText(line).width : line.length * text.fontSize! * 0.8) <= text.w)
  })
  const canApply = computed(() => !!candidate.value && textFits.value && reviewed.value && !showOriginal.value && fonts.includes(fontFamily.value)
    && Number.isFinite(Number(fontSize.value)) && Number(fontSize.value) >= 4 && Number(fontSize.value) <= 512 && /^#[\da-f]{6}$/i.test(color.value))
  async function generate() {
    discard()
    error.value = ''
    const layer = studio.selectedLayer.value
    const blocked = letteringRepairBlockReason(layer, studio.activeLayers.value)
    if (blocked || !layer) {
      error.value = blocked
      return
    }
    if (!validRegion.value || !regionReviewed.value) {
      error.value = 'Choose and review a region inside the source image.'
      return
    }
    if (!sourceWording.value.trim() || sourceWording.value.length > 2000 || wording.value.length > 2000
      || isProtectedBannerCopy(sourceWording.value) || !isSafeBannerRewrite(sourceWording.value, wording.value)) {
      error.value = 'Transcribe the source and enter exact new wording. Approved copy and commercial facts cannot be repaired here.'
      return
    }
    if (!studio.state.project?.updatedAt || studio.state.isDirty) {
      error.value = 'Save the artwork before generating a repair preview.'
      return
    }
    const r = clone(region.value)
    const box = { x: layer.x + layer.w * r.x, y: layer.y + layer.h * r.y, w: layer.w * r.w, h: layer.h * r.h }
    const regionIssue = letteringRepairEligibilityIssue(layer as unknown as Record<string, unknown>, studio.activeLayers.value as unknown as Record<string, unknown>[], r)
    if (regionIssue) {
      error.value = regionIssue
      return
    }
    const ordered = studio.activeLayers.value.filter(l => l.zIndex > layer.zIndex).map(l => l.zIndex)
    const nextZ = ordered.length ? Math.min(...ordered) : layer.zIndex + 2
    const captured = {
      snapshot: snapshot(), projectId: studio.state.project.id, revision: studio.state.project.updatedAt,
      key: studio.state.activeKey, layer: clone(layer),
      textId: Math.max(0, ...Object.values(studio.state.sets).flatMap(board => board.layers.map(l => l.id))) + 1,
      textZ: (layer.zIndex + nextZ) / 2
    }
    target = captured
    const token = ++generation
    const abort = new AbortController()
    controller = abort
    const current = () => token === generation && target === captured && snapshot() === captured.snapshot
    loading.value = true
    try {
      const source = await inspectImage(layer.src!, abort.signal)
      if (!current()) return
      const mappingIssue = letteringRepairEligibilityIssue(layer as unknown as Record<string, unknown>, studio.activeLayers.value as unknown as Record<string, unknown>[], r, source)
      if (mappingIssue) throw new Error(mappingIssue)
      const result = await fetcher('/api/agency/banner-studio/ai/repair-lettering', {
        method: 'POST', signal: abort.signal,
        body: { projectId: captured.projectId, sourceRevision: captured.revision, formatKey: captured.key, layerId: layer.id,
          region: r, sourceWording: sourceWording.value, wording: wording.value, regionReviewed: true,
          instruction: instruction.value, sourceImageHash: source.sha256 }
      }) as LetteringRepairProposal
      if (!current()) return
      const pixels = result?.pixelRegion
      if (!result || !boundedText(result.proposalId, 256) || !boundedText(result.projectId, 256)
        || !boundedText(result.sourceRevision, 100) || !boundedText(result.formatKey, 100) || !boundedText(layer.src, 8192)
        || !boundedText(result.sourceAssetId, 256) || !boundedText(result.backgroundAsset?.id, 256) || !boundedText(result.backgroundAsset?.url, 8192)
        || !boundedText(result.evidence?.provider, 256) || !boundedText(result.evidence?.model, 256)
        || (result.evidence.requestId != null && !boundedText(result.evidence.requestId, 1024))
        || result.projectId !== captured.projectId
        || result.sourceRevision !== captured.revision || result.formatKey !== captured.key || result.layerId !== layer.id
        || !letteringRepairRegionSchema.safeParse(result.region).success || ['x', 'y', 'w', 'h'].some(k => result.region[k as keyof LetteringRepairRegion] !== r[k as keyof LetteringRepairRegion])
        || result.sourceWording !== sourceWording.value || result.wording !== wording.value || result.sourceImageHash !== source.sha256
        || !result.sourceAssetId || !result.backgroundAsset?.id || !result.backgroundAsset.url || !/^[a-f0-9]{64}$/.test(result.backgroundAsset.sha256 || '')
        || result.backgroundAsset.width !== source.width || result.backgroundAsset.height !== source.height
        || !pixels || ![pixels.x, pixels.y, pixels.w, pixels.h].every(Number.isInteger) || pixels.w <= 0 || pixels.h <= 0
        || pixels.x !== Math.ceil(r.x * source.width) || pixels.y !== Math.ceil(r.y * source.height)
        || pixels.w !== Math.floor((r.x + r.w) * source.width) - pixels.x || pixels.h !== Math.floor((r.y + r.h) * source.height) - pixels.y
        || !result.evidence?.provider || !result.evidence.model || !Array.isArray(result.warnings) || result.warnings.some(w => typeof w !== 'string')
        || result.verification !== 'review-required') throw new Error('Incomplete or mismatched repair proposal. Generate again.')
      const output = await inspectImage(result.backgroundAsset.url, abort.signal)
      if (!current()) return
      if (output.width !== source.width || output.height !== source.height || output.sha256 !== result.backgroundAsset.sha256) throw new Error('The repaired image does not match the reviewed asset.')
      const lines = wording.value.split('\n')
      fontSize.value = Math.max(4, Math.min(72, box.h / (lines.length * 1.2), box.w / (Math.max(...lines.map(line => line.length), 1) * 0.8)))
      proposal.value = clone(result)
    } catch (caught: unknown) {
      if (current()) {
        proposal.value = null
        error.value = (caught as { data?: { statusMessage?: string }, message?: string })?.data?.statusMessage || (caught as Error)?.message || 'Repair failed. Artwork is unchanged.'
      }
    } finally { if (token === generation) loading.value = false }
  }
  function apply() {
    if (!target || !canApply.value || !candidate.value || snapshot() !== target.snapshot || blockReason.value) return false
    const canvas = studio.getCanvasData(), key = target.key, replacement = clone(candidate.value)
    canvas[key]!.layers = canvas[key]!.layers.map(layer => layer.id === replacement.background.id ? replacement.background : layer)
    canvas[key]!.layers.push(replacement.text)
    // Discard before the atomic mutation so reactive invalidation cannot interrupt it.
    discard()
    studio.applyAssistantCanvas(canvas)
    studio.selectLayer(replacement.text.id)
    opened.value = false
    return true
  }
  const previewLayers = computed(() => showOriginal.value || !candidate.value ? null : candidate.value)
  return { opened, loading, error, region, sourceWording, wording, instruction, regionReviewed, reviewed, showOriginal,
    proposal, candidate, previewLayers, fontFamily, fontSize, color, fonts, canApply, textFits, validRegion, blockReason,
    open, close, discard, generate, apply, dispose }
}
