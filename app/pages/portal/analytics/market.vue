<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { user } = usePortalAuth()
const config = useRuntimeConfig()

if (!user.value?.permissions?.canViewAnalytics
  || config.public.nearbyMarketDiscoveryEnabled !== true) {
  await navigateTo('/portal')
}
</script>

<template>
  <div class="min-h-0 w-full space-y-6 p-4 sm:p-6">
    <header class="flex items-start gap-3">
      <UButton
        to="/portal/analytics"
        variant="ghost"
        color="neutral"
        icon="i-lucide-arrow-left"
        size="sm"
        aria-label="Back to analytics overview"
      />
      <div>
        <p class="text-xs font-medium uppercase tracking-wide text-primary">
          Market discovery
        </p>
        <h1 class="mt-1 text-2xl font-bold text-highlighted">
          Nearby automotive market
        </h1>
        <p class="mt-1 max-w-3xl text-sm leading-6 text-muted">
          Explore dealerships near your confirmed trading location and flag relevant competitors for agency review.
        </p>
      </div>
    </header>

    <PortalNearbyMarketPanel
      :can-nominate-competitors="Boolean(user?.permissions?.canNominateCompetitors)"
    />
  </div>
</template>
