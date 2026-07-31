<script setup lang="ts">
interface PortalSearchAuthority {
  clientName: string
  window: { startDate: string, endDate: string }
  provider: {
    status: string
    dataThroughDate: string | null
    provisional: boolean
    available: boolean
    caveats: string[]
  }
  visibility: {
    clicks: number
    impressions: number
    ctr: number
    position: number
    clickChangePercent: number | null
    impressionChangePercent: number | null
  } | null
  actions: {
    total: number
    items: Array<{
      label: string
      status: string
    }>
  }
  nextSteps: string[]
}

const { data, status, error, refresh } = await useFetch<PortalSearchAuthority>(
  '/api/portal/search-authority/overview'
)

const numberFormatter = new Intl.NumberFormat('en-AU')
const percentFormatter = new Intl.NumberFormat('en-AU', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
})

function label(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, character => (
    character.toUpperCase()
  ))
}

function dateLabel(value: string | null): string {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`))
}

function changeLabel(value: number | null): string {
  if (value === null) return 'Comparison unavailable'
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}% vs prior period`
}
</script>

<template>
  <div class="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
    <header class="border-b border-default pb-6">
      <div class="flex items-center gap-2 text-sm font-medium text-primary">
        <UIcon name="i-lucide-search-check" class="size-4" />
        Search Authority &amp; AI Trust
      </div>
      <h1 class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
        Measured search visibility
      </h1>
      <p class="mt-2 max-w-3xl text-base leading-7 text-muted">
        See verified Google Search Console movement, approved improvement work, and the freshness of the evidence behind it.
      </p>
    </header>

    <div v-if="status === 'pending'" class="space-y-4" aria-label="Loading search evidence">
      <USkeleton class="h-28 w-full" />
      <USkeleton class="h-64 w-full" />
    </div>

    <UAlert
      v-else-if="error"
      title="Search evidence unavailable"
      description="We could not load the latest search evidence. Try again or contact your account manager."
      icon="i-lucide-triangle-alert"
      color="warning"
      variant="subtle"
    >
      <template #actions>
        <UButton
          label="Try again"
          size="sm"
          color="warning"
          variant="soft"
          @click="refresh"
        />
      </template>
    </UAlert>

    <template v-else-if="data">
      <UAlert
        v-if="!data.provider.available"
        title="Search evidence unavailable"
        description="Your Search Console evidence source is still being prepared. No estimated visibility values are shown."
        icon="i-lucide-circle-dashed"
        color="neutral"
        variant="subtle"
      />

      <UAlert
        v-else-if="data.provider.provisional"
        title="Provider provisional"
        description="Google marks part of this reporting window as provisional, so recent values may still change."
        icon="i-lucide-info"
        color="warning"
        variant="subtle"
      />

      <UCard v-if="data.provider.available && data.visibility">
        <template #header>
          <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 class="font-semibold text-highlighted">
                Search Console evidence
              </h2>
              <p class="mt-1 text-sm text-muted">
                Data through {{ dateLabel(data.provider.dataThroughDate) }}
              </p>
            </div>
            <UBadge
              :label="label(data.provider.status)"
              :color="data.provider.status === 'active' ? 'success' : 'warning'"
              variant="subtle"
            />
          </div>
        </template>

        <div class="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-elevated lg:grid-cols-4">
          <div class="bg-default p-4">
            <p class="text-sm text-muted">
              Clicks
            </p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ numberFormatter.format(data.visibility.clicks) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ changeLabel(data.visibility.clickChangePercent) }}
            </p>
          </div>
          <div class="bg-default p-4">
            <p class="text-sm text-muted">
              Impressions
            </p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ numberFormatter.format(data.visibility.impressions) }}
            </p>
            <p class="mt-1 text-xs text-muted">
              {{ changeLabel(data.visibility.impressionChangePercent) }}
            </p>
          </div>
          <div class="bg-default p-4">
            <p class="text-sm text-muted">
              Click-through rate
            </p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ percentFormatter.format(data.visibility.ctr) }}
            </p>
          </div>
          <div class="bg-default p-4">
            <p class="text-sm text-muted">
              Average position
            </p>
            <p class="mt-1 text-2xl font-semibold text-highlighted">
              {{ data.visibility.position > 0 ? data.visibility.position.toFixed(1) : '—' }}
            </p>
          </div>
        </div>
      </UCard>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-semibold text-highlighted">
                Approved actions
              </h2>
              <p class="mt-1 text-sm text-muted">
                Work that has passed agency review and moved into delivery.
              </p>
            </div>
          </template>
          <ul v-if="data.actions.items.length" class="divide-y divide-default">
            <li
              v-for="(action, index) in data.actions.items"
              :key="`${action.label}:${action.status}:${index}`"
              class="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
            >
              <span class="text-sm font-medium text-highlighted">{{ action.label }}</span>
              <UBadge :label="label(action.status)" color="neutral" variant="subtle" />
            </li>
          </ul>
          <p v-else class="text-sm text-muted">
            No actions have been approved yet. New evidence is reviewed before work is recommended.
          </p>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="font-semibold text-highlighted">
              What happens next
            </h2>
          </template>
          <ul class="space-y-3">
            <li
              v-for="step in data.nextSteps"
              :key="step"
              class="flex items-start gap-3 text-sm text-muted"
            >
              <UIcon name="i-lucide-circle-check" class="mt-0.5 size-4 shrink-0 text-success" />
              {{ step }}
            </li>
          </ul>
          <div v-if="data.provider.caveats.length" class="mt-5 space-y-2">
            <p
              v-for="caveat in data.provider.caveats"
              :key="caveat"
              class="text-xs text-muted"
            >
              {{ caveat }}
            </p>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
