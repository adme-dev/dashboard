<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId ?? ''))
useHead({ title: 'Business content | XeroFlow' })
</script>

<template>
  <div class="h-full w-full overflow-y-auto p-4 sm:p-6">
    <UButton
      to="/portal/page-studio"
      label="Your websites"
      icon="i-lucide-arrow-left"
      color="neutral"
      variant="ghost"
      class="mb-6"
    />
    <PageStudioBusinessContentWorkspace :key="siteId" :site-id="siteId" audience="portal" />
  </div>
</template>
