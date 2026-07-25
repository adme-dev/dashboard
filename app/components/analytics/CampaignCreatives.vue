<script setup lang="ts">
const props = withDefaults(defineProps<{
  mediaSpendId: string
  platform: string
  apiBase?: string
  initialData?: any[] | null
}>(), {
  apiBase: '/api/agency/analytics',
  initialData: null,
})

interface RefreshMeta {
  status: 'missing' | 'stale' | 'refreshing' | 'fresh' | 'failed'
  stale: boolean
  refreshing: boolean
  lastSuccessAt: string | null
  lastError: string | null
}

const emit = defineEmits<{ loaded: [creatives: any[]] }>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: {
  method?: string
  body?: unknown
  query?: Record<string, unknown>
}) => Promise<T>

const isSupported = computed(() => ['meta', 'google_ads'].includes(props.platform))
const creatives = ref<any[]>(props.initialData || [])
const cache = ref<RefreshMeta | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const syncing = ref(false)
const syncFailed = ref(false)
const previewCreative = ref<any>(null)
const hasCreatives = computed(() => creatives.value.length > 0)
const showPreview = computed({
  get: () => previewCreative.value != null,
  set: (value: boolean) => { if (!value) previewCreative.value = null },
})

function applyResponse(response: any) {
  creatives.value = response?.creatives || []
  cache.value = response?.cache || null
  emit('loaded', creatives.value)
}

async function fetchCreatives(showPending = true) {
  if (!isSupported.value) return null
  if (showPending && !hasCreatives.value) status.value = 'pending'
  try {
    const response = await apiFetch<any>(`${props.apiBase}/creatives`, {
      query: { campaignId: props.mediaSpendId },
    })
    applyResponse(response)
    status.value = 'success'
    return response
  } catch {
    status.value = 'error'
    return null
  }
}

async function waitForBackgroundRefresh() {
  for (let attempt = 0; attempt < 6; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 2500))
    const response = await fetchCreatives(false)
    if (!response?.cache?.refreshing) return
  }
}

async function refreshFromPlatform() {
  if (syncing.value) return
  syncing.value = true
  syncFailed.value = false
  try {
    const response = await apiFetch<any>(`${props.apiBase}/creatives/sync`, {
      method: 'POST',
      body: { campaignId: props.mediaSpendId },
    })
    if (response?.creatives) {
      applyResponse(response)
    } else {
      cache.value = response?.cache || cache.value
      await waitForBackgroundRefresh()
    }
  } catch (error) {
    console.warn('[CampaignCreatives] On-demand sync failed:', error)
    syncFailed.value = true
  } finally {
    syncing.value = false
  }
}

watch(
  [() => props.mediaSpendId, () => props.apiBase, isSupported],
  async () => {
    const response = await fetchCreatives()
    if (response && !response.cache && creatives.value.length === 0) {
      await refreshFromPlatform()
    }
  },
  { immediate: true }
)

function timeAgo(value: string | null | undefined) {
  if (!value) return 'Never'
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`
  return `${Math.floor(minutes / 1440)}d ago`
}
</script>

<template>
  <div v-if="isSupported">
    <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h4 class="flex items-center gap-1.5 text-xs font-semibold text-default">
        <UIcon name="i-lucide-image" class="size-3.5 text-muted" />
        Ad Creatives
        <UBadge v-if="cache?.refreshing" size="xs" color="info" variant="subtle">Refreshing</UBadge>
        <UBadge v-else-if="cache?.status === 'failed'" size="xs" color="warning" variant="subtle">Stored</UBadge>
        <span v-if="cache?.lastSuccessAt" class="font-normal text-muted">Updated {{ timeAgo(cache.lastSuccessAt) }}</span>
      </h4>
      <UButton
        v-if="cache"
        size="xs"
        variant="ghost"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        :loading="syncing || cache.refreshing"
        @click.stop="refreshFromPlatform"
      />
    </div>

    <div v-if="status === 'pending' && !hasCreatives" class="flex gap-3">
      <USkeleton v-for="item in 3" :key="item" class="h-20 w-28 rounded" />
    </div>

    <div v-else-if="hasCreatives" class="flex gap-3 overflow-x-auto pb-1">
      <button
        v-for="creative in creatives"
        :key="creative.id"
        class="group w-40 shrink-0 cursor-pointer"
        @click="previewCreative = creative"
      >
        <div class="h-28 w-40 overflow-hidden rounded-md border border-default/50 bg-elevated transition-colors group-hover:border-primary/50">
          <img
            v-if="safeMediaUrl(creative.thumbnailUrl)"
            :src="safeMediaUrl(creative.thumbnailUrl)"
            :alt="creative.title || 'Ad creative'"
            class="h-full w-full object-cover"
            loading="lazy"
          />
          <div v-else class="flex h-full w-full items-center justify-center">
            <UIcon name="i-lucide-image-off" class="size-6 text-muted" />
          </div>
        </div>
        <p v-if="creative.title" class="mt-1 truncate text-[10px] text-muted">{{ creative.title }}</p>
      </button>
    </div>

    <div v-else class="py-2 text-xs italic text-muted">
      {{ cache?.refreshing ? 'Preparing creative data in the background...' : syncFailed || cache?.status === 'failed' ? 'The latest creative refresh failed. Stored campaign metrics remain available.' : 'No ad creatives are available for this campaign.' }}
    </div>

    <UModal v-model:open="showPreview" :ui="{ content: 'sm:max-w-lg' }">
      <template #content>
        <div v-if="previewCreative" class="p-5">
          <div class="mb-4 flex items-start justify-between">
            <h3 class="pr-4 text-base font-semibold text-default">{{ previewCreative.title || 'Ad Creative' }}</h3>
            <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="previewCreative = null" />
          </div>
          <div v-if="safeMediaUrl(previewCreative.thumbnailUrl)" class="mb-4 overflow-hidden rounded-lg bg-elevated">
            <img
              :src="safeMediaUrl(previewCreative.thumbnailUrl)"
              :alt="previewCreative.title || 'Creative'"
              class="max-h-[70vh] w-full object-contain"
            />
          </div>
          <div v-if="previewCreative.body" class="text-sm leading-relaxed text-muted">{{ previewCreative.body }}</div>
          <div class="mt-3 text-xs text-muted">
            <UBadge variant="subtle" color="neutral" size="xs">{{ previewCreative.type }}</UBadge>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
