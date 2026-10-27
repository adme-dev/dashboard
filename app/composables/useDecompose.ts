import { ref, watch } from 'vue'
import type { DecomposeResult, Layer } from '~/types/banner-studio'
import { hasScopedCanvas, SCOPED_DISSECTION_EXCLUSION } from '../../shared/bannerScopedCanvas'

/** Load every frame before changing the canvas; a broken image is not a layer. */
function loadFrame(url: string): Promise<{ width: number, height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const finish = (error?: Error) => {
      clearTimeout(timer)
      image.onload = null
      image.onerror = null
      if (error) reject(error)
      else resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    const timer = setTimeout(() => finish(new Error('A raster layer could not be loaded in time.')), 15_000)
    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0
      ? undefined
      : new Error('A raster layer has invalid dimensions.'))
    image.onerror = () => finish(new Error('A raster layer could not be loaded. Your artwork is unchanged.'))
    image.src = url
  })
}

// Module-scope singleton state — shared across all callers to prevent
// concurrent decomposition from both AssetsPanel and Timeline
const _isDecomposing = ref(false)
const _decomposingAssetId = ref<string | null>(null)
const _decomposingLayerId = ref<number | null>(null)
const _lastPptxUrl = ref<string | null>(null)
const _lastZipUrl = ref<string | null>(null)

export function useDecompose() {
  const studio = useBannerStudio()
  const { state, addLayer, updateLayer, withCanvasUndo } = studio
  const toast = useToast()
  const apiFetch = $fetch as <T = unknown>(
    request: string,
    options?: { method?: string, body?: unknown }
  ) => Promise<T>

  async function decomposeFromUrl(
    imageUrl: string,
    sourceName: string,
    sourceId: string | number,
    sourceType: 'asset' | 'layer',
    numLayers?: number,
    prompt?: string
  ): Promise<boolean> {
    if (hasScopedCanvas(state.sets) || hasScopedCanvas(imageUrl)) {
      toast.add({ title: 'Protected artwork', description: SCOPED_DISSECTION_EXCLUSION, color: 'warning' })
      return false
    }
    const managedSource = Object.entries(state.sets).some(([formatKey, board]) => board.layers.some(layer => layer.platformQr && (
      layer.src === imageUrl || (sourceType === 'layer' && formatKey === state.activeKey && layer.id === Number(sourceId))
      || (sourceType === 'asset' && layer.platformQr.assetId === String(sourceId))
    )))
    if (managedSource) {
      toast.add({ title: 'Managed QR protected', description: 'A managed QR code cannot be decomposed. Update it in QR Codes.', color: 'warning' })
      return false
    }
    if (_isDecomposing.value) return false

    _isDecomposing.value = true
    _lastPptxUrl.value = null
    _lastZipUrl.value = null
    if (sourceType === 'asset') _decomposingAssetId.value = String(sourceId)
    else _decomposingLayerId.value = typeof sourceId === 'number' ? sourceId : Number(sourceId)

    const formatKey = state.activeKey
    const source = sourceType === 'layer' ? state.sets[formatKey]?.layers.find(layer => layer.id === Number(sourceId)) : undefined
    const sourceSnapshot: Layer | undefined = source ? JSON.parse(JSON.stringify(source)) : undefined
    let stale = false
    // Synchronous invalidation also catches switching away/back and edit/undo.
    const stopWatching = watch([
      () => state.project,
      () => state.activeKey,
      () => state.sets[formatKey]
    ], () => { stale = true }, { deep: true, flush: 'sync' })
    const assertCurrent = () => {
      if (stale) throw new Error('The artwork changed during decomposition. Run it again on the current artwork.')
    }

    try {
      if (!studio.activeFormat.value || (sourceType === 'layer' && (!sourceSnapshot || sourceSnapshot.src !== imageUrl))) {
        throw new Error('The source image or artboard is no longer available.')
      }
      if (sourceSnapshot && (sourceSnapshot.type !== 'image' || sourceSnapshot.srcType === 'video' || sourceSnapshot.isMask || sourceSnapshot.feedBindings?.length
        || state.sets[formatKey]?.layers.some(layer => layer.isMask && layer.maskTargetIds?.includes(sourceSnapshot.id)))) {
        throw new Error('Decompose a static, unmasked image without feed bindings.')
      }
      // Applying an aggregate effect to each PNG changes overlapping pixels. The
      // editor has no isolated group compositing contract, so do not approximate it.
      if (sourceSnapshot && (sourceSnapshot.opacity !== 1
        || (sourceSnapshot.mixBlendMode && sourceSnapshot.mixBlendMode !== 'normal')
        || (sourceSnapshot.visualFilter && sourceSnapshot.visualFilter !== 'none')
        || sourceSnapshot.animIn !== 'none' || sourceSnapshot.animOut !== 'none'
        || sourceSnapshot.keyframes?.opacity?.length)) {
        throw new Error('Set image opacity to 100%, blend mode to Normal, and remove filters and entry/exit or opacity animations before decomposing.')
      }
      const sourceFrame = await loadFrame(imageUrl)
      assertCurrent()
      const result = await apiFetch<DecomposeResult & { status?: string, expectedLayerCount?: number }>('/api/agency/banner-studio/ai/decompose', {
        method: 'POST',
        body: { imageUrl, numLayers, prompt: prompt || undefined }
      })

      assertCurrent()
      if (!result?.layers?.length || (result.status && result.status !== 'complete')
        || (result.expectedLayerCount !== undefined && result.expectedLayerCount !== result.layers.length)) {
        throw new Error('The provider did not return a complete raster layer set. Your artwork is unchanged.')
      }

      const frames = await Promise.all(result.layers.map(layer => loadFrame(layer.url)))
      assertCurrent()
      const frame = frames[0]!
      if (frames.some((size, i) => size.width !== frame.width || size.height !== frame.height
        || (result.layers[i]!.width > 0 && result.layers[i]!.width !== size.width)
        || (result.layers[i]!.height > 0 && result.layers[i]!.height !== size.height))) {
        throw new Error('Raster layers do not share one registered frame. Your artwork is unchanged.')
      }
      // Providers can resize the entire frame. Allow pixel rounding, never stretch a changed aspect ratio.
      if (Math.abs(frame.width / frame.height - sourceFrame.width / sourceFrame.height) > 2 / Math.min(frame.height, sourceFrame.height)) {
        throw new Error('The raster layer frame has a different aspect ratio from the source.')
      }
      const format = studio.activeFormat.value!
      const scale = Math.min(format.w / frame.width, format.h / frame.height, 1)
      const placement: Partial<Layer> = sourceSnapshot
        ? { ...sourceSnapshot }
        : {
            x: (format.w - frame.width * scale) / 2, y: (format.h - frame.height * scale) / 2,
            w: frame.width * scale, h: frame.height * scale, fit: 'contain', animIn: 'none', animOut: 'none'
          }
      delete placement.id
      delete placement.bgColor
      delete placement.zIndex
      const baseZ = sourceSnapshot?.zIndex ?? Math.max(0, ...studio.activeLayers.value.map(layer => layer.zIndex)) + 1
      stopWatching()
      withCanvasUndo(() => {
        if (sourceSnapshot) {
          // Keep the original for undo without leaving its baked-in lettering visible underneath.
          for (const layer of [...studio.activeLayers.value]) {
            if (layer.zIndex > baseZ) updateLayer(layer.id, { zIndex: layer.zIndex + result.layers.length - 1 })
          }
          updateLayer(sourceSnapshot.id, { hidden: true })
        }
        result.layers.forEach((layer, index) => addLayer({
          ...placement, type: 'image', src: layer.url, srcType: 'image',
          hidden: sourceSnapshot?.hidden ?? false,
          name: `${sourceName} — ${layer.name} (raster)`, zIndex: baseZ + index
        }))
      })

      // Store export URLs if available
      _lastPptxUrl.value = result.pptxUrl || null
      _lastZipUrl.value = result.zipUrl || null

      const extras = [result.pptxUrl && 'PPTX', result.zipUrl && 'ZIP'].filter(Boolean)
      const extraMsg = extras.length > 0 ? ` (${extras.join(' + ')} available)` : ''

      toast.add({
        title: 'Raster layers imported',
        description: `${result.layers.length} raster image layers from "${sourceName}"${extraMsg}. Text remains pixels; review the result before using it.`,
        color: 'success'
      })
      return true
    } catch (err: unknown) {
      const detail = err as { data?: { statusMessage?: unknown }, message?: unknown }
      const message = detail?.data?.statusMessage || detail?.message
      const msg = typeof message === 'string' ? message : 'Decomposition failed'
      toast.add({ title: 'Decompose error', description: msg, color: 'error' })
      return false
    } finally {
      stopWatching()
      _isDecomposing.value = false
      _decomposingAssetId.value = null
      _decomposingLayerId.value = null
    }
  }

  return {
    isDecomposing: _isDecomposing,
    decomposingAssetId: _decomposingAssetId,
    decomposingLayerId: _decomposingLayerId,
    lastPptxUrl: _lastPptxUrl,
    lastZipUrl: _lastZipUrl,
    decomposeFromUrl
  }
}
