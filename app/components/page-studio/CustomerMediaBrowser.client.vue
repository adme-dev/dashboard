<script setup lang="ts">
import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'

const props = defineProps<{ siteId: string, assets: StandaloneSiteWorkspace['assets'] }>()
const search = ref('')
const page = ref(1)
const pageSize = 18
const selectedId = ref<string | null>(null)
const failed = ref(new Set<string>())
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase()
  return props.assets.filter(asset => !term || [asset.altText, asset.fileName, asset.mediaType].some(value => value?.toLocaleLowerCase().includes(term)))
})
const rows = computed(() => filtered.value.slice((page.value - 1) * pageSize, page.value * pageSize))
const selected = computed(() => props.assets.find(asset => asset.id === selectedId.value))
const detailsOpen = computed({
  get: () => Boolean(selected.value),
  set: (value: boolean) => { if (!value) selectedId.value = null }
})
watch([search, () => props.assets], () => {
  page.value = 1
})
watch(() => props.siteId, () => {
  selectedId.value = null
  failed.value = new Set()
  search.value = ''
  page.value = 1
})
function contentUrl(id: string) {
  return `/api/portal/page-studio/sites/${encodeURIComponent(props.siteId)}/assets/${encodeURIComponent(id)}/content`
}
function previewFailed(id: string) {
  failed.value = new Set([...failed.value, id])
}
function retryPreview(id: string) {
  const next = new Set(failed.value)
  next.delete(id)
  failed.value = next
}
function fileSize(size: number | null) {
  if (size === null) return 'Size unavailable'
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`
}
function displayName(asset: StandaloneSiteWorkspace['assets'][number]) {
  if (asset.altText) return asset.altText
  if (!asset.fileName) return 'Untitled image'
  return /^[a-f0-9]{64}\./.test(asset.fileName) ? `Image ${asset.fileName.slice(0, 8)}` : asset.fileName
}
</script>

<template>
  <section class="@container min-w-0 space-y-5" aria-label="Media library">
    <div>
      <h2 class="text-xl font-semibold tracking-tight text-highlighted">
        Media library
      </h2><p class="mt-1 text-sm text-muted">
        Browse saved images and inspect their details.
      </p>
    </div>
    <UFormField label="Find an image" class="max-w-md">
      <UInput
        v-model="search"
        placeholder="Search filenames or descriptions…"
        icon="i-lucide-search"
        class="w-full"
      />
    </UFormField>
    <div v-if="rows.length" class="grid grid-cols-1 gap-4 @sm:grid-cols-2 @2xl:grid-cols-3">
      <article v-for="asset in rows" :key="asset.id" class="min-w-0 overflow-hidden rounded-lg border border-default">
        <UButton
          color="neutral"
          variant="ghost"
          class="group block w-full overflow-hidden rounded-none p-0"
          :aria-label="`View ${displayName(asset)} details`"
          @click="selectedId = asset.id"
        >
          <div class="flex aspect-[4/3] w-full items-center justify-center bg-muted/40">
            <img
              v-if="asset.previewAvailable && !failed.has(asset.id)"
              :src="contentUrl(asset.id)"
              :alt="asset.altText || ''"
              loading="lazy"
              decoding="async"
              class="size-full object-contain"
              @error="previewFailed(asset.id)"
            >
            <div v-else class="space-y-2 p-4 text-center text-muted">
              <UIcon name="i-lucide-image-off" class="size-6" /><p class="text-xs">
                Preview unavailable
              </p>
            </div>
          </div>
        </UButton>
        <div class="space-y-2 p-3">
          <UButton
            :label="displayName(asset)"
            color="neutral"
            variant="link"
            class="w-full justify-start p-0 text-left text-sm"
            :ui="{ label: 'truncate' }"
            @click="selectedId = asset.id"
          />
          <p class="text-xs text-muted">
            {{ asset.mediaType.replace('image/', '').toUpperCase() }} · {{ fileSize(asset.size) }}
          </p>
        </div>
      </article>
    </div>
    <div v-else class="space-y-3 rounded-lg border border-default p-8 text-center">
      <p class="font-medium text-highlighted">
        {{ assets.length ? 'No images match your search' : 'No images saved yet' }}
      </p>
      <UButton
        v-if="search"
        label="Clear search"
        color="neutral"
        variant="outline"
        @click="search = ''"
      />
    </div>
    <div class="flex flex-wrap items-center justify-between gap-3">
      <p class="text-xs text-muted" role="status">
        {{ filtered.length }} of {{ assets.length }} loaded assets
      </p>
      <UPagination
        v-if="filtered.length > pageSize"
        v-model:page="page"
        :total="filtered.length"
        :items-per-page="pageSize"
        size="xs"
        :sibling-count="1"
      />
    </div>
    <p class="text-xs leading-5 text-muted">
      Add, generate or replace website images from the media picker in Page Studio when editing is connected.
    </p>
    <USlideover v-model:open="detailsOpen" :title="selected ? displayName(selected) : 'Image details'" description="Preview and metadata for this website image.">
      <template #body>
        <div v-if="selected" class="space-y-6">
          <img
            v-if="selected.previewAvailable && !failed.has(selected.id)"
            :src="contentUrl(selected.id)"
            :alt="selected.altText || ''"
            class="max-h-80 w-full rounded-lg bg-muted/40 object-contain"
            @error="previewFailed(selected.id)"
          >
          <UAlert
            v-else
            title="Preview unavailable"
            description="The file may be unavailable, archived or awaiting checks."
            color="neutral"
          />
          <UButton
            v-if="selected.previewAvailable && failed.has(selected.id)"
            label="Retry preview"
            color="neutral"
            variant="outline"
            @click="retryPreview(selected.id)"
          />
          <dl class="space-y-5 text-sm">
            <div>
              <dt class="text-muted">
                Filename
              </dt><dd class="mt-2 break-all text-highlighted">
                {{ selected.fileName || 'Not recorded' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Alt text
              </dt><dd class="mt-2 break-words text-highlighted">
                {{ selected.altText || 'Not set' }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                File type and size
              </dt><dd class="mt-2 text-highlighted">
                {{ selected.mediaType }} · {{ fileSize(selected.size) }}
              </dd>
            </div>
            <div>
              <dt class="text-muted">
                Asset status
              </dt><dd class="mt-2 text-highlighted">
                {{ selected.publicationStatus }}
              </dd>
            </div>
          </dl>
        </div>
      </template>
    </USlideover>
  </section>
</template>
