<script setup lang="ts">
// Agency routes already render in the browser. Keep the editor dependency tree
// behind Nuxt's client-component boundary so it is not shipped in Pages SSR.
definePageMeta({ layout: 'agency', middleware: ['role-creative'] })
</script>

<template>
  <MediaProjectEditor />
</template>
