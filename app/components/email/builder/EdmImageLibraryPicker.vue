<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  EMAIL_IMAGE_ASSET_ACCEPT,
  EMAIL_IMAGE_ASSET_MAX_BYTES,
  formatEmailImageAssetSize,
  isAllowedEmailImageMime,
  isWithinEmailImageAssetLimit,
  type EdmImageAsset
} from '~~/app/utils/edmImageAssets'

const props = defineProps<{
  open?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'pick': [asset: EdmImageAsset]
}>()

const toast = useToast()
const search = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const isUploading = ref(false)
const errorMessage = ref('')

const isOpen = computed({
  get: () => props.open === true,
  set: value => emit('update:open', value)
})

const { data, refresh, pending } = await useFetch<{ assets: EdmImageAsset[] }>('/api/agency/email/assets', {
  default: () => ({ assets: [] })
})

const imageAssets = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (data.value?.assets || [])
    .filter(asset => isAllowedEmailImageMime(asset.mimeType))
    .filter(asset => !q || asset.name.toLowerCase().includes(q))
})

const maxSizeLabel = computed(() => formatEmailImageAssetSize(EMAIL_IMAGE_ASSET_MAX_BYTES))

function close() {
  isOpen.value = false
}

function pick(asset: EdmImageAsset) {
  emit('pick', asset)
  close()
}

function validateFile(file: File): string {
  if (!isAllowedEmailImageMime(file.type)) return 'Use a JPEG, PNG, GIF, or WebP image.'
  if (!isWithinEmailImageAssetLimit(file.size)) return `Images must be ${maxSizeLabel.value} or smaller.`
  return ''
}

async function uploadFile(file: File) {
  const validation = validateFile(file)
  if (validation) {
    errorMessage.value = validation
    toast.add({ title: 'Upload blocked', description: validation, color: 'warning' })
    return
  }

  errorMessage.value = ''
  isUploading.value = true
  try {
    const formData = new FormData()
    formData.append('file', file)
    const { asset } = await $fetch<{ asset: EdmImageAsset }>('/api/agency/email/assets/upload', {
      method: 'POST',
      body: formData
    })
    await refresh()
    pick(asset)
    toast.add({ title: 'Image uploaded', description: asset.name, color: 'success' })
  } catch {
    errorMessage.value = 'Could not upload the image.'
    toast.add({ title: 'Upload failed', description: errorMessage.value, color: 'error' })
  } finally {
    isUploading.value = false
  }
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement | null
  const file = input?.files?.[0]
  if (file) uploadFile(file)
  if (input) input.value = ''
}
</script>

<template>
  <USlideover v-model:open="isOpen" title="Image Library">
    <template #content>
      <div class="flex h-full min-h-[32rem] w-full flex-col bg-default">
        <div class="flex items-center justify-between border-b border-default px-4 py-3">
          <div>
            <p class="text-sm font-semibold">
              Image Library
            </p>
            <p class="text-xs text-muted">
              Email-ready assets · {{ maxSizeLabel }} max
            </p>
          </div>
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Close image library"
            @click="close"
          />
        </div>

        <div class="space-y-3 border-b border-default p-4">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search images"
            class="w-full"
          />
          <div class="flex items-center gap-2">
            <UButton
              icon="i-lucide-upload"
              label="Upload image"
              variant="soft"
              color="primary"
              size="sm"
              :loading="isUploading"
              @click="fileInput?.click()"
            />
            <span class="text-xs text-muted">JPEG, PNG, GIF, WebP</span>
            <input
              ref="fileInput"
              type="file"
              class="hidden"
              :accept="EMAIL_IMAGE_ASSET_ACCEPT"
              @change="onFileSelect"
            >
          </div>
          <UAlert
            v-if="errorMessage"
            color="warning"
            :title="errorMessage"
          />
        </div>

        <div class="flex-1 overflow-auto p-4">
          <div v-if="pending && !imageAssets.length" class="py-8 text-center text-sm text-muted">
            Loading images...
          </div>

          <div v-else-if="!imageAssets.length" class="rounded-lg border border-dashed border-default py-10 text-center">
            <UIcon name="i-lucide-images" class="mx-auto mb-2 size-7 text-muted" />
            <p class="text-sm font-medium">
              No image assets yet
            </p>
            <p class="mt-1 text-xs text-muted">
              Upload an image to use it in this email.
            </p>
          </div>

          <div v-else class="grid grid-cols-2 gap-3">
            <button
              v-for="asset in imageAssets"
              :key="asset.id"
              type="button"
              class="group overflow-hidden rounded-lg border border-default bg-default text-left transition hover:border-primary hover:shadow-sm"
              @click="pick(asset)"
            >
              <div class="aspect-square bg-elevated/40">
                <img
                  :src="asset.thumbnailUrl || asset.url"
                  :alt="asset.name"
                  class="h-full w-full object-cover"
                >
              </div>
              <div class="space-y-1 border-t border-default p-2">
                <p class="truncate text-xs font-semibold group-hover:text-primary">
                  {{ asset.name }}
                </p>
                <p class="text-[11px] text-muted">
                  {{ formatEmailImageAssetSize(asset.fileSize) }}
                </p>
              </div>
            </button>
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
