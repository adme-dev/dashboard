import {
  computed,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  ref,
  watch
} from 'vue'
import type { Layer } from '~/types/banner-studio'
import { useBannerStudio } from './useBannerStudio'
import {
  isBannerCopyLayerProtected,
  isSafeBannerRewrite
} from '../../shared/bannerCopyProtection'

export type BannerLetteringRecipe = {
  version: 1
  sourceWording?: string
  mode: 'native' | 'raster'
  wording: string
  instruction: string
  reference: string | null
  sourceRevision: string
  proposal: LetteringResponse
}
type LetteringLayer = Layer & { letteringRecipe?: BannerLetteringRecipe }
export interface LetteringResponse {
  proposalId: string
  projectId: string
  sourceRevision: string
  formatKey: string
  layerId: number
  mode: 'native' | 'raster'
  wording: string
  asset?: { id: string, url: string, width: number, height: number }
  nativeStyle?: Partial<Layer>
  referenceAssetIds?: string[]
  referenceHashes?: string[]
  evidence: {
    provider: string
    model: string
    requestId?: string
    cost: number | null
  }
  warnings: string[]
  verification: 'review-required'
}
const opened = ref(false),
  wording = ref(''),
  instruction = ref('Keep the angle, colours and depth.')
const sourceWording = ref(''),
  isolationConfirmed = ref(false)
const mode = ref<'native' | 'raster'>('native'),
  loading = ref(false),
  error = ref('')
const candidate = ref<Layer | null>(null),
  proposal = ref<LetteringResponse | null>(null),
  reviewed = ref(false)
let target: {
  snapshot: string
  projectId: string
  revision: string
  key: string
  layer: LetteringLayer
} | null = null
const showOriginal = ref(false)
let request = 0
let watching = false
let consumers = 0

/** Decode actual returned pixels. Opaque or empty provider output is never a cutout. */
export async function validateLetteringImage(
  url: string,
  width: number,
  height: number
): Promise<void> {
  if (
    !Number.isInteger(width)
    || !Number.isInteger(height)
    || width < 1
    || height < 1
    || width * height > 16_000_000
  )
    throw new Error('Invalid lettering dimensions.')
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = url
  await image.decode()
  if (image.naturalWidth !== width || image.naturalHeight !== height)
    throw new Error('Lettering dimensions differ from the proposed asset.')
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Image inspection unavailable.')
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, width, height).data
  let transparent = 0,
    visible = 0
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i]! < 16) transparent++
    if (pixels[i]! > 32) visible++
  }
  if (!transparent || !visible)
    throw new Error(
      'The result is empty or has no transparent background. A clean lettering cutout is required.'
    )
  // A cutout touching the canvas edge can be incomplete; require review through regeneration.
  for (let x = 0; x < width; x++)
    if (
      pixels[x * 4 + 3]! > 32
      || pixels[((height - 1) * width + x) * 4 + 3]! > 32
    )
      throw new Error('Lettering touches the output edge and may be clipped.')
  for (let y = 0; y < height; y++)
    if (
      pixels[y * width * 4 + 3]! > 32
      || pixels[(y * width + width - 1) * 4 + 3]! > 32
    )
      throw new Error('Lettering touches the output edge and may be clipped.')
}
export function useBannerLettering(
  fetcher: typeof $fetch = $fetch,
  inspectImage = validateLetteringImage
) {
  const studio = useBannerStudio()
  const snapshot = () =>
    JSON.stringify([
      studio.state.project,
      studio.state.activeKey,
      studio.state.selectedLayerId,
      studio.state.sets
    ])
  function discard() {
    request++
    target = null
    candidate.value = null
    proposal.value = null
    reviewed.value = false
    showOriginal.value = false
    loading.value = false
  }
  // The document and proposal are singletons. Install one detached subscription set,
  // independent of Artboard count or repeated context-menu actions.
  if (!watching) {
    watching = true
    effectScope(true).run(() => {
      watch(
        [() => studio.state.project, snapshot],
        () => {
          if (target) {
            discard()
            error.value
              = 'Artwork or selection changed. Generate a new preview.'
          }
        },
        { flush: 'sync' }
      )
      watch(
        [
          () => studio.state.selectedLayerId,
          () => studio.state.activeKey,
          () => studio.state.project
        ],
        () => {
          discard()
          opened.value = false
        },
        { flush: 'sync' }
      )
      watch(
        [wording, instruction, mode, sourceWording, isolationConfirmed],
        () => {
          if (target) {
            discard()
            error.value = 'Lettering inputs changed. Generate a new preview.'
          }
        },
        { flush: 'sync' }
      )
    })
  }
  // Context-menu event calls have no component scope; only mounted editor consumers
  // participate in teardown. The last editor unmount cancels any late preview.
  const scoped = !!getCurrentScope()
  let disposed = false
  if (scoped) consumers++
  function dispose() {
    if (!scoped || disposed) return
    disposed = true
    consumers--
    if (consumers === 0) {
      discard()
      opened.value = false
    }
  }
  if (scoped) onScopeDispose(dispose)
  const protectedCopy = computed(
    () =>
      !!studio.selectedLayer.value?.platformQr
      || isBannerCopyLayerProtected({
        ...studio.selectedLayer.value,
        text:
          studio.selectedLayer.value?.text
          || sourceWording.value
          || (studio.selectedLayer.value as LetteringLayer)?.letteringRecipe
            ?.wording
      })
  )
  function open(layer: Layer) {
    if (layer.platformQr) {
      discard()
      opened.value = false
      error.value = 'Managed QR codes must be updated in QR Codes.'
      return
    }
    discard()
    studio.selectLayer(layer.id)
    useBannerInspector().inspectorTab.value = 'properties'
    const recipe = (layer as LetteringLayer).letteringRecipe
    wording.value
      = layer.type === 'text' ? layer.text || '' : recipe?.wording || ''
    sourceWording.value
      = layer.type === 'text' ? layer.text || '' : recipe?.wording || ''
    isolationConfirmed.value = false
    instruction.value
      = recipe?.instruction || 'Keep the angle, colours and depth.'
    mode.value = layer.type === 'text' ? 'native' : recipe?.mode || 'raster'
    opened.value = true
    error.value = ''
  }
  async function generate() {
    discard()
    error.value = ''
    const layer = studio.selectedLayer.value as LetteringLayer | null
    if (
      !layer
      || !['text', 'image'].includes(layer.type)
      || layer.locked
      || layer.platformQr
    )
      return
    const original
      = layer.type === 'text'
        ? layer.text || ''
        : sourceWording.value || layer.letteringRecipe?.wording || ''
    if (
      layer.type === 'image'
      && (!sourceWording.value.trim() || !isolationConfirmed.value)
    ) {
      error.value
        = 'Review the source wording and confirm this is isolated lettering with no duplicate beneath it.'
      return
    }
    if (
      !wording.value.trim()
      || !isSafeBannerRewrite(original, wording.value, protectedCopy.value)
    ) {
      error.value
        = 'Correct the wording. Approved copy and commercial facts must remain exact.'
      return
    }
    if (!studio.state.project?.updatedAt || studio.state.isDirty) {
      error.value
        = 'Save the artwork before generating a revision-bound preview.'
      return
    }
    if (
      layer.imageCrop
      || layer.maskTargetIds?.length
      || studio.activeLayers.value.some(mask =>
        mask.maskTargetIds?.includes(layer.id)
      )
      || (layer.mixBlendMode && layer.mixBlendMode !== 'normal')
    ) {
      error.value
        = 'Crop, mask or compositing needs manual review before lettering replacement.'
      return
    }
    const captured = {
      snapshot: snapshot(),
      projectId: studio.state.project.id,
      revision: studio.state.project.updatedAt,
      key: studio.state.activeKey,
      layer: JSON.parse(JSON.stringify(layer))
    }
    target = captured
    const token = ++request
    loading.value = true
    try {
      if (layer.type === 'image') {
        if (!layer.src)
          throw new Error('Select an owned lettering cutout first.')
        const source = new Image()
        source.crossOrigin = 'anonymous'
        source.src = layer.src
        await source.decode()
        await inspectImage(
          layer.src,
          source.naturalWidth,
          source.naturalHeight
        )
      }
      if (token !== request || target !== captured) return
      const result = (await fetcher('/api/agency/banner-studio/ai/lettering', {
        method: 'POST',
        body: {
          projectId: captured.projectId,
          sourceRevision: captured.revision,
          formatKey: captured.key,
          layerId: layer.id,
          mode: mode.value,
          wording: wording.value,
          instruction: instruction.value,
          ...(layer.type === 'image'
            ? {
                sourceWording: sourceWording.value,
                isolationConfirmed: isolationConfirmed.value
              }
            : {})
        }
      })) as LetteringResponse
      if (token !== request || target !== captured) return
      if (
        !result.proposalId
        || result.projectId !== captured.projectId
        || result.sourceRevision !== captured.revision
        || result.formatKey !== captured.key
        || result.layerId !== layer.id
        || result.mode !== mode.value
        || result.wording !== wording.value
        || !result.evidence?.provider
        || !result.evidence.model
        || result.verification !== 'review-required'
        || !Array.isArray(result.warnings)
      )
        throw new Error('Incomplete or mismatched lettering proposal.')
      let patch: Partial<Layer>
      if (result.mode === 'raster') {
        if (!result.asset?.url || !result.asset.id)
          throw new Error('No generated lettering asset returned.')
        await inspectImage(
          result.asset.url,
          result.asset.width,
          result.asset.height
        )
        patch = {
          type: 'image',
          src: result.asset.url,
          fit: 'contain',
          text: undefined,
          textRuns: undefined
        }
      } else {
        if (
          !result.nativeStyle?.fontFamily
          || !Number.isFinite(result.nativeStyle.fontSize)
          || result.nativeStyle.fontSize! <= 0
        )
          throw new Error('No supported font match returned.')
        const allowed = [
          'fontFamily',
          'fontSize',
          'fontWeight',
          'color',
          'fontStyle',
          'textShadow',
          'textStroke',
          'textAlign',
          'lineHeight',
          'letterSpacing',
          'textDepth',
          'gradientColors'
        ] as const
        patch = {
          ...(captured.layer.type === 'image'
            ? {
                textTransform: 'none',
                textTexture: undefined,
                textDepth: undefined,
                textShadow: undefined,
                textStroke: undefined,
                gradientColors: undefined,
                effectOrigin: undefined,
                lineBoxFontSize: undefined,
                bgColor: undefined,
                visualFilter: 'none' as const,
                textAntialias: true
              }
            : {}),
          type: 'text',
          text: result.wording,
          textRuns: undefined,
          src: undefined
        }
        for (const key of allowed)
          if (result.nativeStyle[key] !== undefined)
            Object.assign(patch, { [key]: result.nativeStyle[key] })
      }
      if (token !== request || target !== captured) return
      candidate.value = {
        ...captured.layer,
        ...patch,
        letteringRecipe: {
          version: 1,
          sourceWording: sourceWording.value || original,
          mode: result.mode,
          wording: result.wording,
          instruction: instruction.value,
          reference:
            captured.layer.letteringRecipe?.reference
            || captured.layer.src
            || null,
          sourceRevision: captured.revision,
          proposal: result
        }
      } as LetteringLayer
      proposal.value = result
    } catch (caught: unknown) {
      const failure = caught as {
        data?: { statusMessage?: string }
        message?: string
      }
      if (token === request) {
        candidate.value = null
        error.value
          = failure?.data?.statusMessage
            || failure?.message
            || 'Lettering generation failed. Artwork is unchanged.'
      }
    } finally {
      if (token === request) loading.value = false
    }
  }
  function apply() {
    if (studio.selectedLayer.value?.platformQr) return false
    if (
      !target
      || !candidate.value
      || !reviewed.value
      || snapshot() !== target.snapshot
    )
      return false
    const replacement = candidate.value
    const id = target.layer.id
    discard()
    studio.updateLayer(id, replacement)
    opened.value = false
    return true
  }
  const previewLayer = computed(() =>
    showOriginal.value ? null : candidate.value
  )
  return {
    sourceWording,
    isolationConfirmed,
    previewLayer,
    showOriginal,
    opened,
    wording,
    instruction,
    mode,
    loading,
    error,
    candidate,
    proposal,
    reviewed,
    protectedCopy,
    open,
    generate,
    discard,
    apply,
    dispose
  }
}
