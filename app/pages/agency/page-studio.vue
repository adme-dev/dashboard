<script setup lang="ts">
definePageMeta({
  layout: 'agency',
  middleware: ['role-creative']
})

await navigateTo('/agency/banner-studio', { redirectCode: 301 })
</script>

<template>
  <div class="p-6 text-sm text-muted">
    Redirecting to Banner Studio…
  </div>
</template>
