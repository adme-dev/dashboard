<script setup lang="ts">
import type { BannerBrandKit } from '~/types/banner-studio'
import { brandFont, brandFontSelection } from '~/utils/banner-brand-kit'
import { bannerFontFamily } from '~/utils/banner-font-family'

const props = defineProps<{ kit: BannerBrandKit, compact?: boolean }>()
const { loadUsedFonts, getCustomFont, getFont } = useBannerFonts(() => props.kit.clientId ?? null)
const logo = computed(() => props.kit.logos.find(item => item.variant === 'light') || props.kit.logos.find(item => item.variant !== 'dark') || props.kit.logos[0])
const logoFailed = ref(false)
watch(() => logo.value?.url, () => {
  logoFailed.value = false
})
const fonts = computed(() => (['heading', 'body'] as const).map((role) => {
  const font = brandFont(props.kit, role)
  if (!font) return { role, label: role === 'heading' ? 'Heading' : 'Body', family: 'Not set' }
  const selection = brandFontSelection(font)
  return { role, label: role === 'heading' ? 'Heading' : 'Body', family: font.family, ...selection,
    fontAssetId: selection.fontAssetId || getCustomFont(selection.fontFamily, selection.fontWeight)?.id }
}))
watch(fonts, (items) => {
  loadUsedFonts(items.filter(font => font.fontFamily && (font.fontAssetId || getFont(font.fontFamily))))
}, { immediate: true })
</script>

<template>
  <div class="bg-default p-4 space-y-4 text-highlighted">
    <!-- Logo specimens retain the surface required by the supplied variant in either UI theme. -->
    <div
      class="flex items-center justify-center rounded-md border border-default px-5"
      :class="[compact ? 'h-20' : 'h-28', logo?.variant === 'dark' ? 'bg-[#202126] text-white' : 'bg-white text-[#171717]']"
    >
      <img
        v-if="logo && !logoFailed"
        :src="safeMediaUrl(logo.url)"
        :alt="logo.name"
        class="h-16 w-full max-w-56 object-contain"
        loading="lazy"
        @error="logoFailed = true"
      >
      <span v-else class="text-sm font-medium text-center">{{ logoFailed ? 'Logo unavailable' : 'No logo yet' }}</span>
    </div>
    <div class="space-y-3">
      <div v-for="font in fonts.slice(0, compact ? 1 : 2)" :key="font.role" class="min-w-0">
        <div class="text-xs text-muted mb-1">
          {{ font.label }}<span v-if="font.fontWeight"> · {{ font.fontWeight }}</span>
        </div>
        <div
          class="text-lg leading-snug text-highlighted break-words"
          :style="{ fontFamily: bannerFontFamily(font.fontFamily, font.fontAssetId), fontWeight: font.fontWeight }"
        >
          {{ font.family }}
        </div>
      </div>
    </div>
  </div>
</template>
