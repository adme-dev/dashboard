<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-media'] })

const config = useRuntimeConfig()
if (config.public.searchAuthorityEnabled !== true) {
  throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useHead({ title: 'Search Authority Connections · XeroFlow Agency' })
</script>

<template>
  <SearchAuthorityConnectionsWorkspace />
</template>
