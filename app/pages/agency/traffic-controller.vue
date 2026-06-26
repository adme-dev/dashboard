<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })
</script>

<template>
  <div class="p-4 sm:p-6 space-y-4">
    <div>
      <h1 class="text-xl font-semibold">Traffic Controller</h1>
      <p class="mt-1 text-sm text-muted">Read-only allocation review across spend, publishing, and finance signals.</p>
    </div>
    <AgencyTrafficControllerPanel />
  </div>
</template>
