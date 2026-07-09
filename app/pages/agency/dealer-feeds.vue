<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

type AgencyClient = {
  id: string
  name: string
  isActive?: boolean
}

type DealerFeedLink = {
  id: string
  clientId: string
  clientName: string | null
  providerId: string
  externalOrgId: string
  sellerRefs: string[]
  defaultFeedIds: string[]
  status: string
  createdAt: string
  updatedAt: string
}

type FeedSummary = {
  id: string
  name: string
  platform: 'google' | 'facebook'
  isActive: boolean
}

const toast = useToast()

const selectedClientId = ref('')
const feedRows = ref<FeedSummary[]>([])
const feedsPending = ref(false)
const feedsError = ref('')
const savingLink = ref(false)
const savingFeed = ref(false)
const deletingLink = ref(false)

const mappingForm = reactive({
  externalOrgId: '',
  sellerRefsText: '',
  defaultFeedIdsText: ''
})

const feedForm = reactive({
  name: '',
  platform: 'google' as 'google' | 'facebook'
})

const { data: clientsData, pending: clientsPending } = useFetch<AgencyClient[]>('/api/agency/clients', {
  server: false,
  default: () => []
})

const {
  data: linksData,
  pending: linksPending,
  error: linksError,
  refresh: refreshLinks
} = useFetch<{ ok: boolean, links: DealerFeedLink[] }>('/api/admin/dealer-feed-links', {
  server: false,
  default: () => ({ ok: false, links: [] })
})

const clients = computed(() => clientsData.value || [])
const links = computed(() => linksData.value?.links || [])

const clientOptions = computed(() =>
  clients.value.map(client => ({ label: client.name, value: client.id }))
)

const selectedClient = computed(() =>
  clients.value.find(client => client.id === selectedClientId.value) || null
)

const selectedLink = computed(() =>
  links.value.find(link => link.clientId === selectedClientId.value) || null
)

const linkedClientIds = computed(() => new Set(links.value.map(link => link.clientId)))
const unmappedClientCount = computed(() =>
  clients.value.filter(client => !linkedClientIds.value.has(client.id)).length
)

const stats = computed(() => [
  { label: 'Mapped clients', value: links.value.length, icon: 'i-lucide-link' },
  { label: 'Unmapped clients', value: unmappedClientCount.value, icon: 'i-lucide-unlink' },
  { label: 'Visible feeds', value: feedRows.value.length, icon: 'i-lucide-rss' }
])

const platformOptions = [
  { label: 'Google Merchant', value: 'google' },
  { label: 'Facebook Catalog', value: 'facebook' }
]

const parseList = (value: string) =>
  value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)

function errorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object') {
    const maybeError = error as {
      data?: { statusMessage?: string, message?: string }
      message?: string
    }
    return maybeError.data?.statusMessage || maybeError.data?.message || maybeError.message || fallback
  }
  return fallback
}

function populateMappingForm() {
  const link = selectedLink.value
  mappingForm.externalOrgId = link?.externalOrgId || ''
  mappingForm.sellerRefsText = link?.sellerRefs.join(', ') || ''
  mappingForm.defaultFeedIdsText = link?.defaultFeedIds.join(', ') || ''
}

async function loadFeeds() {
  feedRows.value = []
  feedsError.value = ''

  if (!selectedClientId.value || !selectedLink.value) return

  feedsPending.value = true
  try {
    const result = await $fetch<{ ok: boolean, feeds: FeedSummary[] }>(`/api/admin/dealer-feeds/${selectedClientId.value}`)
    feedRows.value = result.feeds || []
  } catch (error: unknown) {
    feedsError.value = errorMessage(error, 'Failed to load dealer feeds')
  } finally {
    feedsPending.value = false
  }
}

async function saveMapping() {
  if (!selectedClientId.value) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }
  if (!mappingForm.externalOrgId.trim()) {
    toast.add({ title: 'External org ID is required', color: 'error' })
    return
  }

  savingLink.value = true
  try {
    await $fetch('/api/admin/dealer-feed-links', {
      method: 'POST',
      body: {
        clientId: selectedClientId.value,
        externalOrgId: mappingForm.externalOrgId.trim(),
        sellerRefs: parseList(mappingForm.sellerRefsText),
        defaultFeedIds: parseList(mappingForm.defaultFeedIdsText)
      }
    })
    toast.add({ title: 'Dealer feed mapping saved', color: 'success' })
    await refreshLinks()
    populateMappingForm()
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to save mapping',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    savingLink.value = false
  }
}

async function deactivateMapping() {
  if (!selectedClientId.value || !selectedLink.value) return

  deletingLink.value = true
  try {
    await $fetch(`/api/admin/dealer-feed-links/${selectedClientId.value}`, { method: 'DELETE' })
    toast.add({ title: 'Dealer feed mapping deactivated', color: 'success' })
    await refreshLinks()
    populateMappingForm()
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to deactivate mapping',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    deletingLink.value = false
  }
}

async function createFeed() {
  if (!selectedLink.value) {
    toast.add({ title: 'Create a mapping before creating feeds', color: 'error' })
    return
  }
  if (!feedForm.name.trim()) {
    toast.add({ title: 'Feed name is required', color: 'error' })
    return
  }

  savingFeed.value = true
  try {
    await $fetch(`/api/admin/dealer-feeds/${selectedClientId.value}`, {
      method: 'POST',
      body: {
        name: feedForm.name.trim(),
        platform: feedForm.platform
      }
    })
    toast.add({ title: 'Feed create request sent', color: 'success' })
    feedForm.name = ''
    await loadFeeds()
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to create feed',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    savingFeed.value = false
  }
}

async function refreshView() {
  await refreshLinks()
  await loadFeeds()
}

const formatDate = (value: string) => {
  if (!value) return '-'
  return new Date(value).toLocaleString('en-AU', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const linkColumns = [
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'externalOrgId', header: 'Social org' },
  { accessorKey: 'sellerRefs', header: 'Seller refs' },
  { accessorKey: 'defaultFeedIds', header: 'Default feeds' },
  { accessorKey: 'updatedAt', header: 'Updated' },
  { id: 'actions', header: '' }
]

const feedColumns = [
  { accessorKey: 'name', header: 'Feed' },
  { accessorKey: 'platform', header: 'Platform' },
  { accessorKey: 'id', header: 'Feed ID' },
  { accessorKey: 'isActive', header: 'Status' }
]

watch(clients, (rows) => {
  if (!selectedClientId.value && rows.length > 0) {
    selectedClientId.value = rows[0].id
  }
}, { immediate: true })

watch([selectedClientId, links], async () => {
  populateMappingForm()
  await loadFeeds()
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="dealer-feeds">
    <template #header>
      <UDashboardNavbar
        title="Dealer Feeds"
        description="Connect XeroFlow clients to social-dashboard inventory feeds for Google and Facebook catalogs."
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="outline"
            color="neutral"
            :loading="linksPending || feedsPending"
            @click="refreshView"
          >
            Refresh
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <div class="p-4 sm:p-6 space-y-6">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div
          v-for="stat in stats"
          :key="stat.label"
          class="rounded-lg border border-default bg-default px-4 py-3"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs text-muted">
                {{ stat.label }}
              </p>
              <p class="mt-1 text-2xl font-semibold text-highlighted">
                {{ stat.value }}
              </p>
            </div>
            <UIcon :name="stat.icon" class="size-5 text-primary" />
          </div>
        </div>
      </div>

      <UAlert
        v-if="linksError"
        icon="i-lucide-alert-circle"
        color="error"
        variant="subtle"
        title="Dealer feed links could not be loaded"
        :description="linksError.message"
      />

      <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(480px,0.85fr)_minmax(0,1.35fr)]">
        <section class="rounded-lg border border-default bg-default">
          <div class="border-b border-default px-5 py-4">
            <h2 class="text-base font-semibold text-highlighted">
              Client mapping
            </h2>
            <p class="mt-1 text-sm text-muted">
              Map one XeroFlow client to one social-dashboard organization.
            </p>
          </div>

          <div class="space-y-4 p-5">
            <UFormField label="Client">
              <USelectMenu
                v-model="selectedClientId"
                :items="clientOptions"
                value-key="value"
                :loading="clientsPending"
                placeholder="Select client"
                class="w-full"
              />
            </UFormField>

            <div
              v-if="selectedClient"
              class="rounded-lg border border-default bg-elevated/40 px-3 py-2"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ selectedClient.name }}
                  </p>
                  <p class="break-all text-xs text-muted">
                    {{ selectedClient.id }}
                  </p>
                </div>
                <UBadge
                  :color="selectedLink ? 'success' : 'warning'"
                  variant="subtle"
                  size="xs"
                  class="shrink-0"
                >
                  {{ selectedLink ? 'Mapped' : 'Unmapped' }}
                </UBadge>
              </div>
            </div>

            <UFormField label="Social-dashboard org ID" required>
              <UInput
                v-model="mappingForm.externalOrgId"
                placeholder="00000000-0000-4000-8000-000000000001"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Seller refs">
              <UTextarea
                v-model="mappingForm.sellerRefsText"
                placeholder="dealer-seller-id, dealership-slug"
                :rows="3"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Default feed IDs">
              <UTextarea
                v-model="mappingForm.defaultFeedIdsText"
                placeholder="Optional social-dashboard feed IDs"
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <div class="flex flex-wrap items-center gap-2">
              <UButton
                icon="i-lucide-save"
                color="primary"
                :loading="savingLink"
                @click="saveMapping"
              >
                Save mapping
              </UButton>
              <UButton
                v-if="selectedLink"
                icon="i-lucide-unlink"
                color="error"
                variant="ghost"
                :loading="deletingLink"
                @click="deactivateMapping"
              >
                Deactivate
              </UButton>
            </div>
          </div>
        </section>

        <section class="space-y-6">
          <div class="rounded-lg border border-default bg-default">
            <div class="border-b border-default px-5 py-4">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Connected mappings
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    Active XeroFlow to social-dashboard feed ownership links.
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle">
                  {{ links.length }} active
                </UBadge>
              </div>
            </div>

            <div v-if="linksPending" class="flex min-h-40 items-center justify-center">
              <XfLoader />
            </div>

            <UEmpty
              v-else-if="links.length === 0"
              icon="i-lucide-link"
              title="No dealer feed mappings"
              description="Select a client and save its social-dashboard organization to make feeds visible here."
              class="py-12"
            />

            <UTable
              v-else
              :data="links"
              :columns="linkColumns"
            >
              <template #clientName-cell="{ row }">
                <button
                  type="button"
                  class="text-left text-sm font-medium text-primary hover:underline"
                  @click="selectedClientId = row.original.clientId"
                >
                  {{ row.original.clientName || row.original.clientId }}
                </button>
              </template>

              <template #externalOrgId-cell="{ row }">
                <code class="text-xs">{{ row.original.externalOrgId }}</code>
              </template>

              <template #sellerRefs-cell="{ row }">
                <div class="flex max-w-72 flex-wrap gap-1">
                  <UBadge
                    v-for="sellerRef in row.original.sellerRefs"
                    :key="sellerRef"
                    color="neutral"
                    variant="subtle"
                    size="xs"
                  >
                    {{ sellerRef }}
                  </UBadge>
                  <span v-if="row.original.sellerRefs.length === 0" class="text-xs text-muted">-</span>
                </div>
              </template>

              <template #defaultFeedIds-cell="{ row }">
                <span class="text-xs text-muted">{{ row.original.defaultFeedIds.length || '-' }}</span>
              </template>

              <template #updatedAt-cell="{ row }">
                <span class="text-xs text-muted">{{ formatDate(row.original.updatedAt) }}</span>
              </template>

              <template #actions-cell="{ row }">
                <UButton
                  icon="i-lucide-arrow-right"
                  variant="ghost"
                  color="neutral"
                  size="xs"
                  @click="selectedClientId = row.original.clientId"
                />
              </template>
            </UTable>
          </div>

          <div class="rounded-lg border border-default bg-default">
            <div class="border-b border-default px-5 py-4">
              <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Feeds for selected client
                  </h2>
                  <p class="mt-1 text-sm text-muted">
                    {{ selectedClient ? selectedClient.name : 'Select a client to inspect its Google and Facebook feeds.' }}
                  </p>
                </div>
                <UButton
                  icon="i-lucide-refresh-cw"
                  variant="ghost"
                  color="neutral"
                  :disabled="!selectedLink"
                  :loading="feedsPending"
                  @click="loadFeeds"
                />
              </div>
            </div>

            <div v-if="!selectedLink" class="p-5">
              <UAlert
                icon="i-lucide-info"
                color="warning"
                variant="subtle"
                title="No mapping for this client"
                description="Save the client mapping first, then this panel can list and create feeds through social-dashboard."
              />
            </div>

            <template v-else>
              <div class="grid grid-cols-1 gap-3 border-b border-default p-5 lg:grid-cols-[minmax(0,1fr)_200px_auto]">
                <UFormField label="Feed name">
                  <UInput
                    v-model="feedForm.name"
                    placeholder="Primary inventory feed"
                    class="w-full"
                  />
                </UFormField>
                <UFormField label="Platform">
                  <USelect
                    v-model="feedForm.platform"
                    :items="platformOptions"
                    value-key="value"
                    class="w-full"
                  />
                </UFormField>
                <div class="flex items-end">
                  <UButton
                    icon="i-lucide-plus"
                    color="primary"
                    class="w-full justify-center lg:w-auto"
                    :loading="savingFeed"
                    @click="createFeed"
                  >
                    Create feed
                  </UButton>
                </div>
              </div>

              <UAlert
                v-if="feedsError"
                icon="i-lucide-alert-circle"
                color="error"
                variant="subtle"
                title="Feeds could not be loaded"
                :description="feedsError"
                class="m-5"
              />

              <div v-if="feedsPending" class="flex min-h-40 items-center justify-center">
                <XfLoader />
              </div>

              <UEmpty
                v-else-if="feedRows.length === 0 && !feedsError"
                icon="i-lucide-rss"
                title="No feeds returned"
                description="Create a Google or Facebook feed to send the selected client inventory into social-dashboard."
                class="py-12"
              />

              <UTable
                v-else-if="feedRows.length > 0"
                :data="feedRows"
                :columns="feedColumns"
              >
                <template #name-cell="{ row }">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ row.original.name || row.original.id }}
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ row.original.id }}
                    </p>
                  </div>
                </template>

                <template #platform-cell="{ row }">
                  <UBadge
                    :icon="row.original.platform === 'google' ? 'i-lucide-search' : 'i-lucide-facebook'"
                    color="neutral"
                    variant="subtle"
                  >
                    {{ row.original.platform === 'google' ? 'Google' : 'Facebook' }}
                  </UBadge>
                </template>

                <template #id-cell="{ row }">
                  <code class="text-xs">{{ row.original.id }}</code>
                </template>

                <template #isActive-cell="{ row }">
                  <UBadge
                    :color="row.original.isActive ? 'success' : 'neutral'"
                    variant="subtle"
                    size="xs"
                  >
                    {{ row.original.isActive ? 'Active' : 'Inactive' }}
                  </UBadge>
                </template>
              </UTable>
            </template>
          </div>
        </section>
      </div>
    </div>
  </UDashboardPanel>
</template>
