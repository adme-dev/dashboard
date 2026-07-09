<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

type AgencyClient = {
  id: string
  name: string
  isActive?: boolean
}

type DealerFeedClientOption = {
  id: string
  label: string
  name: string
  source: 'agency' | 'social'
  clientId: string | null
  isActive: boolean
  socialConnectionIds: string[]
  socialPlatforms: string[]
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

type VehicleSummary = {
  id: string
  make: string
  model: string
  year: number | null
  price: number | null
  condition: string | null
  stockNumber: string | null
  url: string | null
  image: string | null
}

type FeedPreviewState = {
  feed: FeedSummary
  total: number
  items: VehicleSummary[]
}

const toast = useToast()

const selectedClientOptionId = ref('')
const feedRows = ref<FeedSummary[]>([])
const feedsPending = ref(false)
const feedsError = ref('')
const previewPendingFeedId = ref('')
const generatingFeedKey = ref('')
const feedPreview = ref<FeedPreviewState | null>(null)
const feedPreviewSearch = ref('')
const generatedFeedUrl = ref('')
const generatedFeedMeta = ref<{ feedName: string, itemCount: number } | null>(null)
const generatedFeedUrlInput = ref<HTMLInputElement | null>(null)
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
  platform: 'google' as 'google' | 'facebook',
  storeCode: ''
})

const {
  data: clientOptionsData,
  pending: clientsPending,
  refresh: refreshClientOptions
} = useFetch<{ items: DealerFeedClientOption[] }>('/api/admin/dealer-feed-client-options', {
  server: false,
  default: () => ({ items: [] })
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

const clientRows = computed(() => clientOptionsData.value?.items || [])
const links = computed(() => linksData.value?.links || [])

const clientOptions = computed(() =>
  clientRows.value.map(client => ({ label: client.label, value: client.id }))
)

const selectedClientOption = computed(() =>
  clientRows.value.find(client => client.id === selectedClientOptionId.value) || null
)

const selectedClientId = computed(() => selectedClientOption.value?.clientId || '')

const selectedClient = computed<AgencyClient | null>(() =>
  selectedClientOption.value
    ? {
        id: selectedClientOption.value.clientId || selectedClientOption.value.socialConnectionIds.join(', '),
        name: selectedClientOption.value.name,
        isActive: selectedClientOption.value.isActive
      }
    : null
)

const selectedLink = computed(() =>
  links.value.find(link => link.clientId === selectedClientId.value) || null
)

const linkedClientIds = computed(() => new Set(links.value.map(link => link.clientId)))
const unmappedClientCount = computed(() =>
  clientRows.value.filter((client) => {
    if (client.source === 'social') return true
    return client.clientId ? !linkedClientIds.value.has(client.clientId) : true
  }).length
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

const slugifySellerRef = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

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
  mappingForm.sellerRefsText = link?.sellerRefs.join(', ') || (selectedClient.value ? slugifySellerRef(selectedClient.value.name) : '')
  mappingForm.defaultFeedIdsText = link?.defaultFeedIds.join(', ') || ''
}

async function createOrFindAgencyClient(option: DealerFeedClientOption): Promise<AgencyClient> {
  try {
    return await $fetch<AgencyClient>('/api/agency/clients', {
      method: 'POST',
      body: {
        name: option.name,
        billingType: 'project',
        notes: `Created from Dealer Feeds for connected ad accounts: ${option.socialPlatforms.join(', ')}`
      }
    })
  } catch (error: unknown) {
    if (!/already exists|409/.test(errorMessage(error, ''))) throw error

    await refreshClientOptions()
    const existing = clientRows.value.find(client =>
      client.source === 'agency' && client.name.toLowerCase() === option.name.toLowerCase()
    )
    if (existing?.clientId) return { id: existing.clientId, name: existing.name, isActive: existing.isActive }
    throw error
  }
}

async function ensureAgencyClientForSelection(): Promise<string> {
  const option = selectedClientOption.value
  if (!option) throw new Error('Select a client first')
  if (option.clientId) return option.clientId

  const client = await createOrFindAgencyClient(option)

  await Promise.all(option.socialConnectionIds.map(connectionId =>
    $fetch('/api/agency/social/spend/map-account', {
      method: 'POST',
      body: { connectionId, clientId: client.id }
    })
  ))

  await refreshClientOptions()
  selectedClientOptionId.value = `client:${client.id}`
  return client.id
}

async function loadFeeds() {
  feedRows.value = []
  feedsError.value = ''
  feedPreview.value = null
  generatedFeedUrl.value = ''
  generatedFeedMeta.value = null

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

async function previewFeed(feed: FeedSummary) {
  if (!selectedClientId.value) return

  previewPendingFeedId.value = feed.id
  generatedFeedUrl.value = ''
  generatedFeedMeta.value = null
  try {
    const result = await $fetch<{ ok: boolean, preview: { total: number, items: VehicleSummary[] } }>(
      `/api/admin/dealer-feeds/${selectedClientId.value}/${feed.id}/preview`,
      { query: { platform: feed.platform, limit: 20, offset: 0, search: feedPreviewSearch.value.trim() || undefined } }
    )
    feedPreview.value = {
      feed,
      total: result.preview.total,
      items: result.preview.items || []
    }
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to preview feed',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    previewPendingFeedId.value = ''
  }
}

async function copyGeneratedUrl(url: string) {
  if (!url) return

  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(url)
      toast.add({ title: 'Feed URL copied', color: 'success' })
      return
    }

    if (typeof document !== 'undefined') {
      const textarea = document.createElement('textarea')
      textarea.value = url
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'fixed'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      const copied = document.execCommand('copy')
      document.body.removeChild(textarea)
      if (copied) {
        toast.add({ title: 'Feed URL copied', color: 'success' })
        return
      }
    }
  } catch {
    // Fall through to visible URL panel.
  }

  await nextTick()
  generatedFeedUrlInput.value?.focus()
  generatedFeedUrlInput.value?.select()
  toast.add({
    title: 'Feed URL ready',
    description: 'Clipboard access was blocked. The URL field is selected so you can copy it manually.',
    color: 'warning'
  })
}

async function shareFeed(feed: FeedSummary) {
  if (!selectedClientId.value) return

  generatingFeedKey.value = feed.id
  try {
    const result = await $fetch<{ ok: boolean, feedUrl: string, url?: string }>(
      `/api/admin/dealer-feeds/${selectedClientId.value}/${feed.id}/url`
    )
    const url = result.feedUrl || result.url || ''
    generatedFeedUrl.value = url
    generatedFeedMeta.value = { feedName: feed.name || feed.id, itemCount: 0 }
    await copyGeneratedUrl(url)
  } catch (error: unknown) {
    toast.add({
      title: 'Failed to prepare feed URL',
      description: errorMessage(error, 'Please try again'),
      color: 'error'
    })
  } finally {
    generatingFeedKey.value = ''
  }
}

async function saveMapping() {
  if (!selectedClientOption.value) {
    toast.add({ title: 'Select a client first', color: 'error' })
    return
  }

  savingLink.value = true
  try {
    const clientId = await ensureAgencyClientForSelection()
    await $fetch('/api/admin/dealer-feed-links', {
      method: 'POST',
      body: {
        clientId,
        externalOrgId: mappingForm.externalOrgId.trim() || undefined,
        sellerRefs: parseList(mappingForm.sellerRefsText),
        defaultFeedIds: parseList(mappingForm.defaultFeedIdsText),
        platforms: selectedClientOption.value.socialPlatforms
      }
    })
    toast.add({ title: 'Feed workspace ready', color: 'success' })
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
        platform: feedForm.platform,
        platformSettings: feedForm.platform === 'google' && feedForm.storeCode.trim()
          ? { store_code: feedForm.storeCode.trim() }
          : {}
      }
    })
    toast.add({ title: 'Feed create request sent', color: 'success' })
    feedForm.name = ''
    feedForm.storeCode = ''
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
  await refreshClientOptions()
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
  { accessorKey: 'externalOrgId', header: 'Feed workspace' },
  { accessorKey: 'sellerRefs', header: 'Seller refs' },
  { accessorKey: 'defaultFeedIds', header: 'Default feeds' },
  { accessorKey: 'updatedAt', header: 'Updated' },
  { id: 'actions', header: '' }
]

const feedColumns = [
  { accessorKey: 'name', header: 'Feed' },
  { accessorKey: 'platform', header: 'Platform' },
  { accessorKey: 'id', header: 'Feed ID' },
  { accessorKey: 'isActive', header: 'Status' },
  { id: 'actions', header: '' }
]

watch(clientRows, (rows) => {
  if (!selectedClientOptionId.value && rows.length > 0) {
    selectedClientOptionId.value = rows[0].id
  }
}, { immediate: true })

watch([selectedClientOptionId, links], async () => {
  populateMappingForm()
  await loadFeeds()
}, { immediate: true })
</script>

<template>
  <UDashboardPanel id="dealer-feeds">
    <template #header>
      <UDashboardNavbar
        title="Dealer Feeds"
        description="Set up dealership inventory feeds for Google and Facebook catalogs."
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

    <div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
      <div class="space-y-6 pb-8">
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
                Feed setup
              </h2>
              <p class="mt-1 text-sm text-muted">
                Select a dealership, confirm its inventory seller refs, then create feeds.
              </p>
            </div>

            <div class="space-y-4 p-5">
              <UFormField label="Client">
                <USelectMenu
                  v-model="selectedClientOptionId"
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

              <div class="rounded-lg border border-default bg-elevated/40 px-3 py-3">
                <div class="flex items-start gap-3">
                  <UIcon
                    :name="selectedLink ? 'i-lucide-check-circle-2' : 'i-lucide-wand-sparkles'"
                    :class="selectedLink ? 'text-success' : 'text-primary'"
                    class="mt-0.5 size-5 shrink-0"
                  />
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-highlighted">
                      {{ selectedLink ? 'Feed workspace connected' : 'Feed workspace will be created automatically' }}
                    </p>
                    <p class="mt-1 text-sm text-muted">
                      {{ selectedLink ? 'This client is linked to social-dashboard and can list or create catalog feeds.' : 'No social-dashboard org ID is needed. Saving will create or reuse the matching workspace in social-dashboard.' }}
                    </p>
                    <p
                      v-if="selectedLink"
                      class="mt-2 break-all font-mono text-xs text-muted"
                    >
                      {{ selectedLink.externalOrgId }}
                    </p>
                  </div>
                </div>
              </div>

              <UFormField label="Inventory seller refs">
                <UTextarea
                  v-model="mappingForm.sellerRefsText"
                  placeholder="Auto-filled from the dealership name"
                  :rows="3"
                  class="w-full"
                />
                <template #help>
                  Used to keep inventory scoped to this dealership. Edit only if the inventory slug differs.
                </template>
              </UFormField>

              <UFormField label="Existing feed IDs">
                <UTextarea
                  v-model="mappingForm.defaultFeedIdsText"
                  placeholder="Optional existing feed IDs"
                  :rows="2"
                  class="w-full"
                />
                <template #help>
                  Optional. Leave blank when setting up a new dealership feed workspace.
                </template>
              </UFormField>

              <div class="flex flex-wrap items-center gap-2">
                <UButton
                  icon="i-lucide-save"
                  color="primary"
                  :loading="savingLink"
                  @click="saveMapping"
                >
                  {{ selectedLink ? 'Update setup' : 'Set up feeds' }}
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
                      Active dealership feed workspaces.
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
                description="Select a client and set up feeds to make its workspace visible here."
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
                    @click="selectedClientOptionId = `client:${row.original.clientId}`"
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
                    @click="selectedClientOptionId = `client:${row.original.clientId}`"
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
                  description="Set up feeds first, then this panel can list and create Google or Facebook catalog feeds."
                />
              </div>

              <template v-else>
                <div class="grid grid-cols-1 gap-3 border-b border-default p-5 lg:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
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
                  <UFormField label="Store code">
                    <UInput
                      v-model="feedForm.storeCode"
                      placeholder="Google only"
                      :disabled="feedForm.platform !== 'google'"
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

                  <template #actions-cell="{ row }">
                    <div class="flex justify-end gap-1">
                      <UTooltip text="Preview vehicles">
                        <UButton
                          icon="i-lucide-eye"
                          variant="ghost"
                          color="neutral"
                          size="xs"
                          :loading="previewPendingFeedId === row.original.id"
                          @click="previewFeed(row.original)"
                        />
                      </UTooltip>
                      <UTooltip text="Copy live feed URL">
                        <UButton
                          icon="i-lucide-link"
                          variant="ghost"
                          color="neutral"
                          size="xs"
                          aria-label="Get live feed URL"
                          :loading="generatingFeedKey === row.original.id"
                          @click="shareFeed(row.original)"
                        />
                      </UTooltip>
                    </div>
                  </template>
                </UTable>

                <div
                  v-if="generatedFeedUrl"
                  class="border-t border-default p-5"
                >
                  <div class="rounded-lg border border-default bg-elevated/40 p-4">
                    <div class="flex flex-col gap-3">
                      <div class="min-w-0">
                        <p class="text-sm font-medium text-highlighted">
                          Live XML feed URL
                        </p>
                        <p class="mt-1 text-sm text-muted">
                          {{ generatedFeedMeta?.feedName }} · copy this URL into Google, Meta, or a browser preview.
                        </p>
                      </div>
                      <div class="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                        <input
                          ref="generatedFeedUrlInput"
                          :value="generatedFeedUrl"
                          readonly
                          aria-label="Live XML feed URL"
                          class="min-h-10 w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-xs text-highlighted outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                          @focus="event => (event.target as HTMLInputElement).select()"
                          @click="event => (event.target as HTMLInputElement).select()"
                        >
                        <UButton
                          icon="i-lucide-copy"
                          color="neutral"
                          variant="outline"
                          class="justify-center"
                          @click="copyGeneratedUrl(generatedFeedUrl)"
                        >
                          Copy
                        </UButton>
                        <UButton
                          icon="i-lucide-external-link"
                          color="neutral"
                          variant="ghost"
                          class="justify-center"
                          :to="generatedFeedUrl"
                          target="_blank"
                        >
                          Open
                        </UButton>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-if="feedPreview"
                  class="border-t border-default p-5"
                >
                  <div class="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h3 class="text-sm font-semibold text-highlighted">
                        Preview: {{ feedPreview.feed.name || feedPreview.feed.id }}
                      </h3>
                      <p class="text-sm text-muted">
                        Showing {{ feedPreview.items.length }} of {{ feedPreview.total }} vehicles.
                      </p>
                    </div>
                    <UBadge color="neutral" variant="subtle">
                      {{ feedPreview.feed.platform === 'google' ? 'Google' : 'Facebook' }}
                    </UBadge>
                  </div>

                  <div class="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                    <UInput
                      v-model="feedPreviewSearch"
                      icon="i-lucide-search"
                      placeholder="Search title, condition, stock number, kilometres"
                      class="w-full"
                      @keyup.enter="previewFeed(feedPreview.feed)"
                    />
                    <UButton
                      icon="i-lucide-search"
                      color="neutral"
                      variant="outline"
                      :loading="previewPendingFeedId === feedPreview.feed.id"
                      @click="previewFeed(feedPreview.feed)"
                    >
                      Search
                    </UButton>
                  </div>

                  <div
                    v-if="feedPreview.items.length === 0"
                    class="rounded-lg border border-default bg-elevated/40 px-4 py-6 text-center text-sm text-muted"
                  >
                    No vehicles returned for this feed preview.
                  </div>

                  <div
                    v-else
                    class="max-h-[min(42rem,calc(100vh-18rem))] overflow-y-auto pr-1"
                  >
                    <div class="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
                      <article
                        v-for="vehicle in feedPreview.items"
                        :key="vehicle.id"
                        class="overflow-hidden rounded-lg border border-default bg-elevated/40"
                      >
                        <div class="flex gap-3 p-3">
                          <div class="h-20 w-28 shrink-0 overflow-hidden rounded-md bg-muted">
                            <img
                              v-if="vehicle.image"
                              :src="vehicle.image"
                              :alt="[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')"
                              class="h-full w-full object-cover"
                            >
                            <div
                              v-else
                              class="flex h-full w-full items-center justify-center"
                            >
                              <UIcon name="i-lucide-car" class="size-6 text-muted" />
                            </div>
                          </div>
                          <div class="min-w-0">
                            <p class="truncate text-sm font-medium text-highlighted">
                              {{ [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') || vehicle.id }}
                            </p>
                            <p class="mt-1 text-xs text-muted">
                              {{ vehicle.stockNumber || 'No stock number' }}
                            </p>
                            <div class="mt-2 flex flex-wrap items-center gap-2">
                              <p class="text-sm font-medium text-highlighted">
                                {{ vehicle.price == null ? 'Price unavailable' : new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(vehicle.price) }}
                              </p>
                              <UBadge
                                v-if="vehicle.condition"
                                color="neutral"
                                variant="subtle"
                                size="xs"
                              >
                                {{ vehicle.condition }}
                              </UBadge>
                            </div>
                            <UButton
                              v-if="vehicle.url"
                              icon="i-lucide-external-link"
                              variant="link"
                              color="primary"
                              size="xs"
                              class="mt-1 px-0"
                              :to="vehicle.url"
                              target="_blank"
                            >
                              Listing
                            </UButton>
                          </div>
                        </div>
                      </article>
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </section>
        </div>
      </div>
    </div>
  </UDashboardPanel>
</template>
