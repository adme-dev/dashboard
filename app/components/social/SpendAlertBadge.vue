<script setup lang="ts">
// Inline pacing-alert indicator for a spend row. Renders nothing when there are
// no active alerts; otherwise a severity-coloured badge with the count and a
// tooltip listing each issue.
const props = defineProps<{
  alerts: Array<{ severity: string; title: string }>
}>()

const worst = computed(() =>
  props.alerts.some(a => a.severity === 'critical') ? 'critical' : 'warning'
)
const tooltip = computed(() => props.alerts.map(a => a.title).join(' · '))
</script>

<template>
  <UTooltip v-if="alerts.length" :text="tooltip">
    <UBadge
      :color="worst === 'critical' ? 'error' : 'warning'"
      variant="subtle"
      size="xs"
      class="gap-0.5 cursor-help align-middle"
    >
      <UIcon name="i-lucide-triangle-alert" class="size-3" />
      {{ alerts.length }}
    </UBadge>
  </UTooltip>
</template>
