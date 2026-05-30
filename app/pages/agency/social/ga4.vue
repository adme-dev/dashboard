<!-- app/pages/agency/social/ga4.vue -->
<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-6">
    <UButton to="/agency/social" variant="ghost" icon="i-lucide-arrow-left" size="sm" class="-ml-2">
      Back to connections
    </UButton>
    <div>
      <h1 class="text-xl font-semibold">Google Analytics</h1>
      <p class="text-sm text-muted">
        Connect GA4 and map each property to a client to power the funnel report.
      </p>
    </div>
    <SocialGa4ConnectCard />
  </div>
</template>
