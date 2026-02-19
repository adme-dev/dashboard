<script setup lang="ts">
// Kanban card skeleton for loading states
defineProps<{
  variant?: 'compact' | 'default' | 'detailed'
}>()
</script>

<template>
  <div
    class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 animate-pulse"
    role="status"
    aria-label="Loading task card"
  >
    <!-- Header -->
    <div class="flex items-center gap-2 mb-2">
      <USkeleton class="w-4 h-4 rounded" />
      <USkeleton class="w-4 h-4 rounded" />
      <div class="flex-1" />
      <USkeleton class="w-6 h-4 rounded" />
    </div>

    <!-- Title -->
    <USkeleton class="h-4 w-full mb-2" />
    <USkeleton v-if="variant !== 'compact'" class="h-4 w-3/4 mb-2" />

    <!-- Labels -->
    <div v-if="variant === 'detailed'" class="flex gap-1 mb-2">
      <USkeleton class="h-5 w-12 rounded-full" />
      <USkeleton class="h-5 w-16 rounded-full" />
    </div>

    <!-- Progress (detailed only) -->
    <div v-if="variant === 'detailed'" class="mb-2">
      <div class="flex justify-between mb-1">
        <USkeleton class="h-3 w-12" />
        <USkeleton class="h-3 w-8" />
      </div>
      <USkeleton class="h-1.5 w-full rounded-full" />
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between mt-2 pt-2 border-t border-neutral-100 dark:border-neutral-700">
      <USkeleton class="h-4 w-16" />
      <div class="flex items-center gap-1.5">
        <USkeleton class="h-5 w-5 rounded-full" />
        <USkeleton class="h-3 w-12" />
      </div>
    </div>
  </div>
</template>
