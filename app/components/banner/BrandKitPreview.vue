<script setup lang="ts">
import type { BannerBrandKit } from '~/types/banner-studio'
import { bannerFontFamily } from '~/utils/banner-font-family'
import { brandColor, brandFont, brandFontSelection, isDarkColor } from '~/utils/banner-brand-kit'
import { motorstackBrandId } from '~~/shared/bannerBrandGuides'
import { brandStyleProfile } from '~~/shared/bannerBrandProfiles'

const props = withDefaults(defineProps<{
  kit: Pick<BannerBrandKit, 'name' | 'colors' | 'fonts' | 'logos'> & { clientId?: string | null, sourceUrl?: string | null }
  ratio?: number
  compact?: boolean
  vehicleImageUrl?: string | null
  vehicleName?: string | null
}>(), { ratio: 300 / 250, compact: false, vehicleImageUrl: null, vehicleName: null })

const profile = computed(() => brandStyleProfile(motorstackBrandId(props.kit.sourceUrl)))
const bg = computed(() => profile.value?.surface || brandColor(props.kit, 'background') || '#ffffff')
const foreground = computed(() => profile.value?.heading || (isDarkColor(bg.value) ? '#ffffff' : '#111111'))
const bodyColor = computed(() => profile.value?.body || (isDarkColor(bg.value) ? '#ffffff' : '#333333'))
const accent = computed(() => brandColor(props.kit, 'accent') || brandColor(props.kit, 'primary') || '#111111')
const primaryButton = computed(() => ({
  backgroundColor: profile.value?.ctaFill || accent.value,
  color: profile.value?.ctaText || (isDarkColor(accent.value) ? '#ffffff' : '#111111'),
  borderColor: profile.value?.ctaBorder || 'transparent',
  borderWidth: profile.value?.ctaBorder ? '1px' : '0',
  borderStyle: 'solid',
  borderRadius: `${profile.value?.ctaRadius ?? 2}px`,
  textTransform: profile.value?.ctaCase || 'uppercase'
}))
const secondaryButton = computed(() => ({
  backgroundColor: profile.value?.secondaryFill || 'transparent',
  color: profile.value?.secondaryText || foreground.value,
  borderColor: profile.value?.secondaryBorder || foreground.value,
  borderWidth: '1px',
  borderStyle: 'solid',
  borderRadius: `${profile.value?.ctaRadius ?? 2}px`,
  textTransform: profile.value?.ctaCase || 'uppercase'
}))
const { loadUsedFonts, getCustomFont, getFont } = useBannerFonts(() => props.kit.clientId ?? null)
function resolvedRoleFont(role: 'heading' | 'body' | 'extra') {
  const font = brandFont(props.kit, role) || (role === 'extra' ? brandFont(props.kit, 'heading') : undefined)
  if (!font) return undefined
  const selection = brandFontSelection(font)
  return { ...selection, fontAssetId: selection.fontAssetId || getCustomFont(selection.fontFamily, selection.fontWeight)?.id }
}
const heading = computed(() => resolvedRoleFont(profile.value?.headingFontRole || 'heading'))
const body = computed(() => resolvedRoleFont('body'))
const button = computed(() => resolvedRoleFont(profile.value?.ctaFontRole || 'body'))
const headingStyle = computed(() => ({ color: foreground.value, fontFamily: bannerFontFamily(heading.value?.fontFamily, heading.value?.fontAssetId), fontWeight: heading.value?.fontWeight }))
const bodyStyle = computed(() => ({ color: bodyColor.value, fontFamily: bannerFontFamily(body.value?.fontFamily, body.value?.fontAssetId), fontWeight: body.value?.fontWeight }))
const buttonStyle = computed(() => ({ fontFamily: motorstackBrandId(props.kit.sourceUrl) === 'ldv' ? 'Open Sans, sans-serif' : bannerFontFamily(button.value?.fontFamily, button.value?.fontAssetId), fontWeight: motorstackBrandId(props.kit.sourceUrl) === 'ldv' ? 700 : button.value?.fontWeight || 700 }))
const logo = computed(() => props.kit.logos.find(l => l.variant === (isDarkColor(bg.value) ? 'dark' : 'light')) || props.kit.logos.find(l => !l.variant || l.variant === 'any') || props.kit.logos[0])
const missingFonts = computed(() => props.kit.fonts.filter(font => !font.assets?.length && !getFont(font.family)))
const model = computed(() => props.vehicleName?.trim() || 'the range')
const headline = computed(() => model.value === 'the range' ? `Discover ${props.kit.name}` : `Discover ${model.value}`)
watch([heading, body, button], ([h, b, c]) => {
  loadUsedFonts([h, b, c].filter((font): font is NonNullable<typeof font> => !!font && (!!font.fontAssetId || !!getFont(font.fontFamily))))
}, { immediate: true })
</script>

<template>
  <div class="brand-preview relative w-full overflow-hidden border border-black/10 select-none" :style="{ aspectRatio: String(ratio), backgroundColor: bg }">
    <div v-if="vehicleImageUrl" class="absolute right-[-4%] top-[8%] w-[61%] h-[79%] flex items-center justify-center" :class="compact ? 'top-[23%] w-[92%] h-[37%]' : ''">
      <img :src="vehicleImageUrl" :alt="`${kit.name} ${model} vehicle`" class="max-h-full max-w-full object-contain drop-shadow-xl">
    </div>
    <div class="absolute inset-0 p-[6%] flex flex-col justify-between" :class="compact ? 'p-[7%]' : ''">
      <div class="flex items-start justify-between gap-2">
        <img
          v-if="logo"
          :src="logo.url"
          :alt="logo.name"
          class="h-auto max-h-8 w-auto max-w-[34%] object-contain object-left"
          :class="compact ? 'max-h-5 max-w-[58%]' : ''"
        >
        <span v-else class="text-[10px] tracking-wide" :style="headingStyle">{{ kit.name }}</span>
        <span v-if="!compact" class="text-[8px] tracking-[0.13em] uppercase" :style="bodyStyle">Model range</span>
      </div>
      <div class="relative z-10 max-w-[52%]" :class="compact ? 'max-w-full' : ''">
        <p class="leading-[1.04] text-[clamp(13px,5.1cqw,32px)]" :style="headingStyle">
          {{ headline }}
        </p>
        <p v-if="!compact" class="mt-[2%] text-[clamp(8px,1.6cqw,13px)] leading-snug" :style="bodyStyle">
          Find your next drive with {{ kit.name }}.
        </p>
        <div class="mt-[5%] flex flex-wrap gap-[2%]">
          <span class="inline-flex min-h-6 items-center justify-center whitespace-nowrap px-[5%] py-[2%] text-[clamp(7px,1.7cqw,11px)]" :style="[primaryButton, buttonStyle]">Book a test drive</span>
          <span v-if="!compact" class="inline-flex min-h-6 items-center justify-center whitespace-nowrap px-[5%] py-[2%] text-[clamp(7px,1.7cqw,11px)]" :style="[secondaryButton, buttonStyle]">Explore models</span>
        </div>
      </div>
    </div>
    <div v-if="missingFonts.length" class="absolute inset-x-0 bottom-0 z-20 bg-default/95 px-2 py-1 text-[10px] text-muted">
      Font preview pending upload
    </div>
  </div>
</template>

<style scoped>
.brand-preview { container-type: inline-size; }
</style>
