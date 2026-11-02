<script setup lang="ts">
import type { BannerAsset, BannerBrandKit, BrandKitFont, BrandKitLogo } from '~/types/banner-studio'
import { brandFontSelection } from '~/utils/banner-brand-kit'
import { bannerFontFamily } from '~/utils/banner-font-family'
import { apiErrorDescription } from '~/utils/apiError'
import { bannerAssetLayer } from '~/utils/banner-media'

interface MotorStackImage {
  id: string
  name: string
  mime: string
  importable: boolean
  previewUrl: string | null
}
interface MotorStackImages {
  brand: { id: string, name: string }
  assets: MotorStackImage[]
  models: string[]
  warnings: string[]
}

interface MotorStackOffer {
  title: string | null
  model: string | null
  variant: string | null
  price: number | null
  priceLabel: string | null
  offer: string | null
  endDate: string | null
  disclaimer: string | null
  hasImage: boolean
}
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
const motorStackBrandId = computed(() => kit.value?.sourceUrl?.match(/^https:\/\/oem-variants\.pages\.dev\/api\/mcp#brand=([a-z0-9-]{1,40})$/)?.[1])
const tabs = [{ label: 'Logos', value: 'logos' }, { label: 'Colours', value: 'colours' }, { label: 'Fonts', value: 'fonts' }]
const catalog = ref<{ kitId: string, items: MotorStackOffer[] } | null>(null)
const catalogLoading = ref(false)
const catalogError = ref('')
let catalogRequest = 0
const money = (value: number) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(value)
const images = ref<MotorStackImages | null>(null)
const imageModel = ref('__all_models__')
const imageSearch = ref('')
const imageLoading = ref(false)
const imageError = ref('')
const addingImage = ref<string | null>(null)
const imageModels = ref<string[]>([])
const imageItems = computed(() => (images.value?.assets || []).filter(asset => asset.mime.startsWith('image/') && asset.importable && imageSearch.value.trim().toLowerCase().split(/\s+/).filter(Boolean).every(word => asset.name.toLowerCase().includes(word))))
const modelItems = computed(() => [{ label: 'All models', value: '__all_models__' }, ...imageModels.value.map(name => ({ label: name, value: name }))])
let imageRequest = 0
async function loadImages() {
  const brandId = motorStackBrandId.value
  const request = ++imageRequest
  images.value = null
  imageError.value = ''
  if (activeTab.value !== 'variants' || !brandId) return
  imageLoading.value = true
  try {
    const result = await $fetch<MotorStackImages>('/api/agency/banner-studio/motorstack/media', { query: { brandId, ...(imageModel.value === '__all_models__' ? {} : { model: imageModel.value }) } })
    if (request !== imageRequest) return
    if (result.brand.id !== brandId) throw new Error('The images did not match this brand kit. Retry.')
    images.value = result
    imageModels.value = [...new Set([...imageModels.value, ...result.models])]
  } catch (error) {
    if (request === imageRequest) imageError.value = apiErrorDescription(error, 'Could not load vehicle images. Try again.')
  } finally {
    if (request === imageRequest) imageLoading.value = false
  }
}
async function addVehicleImage(image: MotorStackImage) {
  const brandId = motorStackBrandId.value
  const selectedKitId = kit.value?.id
  const format = activeFormat.value
  if (!brandId || !format || addingImage.value) return
  addingImage.value = image.id
  try {
    const result = await $fetch<{ asset: BannerAsset }>('/api/agency/banner-studio/motorstack/media', { method: 'POST', body: { brandId, ...(imageModel.value === '__all_models__' ? {} : { model: imageModel.value }), assetId: image.id } })
    if (kit.value?.id !== selectedKitId) return
    if (!result.asset?.url || !result.asset.mimeType?.startsWith('image/')) throw new Error('The saved image could not be verified. Retry.')
    addLayer({ ...bannerAssetLayer(result.asset, format), startTime: 0, endTime: state.duration })
    toast.add({ title: 'Vehicle image added', description: image.name, color: 'success' })
  } catch (error) {
    toast.add({ title: 'Could not add vehicle image', description: apiErrorDescription(error, 'Try another image.'), color: 'error' })
  } finally {
    addingImage.value = null
  }
}
const offers = computed(() => catalog.value?.kitId === kit.value?.id ? catalog.value.items : [])
async function loadCatalog() {
  const kitId = kit.value?.id
  const request = ++catalogRequest
  catalog.value = null
  catalogError.value = ''
  if (!motorStackBrandId.value || activeTab.value !== 'offers' || !kitId) return
  catalogLoading.value = true
  try {
    const result = await $fetch<{ items: MotorStackOffer[] }>('/api/agency/banner-studio/motorstack/creative-catalog', { query: { kitId, kind: 'offers' } })
    if (request === catalogRequest) catalog.value = { ...result, kitId }
  } catch (error) {
    if (request === catalogRequest) catalogError.value = apiErrorDescription(error, 'Could not load MotorStack data. Try again.')
  } finally {
    if (request === catalogRequest) catalogLoading.value = false
  }
}
watch([() => kit.value?.id, activeTab], loadCatalog, { immediate: true })
watch(motorStackBrandId, () => {
  imageModel.value = '__all_models__'
  imageModels.value = []
  imageSearch.value = ''
})
watch([motorStackBrandId, activeTab, imageModel], loadImages, { immediate: true })
watch(motorStackBrandId, (value) => {
  if (!value && (activeTab.value === 'variants' || activeTab.value === 'offers')) activeTab.value = 'logos'
})
onBeforeUnmount(() => {
  catalogRequest++
  imageRequest++
})
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
  <div class="@container p-3 space-y-4 min-w-0">
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
    <BannerBrandStyleGuide v-if="kit" :kit="kit" />
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
      <div v-if="motorStackBrandId" class="space-y-2 border-t border-default pt-3">
        <p class="text-[11px] font-semibold uppercase tracking-wide text-muted">
          MotorStack
        </p>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            label="Variants"
            icon="i-lucide-car-front"
            :variant="activeTab === 'variants' ? 'soft' : 'outline'"
            color="neutral"
            size="xs"
            class="justify-center"
            @click="activeTab = 'variants'"
          />
          <UButton
            label="Offers"
            icon="i-lucide-tags"
            :variant="activeTab === 'offers' ? 'soft' : 'outline'"
            color="neutral"
            size="xs"
            class="justify-center"
            @click="activeTab = 'offers'"
          />
        </div>
      </div>
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
      <div v-else-if="activeTab === 'fonts'" class="space-y-2">
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
      <div v-else-if="activeTab === 'variants'" class="space-y-3">
        <p class="text-xs leading-relaxed text-muted">
          Choose a model, then add a vehicle image to this layout.
        </p>
        <UFormField label="Model">
          <USelectMenu
            v-model="imageModel"
            :items="modelItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Search images">
          <UInput
            v-model="imageSearch"
            icon="i-lucide-search"
            placeholder="Grade, colour or image"
            class="w-full"
          />
        </UFormField>
        <div v-if="imageLoading" role="status" class="flex items-center gap-2 py-5 text-xs text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading images…
        </div>
        <UAlert
          v-else-if="imageError"
          title="Could not load vehicle images"
          :description="imageError"
          color="error"
          variant="subtle"
          :actions="[{ label: 'Retry', onClick: loadImages }]"
        />
        <template v-else-if="images">
          <p class="text-xs text-muted">
            {{ imageItems.length }} images
          </p>
          <UAlert
            v-for="warning in images.warnings"
            :key="warning"
            :description="warning"
            color="warning"
            variant="subtle"
          />
          <p v-if="!imageItems.length" class="text-xs text-muted">
            No images match this model or search.
          </p>
          <div v-else class="grid grid-cols-2 gap-2 @lg:grid-cols-3">
            <UButton
              v-for="image in imageItems"
              :key="image.id"
              color="neutral"
              variant="outline"
              class="min-w-0 flex-col items-stretch gap-1.5 p-1.5 text-left"
              :loading="addingImage === image.id"
              :disabled="!!addingImage"
              :aria-label="`Add ${image.name} to layout`"
              @click="addVehicleImage(image)"
            >
              <span class="flex aspect-square items-center justify-center overflow-hidden rounded bg-default"><img
                v-if="image.previewUrl"
                :src="image.previewUrl"
                :alt="image.name"
                loading="lazy"
                class="h-full w-full object-contain"
              ></span>
              <span class="truncate text-[11px] font-normal" :title="image.name">{{ image.name }}</span>
            </UButton>
          </div>
        </template>
      </div>
      <div v-else-if="activeTab === 'offers'" class="space-y-3">
        <p class="text-xs leading-relaxed text-muted">
          Published national offers from MotorStack. Check the end date and full terms before using offer copy in artwork.
        </p>
        <div v-if="catalogLoading" role="status" class="flex items-center gap-2 py-5 text-xs text-muted">
          <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" /> Loading offers…
        </div>
        <UAlert
          v-else-if="catalogError"
          title="Could not load MotorStack data"
          :description="catalogError"
          color="error"
          variant="subtle"
          :actions="[{ label: 'Retry', onClick: loadCatalog }]"
        />
        <template v-else-if="catalog">
          <p v-if="!catalog.items.length" class="text-xs text-muted">
            No published offers are available for this brand.
          </p>
          <template v-else>
            <UCard v-for="(offer, index) in offers" :key="`${offer.title}-${index}`" :ui="{ body: 'p-3 sm:p-3' }">
              <div class="space-y-2">
                <p class="text-sm font-semibold leading-snug">
                  {{ offer.title || offer.offer || 'Untitled offer' }}
                </p>
                <p class="text-xs text-muted">
                  {{ [offer.model, offer.variant].filter(Boolean).join(' · ') }}
                </p>
                <p v-if="offer.price !== null || offer.priceLabel" class="text-xs font-medium">
                  {{ offer.priceLabel || (offer.price !== null ? money(offer.price) : '') }}
                </p>
                <p v-if="offer.offer && offer.offer !== offer.title" class="whitespace-pre-line text-xs leading-relaxed">
                  {{ offer.offer }}
                </p>
                <UBadge v-if="offer.endDate" color="warning" variant="soft">
                  Ends {{ offer.endDate }}
                </UBadge>
                <UAccordion v-if="offer.disclaimer" :items="[{ label: 'Terms and conditions', content: offer.disclaimer }]" :ui="{ body: 'whitespace-pre-line text-xs leading-relaxed text-muted' }" />
              </div>
            </UCard>
          </template>
          <UButton
            label="Browse MotorStack images"
            icon="i-lucide-images"
            variant="soft"
            size="xs"
            class="w-full justify-center"
            @click="emit('browseAssets')"
          />
        </template>
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
