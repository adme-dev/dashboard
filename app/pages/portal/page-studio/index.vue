<script setup lang="ts">
import type { PageStudioSiteSummary } from '~/types'

definePageMeta({ layout: 'portal', middleware: 'portal-auth' })
useHead({ title: 'Page Studio | Client Portal' })

interface PageStudioSitesResponse {
  sites: PageStudioSiteSummary[]
  total: number
  page: number
  pageSize: number
}

const page = ref(1)
const pageSize = 12
const query = computed(() => ({ page: page.value, pageSize }))

const { data, pending, error, refresh } = await useFetch<PageStudioSitesResponse>('/api/portal/page-studio/sites', {
  query,
  default: () => ({ sites: [], total: 0, page: 1, pageSize })
})

const errorMessage = computed(() => error.value?.statusMessage || error.value?.message || null)
</script>

<template>
  <div class="h-full w-full overflow-y-auto p-4 sm:p-6">
    <PageStudioSiteWorkspace
      audience="portal"
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
</template>
