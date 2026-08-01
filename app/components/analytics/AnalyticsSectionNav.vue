<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  active: 'performance' | 'audiences' | 'intelligence'
  query?: Record<string, unknown>
}>()

const sharedAudienceQuery = computed(() => {
  const query: Record<string, string> = {}
  for (const key of ['from', 'to', 'clientId']) {
    const value = props.query?.[key]
    if (typeof value === 'string' && value) query[key] = value
  }
  return query
})

const items = computed(() => [
  {
    key: 'performance' as const,
    label: 'Campaign performance',
    icon: 'i-lucide-chart-no-axes-combined',
    to: '/agency/analytics'
  },
  {
    key: 'audiences' as const,
    label: 'Website audiences',
    icon: 'i-lucide-radio-tower',
    to: { path: '/agency/analytics/audiences', query: sharedAudienceQuery.value }
  },
  {
    key: 'intelligence' as const,
    label: 'Site intelligence',
    icon: 'i-lucide-scan-search',
    to: { path: '/agency/analytics/audiences/intelligence', query: sharedAudienceQuery.value }
  }
])
</script>

<template>
  <nav
    class="inline-flex w-full items-center gap-1 rounded-lg border border-default bg-elevated p-1 sm:w-auto"
    aria-label="Analytics areas"
  >
    <UButton
      v-for="item in items"
      :key="item.key"
      :to="item.to"
      :label="item.label"
      :icon="item.icon"
      :active="props.active === item.key"
      :color="props.active === item.key ? 'primary' : 'neutral'"
      :variant="props.active === item.key ? 'solid' : 'ghost'"
      size="sm"
      class="flex-1 justify-center sm:flex-none"
    />
  </nav>
</template>
