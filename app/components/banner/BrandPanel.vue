<script setup lang="ts">
import type { BannerBrandKit, BrandKitFont, BrandKitLogo } from '~/types/banner-studio'
import { brandFontSelection } from '~/utils/banner-brand-kit'
import { bannerFontFamily } from '~/utils/banner-font-family'

const emit = defineEmits<{ browseAssets: [] }>()
const { state, selectedLayer, activeFormat, applyBrandKit, updateLayer, addLayer } = useBannerStudio()
const { isLayerLockedByOther } = useBannerRealtime()
const toast = useToast()
const clientId = computed(() => state.project?.clientId || undefined)
const { fetchCustomFonts, loadUsedFonts, getFont } = useBannerFonts(() => clientId.value ?? null)
const { brandKits, kit, kitId, loading, error, refresh } = useBannerProjectBrand()
const activeTab = ref('logos')
const showManagerModal = ref(false)
const kitItems = computed(() => [{ label: 'Choose a brand kit', value: '__choose__' }, ...brandKits.value.map(kit => ({ label: kit.name, value: kit.id }))])
const tabs = [{ label: 'Logos', value: 'logos' }, { label: 'Colours', value: 'colours' }, { label: 'Fonts', value: 'fonts' }]
const editable = computed(() => !!selectedLayer.value && !selectedLayer.value.locked && !isLayerLockedByOther(selectedLayer.value.id))
const canUseFont = computed(() => editable.value && ['text', 'button'].includes(selectedLayer.value!.type))
const colourProperty = computed(() => {
  if (!editable.value) return undefined
  return ({ text: 'color', rect: 'fillColor', button: 'bgColor', bg: 'bgColor' } as const)[selectedLayer.value!.type as 'text' | 'rect' | 'button' | 'bg']
})
watch(showManagerModal, async (open) => {
  if (!open) {
    await refresh()
    await fetchCustomFonts()
  }
})
watch(kit, (kit) => {
  if (kit) loadUsedFonts(kit.fonts.filter(font => font.assets?.length || getFont(font.family)).map(brandFontSelection))
})
function handleApply(value: BannerBrandKit) {
  applyBrandKit(value)
  toast.add({ title: 'Brand applied', description: `${value.name} applied to all layouts. Undo to restore.`, color: 'success' })
}
function useFont(font: BrandKitFont) {
  if (!canUseFont.value || (!font.assets?.length && !getFont(font.family))) return
  const selection = brandFontSelection(font)
  loadUsedFonts([selection])
  updateLayer(selectedLayer.value!.id, selection)
}
function useColour(hex: string) {
  if (colourProperty.value) updateLayer(selectedLayer.value!.id, { [colourProperty.value]: hex })
}
function addLogo(logo: BrandKitLogo, event: MouseEvent) {
  const image = (event.currentTarget as HTMLElement).querySelector('img')
  const format = activeFormat.value
  if (!format) return
  if (!image?.naturalWidth || !image.naturalHeight) {
    toast.add({ title: 'Logo is still loading', description: 'Try again once the preview is visible.', color: 'warning' })
    return
  }
  const scale = Math.min(format.w * 0.4 / image.naturalWidth, format.h * 0.3 / image.naturalHeight, 1)
  const w = image.naturalWidth * scale, h = image.naturalHeight * scale
  addLayer({ type: 'image', name: logo.name, isLogo: true, src: logo.url, fit: 'contain',
    x: (format.w - w) / 2, y: (format.h - h) / 2, w, h,
    startTime: 0, endTime: state.duration, animIn: 'none', animOut: 'none' })
}
</script>

<template>
  <div class="p-3 space-y-4 min-w-0">
    <div class="flex items-center justify-between gap-2">
      <h4 class="text-sm font-semibold">
        Brand kit
      </h4>
      <UButton
        icon="i-lucide-settings-2"
        aria-label="Manage brand kits"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="() => { showManagerModal = true }"
      />
    </div>
    <UFormField label="Brand kit">
      <USelectMenu
        v-model="kitId"
        :items="kitItems"
        value-key="value"
        :loading="loading"
        :disabled="loading"
        class="w-full"
      />
    </UFormField>
    <UAlert
      v-if="error"
      title="Could not load brand kits"
      color="error"
      variant="subtle"
    />
    <UButton
      v-if="error"
      label="Retry"
      size="xs"
      variant="outline"
      @click="() => refresh()"
    />
    <p v-if="!kit && !loading" class="text-xs text-muted leading-relaxed">
      Choose a kit to browse its logos, colours and fonts. Adding an individual asset keeps the rest of your design intact.
    </p>
    <template v-if="kit">
      <p class="text-xs text-muted">
        {{ kit.clientName || 'Shared agency kit' }}
      </p>
      <UTabs
        v-model="activeTab"
        :items="tabs"
        :content="false"
        size="xs"
        class="w-full"
        :ui="{ trigger: 'min-w-0 flex-1 px-2', list: 'w-full' }"
      />
      <div v-if="activeTab === 'logos'" class="space-y-2">
        <p class="text-xs text-muted">
          Click a logo to add it to this layout.
        </p>
        <p v-if="!kit.logos.length" class="text-xs text-muted">
          No logos in this kit.
        </p>
        <UButton
          v-for="(logo, index) in kit.logos"
          :key="`${logo.url}-${index}`"
          :aria-label="`Add ${logo.name}`"
          color="neutral"
          variant="outline"
          class="w-full flex-col items-stretch p-2 gap-2"
          @click="addLogo(logo, $event)"
        >
          <span class="flex items-center justify-center h-20 rounded overflow-hidden" :class="logo.variant === 'dark' ? 'bg-[#202126]' : 'bg-white'">
            <img :src="logo.url" :alt="logo.name" class="max-h-16 max-w-full object-contain">
          </span>
          <span class="text-xs font-normal truncate text-left">{{ logo.name }}</span>
        </UButton>
      </div>
      <div v-else-if="activeTab === 'colours'" class="space-y-2">
        <p class="text-xs text-muted">
          {{ colourProperty ? 'Click a colour to apply it to the selected layer.' : 'Select text, a shape, button or background to apply a colour.' }}
        </p>
        <p v-if="!kit.colors.length" class="text-xs text-muted">
          No colours in this kit.
        </p>
        <UButton
          v-for="(colour, index) in kit.colors"
          :key="index"
          color="neutral"
          variant="outline"
          class="w-full justify-start gap-3"
          :disabled="!colourProperty"
          @click="useColour(colour.hex)"
        >
          <span class="size-8 shrink-0 rounded border border-default" :style="{ backgroundColor: colour.hex }" />
          <span class="min-w-0 text-left"><span class="block truncate text-xs">{{ colour.label || colour.role }}</span><span class="block text-xs text-muted font-normal">{{ colour.hex }}</span></span>
        </UButton>
      </div>
      <div v-else class="space-y-2">
        <p class="text-xs text-muted">
          {{ canUseFont ? 'Click a font to apply it to the selected text.' : 'Select text or a button to apply a font.' }}
        </p>
        <p v-if="!kit.fonts.length" class="text-xs text-muted">
          No font files in this kit. Add them in Manage brand kits.
        </p>
        <UButton
          v-for="(font, index) in kit.fonts"
          :key="index"
          color="neutral"
          variant="outline"
          class="w-full flex-col items-start gap-1 py-3"
          :disabled="!canUseFont || (!font.assets?.length && !getFont(font.family))"
          @click="useFont(font)"
        >
          <span class="text-[11px] text-muted font-normal">{{ font.role === 'extra' ? 'Additional font' : font.role === 'heading' ? 'Heading' : 'Body' }} · {{ brandFontSelection(font).fontWeight }}</span>
          <span class="text-base max-w-full truncate" :style="{ fontFamily: bannerFontFamily(font.family, brandFontSelection(font).fontAssetId), fontWeight: brandFontSelection(font).fontWeight }">{{ font.family }}</span>
          <span v-if="!font.assets?.length && !getFont(font.family)" class="text-xs text-muted">Font file unavailable</span>
        </UButton>
      </div>
      <div class="border-t border-default pt-3 space-y-2">
        <UButton
          label="Apply kit to all layouts"
          icon="i-lucide-paintbrush"
          variant="soft"
          size="xs"
          class="w-full justify-center"
          @click="handleApply(kit)"
        />
        <p class="text-[11px] leading-relaxed text-muted">
          Updates matching colours, fonts and logos throughout this project. You can undo.
        </p>
      </div>
    </template>
    <UButton
      label="Open media library"
      icon="i-lucide-images"
      variant="ghost"
      color="neutral"
      size="xs"
      class="w-full justify-start"
      @click="emit('browseAssets')"
    />
    <UButton
      label="Open brand kit manager"
      icon="i-lucide-external-link"
      variant="ghost"
      color="neutral"
      size="xs"
      to="/agency/banner-studio/brand-kits"
      target="_blank"
      class="w-full justify-start"
    />
    <UModal v-model:open="showManagerModal" title="Manage brand kits" :ui="{ content: 'max-w-4xl' }">
      <template #content>
        <div class="p-5 max-h-[85vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-lg font-semibold">
              Brand kits
            </h3><UButton
              icon="i-lucide-x"
              aria-label="Close brand kit manager"
              variant="ghost"
              size="sm"
              @click="() => { showManagerModal = false }"
            />
          </div>
          <BannerBrandKitManager :client-id="clientId" @apply="value => { handleApply(value); showManagerModal = false }" />
        </div>
      </template>
    </UModal>
  </div>
</template>
