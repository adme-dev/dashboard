<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Search Authority' })
</script>

<template>
  <SearchAuthorityPortalSummary />
</template>
