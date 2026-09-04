<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Page Studio Builder | XeroFlow Agency' })

const route = useRoute()
const siteId = computed(() => String(route.params.siteId || ''))
</script>

<template>
  <div class="h-[calc(100dvh-4rem)] min-w-0 flex-1 overflow-hidden">
    <PageStudioBuilderShell :site-id="siteId" />
  </div>
</template>
