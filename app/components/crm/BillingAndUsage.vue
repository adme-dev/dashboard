<script setup lang="ts">
interface BillingOverview {
  subscription: null | {
    status: string
    currentPeriodStartsAt: string | null
    currentPeriodEndsAt: string | null
    plan: {
      code: string
      name: string
      billingPeriod: string
    }
  }
  usage: Array<{
    featureKey: string
    meterKey: string
    unit: string
    quantity: number
    providerCostMinor: number
  }>
}

const { apiFetch } = useApi()
const overview = ref<BillingOverview | null>(null)
const loading = ref(true)
const error = ref('')

function title(value: string) {
  return value
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, character => character.toUpperCase())
}

function formatPeriod(value: string | null | undefined) {
  if (!value) return 'Open period'
  return new Intl.DateTimeFormat('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  }).format(new Date(value))
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    overview.value = await apiFetch<BillingOverview>('/api/portal/billing')
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Billing information is unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p class="font-medium">
            Plan and usage
          </p>
          <p class="mt-1 text-sm text-muted">
            Current subscription and metered platform activity.
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="ghost"
          size="sm"
          :loading="loading"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </template>

    <div v-if="loading && !overview" class="space-y-3">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <div v-else-if="overview" class="space-y-5">
      <div
        v-if="overview.subscription"
        class="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-default bg-elevated/40 p-4"
      >
        <div>
          <div class="flex items-center gap-2">
            <p class="font-medium">
              {{ overview.subscription.plan.name }}
            </p>
            <UBadge color="neutral" variant="subtle">
              {{ title(overview.subscription.status) }}
            </UBadge>
          </div>
          <p class="mt-1 text-sm text-muted">
            {{ title(overview.subscription.plan.billingPeriod) }} billing
          </p>
        </div>
        <p class="text-sm text-muted">
          {{ formatPeriod(overview.subscription.currentPeriodStartsAt) }}
          to
          {{ formatPeriod(overview.subscription.currentPeriodEndsAt) }}
        </p>
      </div>

      <UAlert
        v-else
        color="warning"
        variant="subtle"
        icon="i-lucide-receipt-text"
        description="No billing plan is currently assigned. Existing explicit feature entitlements remain authoritative."
      />

      <div>
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-medium">
            Current-period usage
          </p>
          <span class="text-xs text-muted">{{ overview.usage.length }} meters</span>
        </div>
        <div v-if="overview.usage.length" class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div
            v-for="meter in overview.usage"
            :key="`${meter.featureKey}:${meter.meterKey}`"
            class="rounded-lg border border-default p-3"
          >
            <p class="text-xs text-muted">
              {{ title(meter.featureKey) }}
            </p>
            <p class="mt-1 text-lg font-semibold">
              {{ meter.quantity.toLocaleString() }}
              <span class="text-xs font-normal text-muted">{{ meter.unit }}</span>
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ title(meter.meterKey) }}
            </p>
          </div>
        </div>
        <p v-else class="rounded-lg border border-dashed border-default p-4 text-sm text-muted">
          No metered usage has been recorded in this billing period.
        </p>
      </div>
    </div>
  </UCard>
</template>
