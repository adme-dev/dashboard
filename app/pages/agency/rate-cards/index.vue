<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const toast = useToast()

// Search & filter
const search = ref('')
const showInactive = ref(false)

// Data fetching
const { data, refresh, status } = useFetch('/api/agency/rate-cards', {
  query: computed(() => ({
    search: search.value || undefined,
    active: showInactive.value ? undefined : 'true',
  })),
})

const categories = computed(() => data.value?.categories || [])
const totalItems = computed(() => data.value?.totalItems || 0)

// Categories list for dropdowns
const { data: categoriesData, refresh: refreshCategories } = useFetch('/api/agency/rate-cards/categories')
const categoryOptions = computed(() =>
  (categoriesData.value?.categories || []).map((c: any) => ({ label: c.name, value: c.id }))
)

// Audit log
const auditPage = ref(1)
const { data: auditData, refresh: refreshAudit } = useFetch('/api/agency/rate-cards/audit', {
  query: computed(() => ({ page: auditPage.value, limit: 20 })),
})
const auditEntries = computed(() => auditData.value?.entries || [])

// Active tab
const activeTab = ref('items')
const tabs = [
  { label: 'Services', value: 'items', icon: 'i-lucide-list' },
  { label: 'Audit Log', value: 'audit', icon: 'i-lucide-history' },
]

// Accordion items — all open by default
const accordionItems = computed(() =>
  categories.value.map((cat: any) => ({
    label: `${cat.name} (${cat.items.length})`,
    value: cat.id,
    icon: 'i-lucide-folder',
    content: cat,
  }))
)
const defaultOpenValues = computed(() => categories.value.map((c: any) => c.id))

// Table columns
const columns = [
  { accessorKey: 'serviceName', header: 'Service' },
  { accessorKey: 'price', header: 'Price', meta: { class: { th: 'w-32 text-right', td: 'w-32 text-right' } } },
  { accessorKey: 'priceUnit', header: 'Unit', meta: { class: { th: 'w-28 text-center', td: 'w-28 text-center' } } },
  { accessorKey: 'setupFee', header: 'Setup Fee', meta: { class: { th: 'w-28 text-right', td: 'w-28 text-right' } } },
  { accessorKey: 'isActive', header: 'Status', meta: { class: { th: 'w-24 text-center', td: 'w-24 text-center' } } },
  { accessorKey: 'actions', header: '', meta: { class: { th: 'w-20', td: 'w-20' } } },
]

// Format helpers
function formatPrice(price: number, unit: string) {
  if (unit === 'POA') return 'POA'
  const formatted = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(price)
  const suffix: Record<string, string> = { 'per-month': '/mo', 'per-hour': '/hr', 'per-unit': '/ea' }
  return formatted + (suffix[unit] || '')
}

function formatSetupFee(fee: number) {
  if (!fee) return '-'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(fee)
}

// Detail slideover
const showDetailSlideover = ref(false)
const selectedItem = ref<any>(null)
const selectedCategoryName = ref('')

function openDetail(item: any, categoryName: string) {
  selectedItem.value = item
  selectedCategoryName.value = categoryName
  showDetailSlideover.value = true
}

function onDetailSaved() {
  refresh()
  refreshAudit()
}

// Edit/Create modal
const showEditModal = ref(false)
const editItem = ref<any>(null)
const editForm = ref({
  serviceName: '',
  price: 0,
  priceUnit: 'once-off',
  setupFee: 0,
  setupNotes: '',
  notes: '',
  categoryId: '',
})
const saving = ref(false)

const priceUnitOptions = [
  { label: 'Once-off', value: 'once-off' },
  { label: 'Per Month', value: 'per-month' },
  { label: 'Per Hour', value: 'per-hour' },
  { label: 'Per Unit', value: 'per-unit' },
  { label: 'POA', value: 'POA' },
]

function openCreate() {
  if (categoryOptions.value.length === 0) {
    toast.add({ title: 'No categories', description: 'Import a CSV or create a category first', color: 'warning' })
    return
  }
  editItem.value = null
  editForm.value = { serviceName: '', price: 0, priceUnit: 'once-off', setupFee: 0, setupNotes: '', notes: '', categoryId: categoryOptions.value[0].value }
  showEditModal.value = true
}

function openEdit(item: any, categoryId: string) {
  editItem.value = item
  editForm.value = {
    serviceName: item.serviceName,
    price: item.price,
    priceUnit: item.priceUnit,
    setupFee: item.setupFee,
    setupNotes: item.setupNotes || '',
    notes: item.notes || '',
    categoryId,
  }
  showEditModal.value = true
}

async function saveItem() {
  saving.value = true
  try {
    if (editItem.value) {
      await $fetch(`/api/agency/rate-cards/${editItem.value.id}`, {
        method: 'PATCH',
        body: editForm.value,
      })
      toast.add({ title: 'Updated', description: `"${editForm.value.serviceName}" saved`, color: 'success' })
    } else {
      await $fetch('/api/agency/rate-cards', {
        method: 'POST',
        body: editForm.value,
      })
      toast.add({ title: 'Created', description: `"${editForm.value.serviceName}" added`, color: 'success' })
    }
    showEditModal.value = false
    refresh()
    refreshAudit()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to save', color: 'error' })
  } finally {
    saving.value = false
  }
}

async function archiveItem(item: any) {
  try {
    await $fetch(`/api/agency/rate-cards/${item.id}`, { method: 'DELETE' })
    toast.add({ title: 'Archived', description: `"${item.serviceName}" archived`, color: 'success' })
    refresh()
    refreshAudit()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to archive', color: 'error' })
  }
}

// Import CSV
const showImportModal = ref(false)
const csvText = ref('')
const importPreview = ref<any>(null)
const importing = ref(false)

async function previewImport() {
  if (!csvText.value.trim()) return
  importing.value = true
  try {
    const result = await $fetch('/api/agency/rate-cards/import', {
      method: 'POST',
      body: { csvText: csvText.value, dryRun: true },
    })
    importPreview.value = result
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to parse CSV', color: 'error' })
  } finally {
    importing.value = false
  }
}

async function confirmImport() {
  importing.value = true
  try {
    const result = await $fetch<any>('/api/agency/rate-cards/import', {
      method: 'POST',
      body: { csvText: csvText.value, dryRun: false },
    })
    toast.add({ title: 'Import Complete', description: `${result.itemsCreated} created, ${result.itemsUpdated} updated across ${result.categoriesCreated} categories`, color: 'success' })
    showImportModal.value = false
    csvText.value = ''
    importPreview.value = null
    refresh()
    refreshCategories()
    refreshAudit()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Import failed', color: 'error' })
  } finally {
    importing.value = false
  }
}

function handleFileUpload(e: Event) {
  const file = (e.target as HTMLInputElement)?.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    csvText.value = reader.result as string
    importPreview.value = null
  }
  reader.readAsText(file)
}

// Audit formatting
function formatAuditAction(entry: any) {
  switch (entry.action) {
    case 'create': return 'Created'
    case 'update': return `Updated ${entry.fieldName?.replace(/_/g, ' ')}`
    case 'delete': return 'Archived'
    case 'import': return 'Imported'
    default: return entry.action
  }
}

function auditActionColor(action: string) {
  switch (action) {
    case 'create': return 'success'
    case 'import': return 'info'
    case 'delete': return 'error'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Header -->
    <div class="flex items-center justify-between px-6 py-4 border-b border-default">
      <div>
        <h1 class="text-xl font-semibold">Rate Card</h1>
        <p class="text-sm text-muted mt-0.5">{{ totalItems }} services across {{ categories.length }} categories</p>
      </div>
      <div class="flex items-center gap-2">
        <UInput
          v-model="search"
          placeholder="Search services..."
          icon="i-lucide-search"
          class="w-64"
        />
        <UCheckbox v-model="showInactive" label="Show archived" />
        <UButton

          icon="i-lucide-upload"
          variant="soft"
          @click="showImportModal = true"
        >
          Import CSV
        </UButton>
        <UButton

          icon="i-lucide-plus"
          color="primary"
          @click="openCreate"
        >
          Add Item
        </UButton>
      </div>
    </div>

    <!-- Tabs -->
    <div class="px-6 pt-3">
      <div class="flex gap-1 border-b border-default">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors"
          :class="activeTab === tab.value
            ? 'border-primary text-primary'
            : 'border-transparent text-muted hover:text-default'"
          @click="activeTab = tab.value"
        >
          <UIcon :name="tab.icon" class="size-4" />
          {{ tab.label }}
        </button>
      </div>
    </div>

    <!-- Services Tab -->
    <div v-if="activeTab === 'items'" class="flex-1 overflow-auto px-6 py-4">
      <div v-if="status === 'pending'" class="flex justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <div v-else-if="categories.length === 0" class="text-center py-12 text-muted">
        <UIcon name="i-lucide-file-x" class="size-12 mx-auto mb-3 opacity-50" />
        <p class="text-lg font-medium">No rate card items yet</p>
        <p class="text-sm mt-1">Import a CSV or add items manually to get started.</p>
      </div>

      <UAccordion
        v-else
        :items="accordionItems"
        type="multiple"
        :default-value="defaultOpenValues"
        class="space-y-2"
      >
        <template #body="{ item }">
          <div class="px-2 pb-2">
            <UTable
              :data="item.content.items"
              :columns="columns"
              class="border-0"
              :ui="{ base: 'table-fixed', tr: 'cursor-pointer hover:bg-elevated/50' }"
              @select="(row: any) => openDetail(row.original ?? row, item.content.name)"
            >
              <template #serviceName-cell="{ row }">
                <div class="flex flex-col">
                  <span :class="{ 'text-muted line-through': !row.original.isActive }">
                    {{ row.original.serviceName }}
                  </span>
                  <span v-if="row.original.notes" class="text-xs text-muted">{{ row.original.notes }}</span>
                </div>
              </template>
              <template #price-cell="{ row }">
                <span class="font-mono font-medium">
                  {{ formatPrice(row.original.price, row.original.priceUnit) }}
                </span>
              </template>
              <template #priceUnit-cell="{ row }">
                <UBadge variant="subtle" :color="row.original.priceUnit === 'POA' ? 'warning' : 'neutral'" size="sm">
                  {{ row.original.priceUnit }}
                </UBadge>
              </template>
              <template #setupFee-cell="{ row }">
                <span class="text-sm text-muted">{{ formatSetupFee(row.original.setupFee) }}</span>
              </template>
              <template #isActive-cell="{ row }">
                <UBadge
                  :color="row.original.isActive ? 'success' : 'neutral'"
                  variant="subtle"
                  size="sm"
                >
                  {{ row.original.isActive ? 'Active' : 'Archived' }}
                </UBadge>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex items-center gap-1 justify-end">
                  <UButton
                    icon="i-lucide-pencil"
                    variant="ghost"
                    color="neutral"
                    size="xs"
                    @click.stop="openEdit(row.original, item.value)"
                  />
                  <UButton
                    v-if="row.original.isActive"
                    icon="i-lucide-archive"
                    variant="ghost"
                    color="error"
                    size="xs"
                    @click.stop="archiveItem(row.original)"
                  />
                </div>
              </template>
            </UTable>
          </div>
        </template>
      </UAccordion>
    </div>

    <!-- Audit Tab -->
    <div v-if="activeTab === 'audit'" class="flex-1 overflow-auto px-6 py-4">
      <div v-if="auditEntries.length === 0" class="text-center py-12 text-muted">
        <p>No audit entries yet.</p>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="entry in auditEntries"
          :key="entry.id"
          class="flex items-start gap-3 py-2 border-b border-default last:border-0"
        >
          <UBadge :color="auditActionColor(entry.action)" variant="subtle" size="sm" class="mt-0.5">
            {{ entry.action }}
          </UBadge>
          <div class="flex-1 min-w-0">
            <p class="text-sm">
              <span class="font-medium">{{ entry.changedByName || 'System' }}</span>
              {{ formatAuditAction(entry) }}
              <span v-if="entry.itemName" class="font-medium">"{{ entry.itemName }}"</span>
            </p>
            <p v-if="entry.oldValue && entry.newValue" class="text-xs text-muted mt-0.5">
              <span class="line-through">{{ entry.oldValue }}</span>
              <UIcon name="i-lucide-arrow-right" class="inline size-3 mx-1" />
              {{ entry.newValue }}
            </p>
          </div>
          <span class="text-xs text-muted whitespace-nowrap">
            {{ new Date(entry.changedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }}
          </span>
        </div>
      </div>
      <div v-if="(auditData?.total || 0) > 20" class="flex justify-center pt-4">
        <UPagination
          v-model="auditPage"
          :total="auditData?.total || 0"
          :items-per-page="20"
        />
      </div>
    </div>

    <!-- Detail Slideover -->
    <RateCardDetailSlideover
      v-model:open="showDetailSlideover"
      :item="selectedItem"
      :category-name="selectedCategoryName"
      :category-options="categoryOptions"
      @saved="onDetailSaved"
    />

    <!-- Create Modal -->
    <UModal v-model:open="showEditModal">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">{{ editItem ? 'Edit Service' : 'Add Service' }}</h3>

          <div class="space-y-3">
            <div>
              <label class="text-sm font-medium text-muted mb-1 block">Service Name</label>
              <UInput v-model="editForm.serviceName" placeholder="e.g. Google Search (SEM)" class="w-full" />
            </div>

            <div class="border-t border-default" />

            <div>
              <label class="text-sm font-medium text-muted mb-1 block">Category</label>
              <USelectMenu
                v-model="editForm.categoryId"
                :items="categoryOptions"
                value-key="value"
                placeholder="Select category"
                class="w-full"
              />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-medium text-muted mb-1 block">Price (ex GST)</label>
                <UInput v-model.number="editForm.price" type="number" step="0.01" placeholder="0.00" class="w-full" />
              </div>
              <div>
                <label class="text-sm font-medium text-muted mb-1 block">Price Unit</label>
                <USelectMenu
                  v-model="editForm.priceUnit"
                  :items="priceUnitOptions"
                  value-key="value"
                  class="w-full"
                />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="text-sm font-medium text-muted mb-1 block">Setup Fee</label>
                <UInput v-model.number="editForm.setupFee" type="number" step="0.01" placeholder="0.00" class="w-full" />
              </div>
              <div>
                <label class="text-sm font-medium text-muted mb-1 block">Setup Notes</label>
                <UInput v-model="editForm.setupNotes" placeholder="e.g. One-off set up" class="w-full" />
              </div>
            </div>
            <div>
              <label class="text-sm font-medium text-muted mb-1 block">Notes</label>
              <UTextarea v-model="editForm.notes" :rows="3" placeholder="Additional notes..." class="w-full" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="showEditModal = false">Cancel</UButton>
            <UButton color="primary" :loading="saving" @click="saveItem">
              {{ editItem ? 'Save Changes' : 'Add Service' }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Import CSV Modal -->
    <UModal v-model:open="showImportModal" :ui="{ width: 'sm:max-w-2xl' }">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-semibold">Import Rate Card CSV</h3>

          <div v-if="!importPreview">
            <p class="text-sm text-muted mb-3">Upload a CSV file or paste CSV text. The parser expects ADME Service Menu format.</p>
            <div class="space-y-3">
              <input
                type="file"
                accept=".csv"
                class="block w-full text-sm text-muted file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                @change="handleFileUpload"
              >
              <div class="text-center text-sm text-muted">or</div>
              <UTextarea
                v-model="csvText"
                :rows="8"
                placeholder="Paste CSV text here..."
              />
            </div>
            <div class="flex justify-end gap-2 pt-3">
              <UButton variant="ghost" color="neutral" @click="showImportModal = false">Cancel</UButton>
              <UButton color="primary" :loading="importing" :disabled="!csvText.trim()" @click="previewImport">
                Preview Import
              </UButton>
            </div>
          </div>

          <div v-else>
            <div class="grid grid-cols-3 gap-3 mb-4">
              <div class="p-3 rounded-lg bg-elevated text-center">
                <p class="text-2xl font-bold">{{ importPreview.categories?.length || 0 }}</p>
                <p class="text-xs text-muted">Categories</p>
              </div>
              <div class="p-3 rounded-lg bg-elevated text-center">
                <p class="text-2xl font-bold">{{ importPreview.itemCount || 0 }}</p>
                <p class="text-xs text-muted">Items</p>
              </div>
              <div class="p-3 rounded-lg bg-elevated text-center">
                <p class="text-2xl font-bold text-warning">{{ importPreview.errors?.length || 0 }}</p>
                <p class="text-xs text-muted">Warnings</p>
              </div>
            </div>

            <div class="max-h-80 overflow-auto border border-default rounded-lg">
              <table class="w-full text-sm">
                <thead class="bg-elevated sticky top-0">
                  <tr>
                    <th class="text-left px-3 py-2">Category</th>
                    <th class="text-left px-3 py-2">Service</th>
                    <th class="text-right px-3 py-2">Price</th>
                    <th class="text-left px-3 py-2">Unit</th>
                    <th class="text-right px-3 py-2">Setup</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(item, idx) in importPreview.items"
                    :key="idx"
                    class="border-t border-default"
                  >
                    <td class="px-3 py-1.5 text-muted">{{ item.category }}</td>
                    <td class="px-3 py-1.5">{{ item.serviceName }}</td>
                    <td class="px-3 py-1.5 text-right font-mono">
                      {{ item.price != null ? `$${item.price.toFixed(2)}` : 'POA' }}
                    </td>
                    <td class="px-3 py-1.5 text-muted">{{ item.priceUnit }}</td>
                    <td class="px-3 py-1.5 text-right font-mono text-muted">
                      {{ item.setupFee ? `$${item.setupFee.toFixed(2)}` : '-' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="flex justify-between pt-3">
              <UButton variant="ghost" color="neutral" @click="importPreview = null">Back</UButton>
              <div class="flex gap-2">
                <UButton variant="ghost" color="neutral" @click="showImportModal = false">Cancel</UButton>
                <UButton color="primary" :loading="importing" @click="confirmImport">
                  Confirm Import ({{ importPreview.itemCount }} items)
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
