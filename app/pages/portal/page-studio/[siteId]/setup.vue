<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Website setup | Client Portal' })
const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-y-auto">
    <PageStudioPortalSetup :key="siteId" :site-id="siteId" />
  </div>
</template>
