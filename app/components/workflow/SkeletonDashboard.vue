<script setup lang="ts">
// Dashboard skeleton for loading states on the main agency pages
</script>

<template>
  <div
    class="space-y-6"
    role="status"
    aria-label="Loading dashboard"
  >
    <!-- Stats cards row -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      <UCard v-for="i in 4" :key="i">
        <div class="space-y-2">
          <USkeleton class="h-4 w-20" />
          <USkeleton class="h-8 w-16" />
          <div class="flex items-center gap-2">
            <USkeleton class="h-3 w-12" />
            <USkeleton class="h-3 w-8" />
          </div>
        </div>
      </UCard>
    </div>

    <!-- Charts/Content area -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
      <!-- Main chart area -->
      <UCard class="lg:col-span-2">
        <template #header>
          <div class="flex items-center justify-between">
            <USkeleton class="h-5 w-32" />
            <USkeleton class="h-8 w-24" />
          </div>
        </template>
        <div class="h-64 flex items-end justify-between gap-2 px-4">
          <USkeleton
            v-for="i in 12"
            :key="i"
            class="flex-1 rounded-t"
            :style="{ height: `${Math.random() * 80 + 20}%` }"
          />
        </div>
      </UCard>

      <!-- Side panel -->
      <UCard>
        <template #header>
          <USkeleton class="h-5 w-24" />
        </template>
        <div class="space-y-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <USkeleton class="w-8 h-8 rounded-full" />
            <div class="flex-1 space-y-1">
              <USkeleton class="h-4 w-full" />
              <USkeleton class="h-3 w-2/3" />
            </div>
          </div>
        </div>
      </UCard>
    </div>

    <!-- List section -->
    <UCard class="animate-pulse">
      <template #header>
        <div class="flex items-center justify-between">
          <USkeleton class="h-5 w-28" />
          <div class="flex gap-2">
            <USkeleton class="h-8 w-20" />
            <USkeleton class="h-8 w-24" />
          </div>
        </div>
      </template>
      <div class="space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center justify-between py-2 border-b border-default last:border-b-0">
          <div class="flex items-center gap-3">
            <USkeleton class="w-4 h-4 rounded" />
            <USkeleton class="h-4 w-48" />
          </div>
          <div class="flex items-center gap-4">
            <USkeleton class="h-5 w-16 rounded-full" />
            <USkeleton class="w-6 h-6 rounded-full" />
            <USkeleton class="h-4 w-20" />
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
