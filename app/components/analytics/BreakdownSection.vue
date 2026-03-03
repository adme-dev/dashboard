<script setup lang="ts">
/**
 * Container for all 4 breakdown charts (age, gender, device, geo).
 * Fetches breakdown data lazily when rendered.
 */
const props = defineProps<{
  mediaSpendId: string
  platform: string
}>()

const emit = defineEmits<{
  loaded: [breakdowns: any]
}>()

const SUPPORTED_PLATFORMS = ['meta', 'google_ads', 'microsoft_ads', 'pinterest']
const isSupported = computed(() => SUPPORTED_PLATFORMS.includes(props.platform))

const { data, status } = useFetch('/api/agency/analytics/breakdowns', {
  query: computed(() => ({ campaignId: props.mediaSpendId })),
  immediate: isSupported.value,
})

const breakdowns = computed(() => (data.value as any)?.breakdowns || { age: [], gender: [], device: [], geo: [] })
const hasBreakdowns = computed(() => (data.value as any)?.hasBreakdowns === true)

const hasAnyData = computed(() => {
  const b = breakdowns.value
  return b.age.length > 0 || b.gender.length > 0 || b.device.length > 0 || b.geo.length > 0
})

// Emit breakdowns data when loaded (for AI summary)
watch(data, (val) => {
  if (val) {
    emit('loaded', breakdowns.value)
  }
})
</script>

<template>
  <div>
    <div v-if="!isSupported" class="text-xs text-muted italic py-2">
      Demographic breakdowns are not available for this platform.
    </div>

    <div v-else-if="status === 'pending'" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div v-for="i in 4" :key="i" class="space-y-2">
        <USkeleton class="h-4 w-24 rounded" />
        <USkeleton v-for="j in 3" :key="j" class="h-6 w-full rounded" />
      </div>
    </div>

    <div v-else-if="hasBreakdowns && hasAnyData" class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <AnalyticsBreakdownBars
        title="Age Distribution"
        icon="i-lucide-users"
        :items="breakdowns.age"
      />
      <AnalyticsBreakdownBars
        title="Gender Split"
        icon="i-lucide-user"
        :items="breakdowns.gender"
      />
      <AnalyticsBreakdownBars
        title="Device Mix"
        icon="i-lucide-smartphone"
        :items="breakdowns.device"
      />
      <AnalyticsBreakdownBars
        title="Top Regions"
        icon="i-lucide-globe"
        :items="breakdowns.geo"
      />
    </div>

    <div v-else-if="hasBreakdowns && !hasAnyData" class="text-xs text-muted italic py-2">
      No breakdown data synced yet. Data will appear after the next sync.
    </div>
  </div>
</template>
