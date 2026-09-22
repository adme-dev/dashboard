<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Website content | XeroFlow' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="h-full min-h-0 min-w-0 w-full overflow-y-auto p-4 sm:p-6">
    <PageStudioContentConnection
      :key="siteId"
      audience="portal"
      :site-id="siteId"
      @connected="refreshNuxtData(`page-studio-content:portal:${siteId}`)"
    />
    <PageStudioCmsPreparation :key="`cms-preparation:${siteId}`" audience="portal" :site-id="siteId" />
    <PageStudioBusinessContentWorkspace :key="siteId" audience="portal" :site-id="siteId" />
  </div>
</template>
