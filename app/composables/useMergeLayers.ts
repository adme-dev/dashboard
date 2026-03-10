const _isMerging = ref(false)

export function useMergeLayers() {
  const { activeLayers, addLayer, removeLayer, activeFormat } = useBannerStudio()
  const toast = useToast()

  async function mergeLayers(layerIds: number[]): Promise<void> {
    if (layerIds.length < 2) {
      toast.add({ title: 'Select at least 2 layers', color: 'warning' })
      return
    }

    // Get layers sorted by zIndex ascending (bottom first)
    const layers = activeLayers.value
      .filter(l => layerIds.includes(l.id))
      .sort((a, b) => a.zIndex - b.zIndex)

    // Filter to image layers only
    const imageLayers = layers.filter(l => l.type === 'image' && l.src && !l.hidden)
    const skipped = layers.length - imageLayers.length

    if (skipped > 0) {
      toast.add({
        title: 'Non-image layers skipped',
        description: `${skipped} non-image or hidden layer(s) excluded from merge`,
        color: 'warning',
      })
    }

    if (imageLayers.length < 2) {
      toast.add({ title: 'Need at least 2 visible image layers to merge', color: 'warning' })
      return
    }

    _isMerging.value = true

    try {
      const fmt = activeFormat.value
      const canvasW = fmt?.w ?? 300
      const canvasH = fmt?.h ?? 250

      // Create offscreen canvas at format dimensions
      const canvas = document.createElement('canvas')
      canvas.width = canvasW
      canvas.height = canvasH
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        toast.add({ title: 'Canvas not available', color: 'error' })
        return
      }

      // Draw each layer
      for (const layer of imageLayers) {
        const img = await loadImage(layer.src!)
        if (!img) continue

        ctx.save()
        ctx.globalAlpha = layer.opacity

        const cx = layer.x + layer.w / 2
        const cy = layer.y + layer.h / 2

        if (layer.rotation) {
          ctx.translate(cx, cy)
          ctx.rotate((layer.rotation * Math.PI) / 180)
          ctx.translate(-cx, -cy)
        }

        ctx.drawImage(img, layer.x, layer.y, layer.w, layer.h)
        ctx.restore()
      }

      // Export to PNG blob
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, 'image/png')
      })

      if (!blob) {
        toast.add({ title: 'Failed to create merged image', color: 'error' })
        return
      }

      // Upload via existing asset endpoint
      const formData = new FormData()
      formData.append('file', blob, `merged-${Date.now()}.png`)

      const uploadResult = await $fetch<{ url: string; r2Key: string }>('/api/agency/banner-studio/assets/upload', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResult?.url) {
        toast.add({ title: 'Failed to upload merged image', color: 'error' })
        return
      }

      // Calculate bounding box of merged layers
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const l of imageLayers) {
        minX = Math.min(minX, l.x)
        minY = Math.min(minY, l.y)
        maxX = Math.max(maxX, l.x + l.w)
        maxY = Math.max(maxY, l.y + l.h)
      }

      const maxZ = Math.max(...imageLayers.map(l => l.zIndex))

      // Remove original layers
      for (const l of imageLayers) {
        removeLayer(l.id)
      }

      // Add merged layer at bounding box position
      addLayer({
        type: 'image',
        src: uploadResult.url,
        name: `Merged (${imageLayers.length} layers)`,
        x: 0,
        y: 0,
        w: canvasW,
        h: canvasH,
        zIndex: maxZ,
        fit: 'contain',
        animIn: 'fadeIn',
      })

      toast.add({
        title: 'Layers merged',
        description: `${imageLayers.length} layers combined into one`,
        color: 'success',
      })
    } catch (err: any) {
      console.error('[MergeLayers]', err)
      toast.add({
        title: 'Merge failed',
        description: err?.message || 'An error occurred during merge',
        color: 'error',
      })
    } finally {
      _isMerging.value = false
    }
  }

  return {
    isMerging: _isMerging,
    mergeLayers,
  }
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => {
      console.warn('[MergeLayers] Failed to load image:', src)
      resolve(null)
    }
    img.src = src
  })
}
