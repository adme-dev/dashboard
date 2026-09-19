<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: 'auth' })
useHead({ title: 'Website content | XeroFlow' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="h-full min-h-0 min-w-0 w-full overflow-y-auto p-4 sm:p-6">
    <PageStudioContentConnection
      :key="siteId"
      audience="agency"
      :site-id="siteId"
      @connected="refreshNuxtData(`page-studio-content:agency:${siteId}`)"
    />
    <PageStudioBusinessContentWorkspace :key="siteId" audience="agency" :site-id="siteId" />
  </div>
</template>
