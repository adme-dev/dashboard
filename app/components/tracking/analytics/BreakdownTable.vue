<script setup lang="ts">
defineProps<{ title: string, rows: { key: string, count: number }[], pending?: boolean }>()
</script>

<template>
  <UCard>
    <template #header>
      <span class="text-sm font-medium">{{ title }}</span>
    </template>
    <div v-if="pending" class="text-sm text-muted py-6 text-center">
      Loading…
    </div>
    <div v-else-if="!rows.length" class="text-sm text-muted py-6 text-center">
      No data.
    </div>
    <ul v-else class="divide-y divide-default">
      <li v-for="r in rows" :key="r.key" class="flex items-center justify-between py-2 gap-3">
        <span class="text-sm truncate">{{ r.key }}</span>
        <span class="text-sm tabular-nums text-muted">{{ r.count.toLocaleString() }}</span>
      </li>
    </ul>
  </UCard>
</template>
