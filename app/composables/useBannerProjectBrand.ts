import type { BannerBrandKit } from '~/types/banner-studio'
import { detectBannerBrandKit } from '~/utils/banner-brand-detection'
import { brandFontSelection } from '~/utils/banner-brand-kit'

export function useBannerProjectBrand(preload = false) {
  const { state } = useBannerStudio()
  const clientId = computed(() => state.project?.clientId || undefined)
  const query = computed(() => clientId.value ? { clientId: clientId.value } : {})
  const choices = useState<Record<string, string>>('banner-project-brand-choices', () => ({}))
  const { data: brandKits, error, status, refresh } = useFetch<BannerBrandKit[]>('/api/agency/banner-studio/brand-kits', {
    key: computed(() => `banner-project-brand-kits:${clientId.value || 'agency'}`), query, default: () => []
  })
  const detected = computed(() => detectBannerBrandKit(state.project, brandKits.value || []))
  const kit = computed(() => {
    const choice = choices.value[state.project?.id || '']
    if (choice === '__choose__') return undefined
    return brandKits.value?.find(kit => kit.id === choice) || detected.value
  })
  const kitId = computed({
    get: () => kit.value?.id || '__choose__',
    set: (id: string) => {
      if (state.project?.id) choices.value = { ...choices.value, [state.project.id]: id }
    }
  })
  if (preload) {
    const { customFonts, loadUsedFonts, getFont } = useBannerFonts(() => clientId.value ?? null)
    watch([kit, customFonts], ([selected]) => {
      if (!selected) return
      const faces = selected.fonts.filter(font => font.assets?.length || getFont(font.family)).flatMap(font => font.assets?.length
        ? font.assets.map(asset => ({ fontFamily: font.family, fontWeight: asset.weight, fontAssetId: asset.id }))
        : [brandFontSelection(font)])
      loadUsedFonts(faces)
    }, { immediate: true })
  }
  return { brandKits, kit, kitId, detected, loading: computed(() => status.value === 'pending'), error, refresh }
}
