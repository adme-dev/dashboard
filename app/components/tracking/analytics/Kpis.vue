<script setup lang="ts">
defineProps<{ data: Record<string, number> | null, pending: boolean }>()
const CARDS = [
  { key: 'visitors', label: 'Visitors' },
  { key: 'sessions', label: 'Sessions' },
  { key: 'pageViews', label: 'Page views' },
  { key: 'avgEngagementSeconds', label: 'Avg engagement (s)' },
  { key: 'callClicks', label: 'Call clicks' },
  { key: 'formSubmits', label: 'Form submits' },
  { key: 'generateLeads', label: 'Generate leads' },
  { key: 'testDriveBookings', label: 'Test drive bookings' },
  { key: 'interactionLeads', label: 'Interaction leads' },
  { key: 'vehicleViews', label: 'Vehicle views' }
]
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    <UCard v-for="c in CARDS" :key="c.key" :ui="{ body: 'p-4' }">
      <p class="text-xs text-muted">
        {{ c.label }}
      </p>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        <span v-if="pending" class="text-muted">—</span>
        <span v-else>{{ (data?.[c.key] ?? 0).toLocaleString() }}</span>
      </p>
    </UCard>
  </div>
</template>
