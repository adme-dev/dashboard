<script setup lang="ts">
defineProps<{ callClicks: number, formSubmits: number }>()
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-phone" class="size-4" />Call clicks
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ callClicks.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-send" class="size-4" />Form submits
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ formSubmits.toLocaleString() }}
      </p>
    </UCard>
  </div>
</template>
