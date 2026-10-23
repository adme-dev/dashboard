<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Review your website transfer — Page Studio', meta: [{ name: 'robots', content: 'noindex, nofollow' }, { name: 'referrer', content: 'no-referrer' }] })
const route = useRoute()
const scalar = (value: unknown) => typeof value === 'string' ? value : ''
const revision = (value: unknown) => typeof value === 'string' && /^[1-9]\d{0,9}$/.test(value) ? Number(value) : 0
const reference = computed(() => ({ reviewId: scalar(route.query.reviewId), revision: revision(route.query.reviewRevision), reviewDigest: scalar(route.query.digest) }))
</script>
<template>
  <main class="min-h-svh bg-default px-4 py-8 text-default sm:px-8 sm:py-14">
    <div class="mx-auto max-w-3xl space-y-5">
      <UButton to="/studio/dashboard" label="Your website" icon="i-lucide-arrow-left" color="neutral" variant="ghost" />
      <PageStudioTransferRecoveryApproval :site-id="scalar(route.params.siteId)" :request-id="scalar(route.params.requestId)" :revision="revision(route.query.revision)" mode="owner" :reference="reference" />
    </div>
  </main>
</template>
