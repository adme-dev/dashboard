<script setup lang="ts">
/**
 * A miniature banner rendered from a brand kit — the fastest way to *see* a kit.
 * Pure CSS; scales to its container via an aspect box. Used on cards, in the editor and in the studio panel.
 */
import type { BannerBrandKit } from '~/types/banner-studio'
import { bannerFontFamily } from '~/utils/banner-font-family'
import { brandColor, brandFont, brandFontSelection, isDarkColor } from '~/utils/banner-brand-kit'

const props = withDefaults(defineProps<{
  kit: Pick<BannerBrandKit, 'name' | 'colors' | 'fonts' | 'logos'> & { clientId?: string | null }
  /** Aspect ratio of the mock artboard */
  ratio?: number
  headline?: string
  sub?: string
  cta?: string
  /** Compact hides sub copy */
  compact?: boolean
}>(), {
  ratio: 300 / 250,
  headline: 'Headline goes here',
  sub: 'Supporting line in the body face',
  cta: 'Call to action',
  compact: false
})

const bg = computed(() => brandColor(props.kit, 'background') || '#111114')
// Defaults contrast with whatever background the kit has, so an unfinished kit still previews legibly
const onBg = computed(() => (isDarkColor(bg.value) ? '#ffffff' : '#111111'))
const primary = computed(() => brandColor(props.kit, 'primary') || onBg.value)
const secondary = computed(() => brandColor(props.kit, 'secondary') || brandColor(props.kit, 'text') || (isDarkColor(bg.value) ? '#b5b8c0' : '#55585f'))
const accent = computed(() => brandColor(props.kit, 'accent') || primary.value)
const { loadUsedFonts, getCustomFont, getFont } = useBannerFonts(() => props.kit.clientId ?? null)
function resolvedRoleFont(role: 'heading' | 'body') {
  const font = brandFont(props.kit, role)
  if (!font) return undefined
  const selection = brandFontSelection(font)
  return { ...selection, fontAssetId: selection.fontAssetId || getCustomFont(selection.fontFamily, selection.fontWeight)?.id }
}
const missingFonts = computed(() => props.kit.fonts.filter(font => !font.assets?.length && !getFont(font.family)))
const heading = computed(() => resolvedRoleFont('heading'))
const body = computed(() => resolvedRoleFont('body'))
const logo = computed(() => {
  const dark = isDarkColor(bg.value)
  return props.kit.logos.find(l => (dark ? l.variant !== 'light' : l.variant !== 'dark')) || props.kit.logos[0]
})
const ctaText = computed(() => (isDarkColor(accent.value) ? '#ffffff' : '#111111'))
watch([heading, body], ([h, b]) => {
  loadUsedFonts([h, b].filter((font): font is NonNullable<typeof font> => !!font && (!!font.fontAssetId || !!getFont(font.fontFamily))))
}, { immediate: true })
</script>

<template>
  <div
    class="relative w-full overflow-hidden rounded-md select-none"
    :style="{ aspectRatio: String(ratio), backgroundColor: bg }"
  >
    <div v-if="missingFonts.length" class="absolute inset-x-0 top-0 z-10 bg-default/95 px-2 py-1 text-[10px] text-muted">
      Font preview pending upload
    </div>
    <!-- Subtle brand-coloured wash so flat backgrounds don't look dead -->
    <div
      class="absolute inset-0 opacity-20"
      :style="{ background: `radial-gradient(120% 80% at 100% 0%, ${accent} 0%, transparent 55%)` }"
    />
    <div class="absolute inset-0 p-[6%] flex flex-col justify-between">
      <div class="flex items-start justify-between gap-2">
        <img
          v-if="logo"
          :src="logo.url"
          :alt="logo.name"
          class="h-[18%] max-h-7 w-auto max-w-[40%] object-contain object-left"
        >
        <span
          v-else
          class="text-[9px] font-bold tracking-[0.2em] uppercase truncate max-w-[55%]"
          :style="{ color: primary, fontFamily: bannerFontFamily(heading?.fontFamily, heading?.fontAssetId), fontWeight: heading?.fontWeight }"
        >{{ kit.name }}</span>
      </div>
      <div class="space-y-[3%]">
        <div
          class="font-bold leading-[1.05] text-[clamp(11px,7cqw,22px)] line-clamp-2"
          :style="{ color: primary, fontFamily: bannerFontFamily(heading?.fontFamily, heading?.fontAssetId), fontWeight: heading?.fontWeight }"
        >
          {{ headline }}
        </div>
        <div
          v-if="!compact"
          class="text-[clamp(8px,3.6cqw,12px)] leading-snug line-clamp-1"
          :style="{ color: secondary, fontFamily: bannerFontFamily(body?.fontFamily, body?.fontAssetId), fontWeight: body?.fontWeight }"
        >
          {{ sub }}
        </div>
        <span
          class="inline-block rounded-sm px-[7%] py-[2.5%] text-[clamp(7px,3.2cqw,11px)] font-semibold uppercase tracking-wide"
          :style="{ backgroundColor: accent, color: ctaText, fontFamily: bannerFontFamily(heading?.fontFamily, heading?.fontAssetId), fontWeight: heading?.fontWeight }"
        >{{ cta }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Enable container-query units for the text clamps */
div[style*="aspect-ratio"] { container-type: inline-size; }
</style>
