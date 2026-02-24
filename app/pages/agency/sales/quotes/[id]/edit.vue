<template>
  <div class="p-6 space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-4">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          :to="`/agency/sales/quotes/${route.params.id}`"
        />
        <div>
          <h1 class="text-2xl font-bold">Edit Quote</h1>
          <p class="text-gray-500">{{ quote?.quoteNumber }}</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <UButton
          variant="outline"
          :to="`/agency/sales/quotes/${route.params.id}`"
        >
          Cancel
        </UButton>
        <UButton
          color="primary"
          :loading="saving"
          @click="saveQuote"
        >
          Save Changes
        </UButton>
      </div>
    </div>

    <div v-if="pending" class="flex justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-gray-400" />
    </div>

    <div v-else-if="quote" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Main Content -->
      <div class="lg:col-span-2 space-y-6">
        <!-- Quote Details -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Quote Details</h3>
          </template>

          <div class="space-y-4">
            <UFormField label="Title">
              <UInput v-model="form.title" placeholder="Quote title" class="w-full" />
            </UFormField>

            <UFormField label="Description">
              <UTextarea
                v-model="form.description"
                placeholder="Quote description..."
                :rows="3"
                class="w-full"
              />
            </UFormField>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Valid From">
                <UInput v-model="form.validFrom" type="date" class="w-full" />
              </UFormField>
              <UFormField label="Valid Until">
                <UInput v-model="form.validUntil" type="date" class="w-full" />
              </UFormField>
            </div>

            <div class="grid grid-cols-2 gap-4">
              <UFormField label="Currency">
                <USelectMenu
                  v-model="form.currency"
                  :items="currencies"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Assigned To">
                <USelectMenu
                  v-model="form.assignedTo"
                  :items="teamMemberOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </UCard>

        <!-- Line Items -->
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="font-semibold">Line Items</h3>
              <UButton
                size="sm"
                variant="outline"
                icon="i-lucide-plus"
                @click="addLineItem"
              >
                Add Item
              </UButton>
            </div>
          </template>

          <div v-if="lineItems.length === 0" class="text-center py-8 text-gray-500">
            No line items yet. Click "Add Item" to add services or products.
          </div>

          <div v-else class="space-y-4">
            <div
              v-for="(item, index) in lineItems"
              :key="item.id || index"
              class="border rounded-lg p-4 space-y-3"
            >
              <div class="flex items-start justify-between">
                <div class="flex-1 grid grid-cols-2 gap-3">
                  <UFormField label="Type">
                    <USelectMenu
                      v-model="item.itemType"
                      :items="itemTypes"
                      value-key="value"
                      class="w-full"
                    />
                  </UFormField>
                  <UFormField label="Category">
                    <UInput v-model="item.category" placeholder="Category" class="w-full" />
                  </UFormField>
                </div>
                <UButton
                  icon="i-lucide-trash-2"
                  color="error"
                  variant="ghost"
                  size="sm"
                  class="ml-2"
                  @click="removeLineItem(index)"
                />
              </div>

              <UFormField label="Name">
                <UInput v-model="item.name" placeholder="Item name" class="w-full" />
              </UFormField>

              <UFormField label="Description">
                <UTextarea
                  v-model="item.description"
                  placeholder="Item description..."
                  :rows="2"
                  class="w-full"
                />
              </UFormField>

              <div class="grid grid-cols-4 gap-3">
                <UFormField label="Quantity">
                  <UInput v-model.number="item.quantity" type="number" min="0" step="0.01" class="w-full" />
                </UFormField>
                <UFormField label="Unit">
                  <UInput v-model="item.unit" placeholder="hrs, ea, etc." class="w-full" />
                </UFormField>
                <UFormField label="Unit Price">
                  <UInput v-model.number="item.unitPrice" type="number" min="0" step="0.01" class="w-full" />
                </UFormField>
                <UFormField label="Discount %">
                  <UInput v-model.number="item.discountPercent" type="number" min="0" max="100" class="w-full" />
                </UFormField>
              </div>

              <!-- Service-specific fields -->
              <div v-if="item.itemType === 'service'" class="grid grid-cols-2 gap-3">
                <UFormField label="Estimated Hours">
                  <UInput v-model.number="item.estimatedHours" type="number" min="0" class="w-full" />
                </UFormField>
                <UFormField label="Hourly Rate">
                  <UInput v-model.number="item.hourlyRate" type="number" min="0" step="0.01" class="w-full" />
                </UFormField>
              </div>

              <!-- Media-specific fields -->
              <div v-if="item.itemType === 'media'" class="grid grid-cols-3 gap-3">
                <UFormField label="Platform">
                  <UInput v-model="item.mediaPlatform" placeholder="e.g., Google Ads" class="w-full" />
                </UFormField>
                <UFormField label="Media Budget">
                  <UInput v-model.number="item.mediaBudget" type="number" min="0" step="0.01" class="w-full" />
                </UFormField>
                <UFormField label="Agency Fee %">
                  <UInput v-model.number="item.agencyFeePercent" type="number" min="0" max="100" class="w-full" />
                </UFormField>
              </div>

              <div class="flex items-center gap-4 pt-2 border-t">
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="item.isOptional" class="rounded" />
                  Optional item
                </label>
                <label class="flex items-center gap-2 text-sm">
                  <input type="checkbox" v-model="item.isIncluded" class="rounded" />
                  Include in total
                </label>
                <div class="flex-1 text-right font-semibold">
                  Line Total: {{ formatCurrency(calculateLineTotal(item)) }}
                </div>
              </div>
            </div>
          </div>
        </UCard>

        <!-- Terms & Notes -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Terms & Notes</h3>
          </template>

          <div class="space-y-4">
            <UFormField label="Terms & Conditions">
              <UTextarea
                v-model="form.terms"
                placeholder="Enter terms and conditions..."
                :rows="4"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Payment Terms">
              <UTextarea
                v-model="form.paymentTerms"
                placeholder="Enter payment terms..."
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Internal Notes">
              <UTextarea
                v-model="form.notes"
                placeholder="Internal notes (not visible to client)..."
                :rows="2"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Client Notes">
              <UTextarea
                v-model="form.clientNotes"
                placeholder="Notes visible to client..."
                :rows="2"
                class="w-full"
              />
            </UFormField>
          </div>
        </UCard>
      </div>

      <!-- Sidebar -->
      <div class="space-y-6">
        <!-- Quote Summary -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Quote Summary</h3>
          </template>

          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-500">Subtotal</span>
              <span>{{ formatCurrency(subtotal) }}</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <span class="text-gray-500">Discount</span>
                <UInput
                  v-model.number="form.discountPercent"
                  type="number"
                  min="0"
                  max="100"
                  class="w-16"
                  size="xs"
                />
                <span class="text-gray-500">%</span>
              </div>
              <span class="text-error">-{{ formatCurrency(discountAmount) }}</span>
            </div>

            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                <span class="text-gray-500">Tax</span>
                <UInput
                  v-model.number="form.taxPercent"
                  type="number"
                  min="0"
                  max="100"
                  class="w-16"
                  size="xs"
                />
                <span class="text-gray-500">%</span>
              </div>
              <span>{{ formatCurrency(taxAmount) }}</span>
            </div>

            <div class="border-t pt-3 flex justify-between font-semibold">
              <span>Total</span>
              <span class="text-lg">{{ formatCurrency(total) }}</span>
            </div>
          </div>
        </UCard>

        <!-- Client Info -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Client</h3>
          </template>

          <div class="space-y-3">
            <UFormField label="Select Client">
              <USelectMenu
                v-model="form.clientId"
                :items="clientOptions"
                value-key="value"
                placeholder="Select a client"
                class="w-full"
              />
            </UFormField>

            <div v-if="selectedClient" class="text-sm space-y-1 pt-2 border-t">
              <p class="font-medium">{{ selectedClient.name }}</p>
              <p v-if="selectedClient.email" class="text-gray-500">{{ selectedClient.email }}</p>
              <p v-if="selectedClient.phone" class="text-gray-500">{{ selectedClient.phone }}</p>
            </div>
          </div>
        </UCard>

        <!-- Project Link -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Project</h3>
          </template>

          <UFormField label="Link to Project">
            <USelectMenu
              v-model="form.projectId"
              :items="projectOptions"
              value-key="value"
              placeholder="Select a project (optional)"
              class="w-full"
            />
          </UFormField>
        </UCard>

        <!-- Status -->
        <UCard>
          <template #header>
            <h3 class="font-semibold">Status</h3>
          </template>

          <div class="space-y-3">
            <UBadge :color="getStatusColor(quote.status)" size="lg">
              {{ quote.status }}
            </UBadge>
            <p class="text-sm text-gray-500">
              Status changes are made from the quote detail page using the action buttons.
            </p>
          </div>
        </UCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({})

const route = useRoute()
const toast = useToast()

interface LineItem {
  id?: string
  itemType: string
  name: string
  description: string
  quantity: number
  unit: string
  unitPrice: number
  discountPercent: number
  estimatedHours?: number
  hourlyRate?: number
  mediaPlatform?: string
  mediaBudget?: number
  agencyFeePercent?: number
  category: string
  isOptional: boolean
  isIncluded: boolean
  _isNew?: boolean
  _isDeleted?: boolean
}

interface Quote {
  id: string
  quoteNumber: string
  title: string
  description: string
  status: string
  clientId: string
  projectId: string | null
  validFrom: string | null
  validUntil: string | null
  discountPercent: number
  taxPercent: number
  currency: string
  terms: string | null
  paymentTerms: string | null
  notes: string | null
  clientNotes: string | null
  assignedTo: string | null
  lineItems: LineItem[]
  client?: {
    id: string
    name: string
    email?: string
    phone?: string
  }
}

// Fetch quote data
const { data: quote, pending } = await useFetch<Quote>(`/api/agency/quotes/${route.params.id}`)

// Fetch team members
const { data: teamData } = await useFetch<{ members: Array<{ id: string; name: string }> }>('/api/agency/team-members')

// Fetch clients
const { data: clientsData } = await useFetch<Array<{ id: string; name: string; email?: string; phone?: string }>>('/api/agency/clients')

// Fetch projects
const { data: projectsData } = await useFetch<{ projects: Array<{ id: string; name: string }> }>('/api/agency/projects')

const saving = ref(false)

// Form state
const form = ref({
  title: '',
  description: '',
  validFrom: '',
  validUntil: '',
  discountPercent: 0,
  taxPercent: 0,
  currency: 'USD',
  terms: '',
  paymentTerms: '',
  notes: '',
  clientNotes: '',
  assignedTo: null as string | null,
  clientId: '',
  projectId: null as string | null
})

// Line items state
const lineItems = ref<LineItem[]>([])

// Initialize form when quote loads
watch(quote, (q) => {
  if (q) {
    form.value = {
      title: q.title || '',
      description: q.description || '',
      validFrom: q.validFrom ? (String(q.validFrom).split('T')[0] ?? '') : '',
      validUntil: q.validUntil ? (String(q.validUntil).split('T')[0] ?? '') : '',
      discountPercent: q.discountPercent || 0,
      taxPercent: q.taxPercent || 0,
      currency: q.currency || 'USD',
      terms: q.terms || '',
      paymentTerms: q.paymentTerms || '',
      notes: q.notes || '',
      clientNotes: q.clientNotes || '',
      assignedTo: q.assignedTo || null,
      clientId: q.clientId || '',
      projectId: q.projectId || null
    }
    lineItems.value = (q.lineItems || []).map(item => ({
      ...item,
      _isNew: false,
      _isDeleted: false
    }))
  }
}, { immediate: true })

// Options
const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD']

const itemTypes = [
  { label: 'Service', value: 'service' },
  { label: 'Product', value: 'product' },
  { label: 'Media', value: 'media' },
  { label: 'Other', value: 'other' }
]

const teamMemberOptions = computed(() => {
  const members = teamData.value?.members || []
  return [
    { label: 'Unassigned', value: null },
    ...members.map(m => ({ label: m.name, value: m.id }))
  ]
})

const clientOptions = computed(() => {
  const clients = clientsData.value || []
  return clients.map(c => ({ label: c.name, value: c.id }))
})

const projectOptions = computed(() => {
  const projects = projectsData.value?.projects || []
  return [
    { label: 'No project', value: null },
    ...projects.map(p => ({ label: p.name, value: p.id }))
  ]
})

const selectedClient = computed(() => {
  if (!form.value.clientId || !clientsData.value) return null
  return clientsData.value.find(c => c.id === form.value.clientId)
})

// Calculations
const calculateLineTotal = (item: LineItem): number => {
  if (item._isDeleted || (!item.isIncluded && item.isOptional)) return 0

  let baseAmount = item.quantity * item.unitPrice

  if (item.itemType === 'service' && item.estimatedHours && item.hourlyRate) {
    baseAmount = item.estimatedHours * item.hourlyRate
  }

  if (item.itemType === 'media' && item.mediaBudget) {
    const agencyFee = item.mediaBudget * (item.agencyFeePercent || 0) / 100
    baseAmount = item.mediaBudget + agencyFee
  }

  const discount = baseAmount * (item.discountPercent || 0) / 100
  return baseAmount - discount
}

const subtotal = computed(() => {
  return lineItems.value
    .filter(item => !item._isDeleted)
    .reduce((sum, item) => sum + calculateLineTotal(item), 0)
})

const discountAmount = computed(() => {
  return subtotal.value * (form.value.discountPercent || 0) / 100
})

const taxableAmount = computed(() => {
  return subtotal.value - discountAmount.value
})

const taxAmount = computed(() => {
  return taxableAmount.value * (form.value.taxPercent || 0) / 100
})

const total = computed(() => {
  return taxableAmount.value + taxAmount.value
})

// Line item actions
const addLineItem = () => {
  lineItems.value.push({
    itemType: 'service',
    name: '',
    description: '',
    quantity: 1,
    unit: 'hrs',
    unitPrice: 0,
    discountPercent: 0,
    category: '',
    isOptional: false,
    isIncluded: true,
    _isNew: true,
    _isDeleted: false
  })
}

const removeLineItem = (index: number) => {
  const item = lineItems.value[index]
  if (!item) return
  if (item._isNew) {
    lineItems.value.splice(index, 1)
  } else {
    item._isDeleted = true
  }
}

// Formatting
const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: form.value.currency || 'USD'
  }).format(amount)
}

const getStatusColor = (status: string): 'warning' | 'primary' | 'success' | 'error' | 'neutral' => {
  const colors: Record<string, 'warning' | 'primary' | 'success' | 'error' | 'neutral'> = {
    draft: 'neutral',
    pending: 'warning',
    sent: 'primary',
    accepted: 'success',
    rejected: 'error',
    expired: 'neutral'
  }
  return colors[status] || 'neutral'
}

// Save quote
const saveQuote = async () => {
  saving.value = true

  try {
    // Update quote details
    await $fetch(`/api/agency/quotes/${route.params.id}`, {
      method: 'PUT',
      body: {
        title: form.value.title,
        description: form.value.description || null,
        validFrom: form.value.validFrom || null,
        validUntil: form.value.validUntil || null,
        discountPercent: form.value.discountPercent,
        taxPercent: form.value.taxPercent,
        currency: form.value.currency,
        terms: form.value.terms || null,
        paymentTerms: form.value.paymentTerms || null,
        notes: form.value.notes || null,
        clientNotes: form.value.clientNotes || null,
        assignedTo: form.value.assignedTo,
        clientId: form.value.clientId,
        projectId: form.value.projectId
      }
    })

    // Handle line items
    for (const item of lineItems.value) {
      if (item._isDeleted && item.id) {
        // Delete existing item
        await $fetch(`/api/agency/quotes/${route.params.id}/line-items/${item.id}`, {
          method: 'DELETE'
        }).catch(() => {}) // Ignore if already deleted
      } else if (item._isNew && !item._isDeleted) {
        // Create new item
        await $fetch(`/api/agency/quotes/${route.params.id}/line-items`, {
          method: 'POST',
          body: {
            itemType: item.itemType,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            estimatedHours: item.estimatedHours || null,
            hourlyRate: item.hourlyRate || null,
            mediaPlatform: item.mediaPlatform || null,
            mediaBudget: item.mediaBudget || null,
            agencyFeePercent: item.agencyFeePercent || null,
            category: item.category || null,
            isOptional: item.isOptional,
            isIncluded: item.isIncluded
          }
        })
      } else if (item.id && !item._isDeleted) {
        // Update existing item
        await $fetch(`/api/agency/quotes/${route.params.id}/line-items/${item.id}`, {
          method: 'PUT',
          body: {
            itemType: item.itemType,
            name: item.name,
            description: item.description || null,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            discountPercent: item.discountPercent,
            estimatedHours: item.estimatedHours || null,
            hourlyRate: item.hourlyRate || null,
            mediaPlatform: item.mediaPlatform || null,
            mediaBudget: item.mediaBudget || null,
            agencyFeePercent: item.agencyFeePercent || null,
            category: item.category || null,
            isOptional: item.isOptional,
            isIncluded: item.isIncluded
          }
        })
      }
    }

    toast.add({
      title: 'Quote saved',
      description: 'Your changes have been saved successfully.',
      color: 'success'
    })

    // Navigate back to quote detail
    navigateTo(`/agency/sales/quotes/${route.params.id}`)
  } catch (error: any) {
    toast.add({
      title: 'Error',
      description: error.data?.message || 'Failed to save quote',
      color: 'error'
    })
  } finally {
    saving.value = false
  }
}
</script>
