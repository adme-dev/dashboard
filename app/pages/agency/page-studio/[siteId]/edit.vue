<script setup lang="ts">
definePageMeta({ layout: 'agency' })
useHead({ title: 'Page Studio | XeroFlow Agency' })

const route = useRoute()
const rawSiteId = route.params.siteId
const siteId = Array.isArray(rawSiteId) ? rawSiteId[0] : rawSiteId

if (!siteId) {
  throw createError({ statusCode: 404, statusMessage: 'Page Studio site not found' })
}

await navigateTo(`/agency/page-studio/${encodeURIComponent(siteId)}`, {
  redirectCode: 308,
  replace: true,
})
</script>

<template>
  <UCard>
    Redirecting to the governed Page Studio workspace.
  </UCard>
</template>
