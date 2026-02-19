<script setup lang="ts">
// Kanban column skeleton for loading states
defineProps<{
  cardCount?: number
}>()
</script>

<template>
  <div
    class="flex-shrink-0 w-72 bg-muted/20 rounded-lg p-3"
    role="status"
    aria-label="Loading column"
  >
    <!-- Column header -->
    <div class="flex items-center justify-between mb-3 animate-pulse">
      <div class="flex items-center gap-2">
        <USkeleton class="w-3 h-3 rounded-full" />
        <USkeleton class="h-5 w-24" />
        <USkeleton class="h-4 w-6 rounded-full" />
      </div>
      <USkeleton class="w-6 h-6 rounded" />
    </div>

    <!-- Cards -->
    <div class="space-y-2">
      <WorkflowSkeletonCard
        v-for="i in (cardCount || 3)"
        :key="i"
        :variant="i === 1 ? 'detailed' : 'default'"
      />
    </div>

    <!-- Add task button skeleton -->
    <div class="mt-3 animate-pulse">
      <USkeleton class="h-8 w-full rounded" />
    </div>
  </div>
</template>
