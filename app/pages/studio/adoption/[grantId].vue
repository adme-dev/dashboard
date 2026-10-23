<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Continue content setup — Page Studio', meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const grantId = computed(() => typeof route.params.grantId === 'string' ? route.params.grantId : '')
const revision = computed(() => typeof route.query.revision === 'string' && /^[1-9]\d{0,9}$/.test(route.query.revision) ? Number(route.query.revision) : 0)
</script>

<template>
  <StudioCustomerAdoption :grant-id="grantId" :revision="revision" />
</template>
