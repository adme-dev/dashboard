<script setup lang="ts">
const from = defineModel<string>('from', { required: true })
const to = defineModel<string>('to', { required: true })

function setPreset(days: number) {
  const end = new Date()
  const start = new Date(end.getTime() - (days - 1) * 86400000)
  to.value = end.toISOString().slice(0, 10)
  from.value = start.toISOString().slice(0, 10)
}
const PRESETS = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 }
]
</script>

<template>
  <div class="flex items-center gap-2">
    <UButton
      v-for="p in PRESETS"
      :key="p.days"
      size="xs"
      color="neutral"
      variant="soft"
      :label="p.label"
      @click="setPreset(p.days)"
    />
    <span class="text-xs text-muted">{{ from }} → {{ to }}</span>
  </div>
</template>
