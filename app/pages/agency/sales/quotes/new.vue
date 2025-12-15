<script setup lang="ts">
definePageMeta({
  title: 'New Quote',
  middleware: ['sales']
})

const router = useRouter()

// Form state
const form = reactive({
  title: '',
  description: '',
  clientId: undefined as string | undefined,
  briefId: undefined as string | undefined,
  validUntil: '',
  discountPercent: 0,
  taxPercent: 0,
  currency: 'USD',
  paymentTerms: '',
  terms: '',
  clientNotes: ''
})

// Fetch clients for dropdown
const { data: clientsData } = await useFetch('/api/agency/clients')
const clients = computed(() => {
  return (clientsData.value || []).map((c: any) => ({
    label: c.name,
    value: c.id
  }))
})

// Fetch price templates
const { data: templatesData } = await useFetch('/api/agency/pricing/templates')
const templates = computed(() => (templatesData.value?.templates || []) as any[])
const templateCategories = computed(() => (templatesData.value?.categories || []) as string[])

// Line items
const lineItems = ref<any[]>([])

// Add line item from template
const addFromTemplate = (template: any) => {
  lineItems.value.push({
    id: crypto.randomUUID(),
    itemType: template.itemType,
    name: template.name,
    description: template.description,
    quantity: 1,
    unit: template.defaultUnit,
    unitPrice: template.defaultUnitPrice || 0,
    discountPercent: 0,
    isOptional: false,
    isIncluded: true
  })
}

// Add custom line item
const addCustomItem = () => {
  lineItems.value.push({
    id: crypto.randomUUID(),
    itemType: 'service',
    name: '',
    description: '',
    quantity: 1,
    unit: 'unit',
    unitPrice: 0,
    discountPercent: 0,
    isOptional: false,
    isIncluded: true
  })
}

// Remove line item
const removeItem = (id: string) => {
  lineItems.value = lineItems.value.filter(item => item.id !== id)
}

// Calculate line total
const getLineTotal = (item: any) => {
  const base = item.quantity * item.unitPrice
  return base * (1 - (item.discountPercent || 0) / 100)
}

// Calculate totals
const subtotal = computed(() => {
  return lineItems.value
    .filter(item => item.isIncluded)
    .reduce((sum, item) => sum + getLineTotal(item), 0)
})

const discountAmount = computed(() => subtotal.value * (form.discountPercent / 100))
const taxableAmount = computed(() => subtotal.value - discountAmount.value)
const taxAmount = computed(() => taxableAmount.value * (form.taxPercent / 100))
const total = computed(() => taxableAmount.value + taxAmount.value)

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: form.currency,
    minimumFractionDigits: 2
  }).format(value)
}

// Currency options
const currencyOptions = [
  { label: 'USD - US Dollar', value: 'USD' },
  { label: 'EUR - Euro', value: 'EUR' },
  { label: 'GBP - British Pound', value: 'GBP' },
  { label: 'AUD - Australian Dollar', value: 'AUD' }
]

// Item type options
const itemTypeOptions = [
  { label: 'Service', value: 'service' },
  { label: 'Product', value: 'product' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Fixed', value: 'fixed' },
  { label: 'Media Spend', value: 'media_spend' },
  { label: 'Production', value: 'production' },
  { label: 'Other', value: 'other' }
]

// Submitting state
const isSubmitting = ref(false)
const error = ref('')

// Submit form
const handleSubmit = async () => {
  if (!form.title) {
    error.value = 'Please enter a title for the quote'
    return
  }

  if (!lineItems.value.length) {
    error.value = 'Please add at least one line item'
    return
  }

  isSubmitting.value = true
  error.value = ''

  try {
    // Create quote
    const { quote } = await $fetch<{ quote: any }>('/api/agency/quotes', {
      method: 'POST',
      body: {
        title: form.title,
        description: form.description,
        clientId: form.clientId,
        briefId: form.briefId,
        validUntil: form.validUntil || null,
        discountPercent: form.discountPercent,
        taxPercent: form.taxPercent,
        currency: form.currency,
        paymentTerms: form.paymentTerms,
        terms: form.terms,
        clientNotes: form.clientNotes
      }
    })

    // Add line items
    for (const item of lineItems.value) {
      await $fetch(`/api/agency/quotes/${quote.id}/line-items`, {
        method: 'POST',
        body: {
          itemType: item.itemType,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          discountPercent: item.discountPercent,
          isOptional: item.isOptional,
          isIncluded: item.isIncluded
        }
      })
    }

    // Navigate to quote
    router.push(`/agency/sales/quotes/${quote.id}`)
  } catch (err: any) {
    console.error('Failed to create quote:', err)
    error.value = err.data?.message || 'Failed to create quote'
  } finally {
    isSubmitting.value = false
  }
}

// Show templates sidebar
const showTemplates = ref(false)
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="New Quote">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="router.back()"
          />
        </template>
        <template #right>
          <UButton
            variant="outline"
            label="Cancel"
            @click="router.back()"
          />
          <UButton
            label="Create Quote"
            icon="i-lucide-check"
            color="primary"
            :loading="isSubmitting"
            @click="handleSubmit"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent class="pb-24">
        <!-- Error alert -->
        <UAlert
          v-if="error"
          color="error"
          icon="i-lucide-alert-circle"
          :title="error"
          class="mb-6"
          :close-button="{ icon: 'i-lucide-x', color: 'white', variant: 'link', padded: false }"
          @close="error = ''"
        />

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Form -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Quote Details -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Quote Details</h3>
              </template>

              <div class="space-y-4">
                <UFormGroup label="Title" required>
                  <UInput v-model="form.title" placeholder="Enter quote title" />
                </UFormGroup>

                <UFormGroup label="Description">
                  <UTextarea v-model="form.description" placeholder="Brief description of this quote" />
                </UFormGroup>

                <div class="grid grid-cols-2 gap-4">
                  <UFormGroup label="Client">
                    <USelectMenu
                      v-model="form.clientId"
                      :options="clients"
                      placeholder="Select client"
                      searchable
                    />
                  </UFormGroup>

                  <UFormGroup label="Valid Until">
                    <UInput v-model="form.validUntil" type="date" />
                  </UFormGroup>
                </div>
              </div>
            </UCard>

            <!-- Line Items -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Line Items</h3>
                  <div class="flex gap-2">
                    <UButton
                      variant="outline"
                      size="sm"
                      icon="i-lucide-layout-template"
                      label="From Template"
                      @click="showTemplates = true"
                    />
                    <UButton
                      variant="outline"
                      size="sm"
                      icon="i-lucide-plus"
                      label="Custom Item"
                      @click="addCustomItem"
                    />
                  </div>
                </div>
              </template>

              <div class="space-y-4">
                <div v-if="!lineItems.length" class="text-center py-8 text-gray-500">
                  <UIcon name="i-lucide-file-text" class="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>No line items yet</p>
                  <p class="text-sm">Add items from templates or create custom items</p>
                </div>

                <div
                  v-for="(item, index) in lineItems"
                  :key="item.id"
                  class="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <div class="flex items-start gap-4">
                    <div class="flex-1 grid grid-cols-12 gap-4">
                      <div class="col-span-6">
                        <UFormGroup label="Name" size="sm">
                          <UInput v-model="item.name" placeholder="Item name" size="sm" />
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Type" size="sm">
                          <USelectMenu
                            v-model="item.itemType"
                            :options="itemTypeOptions"
                            size="sm"
                          />
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Unit" size="sm">
                          <UInput v-model="item.unit" placeholder="unit" size="sm" />
                        </UFormGroup>
                      </div>

                      <div class="col-span-12">
                        <UFormGroup label="Description" size="sm">
                          <UInput v-model="item.description" placeholder="Item description" size="sm" />
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Quantity" size="sm">
                          <UInput v-model.number="item.quantity" type="number" min="0" step="0.01" size="sm" />
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Unit Price" size="sm">
                          <UInput v-model.number="item.unitPrice" type="number" min="0" step="0.01" size="sm">
                            <template #leading>
                              <span class="text-gray-400">$</span>
                            </template>
                          </UInput>
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Discount %" size="sm">
                          <UInput v-model.number="item.discountPercent" type="number" min="0" max="100" size="sm" />
                        </UFormGroup>
                      </div>

                      <div class="col-span-3">
                        <UFormGroup label="Line Total" size="sm">
                          <div class="h-8 flex items-center font-medium">
                            {{ formatCurrency(getLineTotal(item)) }}
                          </div>
                        </UFormGroup>
                      </div>

                      <div class="col-span-12 flex items-center gap-4">
                        <UCheckbox v-model="item.isOptional" label="Optional item" />
                        <UCheckbox v-model="item.isIncluded" label="Include in total" />
                      </div>
                    </div>

                    <UButton
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash-2"
                      size="sm"
                      @click="removeItem(item.id)"
                    />
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Terms -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Terms & Notes</h3>
              </template>

              <div class="space-y-4">
                <UFormGroup label="Payment Terms">
                  <UInput v-model="form.paymentTerms" placeholder="e.g., 50% upfront, 50% on completion" />
                </UFormGroup>

                <UFormGroup label="Terms & Conditions">
                  <UTextarea v-model="form.terms" placeholder="Terms and conditions" />
                </UFormGroup>

                <UFormGroup label="Notes for Client">
                  <UTextarea v-model="form.clientNotes" placeholder="Notes visible to the client" />
                </UFormGroup>
              </div>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Totals -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Quote Summary</h3>
              </template>

              <div class="space-y-4">
                <UFormGroup label="Currency">
                  <USelectMenu v-model="form.currency" :options="currencyOptions" />
                </UFormGroup>

                <div class="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Subtotal</span>
                    <span>{{ formatCurrency(subtotal) }}</span>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <span class="text-gray-500">Discount</span>
                    <div class="flex items-center gap-2">
                      <UInput
                        v-model.number="form.discountPercent"
                        type="number"
                        min="0"
                        max="100"
                        class="w-20"
                        size="sm"
                      >
                        <template #trailing>
                          <span class="text-gray-400">%</span>
                        </template>
                      </UInput>
                      <span class="text-red-500">-{{ formatCurrency(discountAmount) }}</span>
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2">
                    <span class="text-gray-500">Tax</span>
                    <div class="flex items-center gap-2">
                      <UInput
                        v-model.number="form.taxPercent"
                        type="number"
                        min="0"
                        max="100"
                        class="w-20"
                        size="sm"
                      >
                        <template #trailing>
                          <span class="text-gray-400">%</span>
                        </template>
                      </UInput>
                      <span>+{{ formatCurrency(taxAmount) }}</span>
                    </div>
                  </div>

                  <div class="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-semibold text-lg">
                    <span>Total</span>
                    <span class="text-primary-500">{{ formatCurrency(total) }}</span>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Quick Templates -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Quick Add</h3>
              </template>

              <div class="space-y-2 max-h-64 overflow-y-auto">
                <div
                  v-for="template in templates.slice(0, 10)"
                  :key="template.id"
                  class="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer"
                  @click="addFromTemplate(template)"
                >
                  <div class="flex-1 min-w-0">
                    <p class="text-sm font-medium truncate">{{ template.name }}</p>
                    <p class="text-xs text-gray-500">{{ formatCurrency(template.defaultUnitPrice || 0) }}</p>
                  </div>
                  <UIcon name="i-lucide-plus" class="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- Templates Slideover -->
    <USlideover v-model="showTemplates">
      <UCard class="h-full overflow-y-auto">
        <template #header>
          <div class="flex items-center justify-between">
            <h3 class="font-semibold">Price Templates</h3>
            <UButton
              variant="ghost"
              icon="i-lucide-x"
              @click="showTemplates = false"
            />
          </div>
        </template>

        <div class="space-y-4">
          <div v-for="category in templateCategories" :key="category">
            <h4 class="font-medium text-sm text-gray-500 mb-2">{{ category }}</h4>
            <div class="space-y-2">
              <div
                v-for="template in templates.filter(t => t.category === category)"
                :key="template.id"
                class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-primary-500 cursor-pointer transition"
                @click="addFromTemplate(template); showTemplates = false"
              >
                <div>
                  <p class="font-medium">{{ template.name }}</p>
                  <p class="text-sm text-gray-500">{{ template.description }}</p>
                </div>
                <div class="text-right">
                  <p class="font-medium">{{ formatCurrency(template.defaultUnitPrice || 0) }}</p>
                  <p class="text-xs text-gray-500">per {{ template.defaultUnit }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UCard>
    </USlideover>
  </UDashboardPage>
</template>
