<script setup lang="ts">
definePageMeta({
  title: 'Site Tracking',
  layout: 'agency',
  middleware: ['role-media']
})

interface TrackingSiteRow {
  id: string
  client_id: string
  client_name: string | null
  name: string
  write_key: string
  spa: boolean
  consent_mode: string
  is_active: boolean
  events_24h: number | string
  created_at: string
  provider_tracking?: {
    podium: {
      interactions: boolean
      confirmedLeads: boolean
      organizationUid?: string | null
      locationUids?: string[]
    }
    xtime: {
      interactions: boolean
      confirmedLeads: boolean
    }
  }
}

interface ClientOption {
  id: string
  name: string
}

type ClientsResponse = ClientOption[] | { clients?: ClientOption[] }

// Client filter — drives the ?clientId= query reactively.
const selectedClient = ref<string>('all')
const apiFetch = $fetch as <T = unknown>(request: string, options?: { query?: Record<string, unknown> }) => Promise<T>
const clientsData = ref<ClientsResponse>(
  await apiFetch<ClientsResponse>('/api/agency/clients').catch(() => [])
)
const clientFilterItems = computed(() => {
  const list = Array.isArray(clientsData.value) ? clientsData.value : (clientsData.value?.clients ?? [])
  return [
    { label: 'All clients', value: 'all' },
    ...list.map(c => ({ label: c.name, value: c.id }))
  ]
})

const data = ref<{ sites: TrackingSiteRow[] } | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<{ sites: TrackingSiteRow[] }>('/api/agency/tracking', {
      query: selectedClient.value === 'all' ? {} : { clientId: selectedClient.value }
    })
  } catch {
    data.value = { sites: [] }
  } finally {
    pending.value = false
  }
}

watch(selectedClient, () => {
  refresh()
}, { immediate: true })
const sites = computed(() => data.value?.sites ?? [])
const siteRow = (row: unknown): TrackingSiteRow => ((row as { original?: TrackingSiteRow }).original ?? row) as TrackingSiteRow

const showCreate = ref(false)
const showInstall = ref(false)
const installSiteId = ref<string | null>(null)
const showProviders = ref(false)
const providerSite = ref<TrackingSiteRow | null>(null)

const toast = useToast()

function openCreate() {
  showCreate.value = true
}

function openInstall(id: string) {
  installSiteId.value = id
  showInstall.value = true
}

function openProviders(site: TrackingSiteRow) {
  providerSite.value = site
  showProviders.value = true
}

async function copyKey(key: string) {
  try {
    await navigator.clipboard.writeText(key)
    toast.add({ title: 'Write key copied', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', color: 'error' })
  }
}

function truncateKey(key: string) {
  return key.length > 16 ? key.slice(0, 12) + '…' + key.slice(-3) : key
}

// Friendly, marketer-facing labels for the technical fields.
const CONSENT_LABELS: Record<string, string> = {
  off: 'Capture all',
  au_optout: 'AU opt-out',
  consent_gated: 'Consent-gated'
}
function consentLabel(mode: string) {
  return CONSENT_LABELS[mode] ?? mode
}

const columns = [
  { accessorKey: 'client_name', header: 'Client' },
  { accessorKey: 'name', header: 'Site' },
  { accessorKey: 'spa', header: 'Website type' },
  { accessorKey: 'events_24h', header: 'Events (24h)' },
  { accessorKey: 'write_key', header: 'Write key' },
  { accessorKey: 'actions', header: '' }
]
</script>

<template>
  <div class="h-full min-h-0 overflow-y-auto overscroll-y-contain p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-xl font-semibold tracking-tight">
          Site Tracking
        </h1>
        <p class="text-sm text-muted mt-1 max-w-2xl">
          First-party tracking tags for client websites. Provision a site, install the snippet, and
          behavioural events flow into the dashboard.
        </p>
      </div>
      <UButton
        color="primary"
        icon="i-lucide-plus"
        label="New tracking site"
        @click="openCreate"
      />
    </div>

    <!-- Client filter -->
    <div v-if="sites.length > 0 || selectedClient !== 'all'" class="flex items-center gap-2">
      <span class="text-sm text-muted">Client</span>
      <USelectMenu
        v-model="selectedClient"
        :items="clientFilterItems"
        value-key="value"
        class="w-64"
      />
    </div>

    <!-- Empty state -->
    <div
      v-if="!pending && sites.length === 0"
      class="border border-dashed border-default rounded-xl py-16 px-6 text-center"
    >
      <UIcon name="i-lucide-radio" class="size-10 text-muted mx-auto" />
      <p class="mt-3 text-sm font-medium">
        {{ selectedClient === 'all' ? 'No tracking sites yet' : 'No tracking sites for this client' }}
      </p>
      <p class="text-sm text-muted mt-1">
        Create one to generate a write key and install snippet.
      </p>
      <UButton
        class="mt-4"
        color="primary"
        variant="soft"
        icon="i-lucide-plus"
        label="New tracking site"
        @click="openCreate"
      />
    </div>

    <!-- Table -->
    <UTable
      v-else
      :columns="columns"
      :data="sites"
      :loading="pending"
      class="border border-default rounded-xl"
    >
      <template #client_name-cell="{ row }">
        <ULink :to="`/agency/tracking/${siteRow(row).client_id}`" class="font-medium hover:text-primary">
          {{ siteRow(row).client_name || '—' }}
        </ULink>
      </template>

      <template #name-cell="{ row }">
        <div class="flex flex-col">
          <span>{{ siteRow(row).name }}</span>
          <span class="text-xs text-muted">Tracking: {{ consentLabel(siteRow(row).consent_mode) }}</span>
        </div>
      </template>

      <template #spa-cell="{ row }">
        <UTooltip :text="siteRow(row).spa ? 'Single-page app — route changes also count as page views (Gatsby, Next.js, etc.)' : 'Standard site — each page load is a page view'">
          <UBadge :color="siteRow(row).spa ? 'info' : 'neutral'" variant="soft" size="sm">
            {{ siteRow(row).spa ? 'Single-page app' : 'Standard site' }}
          </UBadge>
        </UTooltip>
      </template>

      <template #events_24h-cell="{ row }">
        <span class="tabular-nums">{{ Number(siteRow(row).events_24h) || 0 }}</span>
      </template>

      <template #write_key-header>
        <span class="inline-flex items-center gap-1">
          Write key
          <UTooltip text="The public key embedded in the install snippet. It tells the dashboard which client's site an event came from. Safe to expose on the page.">
            <UIcon name="i-lucide-info" class="size-3.5 text-muted" />
          </UTooltip>
        </span>
      </template>

      <template #write_key-cell="{ row }">
        <button
          type="button"
          class="font-mono text-xs text-muted hover:text-default inline-flex items-center gap-1"
          @click="copyKey(siteRow(row).write_key)"
        >
          {{ truncateKey(siteRow(row).write_key) }}
          <UIcon name="i-lucide-copy" class="size-3" />
        </button>
      </template>

      <template #actions-cell="{ row }">
        <div class="flex justify-end gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plug"
            label="Providers"
            @click="openProviders(siteRow(row))"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            icon="i-lucide-code"
            label="Install"
            @click="openInstall(siteRow(row).id)"
          />
        </div>
      </template>
    </UTable>

    <!-- Create slideover -->
    <TrackingSiteCreateSlideover v-model:open="showCreate" @created="refresh()" />

    <!-- Install modal -->
    <UModal v-model:open="showInstall" title="Install tracking">
      <template #body>
        <TrackingInstallSnippet v-if="installSiteId" :site-id="installSiteId" />
      </template>
    </UModal>

    <TrackingProviderSettingsModal
      v-model:open="showProviders"
      :site="providerSite"
      @saved="refresh"
    />
  </div>
</template>
