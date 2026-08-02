<script setup lang="ts">
import type { NearbyMarketNomination, NearbyMarketResourceStatus } from '~/composables/useNearbyMarket'

defineProps<{
  nominations: NearbyMarketNomination[]
  status: NearbyMarketResourceStatus
  error: string | null
}>()
defineEmits<{
  review: [nomination: NearbyMarketNomination]
  retry: []
}>()

function nominationName(nomination: NearbyMarketNomination) {
  return String(nomination.displayName || nomination.candidateName || nomination.googlePlaceId || 'Nearby dealership')
}

function nominationAge(value: string | null | undefined) {
  if (!value) return 'Recently nominated'
  const timestamp = new Date(value).getTime()
  if (!Number.isFinite(timestamp)) return 'Recently nominated'
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000))
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'} ago`
}
</script>

<template>
  <section aria-labelledby="nomination-queue-heading" class="space-y-3">
    <div>
      <h3 id="nomination-queue-heading" class="text-base font-semibold text-highlighted">
        Client nominations
      </h3>
      <p class="mt-1 text-sm text-muted">
        Independent of discovery results, these suggestions wait for agency review.
      </p>
    </div>

    <UAlert
      v-if="status === 'error'"
      color="error"
      variant="subtle"
      title="Client nominations unavailable"
      :description="error || 'The discovery list remains available.'"
    >
      <template #actions>
        <UButton
          label="Retry nominations"
          color="error"
          variant="soft"
          size="sm"
          @click="$emit('retry')"
        />
      </template>
    </UAlert>
    <div
      v-else-if="status === 'pending'"
      role="status"
      aria-live="polite"
      class="space-y-2"
    >
      <USkeleton class="h-20 w-full rounded-lg" />
      <span class="sr-only">Loading client nominations…</span>
    </div>
    <UAlert
      v-else-if="!nominations.length"
      color="neutral"
      variant="subtle"
      title="No client nominations awaiting review"
      description="Agency discovery and monitored domains remain available."
    />
    <ul v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="nomination in nominations" :key="nomination.id" class="space-y-3 p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <p class="font-medium text-highlighted">
              {{ nominationName(nomination) }}
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ nomination.clientName || 'Client' }} · {{ nomination.nominatedByName || 'Client contact' }} · {{ nominationAge(nomination.nominatedAt) }}
            </p>
            <p class="mt-2 text-sm leading-6 text-toned">
              {{ nomination.nominationReason || 'No nomination reason supplied.' }}
            </p>
          </div>
          <UButton
            v-if="nomination.googlePlaceId"
            label="Review"
            icon="i-lucide-panel-right-open"
            size="sm"
            variant="soft"
            @click="$emit('review', nomination)"
          />
        </div>
      </li>
    </ul>
  </section>
</template>
