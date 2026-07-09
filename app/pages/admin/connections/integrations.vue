<script setup lang="ts">
definePageMeta({ layout: 'admin', middleware: ['role-admin'] })

await navigateTo('/agency/dealer-feeds', { replace: true })
</script>

<template>
  <div />
</template>
