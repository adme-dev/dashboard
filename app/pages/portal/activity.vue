<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import {
  portalActivityIcon,
  portalActivityLabel,
  type PortalActivity
} from '~/utils/portalActivity'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const {
  data,
  status,
  error,
  refresh
} = await useFetch<{ activity: PortalActivity[] }>('/api/portal/activity', {
  query: { limit: 50 },
  default: () => ({ activity: [] })
})

const activity = computed(() => data.value.activity)
const pending = computed(() => status.value === 'pending')

function timeAgo(createdAt: string) {
  try {
    return formatDistanceToNow(new Date(createdAt), { addSuffix: true })
  } catch {
    return createdAt
  }
}
</script>

<template>
  <div class="w-full space-y-6 p-4 sm:p-6 lg:p-8">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">
          Recent Activity
        </h1>
        <p class="mt-1 text-sm text-muted">
          The latest updates and actions across your client portal.
        </p>
      </div>

      <UButton
        label="Refresh"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="pending"
        @click="refresh()"
      />
    </div>

    <UCard v-if="pending">
      <div class="space-y-5">
        <div v-for="index in 6" :key="index" class="flex items-start gap-3">
          <USkeleton class="size-8 shrink-0 rounded-full" />
          <div class="flex-1 space-y-2">
            <USkeleton class="h-4 w-2/3" />
            <USkeleton class="h-3 w-24" />
          </div>
        </div>
      </div>
    </UCard>

    <UAlert
      v-else-if="error"
      title="Recent activity could not be loaded"
      description="Try refreshing the page. If the problem continues, contact your agency team."
      icon="i-lucide-circle-alert"
      color="error"
      variant="soft"
      :actions="[{
        label: 'Try again',
        color: 'error',
        variant: 'outline',
        onClick: () => refresh()
      }]"
    />

    <UCard v-else>
      <div v-if="activity.length" class="divide-y divide-default">
        <div
          v-for="item in activity"
          :key="item.id"
          class="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
        >
          <div class="flex size-8 shrink-0 items-center justify-center rounded-full bg-elevated">
            <UIcon :name="portalActivityIcon(item.action)" class="size-4 text-muted" />
          </div>

          <div class="min-w-0 flex-1">
            <p class="text-sm text-highlighted">
              <span class="font-medium">{{ item.userName || 'Agency team' }}</span>
              {{ portalActivityLabel(item) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ timeAgo(item.createdAt) }}
            </p>
          </div>
        </div>
      </div>

      <div v-else class="py-12 text-center">
        <UIcon name="i-lucide-history" class="mx-auto size-8 text-muted" />
        <p class="mt-3 text-sm font-medium text-highlighted">
          No recent activity
        </p>
        <p class="mt-1 text-sm text-muted">
          Updates will appear here as work progresses.
        </p>
      </div>
    </UCard>
  </div>
</template>
