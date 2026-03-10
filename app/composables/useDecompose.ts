import type { DecomposeResult } from '~/types/banner-studio'

// Module-scope singleton state — shared across all callers to prevent
// concurrent decomposition from both AssetsPanel and Timeline
const _isDecomposing = ref(false)
const _decomposingAssetId = ref<string | null>(null)
const _decomposingLayerId = ref<number | null>(null)

export function useDecompose() {
  const { addLayer } = useBannerStudio()
  const toast = useToast()

  async function decomposeFromUrl(
    imageUrl: string,
    sourceName: string,
    sourceId: string | number,
    sourceType: 'asset' | 'layer',
    numLayers?: number
  ): Promise<boolean> {
    if (_isDecomposing.value) return false

    _isDecomposing.value = true
    if (sourceType === 'asset') _decomposingAssetId.value = String(sourceId)
    else _decomposingLayerId.value = typeof sourceId === 'number' ? sourceId : Number(sourceId)

    try {
      const result = await $fetch<DecomposeResult>('/api/agency/banner-studio/ai/decompose', {
        method: 'POST',
        body: { imageUrl, numLayers },
      })

      if (!result?.layers?.length) {
        toast.add({ title: 'Decomposition failed', description: 'No layers returned', color: 'error' })
        return false
      }

      // Add each decomposed layer to the canvas, resolving natural dimensions
      for (let i = 0; i < result.layers.length; i++) {
        const dl = result.layers[i]

        // Resolve actual image dimensions before adding layer
        let w = 200
        let h = 150
        try {
          const img = new Image()
          img.src = dl.url
          await new Promise<void>((resolve) => {
            img.onload = () => resolve()
            img.onerror = () => resolve()
          })
          if (img.naturalWidth > 0) w = img.naturalWidth
          if (img.naturalHeight > 0) h = img.naturalHeight
        } catch {
          // fallback to defaults
        }

        addLayer({
          type: 'image',
          src: dl.url,
          name: `${sourceName} — ${dl.name}`,
          x: 10 + i * 8,
          y: 10 + i * 8,
          w,
          h,
          fit: 'contain',
          animIn: 'fadeIn',
        })
      }

      toast.add({
        title: 'Layers extracted',
        description: `${result.layers.length} layers from "${sourceName}"`,
        color: 'success',
      })
      return true
    } catch (err: any) {
      const msg = err?.data?.statusMessage || err?.message || 'Decomposition failed'
      toast.add({ title: 'Decompose error', description: msg, color: 'error' })
      return false
    } finally {
      _isDecomposing.value = false
      _decomposingAssetId.value = null
      _decomposingLayerId.value = null
    }
  }

  return {
    isDecomposing: _isDecomposing,
    decomposingAssetId: _decomposingAssetId,
    decomposingLayerId: _decomposingLayerId,
    decomposeFromUrl,
  }
}
