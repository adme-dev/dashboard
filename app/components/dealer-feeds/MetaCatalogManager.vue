<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

type MetaAccount = {
  id: string
  accountId: string
  accountName: string
  status: string
  tokenExpiresAt: string | null
  scopes: string[] | string | null
}

type MetaBusiness = {
  id: string
  name: string
}

type MetaCatalog = {
  id: string
  name: string
  vertical: string | null
  productCount: number | null
  feedCount: number | null
  businessId: string | null
  businessName: string | null
}

type MetaCatalogContext = {
  connection: {
    id: string
    accountId: string
    accountName: string
    scopes: string[]
    tokenExpiresAt: string | null
  }
  businesses: MetaBusiness[]
  selectedBusinessId: string | null
  catalogs: MetaCatalog[]
  catalogAccessGranted: boolean
}

const createSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(120),
  vertical: z.enum(['vehicles', 'commerce']),
})
const renameSchema = z.object({
  name: z.string().trim().min(2, 'Enter at least 2 characters').max(120),
})

type CreateSchema = z.output<typeof createSchema>
type RenameSchema = z.output<typeof renameSchema>

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown },
) => Promise<T>

const accounts = ref<MetaAccount[]>([])
const selectedConnectionId = ref<string>()
const selectedBusinessId = ref<string>()
const context = ref<MetaCatalogContext | null>(null)
const pendingAccounts = ref(false)
const pendingContext = ref(false)
const refreshingPermissions = ref(false)
const savingCreate = ref(false)
const savingRename = ref(false)
const savingDelete = ref(false)
const providerError = ref<{ message: string, traceId?: string } | null>(null)
let contextRequestId = 0

const createOpen = ref(false)
const renameOpen = ref(false)
const deleteOpen = ref(false)
const selectedCatalog = ref<MetaCatalog | null>(null)
const createState = reactive<Partial<CreateSchema>>({ name: undefined, vertical: 'vehicles' })
const renameState = reactive<Partial<RenameSchema>>({ name: undefined })
const deleteConfirmationName = ref('')

const accountOptions = computed(() => accounts.value.map(account => ({
  label: account.accountName,
  value: account.id,
})))
const businessOptions = computed(() => (context.value?.businesses || []).map(business => ({
  label: business.name,
  value: business.id,
})))
const catalogColumns = [
  { accessorKey: 'name', header: 'Catalog' },
  { accessorKey: 'vertical', header: 'Vertical' },
  { accessorKey: 'productCount', header: 'Items' },
  { accessorKey: 'feedCount', header: 'Feeds' },
  { id: 'actions', header: '' },
]
const verticalOptions = [
  { label: 'Vehicles', value: 'vehicles' },
  { label: 'Commerce', value: 'commerce' },
]

const hasConnection = computed(() => Boolean(selectedConnectionId.value))
const hasBusiness = computed(() => Boolean(selectedBusinessId.value))
const hasCatalog = computed(() => Boolean(context.value?.catalogs.length))
const canDelete = computed(() => Boolean(
  selectedCatalog.value
  && deleteConfirmationName.value === selectedCatalog.value.name,
))

function normalizeScopes(value: MetaAccount['scopes']): string[] {
  if (Array.isArray(value)) return value.map(String)
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parsed.map(String)
  } catch {}
  return value.replace(/^\{|\}$/g, '').split(',').map(scope => scope.replace(/^"|"$/g, '').trim()).filter(Boolean)
}

function providerFailure(error: any, fallback: string) {
  const data = error?.data?.data || error?.data || {}
  providerError.value = {
    message: error?.data?.statusMessage || error?.statusMessage || error?.message || fallback,
    traceId: data?.traceId,
  }
}

async function loadAccounts() {
  pendingAccounts.value = true
  providerError.value = null
  try {
    const response = await apiFetch<MetaAccount[]>('/api/agency/social/meta/accounts')
    accounts.value = response
      .filter(account => account.status === 'active')
      .map(account => ({ ...account, scopes: normalizeScopes(account.scopes) }))
      .sort((left, right) => left.accountName.localeCompare(right.accountName) || left.id.localeCompare(right.id))

    if (!accounts.value.some(account => account.id === selectedConnectionId.value)) {
      selectedConnectionId.value = accounts.value[0]?.id
    }
    await loadContext()
  } catch (error) {
    accounts.value = []
    selectedConnectionId.value = undefined
    context.value = null
    providerFailure(error, 'Meta connections could not be loaded.')
  } finally {
    pendingAccounts.value = false
  }
}

async function loadContext(businessId: string | undefined = selectedBusinessId.value) {
  const connectionId = selectedConnectionId.value
  if (!connectionId) {
    context.value = null
    selectedBusinessId.value = undefined
    return
  }

  const requestId = ++contextRequestId
  pendingContext.value = true
  providerError.value = null
  try {
    const query = new URLSearchParams({ connectionId })
    if (businessId) query.set('businessId', businessId)
    const response = await apiFetch<MetaCatalogContext>(`/api/admin/meta-catalogs/context?${query.toString()}`)
    if (requestId !== contextRequestId) return
    context.value = response
    selectedBusinessId.value = response.selectedBusinessId || undefined
  } catch (error) {
    if (requestId !== contextRequestId) return
    context.value = null
    selectedBusinessId.value = undefined
    providerFailure(error, 'Meta catalog context could not be loaded.')
  } finally {
    if (requestId === contextRequestId) pendingContext.value = false
  }
}

async function selectConnection(connectionId: string | undefined) {
  selectedConnectionId.value = connectionId
  selectedBusinessId.value = undefined
  await loadContext()
}

async function selectBusiness(businessId: string | undefined) {
  selectedBusinessId.value = businessId
  await loadContext(businessId)
}

const { state: metaConnectState, connect: connectMeta } = useMetaConnect({
  onConnected: loadAccounts,
})

async function refreshPermissions() {
  if (!selectedConnectionId.value) return
  refreshingPermissions.value = true
  providerError.value = null
  try {
    await apiFetch('/api/agency/social/meta/permissions/refresh', {
      method: 'POST',
      body: { connectionId: selectedConnectionId.value },
    })
    await loadAccounts()
    toast.add({ title: 'Meta permissions refreshed', color: 'success' })
  } catch (error) {
    providerFailure(error, 'Meta permissions could not be refreshed.')
  } finally {
    refreshingPermissions.value = false
  }
}

function openCreate() {
  createState.name = undefined
  createState.vertical = 'vehicles'
  createOpen.value = true
}

function openRename(catalog: MetaCatalog) {
  selectedCatalog.value = catalog
  renameState.name = catalog.name
  renameOpen.value = true
}

function openDelete(catalog: MetaCatalog) {
  selectedCatalog.value = catalog
  deleteConfirmationName.value = ''
  deleteOpen.value = true
}

function closeCreate() {
  createOpen.value = false
}

function closeRename() {
  renameOpen.value = false
}

function closeDelete() {
  deleteOpen.value = false
}

async function submitCreate(event: FormSubmitEvent<CreateSchema>) {
  if (!selectedConnectionId.value || !selectedBusinessId.value) return
  savingCreate.value = true
  try {
    await apiFetch('/api/admin/meta-catalogs', {
      method: 'POST',
      body: {
        connectionId: selectedConnectionId.value,
        businessId: selectedBusinessId.value,
        ...event.data,
      },
    })
    createOpen.value = false
    toast.add({ title: 'Catalog created', color: 'success' })
    await loadContext()
  } catch (error) {
    providerFailure(error, 'The catalog could not be created.')
  } finally {
    savingCreate.value = false
  }
}

async function submitRename(event: FormSubmitEvent<RenameSchema>) {
  if (!selectedConnectionId.value || !selectedCatalog.value) return
  savingRename.value = true
  try {
    await apiFetch(`/api/admin/meta-catalogs/${encodeURIComponent(selectedCatalog.value.id)}`, {
      method: 'PATCH',
      body: { connectionId: selectedConnectionId.value, name: event.data.name },
    })
    renameOpen.value = false
    selectedCatalog.value = null
    toast.add({ title: 'Catalog renamed', color: 'success' })
    await loadContext()
  } catch (error) {
    providerFailure(error, 'The catalog could not be renamed.')
  } finally {
    savingRename.value = false
  }
}

async function deleteCatalog() {
  if (!selectedConnectionId.value || !selectedCatalog.value || !canDelete.value) return
  savingDelete.value = true
  try {
    await apiFetch(`/api/admin/meta-catalogs/${encodeURIComponent(selectedCatalog.value.id)}`, {
      method: 'DELETE',
      body: {
        connectionId: selectedConnectionId.value,
        confirmationName: deleteConfirmationName.value,
      },
    })
    deleteOpen.value = false
    selectedCatalog.value = null
    deleteConfirmationName.value = ''
    toast.add({ title: 'Catalog deleted', color: 'success' })
    await loadContext()
  } catch (error) {
    providerFailure(error, 'The catalog could not be deleted.')
  } finally {
    savingDelete.value = false
  }
}

function formatCount(value: number | null) {
  return value === null ? '—' : new Intl.NumberFormat().format(value)
}

function verticalLabel(vertical: string | null) {
  if (!vertical) return 'Unknown'
  return vertical.charAt(0).toUpperCase() + vertical.slice(1).toLowerCase()
}

onMounted(loadAccounts)
</script>

<template>
  <section class="rounded-lg border border-default bg-default">
    <div class="border-b border-default px-5 py-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-boxes" class="size-5 text-primary" />
            <h2 class="text-base font-semibold text-highlighted">
              Meta Business catalogs
            </h2>
          </div>
          <p class="mt-1 max-w-2xl text-sm text-muted">
            Create and maintain the Meta catalog container for vehicle feeds. Feed generation remains separate, so ownership and deletion stay explicit.
          </p>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="outline"
          :loading="pendingAccounts || pendingContext || refreshingPermissions"
          :disabled="!hasConnection"
          @click="refreshPermissions"
        >
          Refresh access
        </UButton>
      </div>
    </div>

    <div class="space-y-5 p-5">
      <ol class="grid grid-cols-1 gap-3 lg:grid-cols-3" aria-label="Meta catalog activation status">
        <li class="rounded-lg border border-default bg-elevated/40 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted">01 · Meta connection</span>
            <UBadge :color="hasConnection ? 'success' : 'neutral'" variant="subtle" size="xs">
              {{ hasConnection ? 'Ready' : 'Needed' }}
            </UBadge>
          </div>
          <p class="mt-2 text-sm font-medium text-highlighted">Choose the ad account credential</p>
        </li>
        <li class="rounded-lg border border-default bg-elevated/40 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted">02 · Business access</span>
            <UBadge :color="hasBusiness ? 'success' : 'neutral'" variant="subtle" size="xs">
              {{ hasBusiness ? 'Ready' : 'Needed' }}
            </UBadge>
          </div>
          <p class="mt-2 text-sm font-medium text-highlighted">Confirm the owning Meta Business</p>
        </li>
        <li class="rounded-lg border border-default bg-elevated/40 p-3">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-medium text-muted">03 · Catalog ready</span>
            <UBadge :color="hasCatalog ? 'success' : 'neutral'" variant="subtle" size="xs">
              {{ hasCatalog ? 'Ready' : 'Next' }}
            </UBadge>
          </div>
          <p class="mt-2 text-sm font-medium text-highlighted">Create or select the catalog container</p>
        </li>
      </ol>

      <UAlert
        v-if="providerError"
        icon="i-lucide-alert-circle"
        color="error"
        variant="subtle"
        title="Meta catalog request failed"
        :description="providerError.traceId ? `${providerError.message} Meta trace: ${providerError.traceId}` : providerError.message"
      />

      <UAlert
        v-if="metaConnectState.status === 'error'"
        icon="i-lucide-alert-circle"
        color="error"
        variant="subtle"
        title="Meta connection failed"
        :description="metaConnectState.error"
      />

      <div v-if="!hasConnection && !pendingAccounts" class="rounded-lg border border-dashed border-default p-5">
        <UEmpty
          icon="i-lucide-unplug"
          title="Connect Meta first"
          description="Add a Meta account before choosing a Business or managing its catalogs."
        >
          <template #actions>
            <UButton to="/settings?tab=social" icon="i-lucide-arrow-right">
              Open social connections
            </UButton>
          </template>
        </UEmpty>
      </div>

      <template v-else>
        <div class="@container grid grid-cols-1 gap-4 @lg:grid-cols-2">
          <UFormField label="Meta connection">
            <USelectMenu
              :model-value="selectedConnectionId"
              :items="accountOptions"
              value-key="value"
              placeholder="Select Meta connection"
              :loading="pendingAccounts"
              class="w-full"
              @update:model-value="selectConnection"
            />
          </UFormField>
          <UFormField label="Meta Business">
            <USelectMenu
              :model-value="selectedBusinessId"
              :items="businessOptions"
              value-key="value"
              placeholder="Select Meta Business"
              :disabled="!context?.catalogAccessGranted || pendingContext"
              class="w-full"
              @update:model-value="selectBusiness"
            />
          </UFormField>
        </div>

        <UAlert
          v-if="context && !context.catalogAccessGranted"
          icon="i-lucide-shield-alert"
          color="warning"
          variant="subtle"
          title="Catalog permission is optional and not yet granted"
          description="Grant catalog_management through Meta Login to list, create, rename, and delete Business-owned catalogs. Your standard spend and lead connection remains separate."
        >
          <template #actions>
            <UButton
              icon="i-lucide-shield-check"
              :loading="metaConnectState.status === 'loading'"
              @click="connectMeta('catalog')"
            >
              Grant catalog access
            </UButton>
          </template>
        </UAlert>

        <template v-else-if="context?.catalogAccessGranted">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Owned catalogs</h3>
              <p class="mt-1 text-sm text-muted">Only catalogs owned by the selected Business are available here.</p>
            </div>
            <UButton
              icon="i-lucide-plus"
              :disabled="!selectedBusinessId"
              @click="openCreate"
            >
              Create catalog
            </UButton>
          </div>

          <div v-if="pendingContext" class="flex min-h-36 items-center justify-center">
            <XfLoader />
          </div>
          <UEmpty
            v-else-if="context.catalogs.length === 0"
            icon="i-lucide-package-open"
            title="No catalogs in this Business"
            description="Create a vehicle or commerce catalog, then connect your generated inventory feed in Meta."
            class="py-10"
          />
          <UTable v-else :data="context.catalogs" :columns="catalogColumns">
            <template #name-cell="{ row }">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ row.original.name }}</p>
                <p class="truncate font-mono text-xs text-muted">{{ row.original.id }}</p>
              </div>
            </template>
            <template #vertical-cell="{ row }">
              <UBadge color="neutral" variant="subtle">{{ verticalLabel(row.original.vertical) }}</UBadge>
            </template>
            <template #productCount-cell="{ row }">{{ formatCount(row.original.productCount) }}</template>
            <template #feedCount-cell="{ row }">{{ formatCount(row.original.feedCount) }}</template>
            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UTooltip text="Rename catalog">
                  <UButton
                    icon="i-lucide-pencil"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Rename catalog"
                    @click="openRename(row.original)"
                  />
                </UTooltip>
                <UTooltip text="Delete catalog">
                  <UButton
                    icon="i-lucide-trash-2"
                    color="error"
                    variant="ghost"
                    size="xs"
                    aria-label="Delete catalog"
                    @click="openDelete(row.original)"
                  />
                </UTooltip>
              </div>
            </template>
          </UTable>
        </template>
      </template>
    </div>

    <UModal v-model:open="createOpen" class="max-w-xl">
      <template #content>
        <UForm :schema="createSchema" :state="createState" class="@container space-y-5 p-6" @submit="submitCreate">
          <div>
            <h3 class="text-lg font-semibold text-highlighted">Create Meta catalog</h3>
            <p class="mt-1 text-sm text-muted">The catalog will be owned by the selected Meta Business.</p>
          </div>
          <div class="grid grid-cols-1 gap-4 @lg:grid-cols-2">
            <UFormField label="Catalog name" name="name" class="@lg:col-span-2">
              <UInput v-model="createState.name" placeholder="Dealer vehicle inventory" class="w-full" />
            </UFormField>
            <UFormField label="Catalog vertical" name="vertical" class="@lg:col-span-2">
              <USelect v-model="createState.vertical" :items="verticalOptions" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeCreate">Cancel</UButton>
            <UButton type="submit" :loading="savingCreate">Create catalog</UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-model:open="renameOpen" class="max-w-lg">
      <template #content>
        <UForm :schema="renameSchema" :state="renameState" class="@container space-y-5 p-6" @submit="submitRename">
          <div>
            <h3 class="text-lg font-semibold text-highlighted">Rename Meta catalog</h3>
            <p class="mt-1 text-sm text-muted">This changes the catalog name in Meta Business Manager.</p>
          </div>
          <div class="grid grid-cols-1 gap-4">
            <UFormField label="Catalog name" name="name">
              <UInput v-model="renameState.name" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeRename">Cancel</UButton>
            <UButton type="submit" :loading="savingRename">Save name</UButton>
          </div>
        </UForm>
      </template>
    </UModal>

    <UModal v-model:open="deleteOpen" class="max-w-lg">
      <template #content>
        <div class="@container space-y-5 p-6">
          <div>
            <h3 class="text-lg font-semibold text-highlighted">Delete Meta catalog</h3>
            <p class="mt-1 text-sm text-muted">Meta may refuse deletion while feeds, product sets, shops, or ads still depend on this catalog.</p>
          </div>
          <UAlert
            icon="i-lucide-triangle-alert"
            color="error"
            variant="subtle"
            title="This removes the catalog container from Meta"
            :description="selectedCatalog ? `Type ${selectedCatalog.name} exactly to continue.` : undefined"
          />
          <div class="grid grid-cols-1 gap-4">
            <UFormField label="Catalog name confirmation">
              <UInput v-model="deleteConfirmationName" autocomplete="off" class="w-full" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="closeDelete">Cancel</UButton>
            <UButton color="error" :disabled="!canDelete" :loading="savingDelete" @click="deleteCatalog">
              Delete catalog
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </section>
</template>
