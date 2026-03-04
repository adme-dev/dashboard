<script setup lang="ts">
import { FORMATS } from '~/utils/banner-constants'
import type { UploadProgressItem } from '~/composables/useMetaAdUpload'

defineProps<{
  items: UploadProgressItem[]
  overallProgress: number
  isUploading: boolean
}>()

function stepIcon(step: UploadProgressItem['step']): string {
  switch (step) {
    case 'queued': return 'i-lucide-clock'
    case 'image': return 'i-lucide-upload'
    case 'creative': return 'i-lucide-palette'
    case 'ad': return 'i-lucide-megaphone'
    case 'done': return 'i-lucide-check-circle'
    case 'error': return 'i-lucide-x-circle'
    default: return 'i-lucide-circle'
  }
}

function stepColor(step: UploadProgressItem['step']): string {
  switch (step) {
    case 'done': return 'text-green-500'
    case 'error': return 'text-red-500'
    case 'queued': return 'text-(--ui-text-muted)'
    default: return 'text-blue-500'
  }
}

function isActive(step: UploadProgressItem['step']): boolean {
  return step !== 'queued' && step !== 'done' && step !== 'error'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Overall progress bar -->
    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-xs font-medium text-(--ui-text-muted)">Overall Progress</span>
        <span class="text-xs font-mono text-(--ui-text-muted)">{{ overallProgress }}%</span>
      </div>
      <div class="w-full h-2 bg-(--ui-bg) rounded-full overflow-hidden">
        <div
          class="h-full bg-blue-500 rounded-full transition-all duration-300"
          :style="{ width: `${overallProgress}%` }"
        />
      </div>
    </div>

    <!-- Per-creative rows -->
    <div class="space-y-1.5">
      <div
        v-for="item in items"
        :key="item.publishedId"
        class="flex items-center gap-3 px-3 py-2 rounded-lg border border-(--ui-border) bg-(--ui-bg)"
      >
        <!-- Icon -->
        <UIcon
          :name="stepIcon(item.step)"
          class="w-4 h-4 shrink-0"
          :class="[stepColor(item.step), isActive(item.step) ? 'animate-pulse' : '']"
        />

        <!-- Format name -->
        <div class="flex-1 min-w-0">
          <span class="text-xs font-medium truncate block">
            {{ FORMATS[item.formatKey]?.name || item.formatKey }}
          </span>
          <span v-if="item.error" class="text-[10px] text-red-500 block truncate">{{ item.error }}</span>
        </div>

        <!-- Step label -->
        <span class="text-[10px] font-medium shrink-0" :class="stepColor(item.step)">
          {{ item.stepLabel }}
        </span>
      </div>
    </div>
  </div>
</template>
