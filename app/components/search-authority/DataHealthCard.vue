<script setup lang="ts">
import type { SearchAuthorityOverview } from '~/types'

const props = defineProps<{
  provider: SearchAuthorityOverview['provider'] | null
  loading: boolean
}>()

function statusLabel(status: string): string {
  return status.replaceAll('_', ' ').replace(/\b\w/g, value => value.toUpperCase())
}

function displayDate(value: string | null): string {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeZone: 'UTC'
  }).format(new Date(`${value.slice(0, 10)}T00:00:00.000Z`))
}

const statusColor = computed(() => {
  if (!props.provider) return 'neutral'
  if (props.provider.connectionStatus === 'active' && !props.provider.stale) {
    return 'success'
  }
  if (props.provider.connectionStatus === 'not_connected') return 'neutral'
  return 'warning'
})
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-start justify-between gap-4">
        <div>
          <h2 class="font-semibold text-highlighted">
            Evidence health
          </h2>
          <p class="mt-1 text-sm text-muted">
            Provider completeness and last-known-data state.
          </p>
        </div>
        <UBadge
          v-if="provider"
          :label="statusLabel(provider.connectionStatus)"
          :color="statusColor"
          variant="subtle"
        />
      </div>
    </template>

    <div v-if="loading" class="space-y-3" aria-label="Loading evidence health">
      <USkeleton class="h-12 w-full" />
      <USkeleton class="h-20 w-full" />
    </div>

    <div v-else-if="provider" class="space-y-4">
      <dl class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt class="text-muted">
            Data through
          </dt>
          <dd class="mt-1 font-medium text-highlighted">
            {{ displayDate(provider.dataThroughDate) }}
          </dd>
        </div>
        <div>
          <dt class="text-muted">
            Evidence state
          </dt>
          <dd class="mt-1 flex flex-wrap gap-1">
            <UBadge
              :label="provider.stale ? 'Last known' : 'Current'"
              :color="provider.stale ? 'warning' : 'success'"
              variant="subtle"
            />
            <UBadge
              v-if="provider.provisional"
              label="Provisional"
              color="warning"
              variant="subtle"
            />
          </dd>
        </div>
      </dl>

      <UAlert
        v-for="caveat in provider.caveats"
        :key="caveat"
        title="Provider caveat"
        :description="caveat"
        icon="i-lucide-info"
        color="warning"
        variant="subtle"
      />
    </div>

    <UAlert
      v-else
      title="Evidence health unavailable"
      description="Choose an entitled client to inspect its Search Console state."
      icon="i-lucide-circle-dashed"
      color="neutral"
      variant="subtle"
    />
  </UCard>
</template>
