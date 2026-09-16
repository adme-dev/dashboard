<script setup lang="ts">
import type { LaunchReadinessItem } from '~~/shared/pageStudio/launchReadiness'

defineProps<{ items: LaunchReadinessItem[], loading: boolean }>()
defineEmits<{ navigate: [target: LaunchReadinessItem['target']] }>()
const labels = { ready: 'Ready', required: 'Action needed', unavailable: 'Unavailable', optional: 'Optional' }
const colors = { ready: 'success', required: 'warning', unavailable: 'neutral', optional: 'neutral' } as const
</script>

<template>
  <UCard :aria-busy="loading">
    <template #header>
      <h2 class="font-semibold text-highlighted">
        Launch readiness
      </h2>
      <p class="mt-1 text-sm text-muted">
        Checks for the saved website. Publishing rechecks access and the selected version.
      </p>
    </template>
    <ul class="divide-y divide-default">
      <li v-for="item in items" :key="item.id" class="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
        <div class="min-w-0 space-y-1.5">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="text-sm font-medium text-highlighted">
              {{ item.label }}
            </h3>
            <UBadge
              :label="loading ? 'Checking' : labels[item.status]"
              :color="loading ? 'neutral' : colors[item.status]"
              variant="subtle"
              size="sm"
            />
          </div>
          <p class="max-w-2xl text-sm leading-6 text-muted">
            {{ item.detail }}
          </p>
        </div>
        <UButton
          :label="item.action"
          color="neutral"
          variant="link"
          trailing-icon="i-lucide-arrow-right"
          class="self-start shrink-0"
          @click="$emit('navigate', item.target)"
        />
      </li>
    </ul>
  </UCard>
</template>
