<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })
await navigateTo('/agency/financial-health?tab=profitability', { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
