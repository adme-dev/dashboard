<script setup lang="ts">
// This authenticated management surface is intentionally client-only.
const props = withDefaults(defineProps<{
  clientId: string
  apiBase?: string
  canManage?: boolean
}>(), {
  apiBase: '/api/crm/data-sources',
  canManage: true
})
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> }
) => Promise<T>

type Source = {
  id: string
  source_type: string
  display_name: string
  status: string
  last_synced_at: string | null
  last_sync_status: string | null
  last_sync_error: string | null
  active_product_count: number
}

const data = ref<{
  sources: Source[]
  dealerFeed: {
    connected: boolean
    providerId?: string
    sellerRefs?: string[]
    catalogSourceId: string | null
  }
}>({ sources: [], dealerFeed: { connected: false, catalogSourceId: null } })
const loading = ref(false)
const saving = ref(false)
const syncingId = ref('')
const connector = ref<'feed' | 'supabase'>('feed')
const showForm = ref(false)
const form = reactive({
  display_name: '',
  feed_url: '',
  feed_format: 'json',
  item_path: '',
  project_url: '',
  schema: 'public',
  table: '',
  api_key: ''
})

const sourceIcons: Record<string, string> = {
  dealer_feed: 'i-lucide-car-front',
  supabase: 'i-simple-icons-supabase',
  feed: 'i-lucide-rss'
}

const isPortalDataSources = computed(() =>
  props.apiBase === '/api/client-portal/crm/data-sources'
)

async function refresh() {
  loading.value = true
  try {
    data.value = await apiFetch(props.apiBase, { query: { client_id: props.clientId } })
  } finally {
    loading.value = false
  }
}

watch(() => props.clientId, () => void refresh(), { immediate: true })

async function connectDealerFeed() {
  saving.value = true
  try {
    const result = await apiFetch<{ source: Source }>(props.apiBase, {
      method: 'POST',
      body: { client_id: props.clientId, connector_type: 'dealer_feed', display_name: 'Dealer Feed' }
    })
    await refresh()
    toast.add({ title: 'Dealer Feed connected to CRM', color: 'success' })
    await sync(result.source.id)
  } catch (error: any) {
    toast.add({ title: 'Could not connect Dealer Feed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function saveConnector() {
  saving.value = true
  try {
    await apiFetch(props.apiBase, {
      method: 'POST',
      body: connector.value === 'supabase'
        ? {
            client_id: props.clientId,
            connector_type: 'supabase',
            display_name: form.display_name || 'Supabase',
            project_url: form.project_url,
            schema: form.schema,
            table: form.table,
            api_key: form.api_key
          }
        : {
            client_id: props.clientId,
            connector_type: 'feed',
            display_name: form.display_name || 'Product Feed',
            feed_url: form.feed_url,
            feed_format: form.feed_format,
            item_path: form.item_path || undefined
          }
    })
    showForm.value = false
    form.api_key = ''
    await refresh()
    toast.add({ title: 'Data source connected', color: 'success' })
  } catch (error: any) {
    toast.add({ title: 'Could not connect data source', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

async function sync(sourceId: string) {
  syncingId.value = sourceId
  try {
    const result = await apiFetch<{ upserted: number, removed: number }>(`${props.apiBase}/${sourceId}/sync`, {
      method: 'POST',
      body: { client_id: props.clientId }
    })
    await refresh()
    toast.add({
      title: 'Catalog synchronized',
      description: `${result.upserted} products updated, ${result.removed} retired.`,
      color: 'success'
    })
  } catch (error: any) {
    await refresh()
    toast.add({ title: 'Sync failed', description: error?.data?.statusMessage || error?.message, color: 'error' })
  } finally {
    syncingId.value = ''
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">Data Sources</h2>
        <p class="mt-1 max-w-2xl text-sm text-muted">
          Connect inventory and product systems once. CRM enquiries then match against VIN, stock ID, SKU, provider ID and listing URL.
        </p>
      </div>
      <UButton v-if="canManage" icon="i-lucide-plus" @click="showForm = !showForm">
        Add data source
      </UButton>
    </div>

    <UAlert
      v-if="!canManage"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock-keyhole"
      title="Connection management is restricted"
      description="A primary contact or client administrator can connect and synchronize inventory sources."
    />

    <div v-if="showForm && canManage" class="rounded-xl border border-default bg-elevated/30 p-5">
      <div class="mb-5 flex gap-2">
        <UButton
          label="JSON / CSV feed"
          icon="i-lucide-rss"
          :variant="connector === 'feed' ? 'solid' : 'soft'"
          @click="connector = 'feed'"
        />
        <UButton
          label="Supabase"
          icon="i-simple-icons-supabase"
          :variant="connector === 'supabase' ? 'solid' : 'soft'"
          @click="connector = 'supabase'"
        />
      </div>
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Connection name" class="md:col-span-2">
          <UInput v-model="form.display_name" class="w-full" :placeholder="connector === 'supabase' ? 'Vehicle inventory database' : 'Primary product feed'" />
        </UFormField>
        <template v-if="connector === 'feed'">
          <UFormField label="HTTPS feed URL" class="md:col-span-2">
            <UInput v-model="form.feed_url" class="w-full" placeholder="https://example.com/inventory.json" />
          </UFormField>
          <UFormField label="Format">
            <USelect v-model="form.feed_format" class="w-full" :items="[{ label: 'JSON', value: 'json' }, { label: 'CSV', value: 'csv' }]" />
          </UFormField>
          <UFormField label="JSON item path" hint="Optional">
            <UInput v-model="form.item_path" class="w-full" placeholder="data.vehicles" />
          </UFormField>
        </template>
        <template v-else>
          <UFormField label="Project URL" class="md:col-span-2">
            <UInput v-model="form.project_url" class="w-full" placeholder="https://project-ref.supabase.co" />
          </UFormField>
          <UFormField label="Schema">
            <UInput v-model="form.schema" class="w-full" placeholder="public" />
          </UFormField>
          <UFormField label="Table or view">
            <UInput v-model="form.table" class="w-full" placeholder="vehicles" />
          </UFormField>
          <UFormField label="Read-only API key" class="md:col-span-2">
            <UInput v-model="form.api_key" type="password" class="w-full" autocomplete="new-password" />
          </UFormField>
        </template>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showForm = false" />
        <UButton label="Connect" icon="i-lucide-plug" :loading="saving" @click="saveConnector" />
      </div>
    </div>

    <CrmInboundEmailOnboarding
      v-if="isPortalDataSources"
      :key="`inbound-email-${clientId}`"
      api-base="/api/client-portal/crm/email-routes"
      :can-manage="canManage"
    />
    <CrmInboundEmailOnboarding
      v-else
      :key="`inbound-email-${clientId}`"
      :client-id="clientId"
      api-base="/api/crm/email-routes"
      :can-manage="canManage"
    />

    <div class="grid gap-4 xl:grid-cols-3">
      <article class="rounded-xl border border-default bg-elevated/20 p-5">
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <div class="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon name="i-lucide-car-front" class="size-5" />
            </div>
            <div>
              <h3 class="font-medium">Dealer Feed</h3>
              <p class="text-xs text-muted">Campaign vehicle inventory</p>
            </div>
          </div>
          <UBadge :color="data.dealerFeed.connected ? 'success' : 'neutral'" variant="subtle">
            {{ data.dealerFeed.connected ? 'Available' : 'Not linked' }}
          </UBadge>
        </div>
        <p class="mt-4 text-sm text-muted">
          Reuses the existing seller-scoped inventory connection used by Google and Meta campaign feeds.
        </p>
        <UButton
          v-if="canManage && data.dealerFeed.connected && !data.dealerFeed.catalogSourceId"
          class="mt-4 w-full justify-center"
          label="Use in CRM"
          icon="i-lucide-link"
          :loading="saving"
          @click="connectDealerFeed"
        />
        <UButton
          v-else-if="canManage && data.dealerFeed.catalogSourceId"
          class="mt-4 w-full justify-center"
          label="Sync inventory"
          icon="i-lucide-refresh-cw"
          variant="soft"
          :loading="syncingId === data.dealerFeed.catalogSourceId"
          @click="sync(data.dealerFeed.catalogSourceId)"
        />
      </article>

      <article
        v-for="source in data.sources.filter(item => item.source_type !== 'dealer_feed')"
        :key="source.id"
        class="rounded-xl border border-default bg-elevated/20 p-5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex min-w-0 items-center gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <UIcon :name="sourceIcons[source.source_type] || 'i-lucide-database'" class="size-5" />
            </div>
            <div class="min-w-0">
              <h3 class="truncate font-medium">{{ source.display_name }}</h3>
              <p class="text-xs capitalize text-muted">{{ source.source_type.replace('_', ' ') }}</p>
            </div>
          </div>
          <UBadge :color="source.status === 'active' ? 'success' : source.status === 'error' ? 'error' : 'neutral'" variant="subtle">
            {{ source.status }}
          </UBadge>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-xs text-muted">Active products</p>
            <p class="mt-0.5 font-medium">{{ source.active_product_count || 0 }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Last sync</p>
            <p class="mt-0.5 font-medium">{{ source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : 'Never' }}</p>
          </div>
        </div>
        <p v-if="source.last_sync_error" class="mt-3 line-clamp-2 text-xs text-error">
          {{ source.last_sync_error }}
        </p>
        <UButton
          v-if="canManage"
          class="mt-4 w-full justify-center"
          label="Sync now"
          icon="i-lucide-refresh-cw"
          variant="soft"
          :loading="syncingId === source.id"
          @click="sync(source.id)"
        />
      </article>

      <article v-if="!loading && !data.sources.length && !data.dealerFeed.connected" class="rounded-xl border border-dashed border-default p-8 text-center xl:col-span-3">
        <UIcon name="i-lucide-database-zap" class="mx-auto size-7 text-muted" />
        <p class="mt-3 text-sm font-medium">No data sources connected</p>
        <p class="mt-1 text-xs text-muted">Connect a feed or Supabase database to match enquiries with products.</p>
      </article>
    </div>
  </div>
</template>
