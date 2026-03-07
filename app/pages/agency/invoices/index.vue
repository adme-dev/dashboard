<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-finance'] })
await navigateTo('/agency/billing?tab=invoices', { replace: true, redirectCode: 301 })
</script>

<template>
  <div />
</template>
