<script setup lang="ts">
type MetaConnection = {
  id: string
  clientId: string | null
  accountName: string
  accountId: string
  status: string
}

type MetaCatalogReadiness = {
  state: 'USER_GRANT_REQUIRED' | 'APP_REVIEW_REQUIRED' | 'BUSINESS_ROLE_REQUIRED' | 'CATALOG_SETUP_REQUIRED' | 'FEED_SETUP_REQUIRED' | 'READY'
  missingPermissions?: string[]
  business?: { id: string, name: string }
  catalogs?: Array<{ id: string, name: string, vertical?: string, ownership: 'owned' | 'client' }>
  sourceFeeds?: Array<{ id: string, name: string, platform: 'facebook' }>
  bindings?: Array<{
    sourceFeedId: string
    sourceFeedUrl?: string
    catalogId: string
    productFeedId: string
    latestUploadId?: string
    lastVerifiedAt?: string
    state: string
  }>
}

const props = defineProps<{ clientId: string, clientName?: string }>()
const apiFetch = $fetch as <T>(url: string, options?: Record<string, unknown>) => Promise<T>
const toast = useToast()
const accounts = ref<MetaConnection[]>([])
const selectedConnectionId = ref<string>()
const selectedCatalogId = ref<string>()
const selectedSourceFeedId = ref<string>()
const readiness = ref<MetaCatalogReadiness>()
const loading = ref(false)
const attaching = ref(false)
const errorMessage = ref('')

const clientAccounts = computed(() => accounts.value.filter(account => account.clientId === props.clientId))
const accountItems = computed(() => clientAccounts.value.map(account => ({
  label: `${account.accountName} · ${account.accountId}`,
  value: account.id
})))
const catalogItems = computed(() => (readiness.value?.catalogs || []).map(catalog => ({
  label: `${catalog.name} · ${catalog.ownership}`,
  value: catalog.id
})))
const sourceFeedItems = computed(() => (readiness.value?.sourceFeeds || []).map(feed => ({
  label: feed.name,
  value: feed.id
})))
const stateLabel = computed(() => ({
  USER_GRANT_REQUIRED: 'Permission required',
  APP_REVIEW_REQUIRED: 'Meta app review required',
  BUSINESS_ROLE_REQUIRED: 'Business role required',
  CATALOG_SETUP_REQUIRED: 'Catalogue required',
  FEED_SETUP_REQUIRED: 'Feed setup required',
  READY: 'Ready'
}[readiness.value?.state || ''] || 'Not checked'))

function apiErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback
  const data = 'data' in error && error.data && typeof error.data === 'object'
    ? error.data
    : null
  return data && 'statusMessage' in data && typeof data.statusMessage === 'string'
    ? data.statusMessage
    : fallback
}

async function loadAccounts() {
  accounts.value = await apiFetch<MetaConnection[]>('/api/agency/social/meta/accounts')
  if (!clientAccounts.value.some(account => account.id === selectedConnectionId.value)) {
    selectedConnectionId.value = clientAccounts.value[0]?.id
  }
}

async function checkReadiness() {
  if (!props.clientId || !selectedConnectionId.value) {
    readiness.value = undefined
    return
  }
  loading.value = true
  errorMessage.value = ''
  try {
    readiness.value = await apiFetch<MetaCatalogReadiness>('/api/admin/meta-catalogs/readiness', {
      query: { clientId: props.clientId, connectionId: selectedConnectionId.value }
    })
    selectedCatalogId.value ||= readiness.value.catalogs?.[0]?.id
    selectedSourceFeedId.value ||= readiness.value.sourceFeeds?.find(feed =>
      !readiness.value?.bindings?.some(binding => binding.sourceFeedId === feed.id && binding.state === 'READY')
    )?.id || readiness.value.sourceFeeds?.[0]?.id
  } catch (error: unknown) {
    errorMessage.value = apiErrorMessage(error, 'Meta catalogue readiness could not be checked.')
  } finally {
    loading.value = false
  }
}

const { state: connectState, connectWithIntent: connectMetaWithIntent } = useMetaConnect({
  onConnected: async () => {
    await loadAccounts()
    await checkReadiness()
  }
})

async function grantCatalogAccess() {
  await connectMetaWithIntent('catalog_management')
}

async function attachFeed() {
  if (!selectedConnectionId.value || !selectedCatalogId.value || !selectedSourceFeedId.value) return
  attaching.value = true
  try {
    await apiFetch('/api/admin/meta-catalogs/feeds', {
      method: 'POST',
      body: {
        clientId: props.clientId,
        connectionId: selectedConnectionId.value,
        catalogId: selectedCatalogId.value,
        sourceFeedId: selectedSourceFeedId.value
      }
    })
    toast.add({ title: 'Meta feed attached', description: 'The scheduled feed was verified and an import was requested.', color: 'success' })
    await checkReadiness()
  } catch (error: unknown) {
    toast.add({ title: 'Meta feed not attached', description: apiErrorMessage(error, 'Provider verification failed.'), color: 'error' })
  } finally {
    attaching.value = false
  }
}

watch(() => props.clientId, async () => {
  selectedConnectionId.value = undefined
  selectedCatalogId.value = undefined
  selectedSourceFeedId.value = undefined
  readiness.value = undefined
  if (props.clientId) {
    await loadAccounts()
    await checkReadiness()
  }
}, { immediate: true })

watch(selectedConnectionId, () => {
  selectedCatalogId.value = undefined
  selectedSourceFeedId.value = undefined
  readiness.value = undefined
  void checkReadiness()
})
</script>

<template>
  <section class="rounded-lg border border-default bg-default">
    <div class="flex flex-col gap-3 border-b border-default px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-boxes" class="size-5 text-primary" />
          <h2 class="text-base font-semibold text-highlighted">
            Meta catalogue delivery
          </h2>
          <UBadge :color="readiness?.state === 'READY' ? 'success' : 'warning'" variant="subtle" size="xs">
            {{ stateLabel }}
          </UBadge>
        </div>
        <p class="mt-1 text-sm text-muted">
          Use the existing XeroFlow connection to verify access and attach scheduled vehicle feeds.
        </p>
      </div>
      <UButton
        label="Check access"
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="loading"
        :disabled="!selectedConnectionId"
        @click="checkReadiness"
      />
    </div>

    <div class="space-y-4 p-5">
      <UAlert
        v-if="!clientId"
        color="neutral"
        variant="subtle"
        title="Select a client"
        description="Choose a dealership above to inspect its Meta catalogue delivery."
      />
      <UAlert
        v-else-if="!clientAccounts.length"
        color="warning"
        variant="subtle"
        title="Map a Meta ad account"
        description="This client does not yet have a mapped Meta connection. Map the account in Social Spend, then return here."
      />

      <template v-else>
        <UFormField label="Meta ad account">
          <USelectMenu
            v-model="selectedConnectionId"
            :items="accountItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          title="Readiness check failed"
          :description="errorMessage"
        />
        <UAlert
          v-else-if="readiness?.state === 'USER_GRANT_REQUIRED'"
          color="warning"
          variant="subtle"
          title="One-time Meta permission grant required"
          :description="`Grant ${readiness.missingPermissions?.join(' and ')} to the existing connection. Your account mapping and feed setup stay in place.`"
        >
          <template #actions>
            <UButton label="Grant catalogue access" :loading="connectState.status === 'loading'" @click="grantCatalogAccess" />
          </template>
        </UAlert>
        <UAlert
          v-else-if="readiness?.state === 'APP_REVIEW_REQUIRED'"
          color="error"
          variant="subtle"
          title="Meta app advanced access required"
          description="The ad connection is healthy, but Meta is refusing catalogue APIs until the XeroFlow Meta app receives advanced catalog_management access. Reconnecting the account will not fix this state."
        />
        <UAlert
          v-else-if="readiness?.state === 'BUSINESS_ROLE_REQUIRED'"
          color="warning"
          variant="subtle"
          title="Meta business role required"
          description="The connected user must be an administrator of the business that owns or shares this vehicle catalogue."
        />
        <UAlert
          v-else-if="readiness?.state === 'CATALOG_SETUP_REQUIRED'"
          color="warning"
          variant="subtle"
          title="No accessible vehicle catalogue"
          description="Create the first catalogue in Meta Business Manager or share an existing vehicle catalogue with this business. XeroFlow will discover it on the next check."
        />

        <div v-else-if="readiness && readiness.state !== 'READY'" class="@container">
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Meta catalogue">
              <USelectMenu
                v-model="selectedCatalogId"
                :items="catalogItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
            <UFormField label="XeroFlow vehicle feed">
              <USelectMenu
                v-model="selectedSourceFeedId"
                :items="sourceFeedItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
          <div class="mt-4 flex justify-end">
            <UButton
              label="Attach and import feed"
              icon="i-lucide-upload-cloud"
              :loading="attaching"
              :disabled="!selectedCatalogId || !selectedSourceFeedId"
              @click="attachFeed"
            />
          </div>
        </div>

        <div v-else-if="readiness?.state === 'READY'" class="space-y-3">
          <UAlert
            color="success"
            variant="subtle"
            title="Meta catalogue feeds verified"
            :description="`${readiness.bindings?.length || 0} feed binding(s) have provider readback evidence in XeroFlow.`"
          />
          <div
            v-for="binding in readiness.bindings"
            :key="binding.sourceFeedId"
            class="rounded-md border border-default bg-elevated/40 p-3 text-sm"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="font-medium text-highlighted">
                {{ readiness.sourceFeeds?.find(feed => feed.id === binding.sourceFeedId)?.name || binding.sourceFeedId }}
              </p>
              <UBadge color="success" variant="subtle" size="xs">
                Provider verified
              </UBadge>
            </div>
            <dl class="mt-2 grid grid-cols-1 gap-2 text-xs text-muted sm:grid-cols-2">
              <div>
                <dt class="font-medium text-default">
                  Meta catalogue
                </dt><dd>{{ binding.catalogId }}</dd>
              </div>
              <div>
                <dt class="font-medium text-default">
                  Product feed
                </dt><dd>{{ binding.productFeedId }}</dd>
              </div>
              <div>
                <dt class="font-medium text-default">
                  Latest upload
                </dt><dd>{{ binding.latestUploadId || 'Recorded' }}</dd>
              </div>
              <div>
                <dt class="font-medium text-default">
                  Verified
                </dt><dd>{{ binding.lastVerifiedAt || 'Recorded' }}</dd>
              </div>
            </dl>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>
