<script setup lang="ts">
/**
 * AI-generated performance summary card.
 * Fetches lazily on mount, shows loading skeleton then bullet points.
 */
const props = withDefaults(defineProps<{
  mediaSpendId: string
  campaignName: string
  platform: string
  breakdowns: any
  apiBase?: string
  initialSummary?: string | null
}>(), {
  apiBase: '/api/agency/analytics',
  initialSummary: undefined,
})

const emit = defineEmits<{
  loaded: [summary: string | null]
}>()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const summary = ref<string | null>(props.initialSummary ?? null)
const loading = ref(false)
const error = ref(false)

// Only fetch when breakdowns have some data
const hasBreakdownData = computed(() => {
  const b = props.breakdowns
  if (!b) return false
  return (b.age?.length > 0 || b.gender?.length > 0 || b.device?.length > 0 || b.geo?.length > 0 || b.placement?.length > 0 || b.hourly?.length > 0 || b.city?.length > 0 || b.region?.length > 0 || b.story_type?.length > 0)
})

async function fetchSummary() {
  if (loading.value || summary.value) return
  loading.value = true
  error.value = false

  try {
    const res = await apiFetch<{ summary: string | null }>(`${props.apiBase}/ai-summary`, {
      method: 'POST',
      body: {
        campaignId: props.mediaSpendId,
        breakdowns: props.breakdowns,
        campaignName: props.campaignName,
        platform: props.platform,
      },
    })
    summary.value = res.summary
    emit('loaded', res.summary)
  } catch {
    error.value = true
  } finally {
    loading.value = false
  }
}

// Watch for breakdowns data to become available, then fetch
watch(() => props.breakdowns, (val) => {
  if (val && hasBreakdownData.value && !summary.value && !loading.value) {
    fetchSummary()
  }
}, { immediate: true })

const bulletPoints = computed(() => {
  if (!summary.value) return []
  return summary.value
    .split('\n')
    .map(line => line.replace(/^[•\-*]\s*/, '').trim())
    .filter(line => line.length > 0)
})
</script>

<template>
  <div v-if="hasBreakdownData || loading">
    <!-- Loading state -->
    <div v-if="loading" class="rounded-lg bg-elevated/30 border border-default/50 p-3">
      <div class="flex items-center gap-2 mb-2">
        <USkeleton class="h-4 w-4 rounded" />
        <USkeleton class="h-4 w-32 rounded" />
      </div>
      <div class="space-y-1.5">
        <USkeleton v-for="i in 3" :key="i" class="h-3.5 w-full rounded" />
        <USkeleton class="h-3.5 w-3/4 rounded" />
      </div>
    </div>

    <!-- Summary content -->
    <div v-else-if="summary" class="rounded-lg bg-elevated/30 border border-default/50 p-3">
      <div class="flex items-center gap-1.5 mb-2">
        <UIcon name="i-lucide-sparkles" class="w-4 h-4 text-primary" />
        <h4 class="text-xs font-semibold text-default">Performance Insights</h4>
      </div>
      <ul class="space-y-1">
        <li
          v-for="(point, i) in bulletPoints"
          :key="i"
          class="text-xs text-muted leading-relaxed flex gap-1.5"
        >
          <span class="text-primary shrink-0 mt-0.5">•</span>
          <span>{{ point }}</span>
        </li>
      </ul>
    </div>

    <!-- Error state -->
    <div v-else-if="error" class="text-xs text-muted italic py-1">
      AI insights unavailable. <button class="text-primary hover:underline" @click="fetchSummary">Retry</button>
    </div>
  </div>
</template>
