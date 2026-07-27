<script setup lang="ts">
definePageMeta({
  layout: 'portal',
  middleware: 'portal-auth'
})
useHead({ title: 'Leads — Client Portal' })
</script>

<template>
  <div class="w-full h-[calc(100vh-4rem)] flex flex-col">
    <header class="px-6 py-4 border-b border-default bg-default">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-xl font-semibold">
            Leads
          </h1>
          <p class="text-sm text-muted">
            Inquiries your agency has shared from connected Google, Meta, webhook, and CSV forms.
          </p>
        </div>
        <UBadge variant="soft" color="primary" class="shrink-0">
          Client view
        </UBadge>
      </div>
    </header>
    <div class="flex-1 min-h-0">
      <PortalLeadsInbox />
    </div>
  </div>
</template>
