<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Invoices',
  middleware: ['auth']
})

const toast = useToast()

// Filters
const statusFilter = ref('all')
const clientFilter = ref<string | null>(null)
const searchQuery = ref('')

// Fetch invoices
const { data: invoicesData, pending, refresh } = await useFetch('/api/agency/invoices', {
  query: {
    status: statusFilter,
    clientId: clientFilter,
    search: searchQuery,
    limit: 50
  }
})

// Fetch clients for filter
const { data: clientsData } = await useFetch('/api/agency/clients', {
  query: { limit: 100 }
})

const invoices = computed(() => (invoicesData.value?.invoices || []) as any[])
const summary = computed(() => (invoicesData.value?.summary || {
  totalInvoices: 0,
  draftCount: 0,
  sentCount: 0,
  overdueCount: 0,
  paidCount: 0,
  totalInvoiced: 0,
  totalCollected: 0,
  totalOutstanding: 0
}) as any)
const clients = computed(() => ((clientsData.value as any)?.clients || []) as any[])

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatDate = (date: string) => {
  return format(new Date(date), 'MMM d, yyyy')
}

// Status options
const statusOptions = [
  { label: 'All Statuses', value: 'all' },
  { label: 'Draft', value: 'draft' },
  { label: 'Sent', value: 'sent' },
  { label: 'Paid', value: 'paid' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Partially Paid', value: 'partially_paid' }
]

// Table columns
const columns = [
  { accessorKey: 'invoiceNumber', header: 'Invoice #' },
  { accessorKey: 'clientName', header: 'Client' },
  { accessorKey: 'issueDate', header: 'Issue Date' },
  { accessorKey: 'dueDate', header: 'Due Date' },
  { accessorKey: 'totalAmount', header: 'Total' },
  { accessorKey: 'amountDue', header: 'Due' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'actions', header: '' }
]

// Status colors
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'paid': return 'success'
    case 'sent': return 'info'
    case 'draft': return 'neutral'
    case 'overdue': return 'error'
    case 'partially_paid': return 'warning'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'partially_paid': return 'Partial'
    default: return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

// New invoice modal
const showNewInvoiceModal = ref(false)
const newInvoice = ref({
  clientId: null as string | null,
  projectId: null as string | null,
  startDate: '',
  endDate: '',
  taxRate: 0,
  paymentTerms: 'net_30',
  groupBy: 'project'
})

// Fetch projects for selected client
const selectedClientProjects = ref<any[]>([])
watch(() => newInvoice.value.clientId, async (clientId) => {
  if (clientId) {
    const data = await $fetch('/api/agency/projects', {
      query: { clientId, status: 'active', limit: 100 }
    }) as any
    selectedClientProjects.value = data || []
  } else {
    selectedClientProjects.value = []
  }
})

const creatingInvoice = ref(false)
const generateInvoice = async () => {
  if (!newInvoice.value.clientId) {
    toast.add({ title: 'Please select a client', color: 'error' })
    return
  }

  creatingInvoice.value = true
  try {
    const result = await $fetch('/api/agency/invoices/generate', {
      method: 'POST',
      body: {
        clientId: newInvoice.value.clientId,
        projectId: newInvoice.value.projectId,
        startDate: newInvoice.value.startDate || undefined,
        endDate: newInvoice.value.endDate || undefined,
        taxRate: newInvoice.value.taxRate,
        paymentTerms: newInvoice.value.paymentTerms,
        groupBy: newInvoice.value.groupBy
      }
    }) as any

    toast.add({
      title: 'Invoice generated',
      description: `${result.invoice.invoiceNumber} - ${result.entriesIncluded} entries, ${result.totalHours.toFixed(1)}h`,
      color: 'success'
    })
    showNewInvoiceModal.value = false
    refresh()
    navigateTo(`/agency/invoices/${result.invoice.id}`)
  } catch (err: any) {
    toast.add({ title: 'Failed to generate invoice', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingInvoice.value = false
  }
}

// Actions
const sendInvoice = async (invoice: any) => {
  try {
    await ($fetch as any)(`/api/agency/invoices/${invoice.id}/send`, { method: 'POST' })
    toast.add({ title: 'Invoice sent', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to send invoice', description: err.message, color: 'error' })
  }
}
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar title="Invoices">
        <template #right>
          <UButton
            label="New Invoice"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewInvoiceModal = true"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardPanelContent>
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-file-text" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Total Invoiced</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalInvoiced) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-check-circle" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Collected</p>
                <p class="text-xl font-bold text-emerald-500">{{ formatCurrency(summary.totalCollected) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Outstanding</p>
                <p class="text-xl font-bold text-amber-500">{{ formatCurrency(summary.totalOutstanding) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-red-500/10">
                <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Overdue</p>
                <p class="text-xl font-bold text-red-500">{{ summary.overdueCount }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search invoices..."
            icon="i-lucide-search"
            class="w-64"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusOptions"
            placeholder="Status"
            value-key="value"
            class="w-40"
          />
          <USelectMenu
            v-model="clientFilter"
            :items="[{ label: 'All Clients', value: null }, ...clients.map(c => ({ label: c.name, value: c.id }))]"
            placeholder="Client"
            value-key="value"
            class="w-48"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Invoices Table -->
        <UCard v-else>
          <UTable :data="invoices" :columns="columns">
            <template #invoiceNumber-cell="{ row }">
              <NuxtLink :to="`/agency/invoices/${(row.original as any).id}`" class="font-medium text-primary-500 hover:underline">
                {{ (row.original as any).invoiceNumber }}
              </NuxtLink>
            </template>

            <template #clientName-cell="{ row }">
              <span class="font-medium">{{ (row.original as any).clientName }}</span>
              <span v-if="(row.original as any).projectName" class="block text-xs text-gray-500">
                {{ (row.original as any).projectName }}
              </span>
            </template>

            <template #issueDate-cell="{ row }">
              {{ formatDate((row.original as any).issueDate) }}
            </template>

            <template #dueDate-cell="{ row }">
              <span :class="{ 'text-red-500': (row.original as any).daysOverdue > 0 }">
                {{ formatDate((row.original as any).dueDate) }}
              </span>
              <span v-if="(row.original as any).daysOverdue > 0" class="block text-xs text-red-500">
                {{ (row.original as any).daysOverdue }} days overdue
              </span>
            </template>

            <template #totalAmount-cell="{ row }">
              {{ formatCurrency((row.original as any).totalAmount) }}
            </template>

            <template #amountDue-cell="{ row }">
              <span :class="{ 'text-emerald-500': (row.original as any).amountDue === 0, 'font-semibold': (row.original as any).amountDue > 0 }">
                {{ formatCurrency((row.original as any).amountDue) }}
              </span>
            </template>

            <template #status-cell="{ row }">
              <UBadge :color="getStatusColor((row.original as any).status)" variant="subtle">
                {{ getStatusLabel((row.original as any).status) }}
              </UBadge>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex items-center gap-1">
                <UButton
                  v-if="(row.original as any).status === 'draft'"
                  variant="ghost"
                  icon="i-lucide-send"
                  size="xs"
                  @click="sendInvoice(row.original)"
                />
                <UButton
                  variant="ghost"
                  icon="i-lucide-eye"
                  size="xs"
                  @click="navigateTo(`/agency/invoices/${(row.original as any).id}`)"
                />
              </div>
            </template>
          </UTable>

          <div v-if="invoices.length === 0" class="text-center text-gray-500 py-8">
            No invoices found
          </div>
        </UCard>
      </UDashboardPanelContent>
    </UDashboardPanel>

    <!-- New Invoice Modal -->
    <UModal v-model:open="showNewInvoiceModal">
      <template #header>
        <h3 class="font-semibold">Generate Invoice from Time Entries</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client" required>
            <USelectMenu
              v-model="newInvoice.clientId"
              :items="clients.map(c => ({ label: c.name, value: c.id }))"
              placeholder="Select client"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Project (optional)">
            <USelectMenu
              v-model="newInvoice.projectId"
              :items="[{ label: 'All Projects', value: null }, ...selectedClientProjects.map(p => ({ label: p.name, value: p.id }))]"
              placeholder="All projects"
              value-key="value"
              :disabled="!newInvoice.clientId"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Start Date">
              <UInput v-model="newInvoice.startDate" type="date" />
            </UFormField>
            <UFormField label="End Date">
              <UInput v-model="newInvoice.endDate" type="date" />
            </UFormField>
          </div>

          <UFormField label="Group By">
            <USelectMenu
              v-model="newInvoice.groupBy"
              :items="[
                { label: 'Project', value: 'project' },
                { label: 'Individual Entry', value: 'entry' },
                { label: 'Date', value: 'date' },
                { label: 'Team Member', value: 'user' }
              ]"
              value-key="value"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Tax Rate (%)">
              <UInput v-model.number="newInvoice.taxRate" type="number" min="0" max="100" step="0.5" />
            </UFormField>
            <UFormField label="Payment Terms">
              <USelectMenu
                v-model="newInvoice.paymentTerms"
                :items="[
                  { label: 'Due on Receipt', value: 'due_on_receipt' },
                  { label: 'Net 15', value: 'net_15' },
                  { label: 'Net 30', value: 'net_30' },
                  { label: 'Net 45', value: 'net_45' },
                  { label: 'Net 60', value: 'net_60' }
                ]"
                value-key="value"
              />
            </UFormField>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showNewInvoiceModal = false" />
          <UButton
            color="primary"
            label="Generate Invoice"
            :loading="creatingInvoice"
            @click="generateInvoice"
          />
        </div>
      </template>
    </UModal>
  </UDashboardPage>
</template>
