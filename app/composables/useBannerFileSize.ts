import { buildBannerHTML } from '~/utils/banner-html-builder'

// Module-scope asset size registry
const assetSizes = ref<Map<string, number>>(new Map())

export function useBannerFileSize() {
  const { state } = useBannerStudio()
  const { getExportCustomFonts } = useBannerFonts()

  function registerAssetSize(url: string, bytes: number) {
    assetSizes.value.set(url, bytes)
  }

  function estimateSize(fmtKey: string): { html: number; assets: number; total: number } {
    const layers = state.sets[fmtKey]?.layers ?? []
    const html = buildBannerHTML(fmtKey, layers, { bgColor: state.bgColor, customFonts: getExportCustomFonts(layers) })
    const htmlBytes = new Blob([html]).size

    let assetBytes = 0
    const seen = new Set<string>()
    layers.forEach(l => {
      if (l.src && !seen.has(l.src)) {
        seen.add(l.src)
        if (assetSizes.value.has(l.src)) {
          assetBytes += assetSizes.value.get(l.src)!
        }
      }
    })

    return { html: htmlBytes, assets: assetBytes, total: htmlBytes + assetBytes }
  }

  const activeSize = computed(() => estimateSize(state.activeKey))

  return { estimateSize, registerAssetSize, assetSizes, activeSize }
}
