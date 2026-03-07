<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })
await navigateTo('/agency/billing?tab=eom', { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
