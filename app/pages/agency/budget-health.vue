<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })
await navigateTo('/agency/financial-health?tab=budget', { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
