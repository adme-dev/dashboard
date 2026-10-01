<script setup lang="ts">
import type { StandaloneSiteWorkspace } from '~~/shared/pageStudio/standaloneWorkspace'
import { EMAIL_IMAGE_MAX_BYTES } from '~~/shared/pageStudio/emailTemplates'

const props = defineProps<{ siteId: string, assets: StandaloneSiteWorkspace['assets'] }>()
const open = defineModel<boolean>('open', { required: true })
const emit = defineEmits<{ select: [asset: StandaloneSiteWorkspace['assets'][number]] }>()
const search = ref('')
const page = ref(1)
const failed = ref(new Set<string>())
const available = computed(() => props.assets.filter(asset => asset.previewAvailable && ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(asset.mediaType) && (asset.size === null || asset.size <= EMAIL_IMAGE_MAX_BYTES)))
const filtered = computed(() => available.value.filter(asset => `${name(asset)} ${asset.fileName ?? ''} ${asset.mediaType}`.toLowerCase().includes(search.value.trim().toLowerCase())))
const rows = computed(() => filtered.value.slice((page.value - 1) * 12, page.value * 12))
watch(search, () => {
  page.value = 1
})
watch(open, (value) => {
  if (value) {
    search.value = ''
    page.value = 1
    failed.value = new Set()
  }
})
function name(asset: StandaloneSiteWorkspace['assets'][number]) {
  if (asset.altText) return asset.altText
  if (asset.fileName && !/^[a-f0-9]{64}\./.test(asset.fileName)) return asset.fileName
  return `Website image ${props.assets.findIndex(item => item.id === asset.id) + 1}`
}
function select(asset: StandaloneSiteWorkspace['assets'][number]) {
  emit('select', asset)
  open.value = false
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="Choose a website image"
    description="Use a logo or photo from this website’s media library. Up to 512 KB per image and 2 MB per email."
    :ui="{ content: 'sm:max-w-3xl' }"
  >
    <template #body>
      <div class="@container space-y-4">
        <UFormField label="Find an image">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search images…"
            class="w-full"
          />
        </UFormField>
        <div v-if="rows.length" class="grid grid-cols-1 gap-3 @sm:grid-cols-2 @xl:grid-cols-3">
          <UButton
            v-for="asset in rows"
            :key="asset.id"
            :aria-label="`Choose ${name(asset)}`"
            :disabled="failed.has(asset.id)"
            color="neutral"
            variant="outline"
            class="block overflow-hidden p-0 text-left"
            @click="select(asset)"
          >
            <div class="flex aspect-[4/3] items-center justify-center bg-elevated p-3">
              <UIcon v-if="failed.has(asset.id)" name="i-lucide-image-off" class="size-8 text-muted" />
              <img
                v-else
                :src="`/api/portal/page-studio/sites/${encodeURIComponent(siteId)}/assets/${encodeURIComponent(asset.id)}/content`"
                :alt="asset.altText || ''"
                class="size-full object-contain"
                loading="lazy"
                @error="() => { failed = new Set([...failed, asset.id]) }"
              >
            </div>
            <span class="block truncate px-3 py-2 text-sm">{{ failed.has(asset.id) ? 'Image unavailable' : name(asset) }}</span>
          </UButton>
        </div>
        <p v-else class="py-8 text-center text-sm text-muted">
          {{ search ? 'No matching images. Try another search.' : 'No suitable images yet. Add a PNG, JPG, WebP or GIF to your website media library first.' }}
        </p>
        <UPagination
          v-if="filtered.length > 12"
          v-model:page="page"
          :total="filtered.length"
          :items-per-page="12"
        />
      </div>
    </template>
  </UModal>
</template>
