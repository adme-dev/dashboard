<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Client Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()
const clientId = route.params.id as string

// Fetch client data
const { data: clientData, pending, refresh } = await useFetch(`/api/agency/clients/${clientId}`)

const client = computed(() => (clientData.value as any)?.client || null)
const projects = computed(() => ((clientData.value as any)?.projects || []) as any[])
const recentTimeEntries = computed(() => ((clientData.value as any)?.recentTimeEntries || []) as any[])
const invoices = computed(() => ((clientData.value as any)?.invoices || []) as any[])
const mediaSpend = computed(() => ((clientData.value as any)?.mediaSpend || []) as any[])
const summary = computed(() => (clientData.value as any)?.summary || {
  totalRevenue: 0, totalCost: 0, grossProfit: 0, grossMargin: 0,
  totalHours: 0, totalProjects: 0, activeProjects: 0, completedProjects: 0,
  totalInvoiced: 0, totalMediaSpend: 0
})

// Active tab
const activeTab = ref('overview')

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

const formatPercent = (value: number) => `${value.toFixed(1)}%`

const formatDate = (date: string) => {
  if (!date) return '—'
  return format(new Date(date), 'MMM d, yyyy')
}

// Status colors
const getProjectStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'active': return 'success'
    case 'completed': return 'info'
    case 'on_hold': return 'warning'
    case 'cancelled': return 'error'
    default: return 'neutral'
  }
}

const getInvoiceStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' => {
  switch (status) {
    case 'paid': return 'success'
    case 'sent': return 'warning'
    case 'overdue': return 'error'
    default: return 'neutral'
  }
}

const getMarginColor = (margin: number): 'success' | 'warning' | 'error' => {
  if (margin >= 30) return 'success'
  if (margin >= 15) return 'warning'
  return 'error'
}

// Billing type labels
const billingTypeLabels: Record<string, string> = {
  retainer: 'Retainer',
  time_materials: 'Time & Materials',
  fixed: 'Fixed Price',
  commission: 'Commission',
  project: 'Project-Based',
  hybrid: 'Hybrid'
}

// Edit modal
const showEditModal = ref(false)
const editForm = ref({
  name: '',
  billingType: '',
  paymentTerms: 30,
  hourlyRate: null as number | null,
  retainerAmount: null as number | null,
  mediaCommissionRate: null as number | null,
  xeroContactId: null as string | null,
  notes: '',
  isActive: true
})

const openEditModal = () => {
  if (client.value) {
    editForm.value = {
      name: client.value.name,
      billingType: client.value.billingType,
      paymentTerms: client.value.paymentTerms || 30,
      hourlyRate: client.value.hourlyRate,
      retainerAmount: client.value.retainerAmount,
      mediaCommissionRate: client.value.mediaCommissionRate,
      xeroContactId: client.value.xeroContactId || null,
      notes: client.value.notes || '',
      isActive: client.value.isActive
    }
    showEditModal.value = true
  }
}

const saving = ref(false)
const saveClient = async () => {
  saving.value = true
  try {
    await $fetch(`/api/agency/clients/${clientId}`, {
      method: 'PUT',
      body: editForm.value
    })
    toast.add({ title: 'Client updated', color: 'success' })
    showEditModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to update client', description: err.data?.message || err.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

const unlinkXero = async () => {
  try {
    await $fetch(`/api/agency/clients/${clientId}`, {
      method: 'PUT',
      body: { xeroContactId: null }
    })
    toast.add({ title: 'Xero contact unlinked', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to unlink', description: err.data?.message || err.message, color: 'error' })
  }
}

const billingTypeOptions = [
  { label: 'Time & Materials', value: 'time_materials' },
  { label: 'Retainer', value: 'retainer' },
  { label: 'Fixed Price', value: 'fixed' },
  { label: 'Commission', value: 'commission' },
  { label: 'Project-Based', value: 'project' },
  { label: 'Hybrid', value: 'hybrid' }
]

// Project columns
const projectColumns = [
  { accessorKey: 'name', header: 'Project' },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'budget', header: 'Budget' },
  { accessorKey: 'spent', header: 'Spent' },
  { accessorKey: 'margin', header: 'Margin' }
]

// Time entry columns
const timeColumns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'project', header: 'Project' },
  { accessorKey: 'user', header: 'Team Member' },
  { accessorKey: 'hours', header: 'Hours' },
  { accessorKey: 'amount', header: 'Amount' }
]

// Invoice columns
const invoiceColumns = [
  { accessorKey: 'number', header: 'Invoice #' },
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'total', header: 'Total' },
  { accessorKey: 'status', header: 'Status' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="client?.name || 'Client Details'">
        <template #leading>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            to="/agency/clients"
          />
        </template>
        <template #trailing>
          <div v-if="client" class="flex items-center gap-2">
            <UBadge variant="subtle" :color="client.isActive ? 'success' : 'neutral'">
              {{ client.isActive ? 'Active' : 'Inactive' }}
            </UBadge>
            <span class="text-sm text-gray-500">{{ billingTypeLabels[client.billingType] || client.billingType }}</span>
          </div>
        </template>
        <template #right>
          <div class="flex gap-2">
            <UButton
              label="New Project"
              icon="i-lucide-folder-plus"
              variant="outline"
              :to="`/agency/projects/new?clientId=${clientId}`"
            />
            <UButton
              label="Edit"
              icon="i-lucide-pencil"
              color="primary"
              @click="openEditModal"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <template v-else-if="client">
          <!-- Summary Cards -->
          <div class="grid grid-cols-1 md:grid-cols-6 gap-4 mb-6">
            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total Revenue</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalRevenue) }}</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total Cost</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalCost) }}</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Gross Profit</p>
                <p class="text-xl font-bold" :class="summary.grossProfit >= 0 ? 'text-emerald-500' : 'text-red-500'">
                  {{ formatCurrency(summary.grossProfit) }}
                </p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Margin</p>
                <UBadge :color="getMarginColor(summary.grossMargin)" size="lg">
                  {{ formatPercent(summary.grossMargin) }}
                </UBadge>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Total Hours</p>
                <p class="text-xl font-bold">{{ summary.totalHours.toFixed(1) }}h</p>
              </div>
            </UCard>

            <UCard>
              <div class="text-center">
                <p class="text-sm text-gray-500">Projects</p>
                <p class="text-xl font-bold">
                  <span class="text-emerald-500">{{ summary.activeProjects }}</span>
                  <span class="text-gray-400"> / {{ summary.totalProjects }}</span>
                </p>
              </div>
            </UCard>
          </div>

          <!-- Tabs -->
          <UTabs
            v-model="activeTab"
            :items="[
              { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
              { label: 'Projects', value: 'projects', icon: 'i-lucide-folder', badge: projects.length.toString() },
              { label: 'Time Entries', value: 'time', icon: 'i-lucide-clock' },
              { label: 'Invoices', value: 'invoices', icon: 'i-lucide-receipt' },
              { label: 'Media Spend', value: 'media', icon: 'i-lucide-megaphone' }
            ]"
            class="mb-6"
          />

          <!-- Overview Tab -->
          <div v-if="activeTab === 'overview'" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Client Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Client Information</h3>
              </template>
              <dl class="space-y-3">
                <div>
                  <dt class="text-sm text-gray-500">Billing Type</dt>
                  <dd class="font-medium">{{ billingTypeLabels[client.billingType] || client.billingType }}</dd>
                </div>
                <div>
                  <dt class="text-sm text-gray-500">Payment Terms</dt>
                  <dd class="font-medium">{{ client.paymentTerms }} days</dd>
                </div>
                <div v-if="client.hourlyRate">
                  <dt class="text-sm text-gray-500">Hourly Rate</dt>
                  <dd class="font-medium">{{ formatCurrency(client.hourlyRate) }}/hr</dd>
                </div>
                <div v-if="client.retainerAmount">
                  <dt class="text-sm text-gray-500">Retainer Amount</dt>
                  <dd class="font-medium">{{ formatCurrency(client.retainerAmount) }}/mo</dd>
                </div>
                <div v-if="client.mediaCommissionRate">
                  <dt class="text-sm text-gray-500">Media Commission</dt>
                  <dd class="font-medium">{{ client.mediaCommissionRate }}%</dd>
                </div>
                <div v-if="client.notes">
                  <dt class="text-sm text-gray-500">Notes</dt>
                  <dd class="text-sm">{{ client.notes }}</dd>
                </div>
              </dl>
            </UCard>

            <!-- Recent Projects -->
            <UCard class="lg:col-span-2">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Active Projects</h3>
                  <UButton
                    variant="ghost"
                    size="xs"
                    label="View All"
                    @click="activeTab = 'projects'"
                  />
                </div>
              </template>
              <div class="space-y-3">
                <div
                  v-for="project in projects.filter(p => p.status === 'active').slice(0, 5)"
                  :key="project.id"
                  class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                >
                  <div>
                    <NuxtLink :to="`/agency/projects/${project.id}`" class="font-medium hover:text-primary-500">
                      {{ project.name }}
                    </NuxtLink>
                    <p class="text-sm text-gray-500">{{ formatCurrency(project.budgetAmount) }} budget</p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium">{{ formatCurrency(project.totalCost) }} spent</p>
                    <UBadge :color="getMarginColor(project.margin)" variant="subtle" size="xs">
                      {{ formatPercent(project.margin) }} margin
                    </UBadge>
                  </div>
                </div>
                <div v-if="projects.filter(p => p.status === 'active').length === 0" class="text-center text-gray-500 py-4">
                  No active projects
                </div>
              </div>
            </UCard>

            <!-- Xero Link -->
            <UCard class="lg:col-span-3">
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Xero Integration</h3>
                  <UIcon name="i-lucide-link" class="w-5 h-5 text-gray-400" />
                </div>
              </template>
              <div v-if="client.xeroContactId" class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <UBadge color="success" variant="subtle">
                    <UIcon name="i-lucide-check" class="w-3 h-3 mr-1" />
                    Linked
                  </UBadge>
                  <span class="text-sm text-gray-500">Contact ID: {{ client.xeroContactId }}</span>
                </div>
                <div class="flex items-center gap-2">
                  <UButton
                    label="View in Xero"
                    icon="i-lucide-external-link"
                    variant="outline"
                    size="sm"
                    :to="`https://go.xero.com/Contacts/View/${client.xeroContactId}`"
                    target="_blank"
                  />
                  <UButton
                    label="Unlink"
                    icon="i-lucide-unlink"
                    variant="ghost"
                    size="sm"
                    color="error"
                    @click="unlinkXero"
                  />
                </div>
              </div>
              <div v-else class="flex items-center justify-between">
                <p class="text-sm text-gray-500">Not linked to a Xero contact</p>
                <UButton
                  label="Link to Xero Contact"
                  icon="i-lucide-link"
                  variant="outline"
                  size="sm"
                  @click="openEditModal"
                />
              </div>
            </UCard>
          </div>

          <!-- Projects Tab -->
          <div v-if="activeTab === 'projects'">
            <UCard>
              <UTable :data="projects" :columns="projectColumns">
                <template #name-cell="{ row: r }">
                  <NuxtLink :to="`/agency/projects/${(r as any).id}`" class="font-medium hover:text-primary-500">
                    {{ (r as any).name }}
                  </NuxtLink>
                </template>

                <template #status-cell="{ row: r }">
                  <UBadge :color="getProjectStatusColor((r as any).status)" variant="subtle">
                    {{ (r as any).status }}
                  </UBadge>
                </template>

                <template #budget-cell="{ row: r }">
                  {{ formatCurrency((r as any).budgetAmount) }}
                </template>

                <template #spent-cell="{ row: r }">
                  {{ formatCurrency((r as any).totalCost) }}
                </template>

                <template #margin-cell="{ row: r }">
                  <UBadge :color="getMarginColor((r as any).margin)" variant="subtle">
                    {{ formatPercent((r as any).margin) }}
                  </UBadge>
                </template>
              </UTable>

              <div v-if="projects.length === 0" class="text-center text-gray-500 py-8">
                No projects yet
              </div>
            </UCard>
          </div>

          <!-- Time Entries Tab -->
          <div v-if="activeTab === 'time'">
            <UCard>
              <UTable :data="recentTimeEntries" :columns="timeColumns">
                <template #date-cell="{ row: r }">
                  {{ formatDate((r as any).date) }}
                </template>

                <template #project-cell="{ row: r }">
                  {{ (r as any).projectName }}
                </template>

                <template #user-cell="{ row: r }">
                  {{ (r as any).userName }}
                </template>

                <template #hours-cell="{ row: r }">
                  {{ (r as any).hours }}h
                </template>

                <template #amount-cell="{ row: r }">
                  {{ formatCurrency((r as any).amount) }}
                </template>
              </UTable>

              <div v-if="recentTimeEntries.length === 0" class="text-center text-gray-500 py-8">
                No time entries yet
              </div>
            </UCard>
          </div>

          <!-- Invoices Tab -->
          <div v-if="activeTab === 'invoices'">
            <UCard>
              <UTable :data="invoices" :columns="invoiceColumns">
                <template #number-cell="{ row: r }">
                  <span class="font-medium">{{ (r as any).invoiceNumber }}</span>
                </template>

                <template #date-cell="{ row: r }">
                  {{ formatDate((r as any).issueDate) }}
                </template>

                <template #total-cell="{ row: r }">
                  {{ formatCurrency((r as any).total) }}
                </template>

                <template #status-cell="{ row: r }">
                  <UBadge :color="getInvoiceStatusColor((r as any).status)" variant="subtle">
                    {{ (r as any).status }}
                  </UBadge>
                </template>
              </UTable>

              <div v-if="invoices.length === 0" class="text-center text-gray-500 py-8">
                No invoices yet
              </div>
            </UCard>
          </div>

          <!-- Media Spend Tab -->
          <div v-if="activeTab === 'media'">
            <UCard>
              <div class="mb-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-gray-500">Total Media Spend</p>
                    <p class="text-2xl font-bold">{{ formatCurrency(summary.totalMediaSpend) }}</p>
                  </div>
                  <div v-if="client.mediaCommissionRate">
                    <p class="text-sm text-gray-500">Est. Commission</p>
                    <p class="text-2xl font-bold text-emerald-500">
                      {{ formatCurrency(summary.totalMediaSpend * client.mediaCommissionRate / 100) }}
                    </p>
                  </div>
                </div>
              </div>

              <div class="space-y-3">
                <div
                  v-for="spend in mediaSpend"
                  :key="spend.id"
                  class="flex items-center justify-between p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div>
                    <p class="font-medium">{{ spend.platform }}</p>
                    <p class="text-sm text-gray-500">{{ spend.period }}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-medium">{{ formatCurrency(spend.actualSpend) }}</p>
                    <p class="text-sm text-emerald-500">+{{ formatCurrency(spend.commission) }} commission</p>
                  </div>
                </div>
              </div>

              <div v-if="mediaSpend.length === 0" class="text-center text-gray-500 py-8">
                No media spend tracked
              </div>
            </UCard>
          </div>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Edit Modal -->
    <UModal v-model:open="showEditModal">
      <template #header>
        <h3 class="font-semibold">Edit Client</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Client Name" required>
            <UInput v-model="editForm.name" />
          </UFormField>

          <UFormField label="Billing Type">
            <USelectMenu
              v-model="editForm.billingType"
              :items="billingTypeOptions"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Payment Terms (days)">
            <UInput v-model.number="editForm.paymentTerms" type="number" min="0" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Hourly Rate">
              <UInput v-model.number="editForm.hourlyRate" type="number" min="0" />
            </UFormField>

            <UFormField label="Retainer Amount">
              <UInput v-model.number="editForm.retainerAmount" type="number" min="0" />
            </UFormField>
          </div>

          <UFormField label="Media Commission Rate (%)">
            <UInput v-model.number="editForm.mediaCommissionRate" type="number" min="0" max="100" />
          </UFormField>

          <UFormField label="Xero Contact">
            <XeroContactSearch v-model="editForm.xeroContactId" />
          </UFormField>

          <UFormField label="Notes">
            <UTextarea v-model="editForm.notes" :rows="3" />
          </UFormField>

          <UCheckbox v-model="editForm.isActive" label="Client is active" />
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
          <UButton
            color="primary"
            label="Save Changes"
            :loading="saving"
            @click="saveClient"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
