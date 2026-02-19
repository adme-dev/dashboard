<script setup lang="ts">
// Table view skeleton for loading states
defineProps<{
  rows?: number
  columns?: number
}>()
</script>

<template>
  <div
    class="w-full overflow-hidden"
    role="status"
    aria-label="Loading table"
  >
    <!-- Table header -->
    <div class="flex border-b border-default bg-muted/30 animate-pulse">
      <div
        v-for="i in (columns || 6)"
        :key="i"
        class="flex-1 p-3"
        :class="{ 'w-64 flex-shrink-0 flex-grow-0': i === 1 }"
      >
        <USkeleton class="h-4 w-3/4" />
      </div>
    </div>

    <!-- Table rows -->
    <div
      v-for="row in (rows || 8)"
      :key="row"
      class="flex border-b border-default animate-pulse"
      :style="{ animationDelay: `${row * 50}ms` }"
    >
      <!-- Task name column -->
      <div class="w-64 flex-shrink-0 p-3">
        <div class="flex items-center gap-2">
          <USkeleton class="w-4 h-4 rounded" />
          <USkeleton class="h-4 flex-1" />
        </div>
      </div>

      <!-- Status -->
      <div class="flex-1 p-3">
        <USkeleton class="h-5 w-16 rounded-full" />
      </div>

      <!-- Priority -->
      <div class="flex-1 p-3">
        <USkeleton class="h-5 w-12 rounded-full" />
      </div>

      <!-- Assignee -->
      <div class="flex-1 p-3">
        <div class="flex items-center gap-2">
          <USkeleton class="w-6 h-6 rounded-full" />
          <USkeleton class="h-4 w-20" />
        </div>
      </div>

      <!-- Due date -->
      <div class="flex-1 p-3">
        <USkeleton class="h-4 w-16" />
      </div>

      <!-- Actions -->
      <div class="flex-1 p-3">
        <div class="flex gap-1">
          <USkeleton class="w-6 h-6 rounded" />
          <USkeleton class="w-6 h-6 rounded" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes pulse-delay {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}
</style>
