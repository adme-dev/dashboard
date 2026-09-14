<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Website domains | Client Portal' })
const route = useRoute()
const router = useRouter()
const siteId = computed(() => typeof route.query.siteId === 'string' ? route.query.siteId : '')
function selectSite(value: string) {
  return router.replace({ query: { ...route.query, siteId: value || undefined } })
}
</script>

<template>
  <div class="h-full min-h-0 w-full overflow-y-auto p-4 sm:p-6">
    <div class="space-y-6">
      <div>
        <h1 class="text-2xl font-semibold text-highlighted">
          Domains and DNS
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Connect a website address, copy its verification records and check DNS and HTTPS progress.
        </p>
      </div>
      <PageStudioBookingSitePicker
        audience="portal"
        :site-id="siteId"
        help="Domain settings belong to the selected website."
        @update:site-id="selectSite"
      />
      <PageStudioDomainsWorkspace
        v-if="siteId"
        :key="siteId"
        audience="portal"
        :site-id="siteId"
      />
      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        title="Choose a website to view its domains"
        description="Each website has its own connection settings and access permissions."
      />
    </div>
  </div>
</template>
