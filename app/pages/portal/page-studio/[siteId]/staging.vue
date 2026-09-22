<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Website staging | XeroFlow' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="h-full min-h-0 min-w-0 w-full space-y-4 overflow-y-auto p-4 sm:p-6">
    <UButton
      to="/portal/page-studio"
      label="Your websites"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
    />
    <PageStudioStagingWorkspace :key="siteId" audience="portal" :site-id="siteId" />
  </div>
</template>
