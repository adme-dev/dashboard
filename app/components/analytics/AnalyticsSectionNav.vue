<script setup lang="ts">
const props = defineProps<{
  active: 'performance' | 'audiences'
}>()

const items = [
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
    to: '/agency/analytics/audiences'
  }
]
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
