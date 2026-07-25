<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const route = useRoute()
const router = useRouter()

const now = new Date()
const thirtyDaysAgo = new Date(now)
thirtyDaysAgo.setDate(now.getDate() - 30)

function formatDateISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function queryValue(value: unknown): string | undefined {
  return Array.isArray(value) ? value[0] : typeof value === 'string' ? value : undefined
}

function validDate(value: unknown, fallback: string): string {
  const candidate = queryValue(value)
  return candidate && /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : fallback
}

const startDate = ref(validDate(route.query.startDate, formatDateISO(thirtyDaysAgo)))
const endDate = ref(validDate(route.query.endDate, formatDateISO(now)))

watch([startDate, endDate], () => {
  router.replace({
    query: {
      ...route.query,
      startDate: startDate.value,
      endDate: endDate.value
    }
  })
})
</script>

<template>
  <div class="w-full space-y-6 p-4 sm:p-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div class="flex items-start gap-3">
        <UButton
          to="/portal/analytics"
          variant="ghost"
          color="neutral"
          icon="i-lucide-arrow-left"
          size="sm"
          aria-label="Back to analytics overview"
        />
        <div>
          <h1 class="text-2xl font-bold text-default">
            Website + Funnel
          </h1>
          <p class="mt-1 text-sm text-muted">
            Website activity, traffic quality and lead conversion performance.
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <UInput
          v-model="startDate"
          type="date"
          size="sm"
          aria-label="Start date"
          class="w-36"
        />
        <span class="text-sm text-muted">to</span>
        <UInput
          v-model="endDate"
          type="date"
          size="sm"
          aria-label="End date"
          class="w-36"
        />
      </div>
    </header>

    <PortalFunnelChart
      :start-date="startDate"
      :end-date="endDate"
    />

    <UCard>
      <PortalTrackingAnalyticsSection
        :start-date="startDate"
        :end-date="endDate"
      />
    </UCard>
  </div>
</template>
