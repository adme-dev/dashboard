<script setup lang="ts">
/**
 * Thumbnail grid of ad creatives for a campaign.
 * Only shows for Meta and Google (other platforms don't support creative API).
 */
const props = defineProps<{
  mediaSpendId: string
  platform: string
}>()

const CREATIVE_PLATFORMS = ['meta', 'google_ads']
const isSupported = computed(() => CREATIVE_PLATFORMS.includes(props.platform))

const { data, status } = useFetch('/api/agency/analytics/creatives', {
  query: computed(() => ({ campaignId: props.mediaSpendId })),
  immediate: isSupported.value,
})

const creatives = computed(() => (data.value as any)?.creatives || [])
const hasCreatives = computed(() => (data.value as any)?.hasCreatives === true)

const previewCreative = ref<any>(null)
const showPreview = computed({
  get: () => previewCreative.value != null,
  set: (val: boolean) => { if (!val) previewCreative.value = null },
})
</script>

<template>
  <div v-if="isSupported">
    <div v-if="status === 'pending'" class="flex gap-3">
      <USkeleton v-for="i in 3" :key="i" class="h-20 w-28 rounded" />
    </div>

    <div v-else-if="hasCreatives">
      <h4 class="text-xs font-semibold text-default mb-2 flex items-center gap-1.5">
        <UIcon name="i-lucide-image" class="w-3.5 h-3.5 text-muted" />
        Ad Creatives
      </h4>
      <div class="flex gap-3 overflow-x-auto pb-1">
        <button
          v-for="creative in creatives"
          :key="creative.id"
          class="shrink-0 w-28 group cursor-pointer"
          @click="previewCreative = creative"
        >
          <div class="h-20 w-28 bg-elevated rounded-md overflow-hidden border border-default/50 group-hover:border-primary/50 transition-colors">
            <img
              v-if="creative.thumbnailUrl"
              :src="creative.thumbnailUrl"
              :alt="creative.title || 'Ad creative'"
              class="w-full h-full object-cover"
              loading="lazy"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-lucide-image-off" class="w-6 h-6 text-muted" />
            </div>
          </div>
          <p v-if="creative.title" class="text-[10px] text-muted mt-1 truncate">{{ creative.title }}</p>
        </button>
      </div>
    </div>

    <!-- Creative preview modal -->
    <UModal v-model:open="showPreview">
      <template #content>
        <div v-if="previewCreative" class="p-4">
          <div class="flex items-start justify-between mb-3">
            <h3 class="text-sm font-semibold text-default">{{ previewCreative.title || 'Ad Creative' }}</h3>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="previewCreative = null" />
          </div>
          <div v-if="previewCreative.thumbnailUrl" class="rounded-lg overflow-hidden bg-elevated mb-3">
            <img
              :src="previewCreative.thumbnailUrl"
              :alt="previewCreative.title || 'Creative'"
              class="max-w-full max-h-[60vh] mx-auto"
            />
          </div>
          <div v-if="previewCreative.body" class="text-sm text-muted">
            {{ previewCreative.body }}
          </div>
          <div class="mt-2 text-xs text-muted">
            <UBadge variant="subtle" color="neutral" size="xs">{{ previewCreative.type }}</UBadge>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
