<script setup lang="ts">
definePageMeta({
  layout: 'portal',
})
useHead({ title: 'Leads — Client Portal' })
</script>

<template>
  <div class="h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default">
      <h1 class="text-xl font-semibold">Your leads</h1>
      <p class="text-sm text-muted">Real-time inquiries from your Meta + Google ads.</p>
    </header>
    <div class="flex-1 min-h-0">
      <PortalLeadsInbox />
    </div>
  </div>
</template>
