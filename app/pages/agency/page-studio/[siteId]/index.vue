<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))

useSeoMeta({ title: 'Manage website | XeroFlow' })
</script>

<template>
  <UDashboardPanel id="agency-page-studio-site" :ui="{ root: 'min-h-0 max-h-svh', body: 'p-0 min-h-0 overflow-y-auto' }">
    <template #body>
      <PageStudioPublishingWorkspace :site-id="siteId" />
    </template>
  </UDashboardPanel>
</template>
