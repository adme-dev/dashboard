<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Expenses',
  middleware: ['auth']
})

const toast = useToast()

// Filters
const statusFilter = ref('all')
const categoryFilter = ref<string | null>(null)
const searchQuery = ref('')

// Fetch expenses
const { data: expensesData, pending, refresh } = await useFetch('/api/agency/expenses', {
  query: {
    status: statusFilter,
    categoryId: categoryFilter,
    limit: 50
  }
})

const expenses = computed(() => ((expensesData.value as any)?.expenses || []) as any[])
const summary = computed(() => ((expensesData.value as any)?.summary || {
  totalCount: 0,
  totalAmount: 0,
  billableAmount: 0,
  pendingReimbursement: 0,
  pendingApprovalCount: 0,
  missingReceipts: 0
}) as any)
const categories = computed(() => ((expensesData.value as any)?.categories || []) as any[])

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
  { label: 'Submitted', value: 'submitted' },
  { label: 'Pending Approval', value: 'pending_approval' },
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Paid', value: 'paid' }
]

// Table columns
const columns: any[] = [
  { key: 'expenseDate', label: 'Date' },
  { key: 'description', label: 'Description' },
  { key: 'category', label: 'Category' },
  { key: 'project', label: 'Project' },
  { key: 'totalAmount', label: 'Amount' },
  { key: 'status', label: 'Status' },
  { key: 'actions', label: '' }
]

// Status colors
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'neutral' | 'info' => {
  switch (status) {
    case 'approved': return 'success'
    case 'paid': return 'success'
    case 'pending_approval': return 'warning'
    case 'submitted': return 'info'
    case 'draft': return 'neutral'
    case 'rejected': return 'error'
    default: return 'neutral'
  }
}

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'pending_approval': return 'Pending'
    default: return status.charAt(0).toUpperCase() + status.slice(1)
  }
}

// New expense modal
const showNewExpenseModal = ref(false)
const newExpense = ref({
  categoryId: null as string | null,
  projectId: null as string | null,
  amount: 0,
  taxAmount: 0,
  merchant: '',
  description: '',
  expenseDate: new Date().toISOString().split('T')[0],
  billable: false,
  reimbursable: true,
  paymentMethod: 'personal_card'
})

// Fetch projects for dropdown
const { data: projectsData } = await useFetch('/api/agency/projects', {
  query: { status: 'active', limit: 100 }
})
const projects = computed(() => ((projectsData.value as any)?.projects || []) as any[])

const paymentMethodOptions = [
  { label: 'Personal Card', value: 'personal_card' },
  { label: 'Corporate Card', value: 'corporate_card' },
  { label: 'Cash', value: 'cash' },
  { label: 'Bank Transfer', value: 'bank_transfer' }
]

const creatingExpense = ref(false)
const createExpense = async (submit = false) => {
  if (!newExpense.value.categoryId || !newExpense.value.description || !newExpense.value.amount) {
    toast.add({ title: 'Please fill in required fields', color: 'error' })
    return
  }

  creatingExpense.value = true
  try {
    await $fetch('/api/agency/expenses', {
      method: 'POST',
      body: {
        ...newExpense.value,
        submit
      }
    })

    toast.add({
      title: submit ? 'Expense submitted' : 'Expense saved as draft',
      color: 'success'
    })
    showNewExpenseModal.value = false
    resetNewExpense()
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to create expense', description: err.data?.message || err.message, color: 'error' })
  } finally {
    creatingExpense.value = false
  }
}

const resetNewExpense = () => {
  newExpense.value = {
    categoryId: null,
    projectId: null,
    amount: 0,
    taxAmount: 0,
    merchant: '',
    description: '',
    expenseDate: new Date().toISOString().split('T')[0],
    billable: false,
    reimbursable: true,
    paymentMethod: 'personal_card'
  }
}

// Approval actions
const approveExpense = async (expense: any) => {
  try {
    await $fetch(`/api/agency/expenses/${expense.id}/approve`, {
      method: 'POST',
      body: { action: 'approve' }
    })
    toast.add({ title: 'Expense approved', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to approve', description: err.data?.message || err.message, color: 'error' })
  }
}

const showRejectModal = ref(false)
const rejectingExpense = ref<any>(null)
const rejectionReason = ref('')

const openRejectModal = (expense: any) => {
  rejectingExpense.value = expense
  rejectionReason.value = ''
  showRejectModal.value = true
}

const rejectExpense = async () => {
  if (!rejectionReason.value) {
    toast.add({ title: 'Please provide a reason', color: 'error' })
    return
  }

  try {
    await $fetch(`/api/agency/expenses/${rejectingExpense.value.id}/approve`, {
      method: 'POST',
      body: { action: 'reject', reason: rejectionReason.value }
    })
    toast.add({ title: 'Expense rejected', color: 'success' })
    showRejectModal.value = false
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to reject', description: err.data?.message || err.message, color: 'error' })
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Expenses">
        <template #right>
          <UButton
            label="New Expense"
            icon="i-lucide-plus"
            color="primary"
            @click="showNewExpenseModal = true"
          />
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Summary Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-blue-500/10">
                <UIcon name="i-lucide-receipt" class="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Total Expenses</p>
                <p class="text-xl font-bold">{{ formatCurrency(summary.totalAmount) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-emerald-500/10">
                <UIcon name="i-lucide-dollar-sign" class="w-5 h-5 text-emerald-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Billable</p>
                <p class="text-xl font-bold text-emerald-500">{{ formatCurrency(summary.billableAmount) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-amber-500/10">
                <UIcon name="i-lucide-clock" class="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Pending Reimbursement</p>
                <p class="text-xl font-bold text-amber-500">{{ formatCurrency(summary.pendingReimbursement) }}</p>
              </div>
            </div>
          </UCard>

          <UCard>
            <div class="flex items-center gap-3">
              <div class="p-2 rounded-lg bg-red-500/10">
                <UIcon name="i-lucide-alert-circle" class="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p class="text-sm text-gray-500">Pending Approval</p>
                <p class="text-xl font-bold text-red-500">{{ summary.pendingApprovalCount }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Filters -->
        <div class="flex flex-wrap items-center gap-4 mb-6">
          <UInput
            v-model="searchQuery"
            placeholder="Search expenses..."
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
            v-model="categoryFilter"
            :items="[{ label: 'All Categories', value: null }, ...categories.map(c => ({ label: c.name, value: c.id }))]"
            placeholder="Category"
            value-key="value"
            class="w-48"
          />
        </div>

        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Expenses Table -->
        <UCard v-else>
          <UTable :data="expenses" :columns="columns">
            <template #expenseDate-cell="{ row: r }">
              {{ formatDate((r as any).expenseDate) }}
            </template>

            <template #description-cell="{ row: r }">
              <div>
                <p class="font-medium">{{ (r as any).description }}</p>
                <p v-if="(r as any).merchant" class="text-xs text-gray-500">
                  {{ (r as any).merchant }}
                </p>
              </div>
            </template>

            <template #category-cell="{ row: r }">
              <UBadge variant="subtle" color="neutral">
                {{ (r as any).categoryName }}
              </UBadge>
            </template>

            <template #project-cell="{ row: r }">
              <span v-if="(r as any).projectName" class="text-gray-600">
                {{ (r as any).projectName }}
              </span>
              <span v-else class="text-gray-400">—</span>
            </template>

            <template #totalAmount-cell="{ row: r }">
              <div class="text-right">
                <p class="font-semibold">{{ formatCurrency((r as any).totalAmount) }}</p>
                <p v-if="(r as any).billable" class="text-xs text-emerald-500">Billable</p>
              </div>
            </template>

            <template #status-cell="{ row: r }">
              <div class="flex items-center gap-2">
                <UBadge :color="getStatusColor((r as any).status)" variant="subtle">
                  {{ getStatusLabel((r as any).status) }}
                </UBadge>
                <UIcon
                  v-if="(r as any).hasReceipt"
                  name="i-lucide-paperclip"
                  class="w-4 h-4 text-gray-400"
                  title="Has receipt"
                />
              </div>
            </template>

            <template #actions-cell="{ row: r }">
              <div class="flex items-center gap-1">
                <template v-if="(r as any).status === 'pending_approval' || (r as any).status === 'submitted'">
                  <UButton
                    variant="ghost"
                    color="success"
                    icon="i-lucide-check"
                    size="xs"
                    @click="approveExpense(r)"
                  />
                  <UButton
                    variant="ghost"
                    color="error"
                    icon="i-lucide-x"
                    size="xs"
                    @click="openRejectModal(r)"
                  />
                </template>
                <UButton
                  variant="ghost"
                  icon="i-lucide-eye"
                  size="xs"
                  @click="navigateTo(`/agency/expenses/${(r as any).id}`)"
                />
              </div>
            </template>
          </UTable>

          <div v-if="expenses.length === 0" class="text-center text-gray-500 py-8">
            No expenses found
          </div>
        </UCard>
      </div>
    </UDashboardPanel>

    <!-- New Expense Modal -->
    <UModal v-model:open="showNewExpenseModal">
      <template #header>
        <h3 class="font-semibold">New Expense</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Category" required>
            <USelectMenu
              v-model="newExpense.categoryId"
              :items="categories.map(c => ({ label: c.name, value: c.id }))"
              placeholder="Select category"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Project (optional)">
            <USelectMenu
              v-model="newExpense.projectId"
              :items="[{ label: 'None', value: null }, ...projects.map(p => ({ label: p.name, value: p.id }))]"
              placeholder="Select project"
              value-key="value"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Amount" required>
              <UInput v-model.number="newExpense.amount" type="number" min="0" step="0.01" placeholder="0.00" />
            </UFormField>
            <UFormField label="Tax Amount">
              <UInput v-model.number="newExpense.taxAmount" type="number" min="0" step="0.01" placeholder="0.00" />
            </UFormField>
          </div>

          <UFormField label="Merchant">
            <UInput v-model="newExpense.merchant" placeholder="Store or vendor name" />
          </UFormField>

          <UFormField label="Description" required>
            <UTextarea v-model="newExpense.description" placeholder="What was this expense for?" :rows="2" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Date" required>
              <UInput v-model="newExpense.expenseDate" type="date" />
            </UFormField>
            <UFormField label="Payment Method">
              <USelectMenu
                v-model="newExpense.paymentMethod"
                :items="paymentMethodOptions"
                value-key="value"
              />
            </UFormField>
          </div>

          <div class="flex items-center gap-6">
            <UCheckbox v-model="newExpense.billable" label="Billable to client" />
            <UCheckbox v-model="newExpense.reimbursable" label="Reimbursable" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between w-full">
          <UButton variant="ghost" label="Cancel" @click="showNewExpenseModal = false" />
          <div class="flex gap-2">
            <UButton
              variant="outline"
              label="Save Draft"
              :loading="creatingExpense"
              @click="createExpense(false)"
            />
            <UButton
              color="primary"
              label="Submit for Approval"
              :loading="creatingExpense"
              @click="createExpense(true)"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Reject Modal -->
    <UModal v-model:open="showRejectModal">
      <template #header>
        <h3 class="font-semibold">Reject Expense</h3>
      </template>
      <template #body>
        <UFormField label="Rejection Reason" required>
          <UTextarea
            v-model="rejectionReason"
            placeholder="Please provide a reason for rejecting this expense..."
            :rows="3"
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showRejectModal = false" />
          <UButton
            color="error"
            label="Reject Expense"
            @click="rejectExpense"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
