<script setup lang="ts">
definePageMeta({ layout: 'studio', middleware: 'studio-auth' })
useHead({ title: 'Draft history | Page Studio' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="min-w-0 space-y-6">
    <UButton
      to="/studio/sites"
      label="Back to My sites"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
    />
    <PageStudioDraftHistory :key="siteId" audience="portal" :site-id="siteId" />
  </div>
</template>
