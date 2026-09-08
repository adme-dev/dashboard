<script setup lang="ts">
definePageMeta({ layout: 'portal' })
useHead({ title: 'Booking enquiries | XeroFlow' })
</script>

<template>
  <div class="mx-auto w-full max-w-3xl space-y-6 p-4 sm:p-6">
    <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          Bookings
        </p><h1 class="mt-2 text-2xl font-semibold text-highlighted">
          Request a trip
        </h1><p class="mt-2 text-sm leading-6 text-muted">
          Submit a booking enquiry for your agency to review.
        </p>
      </div>
      <UButton
        to="/portal/page-studio/bookings/new"
        label="New enquiry"
        icon="i-lucide-plus"
        color="primary"
      />
    </div>
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-shield-check"
      title="Operator-reviewed bookings"
      description="Every enquiry is checked for availability before a quote or customer confirmation is issued."
    />
  </div>
</template>
