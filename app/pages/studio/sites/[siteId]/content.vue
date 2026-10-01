<script setup lang="ts">
definePageMeta({ layout: 'studio', middleware: 'studio-auth' })
useHead({ title: 'Website content | Page Studio' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="min-w-0 space-y-6">
    <UButton
      :to="`/studio/sites/${siteId}`"
      label="Back to website"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
    />
    <h1 class="text-3xl font-semibold tracking-tight text-highlighted">
      Website content
    </h1>
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
