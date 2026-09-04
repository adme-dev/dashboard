<script setup lang="ts">
interface AssetRecord {
  altText?: string | null
  createdAt: string
  id: string
  mediaType: string
  publicationStatus: string
  renditions?: Array<{ fileName?: string, size?: number }>
}

const props = defineProps<{ siteId: string }>()
const toast = useToast()
const open = ref(false)
const uploading = ref(false)
const file = ref<File | null>(null)
const altText = ref('')
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/assets`)
const { data, status, error, refresh } = await useFetch<{ assets: AssetRecord[] }>(endpoint)
const assets = computed(() => data.value?.assets ?? [])

function showUpload() {
  open.value = true
}

function closeUpload() {
  open.value = false
}

function formatBytes(value?: number) {
  if (!value) return 'Size unavailable'
  return value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / 1024 / 1024).toFixed(1)} MB`
}

async function upload() {
  if (!file.value || uploading.value) return
  uploading.value = true
  const body = new FormData()
  body.append('file', file.value)
  body.append('altText', altText.value)
  try {
    await $fetch(endpoint.value, { method: 'POST', body })
    open.value = false
    file.value = null
    altText.value = ''
    await refresh()
    toast.add({ title: 'Asset uploaded', description: 'The image is ready for governed Page Studio use.', color: 'success' })
  } catch (failure: unknown) {
    const candidate = failure as { data?: { statusMessage?: string }, message?: string }
    toast.add({ title: 'Upload failed', description: candidate.data?.statusMessage || candidate.message, color: 'error' })
  } finally {
    uploading.value = false
  }
}

async function archive(asset: AssetRecord) {
  await $fetch(`${endpoint.value}/${asset.id}`, { method: 'PATCH', body: { publicationStatus: 'archived' } })
  await refresh()
  toast.add({ title: 'Asset archived', color: 'success' })
}
</script>

<template>
  <div class="pt-5">
    <UCard>
      <template #header>
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="font-semibold text-highlighted">
              Media library
            </h2>
            <p class="mt-1 text-sm text-muted">
              Signature-validated images stored in the site scope. Publishing still uses immutable checkpoints.
            </p>
          </div>
          <UButton label="Upload image" icon="i-lucide-upload" @click="showUpload" />
        </div>
      </template>
      <div v-if="status === 'pending'" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        <USkeleton v-for="index in 3" :key="index" class="h-48" />
      </div>
      <UAlert
        v-else-if="error"
        color="error"
        title="Unable to load assets"
        description="Refresh the site or check Page Studio access."
      />
      <div v-else-if="assets.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <article v-for="asset in assets" :key="asset.id" class="overflow-hidden rounded-lg border border-default bg-elevated/40">
          <img :src="`${endpoint}/${asset.id}/content`" :alt="asset.altText || ''" class="aspect-video w-full bg-muted object-cover">
          <div class="space-y-3 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ asset.renditions?.[0]?.fileName || asset.id }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ formatBytes(asset.renditions?.[0]?.size) }} · {{ asset.mediaType }}
                </p>
              </div>
              <UBadge :label="asset.publicationStatus" color="neutral" variant="subtle" />
            </div>
            <UButton
              label="Archive"
              icon="i-lucide-archive"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="archive(asset)"
            />
          </div>
        </article>
      </div>
      <div v-else class="py-10 text-center">
        <UIcon name="i-lucide-images" class="mx-auto size-8 text-muted" />
        <h3 class="mt-3 font-medium text-highlighted">
          No site assets yet
        </h3>
        <p class="mt-1 text-sm text-muted">
          Upload the first reusable image for this website.
        </p>
      </div>
    </UCard>

    <UModal v-model:open="open" title="Upload site image" description="JPEG, PNG, GIF or WebP up to 10 MB.">
      <template #content>
        <div class="space-y-5 p-6">
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Upload site image
            </h2>
            <p class="mt-1 text-sm text-muted">
              The image is isolated to this client and site.
            </p>
          </div>
          <UFormField label="Image" required>
            <UFileUpload
              v-model="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              class="w-full"
              label="Drop an image here"
              description="Maximum 10 MB"
            />
          </UFormField>
          <UFormField label="Alternative text" help="Describe meaningful content for screen readers. Leave blank for decorative images.">
            <UTextarea v-model="altText" :rows="3" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              label="Cancel"
              color="neutral"
              variant="ghost"
              :disabled="uploading"
              @click="closeUpload"
            />
            <UButton
              label="Upload"
              icon="i-lucide-upload"
              :loading="uploading"
              :disabled="!file"
              @click="upload"
            />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
