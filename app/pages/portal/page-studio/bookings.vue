<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Website bookings | Client Portal' })
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-y-auto p-4 sm:p-6">
    <PageStudioPortalBookingWorkspace />
  </div>
</template>
