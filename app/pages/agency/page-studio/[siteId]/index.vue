<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))

useSeoMeta({ title: 'Manage website | XeroFlow' })
</script>

<template>
  <PageStudioPublishingWorkspace :site-id="siteId" />
</template>
