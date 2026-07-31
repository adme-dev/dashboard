<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface ClientOption {
  id: string
  name: string
}

interface SearchAuthoritySite {
  id: string
  clientId: string
  clientName: string
  canonicalHostname: string
  contentHostname: string | null
  status: string
}

const clients = ref<ClientOption[]>([])
const sites = ref<SearchAuthoritySite[]>([])
const loading = ref(true)
const loadError = ref<string | null>(null)

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'The Search Authority workspace could not be loaded'
}

async function loadWorkspace() {
  loading.value = true
  loadError.value = null

  try {
    const [clientRows, siteResponse] = await Promise.all([
      $fetch<ClientOption[]>('/api/agency/clients?active=true'),
      $fetch<{ sites: SearchAuthoritySite[] }>('/api/agency/search-authority/sites')
    ])
    clients.value = clientRows
    sites.value = siteResponse.sites
  } catch (error: unknown) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

function siteConfigured(site: Omit<SearchAuthoritySite, 'clientName'>) {
  const clientName = clients.value.find(client => client.id === site.clientId)?.name
    || 'Configured client'
  const nextSite: SearchAuthoritySite = { ...site, clientName }
  const index = sites.value.findIndex(existing => existing.clientId === site.clientId)
  if (index >= 0) sites.value.splice(index, 1, nextSite)
  else sites.value.push(nextSite)
}

onMounted(loadWorkspace)
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <header class="relative overflow-hidden rounded-2xl border border-default bg-elevated/40 p-6 sm:p-8">
        <div class="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-primary/10 blur-3xl" />
        <div class="relative max-w-3xl">
          <div class="flex items-center gap-2 text-sm font-medium text-primary">
            <UIcon name="i-lucide-search-check" class="size-4" />
            Search Authority &amp; AI Trust
          </div>
          <h1 class="mt-3 text-3xl font-semibold tracking-tight text-highlighted">
            Establish a trustworthy search evidence source
          </h1>
          <p class="mt-3 text-base leading-7 text-muted">
            Configure the dealership site, connect Search Console with read-only access, and map the verified property XeroFlow will use for technical trust monitoring and opportunity discovery.
          </p>
        </div>
      </header>

      <UAlert
        v-if="loadError"
        title="Workspace unavailable"
        :description="loadError"
        icon="i-lucide-triangle-alert"
        color="error"
        variant="subtle"
      >
        <template #actions>
          <UButton
            label="Try again"
            color="error"
            variant="soft"
            size="sm"
            @click="loadWorkspace"
          />
        </template>
      </UAlert>

      <div class="grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <SearchAuthoritySiteReadinessCard
          :clients="clients"
          :sites="sites"
          :loading="loading"
          @configured="siteConfigured"
        />
        <SearchAuthoritySearchConsoleConnectCard :sites="sites" />
      </div>
    </div>
  </div>
</template>
