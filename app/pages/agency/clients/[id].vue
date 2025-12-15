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
  { key: 'name', label: 'Project' },
  { key: 'status', label: 'Status' },
  { key: 'budget', label: 'Budget' },
  { key: 'spent', label: 'Spent' },
  { key: 'margin', label: 'Margin' }
]

// Time entry columns
const timeColumns = [
  { key: 'date', label: 'Date' },
  { key: 'project', label: 'Project' },
  { key: 'user', label: 'Team Member' },
  { key: 'hours', label: 'Hours' },
  { key: 'amount', label: 'Amount' }
]

// Invoice columns
const invoiceColumns = [
  { key: 'number', label: 'Invoice #' },
  { key: 'date', label: 'Date' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' }
]
</script>

<template>
  <UDashboardPage>
    <UDashboardPanel grow>
      <UDashboardNavbar>
        <template #left>
          <div class="flex items-center gap-3">
            <UButton
              variant="ghost"
              icon="i-lucide-arrow-left"
              to="/agency/clients"
            />
            <div v-if="client">
              <h1 class="text-xl font-semibold">{{ client.name }}</h1>
              <div class="flex items-center gap-2 text-sm text-gray-500">
                <UBadge variant="subtle" :color="client.isActive ? 'success' : 'neutral'">
                  {{ client.isActive ? 'Active' : 'Inactive' }}
                </UBadge>
                <span>{{ billingTypeLabels[client.billingType] || client.billingType }}</span>
              </div>
            </div>
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

      <UDashboardPanelContent>
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
      </UDashboardPanelContent>
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
  </UDashboardPage>
</template>
