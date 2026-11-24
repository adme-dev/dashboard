// Animate layers: the calls behind the pure maths in app/utils/video/layerAnimation.ts.
//
// A layer composition is an ordinary Banner Studio project, so it uses the
// existing asset upload and project endpoints. The layer pictures are copied into
// banner assets because the renderer loads them by URL without a login.
import { ref } from 'vue'
import type { Layer } from '~~/app/types/banner-studio'
import { idempotencyKey } from '~~/app/utils/idempotencyKey'
import { prepareBannerUploadRequest } from '~~/app/utils/bannerUpload'
import {
  LAYER_COMPOSITION_TAG,
  LAYER_MOTION_MODEL_ID,
  applyGeneratedLayerMotion,
  applyLayerMotionPreset,
  buildLayerComposition,
  layerMotionRegion,
  type CompositionLayerInput,
  type FrameSize,
  type LayerFit,
  type LayerMotionPresetId,
  type LayerMotionRegion,
  type LayerPackage
} from '~~/app/utils/video/layerAnimation'

type Api = <T = unknown>(request: string, options?: { method?: string, body?: unknown, headers?: Record<string, string>, query?: Record<string, unknown>, responseType?: 'blob' | 'json' }) => Promise<T>

export interface LayerCompositionProject {
  id: string
  name: string
  clientId: string | null
  tags: string[]
  canvasData: Record<string, { layers: Layer[], playback?: { duration: number, loopCount: number }, bgColor?: string }>
}

export interface AnimateLayersRequest {
  pkg: LayerPackage
  frame: FrameSize
  fit: LayerFit
  durationSec: number
  /** Keyed by layer derivative id, or 'base'. Missing means auto. */
  presets: Record<string, LayerMotionPresetId | 'auto'>
  clientId: string | null
  name: string
}

export interface GenerateLayerMotionRequest {
  videoProjectId: string
  bannerProjectId: string
  formatKey: string
  layerId: number
  frame: FrameSize
  prompt: string
  durationSeconds: number
  /** Called with a short status line while the clip is made. */
  onStatus?: (status: string) => void
}

interface GenerationJob {
  id: string
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'unknown'
  outputAssetId: string | null
  errorMessage: string | null
  actualCostCents?: number | null
  estimatedCostCents?: number
}

export function isLayerComposition(project: Pick<LayerCompositionProject, 'tags'> | null | undefined): boolean {
  return Boolean(project?.tags?.includes(LAYER_COMPOSITION_TAG))
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('A layer picture could not be read.'))
    }
    image.src = url
  })
}

export function useLayerAnimation() {
  const api = $fetch as Api
  const busy = ref(false)

  async function derivativeFile(derivativeId: string, name: string): Promise<File> {
    const blob = await api<Blob>(`/api/agency/video/derivatives/${encodeURIComponent(derivativeId)}/stream`, { query: { inline: '1' }, responseType: 'blob' })
    return new File([blob], name, { type: 'image/png' })
  }

  async function uploadToBannerAssets(file: File, scope: string, clientId: string | null): Promise<string> {
    const request = await prepareBannerUploadRequest(file, idempotencyKey(scope), clientId)
    const stored = await api<{ url: string }>('/api/agency/banner-studio/assets/upload', { method: 'POST', ...request })
    if (!stored?.url) throw new Error('A layer picture could not be stored.')
    return stored.url
  }

  /** Copy the package's pictures into banner assets and create the composition project. */
  async function createComposition(input: AnimateLayersRequest): Promise<{ projectId: string, formatKey: string, durationSec: number }> {
    busy.value = true
    try {
      const { pkg } = input
      const entries: Array<Omit<CompositionLayerInput, 'src'> & { derivativeId: string, fileName: string }> = []
      if (pkg.base) {
        entries.push({
          derivativeId: pkg.base.derivativeId, fileName: 'background.png', name: 'Background', kind: 'background', role: 'base',
          bbox: { x: 0, y: 0, width: pkg.width, height: pkg.height }, preset: input.presets.base ?? 'auto'
        })
      }
      for (const [index, layer] of pkg.layers.entries()) {
        entries.push({
          derivativeId: layer.derivativeId, fileName: `layer-${String(index + 1).padStart(2, '0')}.png`, name: layer.name, kind: layer.kind, role: 'layer',
          bbox: layer.bbox, preset: input.presets[layer.derivativeId] ?? 'auto'
        })
      }
      const layers: CompositionLayerInput[] = []
      // One at a time: each upload is its own audited write, and order keeps failures easy to read.
      for (const entry of entries) {
        const file = await derivativeFile(entry.derivativeId, entry.fileName)
        const src = await uploadToBannerAssets(file, 'animate-layers-asset', input.clientId)
        layers.push({ src, name: entry.name, kind: entry.kind, role: entry.role, bbox: entry.bbox, preset: entry.preset })
      }
      const composition = buildLayerComposition({
        source: { width: pkg.width, height: pkg.height },
        frame: input.frame,
        fit: input.fit,
        timing: { durationSec: input.durationSec },
        layers
      })
      const project = await api<{ id: string }>('/api/agency/banner-studio/projects', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('animate-layers-project') },
        body: { name: input.name, clientId: input.clientId, canvasData: composition.canvasData, tags: [LAYER_COMPOSITION_TAG] }
      })
      if (!project?.id) throw new Error('The layer composition could not be saved.')
      return { projectId: project.id, formatKey: composition.formatKey, durationSec: composition.durationSec }
    } finally {
      busy.value = false
    }
  }

  function loadComposition(bannerProjectId: string): Promise<LayerCompositionProject> {
    return api<LayerCompositionProject>(`/api/agency/banner-studio/projects/${encodeURIComponent(bannerProjectId)}`)
  }

  async function saveLayers(project: LayerCompositionProject, formatKey: string, layers: Layer[]): Promise<LayerCompositionProject> {
    const canvasData = { ...project.canvasData, [formatKey]: { ...project.canvasData[formatKey]!, layers } }
    await api(`/api/agency/banner-studio/projects/${encodeURIComponent(project.id)}`, {
      method: 'PATCH',
      headers: { 'Idempotency-Key': idempotencyKey('animate-layers-save') },
      body: { canvasData }
    })
    return { ...project, canvasData }
  }

  async function setLayerPreset(project: LayerCompositionProject, formatKey: string, layerId: number, presetId: LayerMotionPresetId, frame: FrameSize) {
    const artboard = project.canvasData[formatKey]
    if (!artboard) throw new Error('This composition has no artboard for this video.')
    return saveLayers(project, formatKey, applyLayerMotionPreset(artboard.layers, layerId, presetId, frame, { playback: artboard.playback }))
  }

  /**
   * The picture a clip is generated from: the layer, on top of everything beneath
   * it, cropped to the region the clip will cover. Layers above it are left out
   * because they stay above the clip in the composition.
   */
  async function composeRegionPicture(layers: Layer[], layerId: number, region: LayerMotionRegion): Promise<Blob> {
    const target = layers.find(layer => layer.id === layerId)
    if (!target) throw new Error('That layer is no longer in the composition.')
    const longSide = 1280
    const scale = Math.min(1, longSide / Math.max(region.w, region.h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(2, Math.round(region.w * scale))
    canvas.height = Math.max(2, Math.round(region.h * scale))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('The picture could not be prepared in this browser.')
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.translate(-region.x, -region.y)
    const beneath = layers
      .filter(layer => layer.type === 'image' && !layer.hidden && layer.src && layer.zIndex <= target.zIndex)
      .sort((a, b) => a.zIndex - b.zIndex)
    for (const layer of beneath) {
      const image = await loadImage(await api<Blob>(layer.src!, { responseType: 'blob' }))
      ctx.drawImage(image, layer.x, layer.y, layer.w, layer.h)
    }
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.92))
    if (!blob) throw new Error('The picture could not be prepared in this browser.')
    return blob
  }

  async function waitForJob(videoProjectId: string, jobId: string, onStatus?: (status: string) => void): Promise<GenerationJob> {
    const deadline = Date.now() + 12 * 60 * 1000
    while (Date.now() < deadline) {
      const res = await api<{ jobs: GenerationJob[] }>('/api/agency/video/generation/jobs', { query: { projectId: videoProjectId } })
      const job = res.jobs?.find(candidate => candidate.id === jobId)
      if (job?.status === 'succeeded' && job.outputAssetId) return job
      if (job && (job.status === 'failed' || job.status === 'blocked')) throw new Error(job.errorMessage || 'The clip could not be generated.')
      onStatus?.(job?.status === 'running' ? 'Generating the clip…' : 'Waiting in the queue…')
      await new Promise(resolve => setTimeout(resolve, 4000))
    }
    throw new Error('The clip is taking longer than expected. It will appear in the Library when it is ready; it has not been placed on the layer.')
  }

  /**
   * Make a short clip from one layer through the existing video generation path
   * (same queue, worker, budget and spend policy), then put it back on that layer.
   * This is a paid call: the caller must have shown the cost and been told to go ahead.
   */
  async function generateLayerMotion(input: GenerateLayerMotionRequest, project: LayerCompositionProject): Promise<{ project: LayerCompositionProject, job: GenerationJob }> {
    busy.value = true
    try {
      const artboard = project.canvasData[input.formatKey]
      const target = artboard?.layers.find(layer => layer.id === input.layerId)
      if (!artboard || !target) throw new Error('That layer is no longer in the composition.')
      const region = layerMotionRegion({ x: target.x, y: target.y, w: target.w, h: target.h }, input.frame)

      input.onStatus?.('Preparing the picture…')
      const picture = await composeRegionPicture(artboard.layers, input.layerId, region)
      const form = new FormData()
      form.append('file', new File([picture], 'layer-motion-source.jpg', { type: 'image/jpeg' }))
      form.append('projectId', input.videoProjectId)
      form.append('subjectType', 'unknown')
      const source = await api<{ id: string }>('/api/agency/video/generation/source-assets', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey('layer-motion-source') },
        body: form
      })

      // One key for both the body (tenant-level dedupe) and the header (God mode ledger).
      const key = `layer-motion:${crypto.randomUUID()}`
      const queued = await api<{ job: GenerationJob }>('/api/agency/video/generation/jobs', {
        method: 'POST',
        headers: { 'Idempotency-Key': key },
        body: {
          projectId: input.videoProjectId,
          mode: 'image-to-video',
          modelId: LAYER_MOTION_MODEL_ID,
          prompt: input.prompt,
          sourceAssetIds: [source.id],
          durationSeconds: input.durationSeconds,
          aspectRatio: region.aspectRatio,
          subjectType: 'unknown',
          idempotencyKey: key
        }
      })
      const job = await waitForJob(input.videoProjectId, queued.job.id, input.onStatus)

      input.onStatus?.('Placing the clip on the layer…')
      const clip = await api<Blob>(`/api/agency/video/assets/${encodeURIComponent(job.outputAssetId!)}/stream`, { query: { inline: '1' }, responseType: 'blob' })
      const src = await uploadToBannerAssets(new File([clip], `layer-motion-${job.id}.mp4`, { type: 'video/mp4' }), 'layer-motion-clip', project.clientId)
      // Reload first: the composition may have been edited while the clip was being made.
      const latest = await loadComposition(project.id)
      const latestArtboard = latest.canvasData[input.formatKey]
      if (!latestArtboard?.layers.some(layer => layer.id === input.layerId)) throw new Error('That layer was removed while the clip was being made. The clip is in the Library.')
      const layers = applyGeneratedLayerMotion(latestArtboard.layers, input.layerId, { src, region, durationSeconds: input.durationSeconds }, { playback: latestArtboard.playback })
      return { project: await saveLayers(latest, input.formatKey, layers), job }
    } finally {
      busy.value = false
    }
  }

  return { busy, createComposition, loadComposition, setLayerPreset, generateLayerMotion }
}
