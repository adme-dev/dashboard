<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

definePageMeta({ layout: 'agency' })
useHead({ title: 'Demo Sites | XeroFlow Agency' })

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
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Demo Sites" />
      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
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
      </div>
    </UDashboardPanel>
  </div>
</template>
