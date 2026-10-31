<script setup lang="ts">
import type { BannerAsset } from '~/types/banner-studio'
import { apiErrorDescription } from '~/utils/apiError'

interface MotorStackMediaAsset {
  id: string
  name: string
  type: string
  mime: string
  importable: boolean
  previewUrl: string | null
}
interface MotorStackMediaResponse {
  brand: { id: string, name: string }
  assets: MotorStackMediaAsset[]
  models: string[]
  warnings: string[]
}

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ imported: [asset: BannerAsset] }>()
const allModels = '__all_models__'
const brandId = ref<string>()
const model = ref(allModels)
const search = ref('')
const assetType = ref('images')
const typeItems = [{ label: 'Images', value: 'images' }, { label: 'Documents', value: 'documents' }, { label: 'All media', value: 'all' }]
const media = ref<MotorStackMediaResponse | null>(null)
const modelNames = ref<string[]>([])
const loadingMedia = ref(false)
const mediaError = ref('')
const importing = ref<string | null>(null)
const imported = ref<Record<string, BannerAsset>>({})
const importErrors = ref<Record<string, string>>({})
const previewErrors = ref<Record<string, boolean>>({})
let requestGeneration = 0
const api = $fetch as <T>(url: string, options: Record<string, unknown>) => Promise<T>
const { data: brandsData, error: brandsError, status: brandsStatus, execute: loadBrands } = useFetch<{
  brands: Array<{ id: string, name: string }>
  warnings?: string[]
}>('/api/agency/banner-studio/motorstack/brands', { immediate: false })
const mediaQuery = computed(() => ({ brandId: brandId.value, ...(model.value === allModels ? {} : { model: model.value }) }))
const { data: mediaData, error: mediaFetchError, execute: fetchMedia } = useFetch<MotorStackMediaResponse>(
  '/api/agency/banner-studio/motorstack/media', { immediate: false, query: mediaQuery, watch: false }
)
const brandItems = computed(() => (brandsData.value?.brands || []).map(brand => ({ label: brand.name, value: brand.id })))
const modelItems = computed(() => [{ label: 'All models', value: allModels }, ...modelNames.value.map(name => ({ label: name, value: name }))])
const filteredAssets = computed(() => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return (media.value?.assets || []).filter((asset) => {
    if (assetType.value === 'images' && !isImage(asset)) return false
    if (assetType.value === 'documents' && !isPdf(asset)) return false
    const text = `${asset.name} ${asset.type} ${formatLabel(asset)}`.toLowerCase()
    return terms.every(term => text.includes(term))
  })
})
const busy = computed(() => importing.value !== null)

function selectBrand(value: string) {
  if (value === brandId.value) return
  brandId.value = value
  model.value = allModels
  modelNames.value = []
}
async function loadMedia() {
  const selectedBrand = brandId.value
  if (!selectedBrand) return
  const generation = ++requestGeneration
  loadingMedia.value = true
  media.value = null
  mediaError.value = ''
  try {
    await fetchMedia()
    if (generation !== requestGeneration) return
    if (mediaFetchError.value) throw mediaFetchError.value
    if (!mediaData.value || mediaData.value.brand.id !== selectedBrand) throw new Error('The media list did not match the selected brand. Try again.')
    previewErrors.value = {}
    media.value = mediaData.value
    modelNames.value = [...new Set([...modelNames.value, ...mediaData.value.models.filter(name => name.trim() && name !== allModels)])]
  } catch (error) {
    if (generation === requestGeneration) mediaError.value = apiErrorDescription(error, 'Could not load this brand’s media. Try again.')
  } finally {
    if (generation === requestGeneration) loadingMedia.value = false
  }
}
watch(open, (value) => {
  if (value && !brandsData.value && brandsStatus.value !== 'pending') loadBrands()
}, { immediate: true })
watch([brandId, model], () => {
  if (open.value) loadMedia()
})
onBeforeUnmount(() => {
  requestGeneration++
})

function assetKey(asset: MotorStackMediaAsset) {
  return `${brandId.value}:${asset.id}`
}
function isImage(asset: MotorStackMediaAsset) {
  return asset.mime.startsWith('image/')
}
function canImport(asset: MotorStackMediaAsset) {
  return asset.importable && isImage(asset) && asset.mime !== 'image/svg+xml'
}
function formatLabel(asset: MotorStackMediaAsset) {
  const formats: Record<string, string> = { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/avif': 'AVIF', 'image/svg+xml': 'SVG', 'application/pdf': 'PDF' }
  return formats[asset.mime] || 'File'
}
function isPdf(asset: MotorStackMediaAsset) {
  return asset.mime === 'application/pdf'
}
async function importAsset(asset: MotorStackMediaAsset) {
  if (busy.value || !brandId.value || !canImport(asset)) return
  const key = assetKey(asset)
  if (imported.value[key]) return
  importing.value = key
  importErrors.value[key] = ''
  try {
    const result = await api<{ asset: BannerAsset }>('/api/agency/banner-studio/motorstack/media', {
      method: 'POST', body: { brandId: brandId.value, ...(model.value === allModels ? {} : { model: model.value }), assetId: asset.id }
    })
    if (!result.asset?.id || !result.asset.url || !result.asset.mimeType.startsWith('image/')) throw new Error('Could not verify the saved image. Retry to check its library status.')
    imported.value[key] = result.asset
    emit('imported', result.asset)
  } catch (error) {
    importErrors.value[key] = apiErrorDescription(error, 'Could not add this image. Try again.')
  } finally {
    importing.value = null
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="MotorStack media"
    description="Browse OEM images and documents. Add images to your asset library when you are ready."
    :dismissible="!busy"
    :close="!busy"
    :ui="{ content: 'sm:max-w-5xl', body: 'min-h-0' }"
  >
    <template #body>
      <div class="@container space-y-4">
        <UAlert
          v-if="brandsError"
          color="error"
          title="Could not load brands"
          :description="apiErrorDescription(brandsError, 'Try loading the brand list again.')"
          :actions="[{ label: 'Retry loading', color: 'error', variant: 'soft', onClick: () => loadBrands() }]"
        />
        <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Brand">
            <USelectMenu
              :model-value="brandId"
              :items="brandItems"
              value-key="value"
              placeholder="Choose a brand"
              :loading="brandsStatus === 'pending'"
              :disabled="busy || brandsStatus === 'pending'"
              class="w-full"
              @update:model-value="selectBrand"
            />
          </UFormField>
          <UFormField label="Model">
            <USelectMenu
              v-model="model"
              :items="modelItems"
              value-key="value"
              :disabled="busy || !brandId || loadingMedia"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Media type">
            <USelectMenu
              v-model="assetType"
              :items="typeItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Search media">
            <UInput
              v-model="search"
              icon="i-lucide-search"
              placeholder="Model, grade, colour or image name"
              class="w-full"
            />
          </UFormField>
        </div>
        <p v-if="brandId" class="text-sm text-muted">
          {{ model === allModels ? 'Browse colour images across this brand. Choose a model to include its gallery and interior photos.' : 'Search this model’s colour images, gallery and interior photos.' }}
        </p>
        <UAlert
          v-for="warning in brandsData?.warnings || []"
          :key="warning"
          color="warning"
          variant="soft"
          :description="warning"
        />
        <div v-if="loadingMedia" role="status" class="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          Loading media…
        </div>
        <UAlert
          v-else-if="mediaError"
          color="error"
          title="Could not load media"
          :description="mediaError"
          :actions="[{ label: 'Retry loading', color: 'error', variant: 'soft', onClick: loadMedia }]"
        />
        <div v-else-if="!brandId" class="py-16 text-center text-sm text-muted">
          {{ brandsStatus === 'pending' ? 'Loading brands…' : brandItems.length ? 'Choose a brand to browse its images and documents.' : brandsError ? 'Retry loading the brand list to continue.' : 'No MotorStack brands are available.' }}
        </div>
        <template v-else-if="media">
          <UAlert
            v-for="warning in media.warnings"
            :key="warning"
            color="warning"
            variant="soft"
            :description="warning"
          />
          <div class="flex items-center justify-between gap-3 text-sm">
            <p class="font-medium">
              {{ media.brand.name }}
            </p>
            <p class="text-muted">
              {{ filteredAssets.length }} of {{ media.assets.length }} assets
            </p>
          </div>
          <div v-if="!filteredAssets.length" class="py-16 text-center text-sm text-muted">
            {{ media.assets.length ? 'No media matches these filters. Try another model, colour or media type.' : 'No media is available for this selection. Try another model or brand.' }}
          </div>
          <ul v-else class="grid max-h-[min(55vh,38rem)] grid-cols-1 gap-4 overflow-y-auto @sm:grid-cols-2 @2xl:grid-cols-3" aria-label="MotorStack media assets">
            <li v-for="asset in filteredAssets" :key="asset.id" class="flex min-w-0 flex-col overflow-hidden rounded-lg border border-default">
              <div class="relative flex aspect-[4/3] shrink-0 items-center justify-center overflow-hidden bg-elevated">
                <img
                  v-if="isImage(asset) && asset.previewUrl && !previewErrors[assetKey(asset)]"
                  :src="asset.previewUrl"
                  :alt="asset.name"
                  loading="lazy"
                  class="absolute inset-0 h-full w-full object-contain"
                  @error="previewErrors[assetKey(asset)] = true"
                >
                <div v-else class="space-y-2 p-4 text-center text-muted">
                  <UIcon :name="isPdf(asset) ? 'i-lucide-file-text' : 'i-lucide-image-off'" class="size-10" />
                  <p class="text-xs">
                    {{ isPdf(asset) ? 'PDF document' : 'Preview unavailable' }}
                  </p>
                  <UButton
                    v-if="isImage(asset) && asset.previewUrl && previewErrors[assetKey(asset)]"
                    label="Retry preview"
                    color="neutral"
                    variant="outline"
                    size="xs"
                    @click="previewErrors[assetKey(asset)] = false"
                  />
                </div>
              </div>
              <div class="flex flex-1 flex-col gap-3 p-3">
                <div class="space-y-1">
                  <p class="break-words text-sm font-medium">
                    {{ asset.name }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ asset.type }} · {{ formatLabel(asset) }}
                  </p>
                </div>
                <p v-if="importErrors[assetKey(asset)]" role="alert" class="text-xs text-error">
                  {{ importErrors[assetKey(asset)] }}
                </p>
                <div class="mt-auto">
                  <UButton
                    v-if="canImport(asset)"
                    :label="imported[assetKey(asset)] ? 'Added to library' : importErrors[assetKey(asset)] ? 'Retry adding to library' : 'Add to library'"
                    :icon="imported[assetKey(asset)] ? 'i-lucide-check' : 'i-lucide-plus'"
                    :loading="importing === assetKey(asset)"
                    :disabled="busy || Boolean(imported[assetKey(asset)])"
                    :color="imported[assetKey(asset)] ? 'success' : 'primary'"
                    variant="soft"
                    size="sm"
                    class="w-full justify-center"
                    @click="importAsset(asset)"
                  />
                  <UButton
                    v-else-if="isPdf(asset) && asset.previewUrl"
                    label="Download PDF"
                    icon="i-lucide-download"
                    :href="asset.previewUrl"
                    :download="asset.name"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="neutral"
                    variant="outline"
                    size="sm"
                    class="w-full justify-center"
                  />
                  <p v-else class="text-xs text-muted">
                    This file cannot be added as an image.
                  </p>
                </div>
              </div>
            </li>
          </ul>
        </template>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <p role="status" aria-live="polite" class="text-xs text-muted">
          {{ busy ? 'Adding the image to your library…' : 'Adding to the library does not change the artwork on your canvas.' }}
        </p>
        <UButton
          color="neutral"
          variant="outline"
          :disabled="busy"
          @click="open = false"
        >
          Close
        </UButton>
      </div>
    </template>
  </UModal>
</template>
