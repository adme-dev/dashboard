<script setup lang="ts">
/**
 * XeroFlow Invoice Builder
 *
 * Build detailed agency invoices with category breakdowns:
 *   - Media Charges (10% margin)
 *   - Production Charges (100% margin)
 *   - Marketing Charges (100% margin)
 *   - Digital Advertising Charges (100% margin)
 *   - Social Media Charges (100% margin)
 *   - Video Production Charges (100% margin)
 *   - IT / Website Charges (100% margin)
 *   - Printing Charges (30% margin)
 *   - PPC Passthrough (0% margin)
 *
 * Mirrors the ADME "APRIL 2026 Inv FINAL" PDF format.
 */

definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

const toast = useToast()

// ── Invoice header ──
const invoiceDate = ref(new Date().toISOString().slice(0, 10))
const dueDate = ref('')
const contactName = ref('')
const reference = ref('')
const invoiceNumber = ref('')

// ── Line items by category ──
interface LineItem {
  id: string
  description: string
  quantity: number
  unitAmount: number
  accountCode: string
  taxType: string
  trackingCategory: string
}

const categories = [
  { code: '220', name: 'Media', margin: 0.10, taxType: 'GST on Income', tracking: 'Marketing & Media' },
  { code: '210', name: 'Production', margin: 1.0, taxType: 'GST on Income', tracking: 'Production' },
  { code: '215', name: 'Marketing', margin: 1.0, taxType: 'GST on Income', tracking: 'Marketing & Media' },
  { code: '216', name: 'Digital Advertising', margin: 1.0, taxType: 'GST on Income', tracking: 'Digital Advertising' },
  { code: '217', name: 'Social Media', margin: 1.0, taxType: 'GST on Income', tracking: 'Social Media' },
  { code: '219', name: 'Video Production', margin: 1.0, taxType: 'GST on Income', tracking: 'Video Productions' },
  { code: '225', name: 'IT / Website', margin: 1.0, taxType: 'GST on Income', tracking: 'Websites' },
  { code: '205', name: 'Printing', margin: 1.0, taxType: 'GST on Income', tracking: 'Printing' },
  { code: '330', name: 'PPC Passthrough', margin: 0.0, taxType: 'GST Free Expenses', tracking: 'Facebook Ads' },
]

const itemsByCategory = reactive<Record<string, LineItem[]>>({
  '220': [],
  '210': [],
  '215': [],
  '216': [],
  '217': [],
  '219': [],
  '225': [],
  '205': [],
  '330': [],
})

function addLine(categoryCode: string) {
  const cat = categories.find(c => c.code === categoryCode)!
  itemsByCategory[categoryCode].push({
    id: crypto.randomUUID(),
    description: '',
    quantity: 1,
    unitAmount: 0,
    accountCode: cat.code,
    taxType: cat.taxType,
    trackingCategory: cat.tracking,
  })
}

function removeLine(categoryCode: string, itemId: string) {
  itemsByCategory[categoryCode] = itemsByCategory[categoryCode].filter(i => i.id !== itemId)
}

function duplicateLine(categoryCode: string, item: LineItem) {
  itemsByCategory[categoryCode].push({
    ...item,
    id: crypto.randomUUID(),
    description: item.description + ' (copy)',
  })
}

// ── Computed totals ──
const allItems = computed(() =>
  Object.values(itemsByCategory).flat()
)

const categoryTotals = computed(() => {
  return categories.map(cat => {
    const items = itemsByCategory[cat.code]
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unitAmount), 0)
    const gst = cat.taxType === 'GST on Income' ? subtotal * 0.10 : 0
    return {
      ...cat,
      itemCount: items.length,
      subtotal,
      gst,
      total: subtotal + gst,
    }
  }).filter(c => c.itemCount > 0)
})

const grandTotalExGst = computed(() =>
  categoryTotals.value.reduce((s, c) => s + c.subtotal, 0)
)
const grandTotalGst = computed(() =>
  categoryTotals.value.reduce((s, c) => s + c.gst, 0)
)
const grandTotalIncGst = computed(() =>
  grandTotalExGst.value + grandTotalGst.value
)

// ── Push to Xero ──
const pushing = ref(false)

async function pushToXero() {
  if (!contactName.value.trim()) {
    toast.add({ title: 'Contact name required', color: 'error' })
    return
  }
  if (allItems.value.length === 0) {
    toast.add({ title: 'Add at least one line item', color: 'error' })
    return
  }

  pushing.value = true
  try {
    const result = await $fetch('/api/xero/invoice-builder/create', {
      method: 'POST',
      body: {
        type: 'ACCREC',
        contact: { name: contactName.value },
        invoiceNumber: invoiceNumber.value || undefined,
        reference: reference.value,
        date: invoiceDate.value,
        dueDate: dueDate.value || undefined,
        status: 'DRAFT',
        lineAmountTypes: 'Exclusive',
        currencyCode: 'AUD',
        lineItems: allItems.value.map((item) => {
          const cat = categories.find(c => c.code === item.accountCode)!
          return {
            description: item.description,
            quantity: item.quantity,
            unitAmount: item.unitAmount,
            accountCode: item.accountCode,
            taxType: item.taxType,
            tracking: [
              { name: item.trackingCategory, option: cat.name },
              { name: 'Client', option: contactName.value },
            ],
          }
        }),
      },
    })
    toast.add({
      title: 'Invoice created in Xero',
      description: `Invoice ${result.invoiceNumber || result.invoiceID} created as DRAFT`,
      color: 'success',
    })
  } catch (e: any) {
    toast.add({
      title: 'Failed to create invoice',
      description: e?.data?.statusMessage || e?.message || 'Unknown error',
      color: 'error',
    })
  } finally {
    pushing.value = false
  }
}

// ── Reset ──
function reset() {
  contactName.value = ''
  reference.value = ''
  invoiceNumber.value = ''
  invoiceDate.value = new Date().toISOString().slice(0, 10)
  dueDate.value = ''
  for (const code of Object.keys(itemsByCategory)) {
    itemsByCategory[code] = []
  }
}

const breadcrumbs = computed(() => [
  { label: 'Home', to: '/' },
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Invoice Builder', to: '/xeroflow/invoice-builder' },
])

const formatCurrency = (val: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 2 }).format(val)
</script>

<template>
  <UDashboardPanel id="invoice-builder">
    <template #header>
      <UDashboardNavbar title="Invoice Builder">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            variant="soft"
            color="error"
            size="sm"
            icon="i-lucide-trash-2"
            @click="reset"
          >
            Reset
          </UButton>
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :links="breadcrumbs" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="max-w-5xl mx-auto space-y-6 pb-12">
        <!-- Header Form -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Invoice Details</h3>
          </template>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm text-muted mb-1">Contact Name *</label>
              <UInput v-model="contactName" placeholder="Customer name" icon="i-lucide-user" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">Invoice Number</label>
              <UInput v-model="invoiceNumber" placeholder="Auto-generated if empty" icon="i-lucide-hash" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">Reference</label>
              <UInput v-model="reference" placeholder="e.g. 04/2026" icon="i-lucide-file-text" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">Invoice Date</label>
              <UInput v-model="invoiceDate" type="date" />
            </div>
            <div>
              <label class="block text-sm text-muted mb-1">Due Date</label>
              <UInput v-model="dueDate" type="date" />
            </div>
          </div>
        </UCard>

        <!-- Categories -->
        <div class="space-y-4">
          <div
            v-for="cat in categories"
            :key="cat.code"
            class="border border-default rounded-xl overflow-hidden"
          >
            <!-- Category Header -->
            <div class="flex items-center justify-between px-4 py-3 bg-elevated/30">
              <div class="flex items-center gap-3">
                <UBadge size="sm" variant="subtle">{{ cat.code }}</UBadge>
                <span class="font-semibold">{{ cat.name }}</span>
                <span class="text-xs text-muted">
                  {{ cat.margin === 0 ? 'Passthrough' : cat.margin === 0.10 ? '10% margin' : '100% margin' }}
                </span>
              </div>
              <div class="flex items-center gap-2">
                <span v-if="itemsByCategory[cat.code].length" class="text-sm font-medium">
                  {{ formatCurrency(itemsByCategory[cat.code].reduce((s, i) => s + i.quantity * i.unitAmount, 0)) }}
                </span>
                <UButton
                  size="xs"
                  variant="soft"
                  icon="i-lucide-plus"
                  @click="addLine(cat.code)"
                >
                  Add Line
                </UButton>
              </div>
            </div>

            <!-- Line Items -->
            <div v-if="itemsByCategory[cat.code].length" class="divide-y divide-default/50">
              <div
                v-for="item in itemsByCategory[cat.code]"
                :key="item.id"
                class="px-4 py-3 grid grid-cols-1 sm:grid-cols-12 gap-3 items-start"
              >
                <div class="sm:col-span-5">
                  <UInput
                    v-model="item.description"
                    placeholder="Description"
                    size="sm"
                  />
                </div>
                <div class="sm:col-span-2">
                  <UInput
                    v-model.number="item.quantity"
                    type="number"
                    placeholder="Qty"
                    size="sm"
                  />
                </div>
                <div class="sm:col-span-3">
                  <UInput
                    v-model.number="item.unitAmount"
                    type="number"
                    placeholder="Unit Amount (ex GST)"
                    size="sm"
                  />
                </div>
                <div class="sm:col-span-2 flex items-center justify-end gap-1">
                  <span class="text-sm font-medium mr-2">
                    {{ formatCurrency(item.quantity * item.unitAmount) }}
                  </span>
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-copy"
                    color="neutral"
                    @click="duplicateLine(cat.code, item)"
                  />
                  <UButton
                    size="xs"
                    variant="ghost"
                    icon="i-lucide-x"
                    color="error"
                    @click="removeLine(cat.code, item.id)"
                  />
                </div>
              </div>
            </div>

            <!-- Empty State -->
            <div v-else class="px-4 py-6 text-center">
              <p class="text-sm text-muted">No items yet. Click "Add Line" to start.</p>
            </div>
          </div>
        </div>

        <!-- Summary & Push -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Invoice Summary</h3>
          </template>

          <div class="space-y-2">
            <div
              v-for="c in categoryTotals"
              :key="c.code"
              class="flex items-center justify-between py-2 border-b border-default/50"
            >
              <div class="flex items-center gap-2">
                <UBadge size="xs" variant="subtle">{{ c.code }}</UBadge>
                <span class="text-sm">{{ c.name }}</span>
                <span class="text-xs text-muted">({{ c.itemCount }} items)</span>
              </div>
              <div class="text-right">
                <span class="text-sm font-medium">{{ formatCurrency(c.subtotal) }}</span>
                <span class="text-xs text-muted ml-2">+ {{ formatCurrency(c.gst) }} GST</span>
              </div>
            </div>

            <div class="pt-4 space-y-2">
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted">Subtotal (ex GST)</span>
                <span class="font-medium">{{ formatCurrency(grandTotalExGst) }}</span>
              </div>
              <div class="flex items-center justify-between">
                <span class="text-sm text-muted">GST</span>
                <span class="font-medium">{{ formatCurrency(grandTotalGst) }}</span>
              </div>
              <div class="flex items-center justify-between pt-2 border-t border-default">
                <span class="text-lg font-bold">Total (inc GST)</span>
                <span class="text-lg font-bold">{{ formatCurrency(grandTotalIncGst) }}</span>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex items-center justify-between">
              <div class="text-sm text-muted">
                {{ allItems.length }} line items across {{ categoryTotals.length }} categories
              </div>
              <UButton
                color="primary"
                icon="i-lucide-upload"
                :loading="pushing"
                :disabled="allItems.length === 0 || !contactName"
                @click="pushToXero"
              >
                Push to Xero as DRAFT
              </UButton>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
