<script setup lang="ts">
defineProps<{ steps: { step: string, sessions: number, rate: number }[] }>()
</script>

<template>
  <UCard>
    <template #header>
      <span class="text-sm font-medium">Funnel</span>
    </template>
    <div class="space-y-2">
      <div v-for="s in steps" :key="s.step">
        <div class="flex justify-between text-sm">
          <span>{{ s.step }}</span>
          <span class="text-muted tabular-nums">{{ s.sessions.toLocaleString() }} · {{ s.rate }}%</span>
        </div>
        <div class="h-2 rounded bg-elevated mt-1">
          <div class="h-2 rounded bg-primary" :style="{ width: s.rate + '%' }" />
        </div>
      </div>
    </div>
  </UCard>
</template>
