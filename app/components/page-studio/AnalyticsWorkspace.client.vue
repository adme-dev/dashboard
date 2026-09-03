<script setup lang="ts">
interface AnalyticsResponse {
  recent: Array<{ deliveryStatus: string, eventId: string, kind: string, occurredAt: string, pageRoute: string }>
  routes: Array<{ conversions: number, pageViews: number, route: string }>
  summary: { conversions: number, lastEventAt: string | null, pageViews: number, total: number }
}

const props = defineProps<{ siteId: string }>()
const endpoint = computed(() => `/api/agency/page-studio/sites/${encodeURIComponent(props.siteId)}/analytics`)
const { data, status, error, refresh } = await useFetch<AnalyticsResponse>(endpoint)
const summary = computed(() => data.value?.summary ?? { conversions: 0, lastEventAt: null, pageViews: 0, total: 0 })
const routeColumns = [
  { accessorKey: 'route', header: 'Route' },
  { accessorKey: 'pageViews', header: 'Page views' },
  { accessorKey: 'conversions', header: 'Conversions' }
]
const eventColumns = [
  { accessorKey: 'eventId', header: 'Event' },
  { accessorKey: 'pageRoute', header: 'Route' },
  { accessorKey: 'deliveryStatus', header: 'Delivery' },
  { accessorKey: 'occurredAt', header: 'Occurred' }
]
const recent = computed(() => (data.value?.recent ?? []).map(event => ({
  ...event,
  occurredAt: new Intl.DateTimeFormat('en-AU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.occurredAt))
})))

async function refreshAnalytics() {
  await refresh()
}
</script>

<template>
  <div class="space-y-4 pt-5">
    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <UCard>
        <p class="text-xs text-muted">
          Events
        </p><p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ summary.total }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Page views
        </p><p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ summary.pageViews }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Conversions
        </p><p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ summary.conversions }}
        </p>
      </UCard>
      <UCard>
        <p class="text-xs text-muted">
          Conversion rate
        </p><p class="mt-2 text-2xl font-semibold text-highlighted">
          {{ summary.pageViews ? `${((summary.conversions / summary.pageViews) * 100).toFixed(1)}%` : '0%' }}
        </p>
      </UCard>
    </div>
    <UAlert
      v-if="error"
      color="error"
      title="Unable to load analytics"
      description="No inferred or client-side-only metrics are shown."
    />
    <div v-else class="grid gap-4 xl:grid-cols-2">
      <UCard :ui="{ body: '!p-0' }">
        <template #header>
          <h2 class="font-semibold text-highlighted">
            Route performance
          </h2>
        </template>
        <UTable v-if="data?.routes.length" :columns="routeColumns" :data="data.routes" />
        <p v-else class="p-5 text-sm text-muted">
          No route activity recorded.
        </p>
      </UCard>
      <UCard :ui="{ body: '!p-0' }">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h2 class="font-semibold text-highlighted">
              Recent events
            </h2><UButton
              icon="i-lucide-refresh-cw"
              color="neutral"
              variant="ghost"
              :loading="status === 'pending'"
              @click="refreshAnalytics"
            />
          </div>
        </template>
        <UTable v-if="recent.length" :columns="eventColumns" :data="recent" />
        <p v-else class="p-5 text-sm text-muted">
          No analytics events recorded.
        </p>
      </UCard>
    </div>
  </div>
</template>
