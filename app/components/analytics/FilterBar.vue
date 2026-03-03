<script setup lang="ts">
const { filters, updateFilters, setDatePreset, ALL_PLATFORM_KEYS, getPlatformLabel } = useAnalytics()

const { data: clientsData } = useLazyFetch('/api/agency/clients', { query: { limit: 200 } })
const clientOptions = computed(() => {
  const clients = (clientsData.value as any)?.clients || clientsData.value || []
  return [
    { label: 'All Clients', value: 'all' },
    ...clients.map((c: any) => ({ label: c.name, value: c.id }))
  ]
})

const platformOptions = ALL_PLATFORM_KEYS.map(k => ({
  label: getPlatformLabel(k),
  value: k,
}))

const datePresets = [
  { label: '7 days', value: '7d' },
  { label: '30 days', value: '30d' },
  { label: '90 days', value: '90d' },
  { label: 'MTD', value: 'mtd' },
  { label: 'Last Month', value: 'last-month' },
  { label: 'YTD', value: 'ytd' },
]

const selectedClient = computed({
  get: () => filters.value.clientId || 'all',
  set: (v: string) => updateFilters({ clientId: v === 'all' ? null : v }),
})

const selectedPlatforms = computed({
  get: () => filters.value.platforms,
  set: (v: string[]) => updateFilters({ platforms: v }),
})
</script>

<template>
  <div class="flex flex-wrap items-center gap-3 p-4 bg-elevated/50 rounded-lg border border-default">
    <!-- Date Range -->
    <div class="flex items-center gap-2">
      <UInput
        :model-value="filters.startDate"
        type="date"
        size="sm"
        class="w-36"
        @update:model-value="(v: string) => updateFilters({ startDate: v })"
      />
      <span class="text-muted text-sm">to</span>
      <UInput
        :model-value="filters.endDate"
        type="date"
        size="sm"
        class="w-36"
        @update:model-value="(v: string) => updateFilters({ endDate: v })"
      />
    </div>

    <!-- Date Presets -->
    <div class="flex items-center gap-1">
      <UButton
        v-for="preset in datePresets"
        :key="preset.value"
        :label="preset.label"
        size="xs"
        variant="ghost"
        color="neutral"
        @click="setDatePreset(preset.value)"
      />
    </div>

    <div class="h-6 w-px bg-default" />

    <!-- Platform Select -->
    <USelectMenu
      v-model="selectedPlatforms"
      :items="platformOptions"
      multiple
      placeholder="All Platforms"
      size="sm"
      class="w-44"
      value-key="value"
    />

    <!-- Client Select -->
    <USelectMenu
      v-model="selectedClient"
      :items="clientOptions"
      placeholder="All Clients"
      size="sm"
      class="w-48"
      value-key="value"
    />

    <!-- Export -->
    <div class="ml-auto">
      <UButton
        icon="i-lucide-download"
        label="Export CSV"
        size="sm"
        variant="soft"
        color="neutral"
        :to="`/api/agency/analytics/export?startDate=${filters.startDate}&endDate=${filters.endDate}${filters.platforms.length ? '&platform=' + filters.platforms.join(',') : ''}${filters.clientId ? '&clientId=' + filters.clientId : ''}`"
        target="_blank"
      />
    </div>
  </div>
</template>
