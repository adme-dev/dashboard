<script setup lang="ts">
/**
 * Thumbnail grid of ad creatives for a campaign.
 * Only shows for Meta and Google (other platforms don't support creative API).
 * Fetches from DB first; if empty, triggers on-demand sync from platform API.
 */
const props = withDefaults(defineProps<{
  mediaSpendId: string
  platform: string
  apiBase?: string
  initialData?: any[] | null
}>(), {
  apiBase: '/api/agency/analytics',
  initialData: null,
})

const emit = defineEmits<{
  loaded: [creatives: any[]]
}>()

const CREATIVE_PLATFORMS = ['meta', 'google_ads']
const isSupported = computed(() => CREATIVE_PLATFORMS.includes(props.platform))
const useCached = computed(() => props.initialData != null)

const { data, status } = useFetch(() => `${props.apiBase}/creatives`, {
  query: computed(() => ({ campaignId: props.mediaSpendId })),
  immediate: isSupported.value && !useCached.value,
})

const creatives = ref<any[]>([])
const hasCreatives = ref(false)
const syncing = ref(false)
const syncFailed = ref(false)

// Seed from cache if available
if (props.initialData) {
  creatives.value = props.initialData
  hasCreatives.value = props.initialData.length > 0
}

// When DB fetch completes, check if empty → trigger on-demand sync
watch(data, async (val) => {
  if (!val || useCached.value) return
  const resp = val as any
  creatives.value = resp.creatives || []
  hasCreatives.value = resp.hasCreatives === true

  if (creatives.value.length === 0 && isSupported.value && !syncing.value && !syncFailed.value) {
    syncing.value = true
    try {
      const syncResult = await $fetch<any>(`${props.apiBase}/creatives/sync`, {
        method: 'POST',
        body: { campaignId: props.mediaSpendId },
      })
      if (syncResult?.creatives) {
        creatives.value = syncResult.creatives
        hasCreatives.value = syncResult.hasCreatives === true
      }
    } catch (err) {
      console.warn('[CampaignCreatives] On-demand sync failed:', err)
      syncFailed.value = true
    } finally {
      syncing.value = false
    }
  }

  emit('loaded', creatives.value)
})

const previewCreative = ref<any>(null)
const showPreview = computed({
  get: () => previewCreative.value != null,
  set: (val: boolean) => { if (!val) previewCreative.value = null },
})
</script>

<template>
  <div v-if="isSupported">
    <div v-if="status === 'pending' || syncing" class="space-y-2">
      <div v-if="syncing" class="flex items-center gap-2 text-xs text-muted">
        <UIcon name="i-lucide-loader-2" class="w-3.5 h-3.5 animate-spin" />
        <span>Fetching ad creatives...</span>
      </div>
      <div class="flex gap-3">
        <USkeleton v-for="i in 3" :key="i" class="h-20 w-28 rounded" />
      </div>
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
          class="shrink-0 w-40 group cursor-pointer"
          @click="previewCreative = creative"
        >
          <div class="h-28 w-40 bg-elevated rounded-md overflow-hidden border border-default/50 group-hover:border-primary/50 transition-colors">
            <img
              v-if="safeMediaUrl(creative.thumbnailUrl)"
              :src="safeMediaUrl(creative.thumbnailUrl)"
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
    <UModal v-model:open="showPreview" :ui="{ width: 'sm:max-w-lg' }">
      <template #content>
        <div v-if="previewCreative" class="p-5">
          <div class="flex items-start justify-between mb-4">
            <h3 class="text-base font-semibold text-default pr-4">{{ previewCreative.title || 'Ad Creative' }}</h3>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="previewCreative = null" />
          </div>
          <div v-if="safeMediaUrl(previewCreative.thumbnailUrl)" class="rounded-lg overflow-hidden bg-elevated mb-4">
            <img
              :src="safeMediaUrl(previewCreative.thumbnailUrl)"
              :alt="previewCreative.title || 'Creative'"
              class="w-full max-h-[70vh] object-contain"
            />
          </div>
          <div v-if="previewCreative.body" class="text-sm text-muted leading-relaxed">
            {{ previewCreative.body }}
          </div>
          <div class="mt-3 text-xs text-muted">
            <UBadge variant="subtle" color="neutral" size="xs">{{ previewCreative.type }}</UBadge>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
