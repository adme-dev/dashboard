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
  options?: {
    method?: string
    body?: unknown
    query?: Record<string, unknown>
    headers?: Record<string, string>
  }
) => Promise<T>
const route = useRoute()

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
const listingTypeOptions = [
  { label: 'New', value: 'New' },
  { label: 'Demo', value: 'Demo' },
  { label: 'Used', value: 'Used' }
]
const requiredFieldOptions = [
  { label: 'Source product ID', value: 'source_product_id' },
  { label: 'Stock ID', value: 'stock_id' },
  { label: 'VIN', value: 'vin' },
  { label: 'Vehicle name', value: 'name' },
  { label: 'Price', value: 'price' },
  { label: 'Vehicle URL', value: 'product_url' },
  { label: 'Primary image', value: 'primary_image_url' },
  { label: 'Colour', value: 'color' },
  { label: 'Merchant offer ID', value: 'merchant_offer_id' }
]
const form = reactive({
  display_name: '',
  feed_url: '',
  feed_format: 'json',
  item_path: '',
  project_url: '',
  schema: 'public',
  table: 'vehicles',
  seller_ids_text: '',
  makes_text: '',
  listing_types: ['New'],
  product_url_template: '',
  required_fields: [
    'source_product_id',
    'stock_id',
    'vin',
    'name',
    'price',
    'product_url',
    'primary_image_url',
    'color',
    'merchant_offer_id'
  ],
  source_product_id_column: 'id',
  stock_id_column: 'stock_number',
  vin_column: 'vin',
  name_column: 'title',
  seller_id_column: 'seller_id',
  sale_status_column: 'sale_status',
  listing_type_column: 'listing_type',
  make_column: 'make',
  price_column: 'price',
  product_url_column: 'url',
  primary_image_url_column: 'image_url',
  color_column: 'colour',
  merchant_offer_id_column: 'merchant_offer_id',
  api_key: ''
})

onMounted(() => {
  if (route.query.connector === 'supabase') connector.value = 'supabase'
  if (route.query.open === '1') showForm.value = true
})

function mutationHeaders() {
  return { 'Idempotency-Key': crypto.randomUUID() }
}

function parseLines(value: string): string[] {
  return [...new Set(value.split(/[\n,]/).map(item => item.trim()).filter(Boolean))]
}

function errorMessage(error: unknown): string | undefined {
  const candidate = error as { data?: { statusMessage?: string }, message?: string }
  return candidate?.data?.statusMessage || candidate?.message
}

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
      headers: mutationHeaders(),
      body: { client_id: props.clientId, connector_type: 'dealer_feed', display_name: 'Dealer Feed' }
    })
    await refresh()
    toast.add({ title: 'Dealer Feed connected to CRM', color: 'success' })
    await sync(result.source.id)
  } catch (error: unknown) {
    toast.add({ title: 'Could not connect Dealer Feed', description: errorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function saveConnector() {
  saving.value = true
  try {
    await apiFetch(props.apiBase, {
      method: 'POST',
      headers: mutationHeaders(),
      body: connector.value === 'supabase'
        ? {
            client_id: props.clientId,
            connector_type: 'supabase',
            display_name: form.display_name || 'Supabase',
            project_url: form.project_url,
            schema: form.schema,
            table: form.table,
            selection: {
              seller_ids: parseLines(form.seller_ids_text),
              sale_statuses: ['For Sale'],
              makes: parseLines(form.makes_text),
              listing_types: form.listing_types,
              required_fields: form.required_fields,
              product_url_template: form.product_url_template || undefined
            },
            field_mapping: {
              source_product_id: form.source_product_id_column,
              stock_id: form.stock_id_column,
              vin: form.vin_column,
              name: form.name_column,
              seller_id: form.seller_id_column,
              sale_status: form.sale_status_column,
              listing_type: form.listing_type_column,
              make: form.make_column,
              price: form.price_column,
              product_url: form.product_url_column,
              primary_image_url: form.primary_image_url_column,
              color: form.color_column,
              merchant_offer_id: form.merchant_offer_id_column
            },
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
  } catch (error: unknown) {
    toast.add({ title: 'Could not connect data source', description: errorMessage(error), color: 'error' })
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
  } catch (error: unknown) {
    await refresh()
    toast.add({ title: 'Sync failed', description: errorMessage(error), color: 'error' })
  } finally {
    syncingId.value = ''
  }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="text-lg font-semibold">
          Data Sources
        </h2>
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

    <div v-if="showForm && canManage" class="@container rounded-xl border border-default bg-elevated/30 p-5">
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
      <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
        <UFormField label="Connection name" class="@lg:col-span-2">
          <UInput v-model="form.display_name" class="w-full" :placeholder="connector === 'supabase' ? 'Vehicle inventory database' : 'Primary product feed'" />
        </UFormField>
        <template v-if="connector === 'feed'">
          <UFormField label="HTTPS feed URL" class="@lg:col-span-2">
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
          <UFormField label="Project URL" class="@lg:col-span-2">
            <UInput v-model="form.project_url" class="w-full" placeholder="https://project-ref.supabase.co" />
          </UFormField>
          <UFormField label="Schema">
            <UInput v-model="form.schema" class="w-full" placeholder="public" />
          </UFormField>
          <UFormField label="Table or view">
            <UInput v-model="form.table" class="w-full" placeholder="vehicles" />
          </UFormField>
          <div class="@lg:col-span-2">
            <h3 class="text-sm font-semibold">
              Inventory eligibility
            </h3>
            <p class="mt-1 text-sm text-muted">
              Scope this connection to the client inventory represented by this campaign.
            </p>
          </div>
          <UAlert
            class="@lg:col-span-2"
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-check"
            title="Only vehicles marked exactly For Sale are eligible"
            description="Sold, withdrawn and other inventory states are excluded at synchronization and cannot be published to advertising platforms."
          />
          <UFormField label="Seller IDs" description="Required. Enter the source seller/dealer IDs for this client, separated by commas or new lines." class="@lg:col-span-2">
            <UTextarea
              v-model="form.seller_ids_text"
              class="w-full"
              :rows="3"
              placeholder="northern-isuzu-ute"
            />
          </UFormField>
          <UFormField label="Eligible listing types">
            <USelectMenu
              v-model="form.listing_types"
              class="w-full"
              :items="listingTypeOptions"
              value-key="value"
              label-key="label"
              multiple
            />
          </UFormField>
          <UFormField label="Makes" description="Optional. Leave blank to include every make for the selected seller.">
            <UTextarea
              v-model="form.makes_text"
              class="w-full"
              :rows="3"
              placeholder="Isuzu UTE"
            />
          </UFormField>
          <UFormField label="Required Merchant fields" description="Rows missing any selected field are excluded before publishing." class="@lg:col-span-2">
            <USelectMenu
              v-model="form.required_fields"
              class="w-full"
              :items="requiredFieldOptions"
              value-key="value"
              label-key="label"
              multiple
            />
          </UFormField>
          <UFormField
            label="Vehicle URL template"
            description="Use {stock_id}, {source_product_id} and {name_slug} when the source does not provide a complete landing-page URL."
            class="@lg:col-span-2"
          >
            <UInput
              v-model="form.product_url_template"
              class="w-full"
              placeholder="https://www.example.com.au/vehicle-for-sale/{stock_id}/{name_slug}"
            />
          </UFormField>
          <div class="@lg:col-span-2">
            <h3 class="text-sm font-semibold">
              Column mapping
            </h3>
            <p class="mt-1 text-sm text-muted">
              Enter the exact Supabase column name for each governed inventory field.
            </p>
          </div>
          <UFormField label="Source product ID column">
            <UInput v-model="form.source_product_id_column" class="w-full" placeholder="id" />
          </UFormField>
          <UFormField label="Stock ID column">
            <UInput v-model="form.stock_id_column" class="w-full" placeholder="stock_number" />
          </UFormField>
          <UFormField label="VIN column">
            <UInput v-model="form.vin_column" class="w-full" placeholder="vin" />
          </UFormField>
          <UFormField label="Vehicle name column">
            <UInput v-model="form.name_column" class="w-full" placeholder="title" />
          </UFormField>
          <UFormField label="Seller ID column">
            <UInput v-model="form.seller_id_column" class="w-full" placeholder="seller_id" />
          </UFormField>
          <UFormField label="Sale status column">
            <UInput v-model="form.sale_status_column" class="w-full" placeholder="sale_status" />
          </UFormField>
          <UFormField label="Listing type column">
            <UInput v-model="form.listing_type_column" class="w-full" placeholder="listing_type" />
          </UFormField>
          <UFormField label="Make column">
            <UInput v-model="form.make_column" class="w-full" placeholder="make" />
          </UFormField>
          <UFormField label="Price column">
            <UInput v-model="form.price_column" class="w-full" placeholder="price" />
          </UFormField>
          <UFormField label="Vehicle URL column">
            <UInput v-model="form.product_url_column" class="w-full" placeholder="url" />
          </UFormField>
          <UFormField label="Primary image column">
            <UInput v-model="form.primary_image_url_column" class="w-full" placeholder="image_url" />
          </UFormField>
          <UFormField label="Colour column">
            <UInput v-model="form.color_column" class="w-full" placeholder="colour" />
          </UFormField>
          <UFormField label="Merchant offer ID column">
            <UInput v-model="form.merchant_offer_id_column" class="w-full" placeholder="merchant_offer_id" />
          </UFormField>
          <UFormField label="Supabase API key" class="@lg:col-span-2">
            <UInput
              v-model="form.api_key"
              type="password"
              class="w-full"
              autocomplete="new-password"
            />
            <template #help>
              Use a key that can read this table. XeroFlow encrypts it before storage and never returns it to the browser.
            </template>
          </UFormField>
        </template>
      </div>
      <div class="mt-5 flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showForm = false"
        />
        <UButton
          label="Connect"
          icon="i-lucide-plug"
          :loading="saving"
          @click="saveConnector"
        />
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
              <h3 class="font-medium">
                Dealer Feed
              </h3>
              <p class="text-xs text-muted">
                Campaign vehicle inventory
              </p>
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
              <h3 class="truncate font-medium">
                {{ source.display_name }}
              </h3>
              <p class="text-xs capitalize text-muted">
                {{ source.source_type.replace('_', ' ') }}
              </p>
            </div>
          </div>
          <UBadge :color="source.status === 'active' ? 'success' : source.status === 'error' ? 'error' : 'neutral'" variant="subtle">
            {{ source.status }}
          </UBadge>
        </div>
        <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-xs text-muted">
              Active products
            </p>
            <p class="mt-0.5 font-medium">
              {{ source.active_product_count || 0 }}
            </p>
          </div>
          <div>
            <p class="text-xs text-muted">
              Last sync
            </p>
            <p class="mt-0.5 font-medium">
              {{ source.last_synced_at ? new Date(source.last_synced_at).toLocaleString() : 'Never' }}
            </p>
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
        <p class="mt-3 text-sm font-medium">
          No data sources connected
        </p>
        <p class="mt-1 text-xs text-muted">
          Connect a feed or Supabase database to match enquiries with products.
        </p>
      </article>
    </div>
  </div>
</template>
