<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

definePageMeta({ layout: 'agency' })
useHead({ title: 'Client websites | XeroFlow Agency' })

interface PageStudioSitesResponse {
  sites: PageStudioSiteSummary[]
  total: number
  page: number
  pageSize: number
}

const page = ref(1)
const pageSize = 12
const query = computed(() => ({ page: page.value, pageSize }))

const { data, pending, error, refresh } = await useFetch<PageStudioSitesResponse>('/api/agency/page-studio/sites', {
  query,
  default: () => ({ sites: [], total: 0, page: 1, pageSize })
})

const errorMessage = computed(() => error.value?.statusMessage || error.value?.message || null)
</script>

<template>
  <UDashboardPanel id="agency-page-studio" :ui="{ root: 'min-h-0 max-h-svh', body: 'min-h-0 overflow-y-auto' }">
    <template #header>
      <UDashboardNavbar title="Client websites" />
    </template>
    <template #body>
      <PageStudioSiteWorkspace
        audience="agency"
        :sites="data.sites"
        :total="data.total"
        :page="page"
        :page-size="pageSize"
        :pending="pending"
        :error-message="errorMessage"
        @refresh="refresh"
        @update:page="page = $event"
      />
    </template>
  </UDashboardPanel>
</template>
