<script setup lang="ts">
const props = withDefaults(defineProps<{
  callClicks?: number
  formSubmits?: number
  generateLeads?: number
  testDriveBookings?: number
  interactionLeads?: number
  vehicleViews?: number
}>(), {
  callClicks: 0,
  formSubmits: 0,
  generateLeads: 0,
  testDriveBookings: 0,
  interactionLeads: 0,
  vehicleViews: 0
})
</script>

<template>
  <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-phone" class="size-4" />Call clicks
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.callClicks.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-send" class="size-4" />Form submits
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.formSubmits.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-hand-coins" class="size-4" />Generate leads
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.generateLeads.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-car" class="size-4" />Test drive bookings
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.testDriveBookings.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-target" class="size-4" />Interaction leads
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.interactionLeads.toLocaleString() }}
      </p>
    </UCard>
    <UCard :ui="{ body: 'p-4' }">
      <div class="flex items-center gap-2 text-muted text-xs">
        <UIcon name="i-lucide-car" class="size-4" />Vehicle views
      </div>
      <p class="text-2xl font-semibold tabular-nums mt-1">
        {{ props.vehicleViews.toLocaleString() }}
      </p>
    </UCard>
  </div>
</template>
