<script setup lang="ts">
import type { Department } from '~/types'

const props = defineProps<{
  departments: Department[]
  selectedId?: string
  loading?: boolean
}>()

const emit = defineEmits<{
  select: [department: Department]
}>()

// Get department icon component
const getDepartmentIcon = (icon: string) => {
  return icon || 'i-lucide-folder'
}

// Task count badge color
const getTaskBadgeColor = (overdue: number) => {
  if (overdue > 0) return 'error'
  return 'neutral'
}
</script>

<template>
  <div class="h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-700">
    <!-- Header -->
    <div class="p-4 border-b border-neutral-200 dark:border-neutral-700">
      <h2 class="font-semibold text-lg">Departments</h2>
    </div>

    <!-- Loading state -->
    <template v-if="loading">
      <div class="p-4 space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <USkeleton class="h-10 w-10 rounded-lg" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-24" />
            <USkeleton class="h-3 w-16" />
          </div>
        </div>
      </div>
    </template>

    <!-- Department list -->
    <template v-else>
      <div class="flex-1 overflow-y-auto p-2">
        <nav class="space-y-1">
          <button
            v-for="dept in departments"
            :key="dept.id"
            class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
            :class="[
              selectedId === dept.id
                ? 'bg-primary/10 text-primary border border-primary/20'
                : 'hover:bg-neutral-100 dark:hover:bg-neutral-800'
            ]"
            @click="emit('select', dept)"
          >
            <!-- Department icon -->
            <div
              class="w-10 h-10 rounded-lg flex items-center justify-center"
              :style="{ backgroundColor: `${dept.color}20` }"
            >
              <UIcon
                :name="getDepartmentIcon(dept.icon)"
                class="h-5 w-5"
                :style="{ color: dept.color }"
              />
            </div>

            <!-- Department info -->
            <div class="flex-1 min-w-0">
              <p class="font-medium text-sm truncate">{{ dept.name }}</p>
              <p class="text-xs text-muted">
                {{ dept.memberCount || 0 }} members
              </p>
            </div>

            <!-- Task counts -->
            <div class="flex flex-col items-end gap-1">
              <UBadge
                v-if="dept.activeTasks"
                :label="String(dept.activeTasks)"
                :color="getTaskBadgeColor(dept.overdueTasks || 0)"
                size="xs"
              />
              <span
                v-if="dept.overdueTasks"
                class="text-xs text-red-500"
              >
                {{ dept.overdueTasks }} overdue
              </span>
            </div>
          </button>

          <!-- Empty state -->
          <div v-if="!departments.length" class="text-center py-8">
            <UIcon name="i-lucide-folder-x" class="h-8 w-8 text-muted mx-auto mb-2" />
            <p class="text-sm text-muted">No departments</p>
          </div>
        </nav>
      </div>
    </template>

    <!-- Footer: Summary -->
    <div class="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
      <div class="grid grid-cols-2 gap-4 text-center">
        <div>
          <p class="text-lg font-bold text-highlighted">
            {{ departments.reduce((sum, d) => sum + (d.activeTasks || 0), 0) }}
          </p>
          <p class="text-xs text-muted">Active Tasks</p>
        </div>
        <div>
          <p class="text-lg font-bold text-red-500">
            {{ departments.reduce((sum, d) => sum + (d.overdueTasks || 0), 0) }}
          </p>
          <p class="text-xs text-muted">Overdue</p>
        </div>
      </div>
    </div>
  </div>
</template>
