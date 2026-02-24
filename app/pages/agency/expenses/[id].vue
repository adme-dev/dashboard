<script setup lang="ts">
definePageMeta({
  title: 'Expense Details',
  middleware: ['auth']
})

const route = useRoute()
const router = useRouter()
const toast = useToast()

// Fetch expense data
const { data, pending, refresh } = await useFetch<{
  expense: {
    id: string
    userId: string
    userName: string
    userEmail: string
    categoryId: string
    categoryName: string
    categoryCode: string
    projectId: string | null
    projectName: string | null
    clientId: string | null
    clientName: string | null
    taskId: string | null
    taskTitle: string | null
    amount: number
    currency: string
    exchangeRate: number
    taxAmount: number
    totalAmount: number
    merchant: string
    description: string
    expenseDate: string
    billable: boolean
    invoiced: boolean
    invoiceId: string | null
    status: string
    submittedAt: string | null
    approvedAt: string | null
    approvedBy: string | null
    approvedByName: string | null
    rejectionReason: string | null
    paymentMethod: string
    reimbursable: boolean
    reimbursed: boolean
    reimbursedAt: string | null
    reimbursementReference: string | null
    hasReceipt: boolean
    receiptUrl: string | null
    notes: string | null
    tags: string[] | null
    externalId: string | null
    createdAt: string
    updatedAt: string
  }
  receipts: Array<{
    id: string
    fileName: string
    fileType: string
    fileSize: number
    fileUrl: string
    thumbnailUrl: string | null
    ocrProcessed: boolean
    ocrVendor: string | null
    ocrAmount: number | null
    ocrDate: string | null
    uploadedAt: string
  }>
  report: {
    id: string
    reportNumber: string
    title: string
    status: string
  } | null
}>(`/api/agency/expenses/${route.params.id}`)

const expense = computed(() => data.value?.expense)
const receipts = computed(() => data.value?.receipts || [])
const report = computed(() => data.value?.report)

// Format helpers
const formatCurrency = (value: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

const formatDate = (date: string) => {
  if (!date) return '—'
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}

const formatDateTime = (date: string) => {
  if (!date) return '—'
  return new Date(date).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Status helpers
const getStatusColor = (status: string): 'success' | 'warning' | 'error' | 'info' | 'neutral' => {
  switch (status) {
    case 'approved': return 'success'
    case 'pending': return 'warning'
    case 'submitted': return 'info'
    case 'rejected': return 'error'
    case 'draft': return 'neutral'
    default: return 'neutral'
  }
}

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    draft: 'Draft',
    submitted: 'Submitted',
    pending: 'Pending Approval',
    approved: 'Approved',
    rejected: 'Rejected',
    reimbursed: 'Reimbursed'
  }
  return labels[status] || status
}

const paymentMethodLabels: Record<string, string> = {
  cash: 'Cash',
  credit_card: 'Credit Card',
  debit_card: 'Debit Card',
  company_card: 'Company Card',
  personal_card: 'Personal Card',
  bank_transfer: 'Bank Transfer',
  check: 'Check',
  other: 'Other'
}

// Edit modal
const showEditModal = ref(false)
const editForm = ref({
  categoryId: '',
  projectId: null as string | null,
  amount: 0,
  taxAmount: 0,
  merchant: '',
  description: '',
  expenseDate: '',
  billable: false,
  paymentMethod: 'company_card',
  reimbursable: false,
  notes: ''
})
const saving = ref(false)

const openEditModal = () => {
  if (expense.value) {
    editForm.value = {
      categoryId: expense.value.categoryId,
      projectId: expense.value.projectId,
      amount: expense.value.amount,
      taxAmount: expense.value.taxAmount,
      merchant: expense.value.merchant || '',
      description: expense.value.description || '',
      expenseDate: expense.value.expenseDate ? (expense.value.expenseDate.split('T')[0] ?? '') : '',
      billable: expense.value.billable,
      paymentMethod: expense.value.paymentMethod || 'company_card',
      reimbursable: expense.value.reimbursable,
      notes: expense.value.notes || ''
    }
    showEditModal.value = true
  }
}

const saveExpense = async () => {
  saving.value = true
  try {
    await $fetch(`/api/agency/expenses/${route.params.id}`, {
      method: 'PUT',
      body: editForm.value
    })
    toast.add({ title: 'Expense updated successfully', color: 'success' })
    showEditModal.value = false
    refresh()
  } catch (error) {
    toast.add({ title: 'Failed to update expense', color: 'error' })
  } finally {
    saving.value = false
  }
}

// Approval actions
const approving = ref(false)
const rejecting = ref(false)
const showRejectModal = ref(false)
const rejectionReason = ref('')

const approveExpense = async () => {
  approving.value = true
  try {
    await $fetch(`/api/agency/expenses/${route.params.id}`, {
      method: 'PUT',
      body: { status: 'approved' }
    })
    toast.add({ title: 'Expense approved', color: 'success' })
    refresh()
  } catch (error) {
    toast.add({ title: 'Failed to approve expense', color: 'error' })
  } finally {
    approving.value = false
  }
}

const rejectExpense = async () => {
  rejecting.value = true
  try {
    await $fetch(`/api/agency/expenses/${route.params.id}`, {
      method: 'PUT',
      body: {
        status: 'rejected',
        rejectionReason: rejectionReason.value
      }
    })
    toast.add({ title: 'Expense rejected', color: 'warning' })
    showRejectModal.value = false
    rejectionReason.value = ''
    refresh()
  } catch (error) {
    toast.add({ title: 'Failed to reject expense', color: 'error' })
  } finally {
    rejecting.value = false
  }
}

// Fetch categories for edit form
const { data: categoriesData } = await useFetch<{ categories: Array<{ id: string; name: string }> }>('/api/agency/expenses/categories')
const categories = computed(() => categoriesData.value?.categories || [])
const categoryOptions = computed(() => categories.value.map(c => ({ label: c.name, value: c.id })))

// Fetch projects for edit form
const { data: projectsData } = await useFetch<{ projects: Array<{ id: string; name: string }> }>('/api/agency/projects')
const projects = computed(() => projectsData.value?.projects || [])
const projectOptions = computed(() => [
  { label: 'No Project', value: null },
  ...projects.value.map(p => ({ label: p.name, value: p.id }))
])

const paymentMethodOptions = [
  { label: 'Company Card', value: 'company_card' },
  { label: 'Personal Card', value: 'personal_card' },
  { label: 'Cash', value: 'cash' },
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Check', value: 'check' },
  { label: 'Other', value: 'other' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="expense ? `Expense: ${expense.merchant || expense.categoryName}` : 'Loading...'">
        <template #left>
          <UButton
            icon="i-lucide-arrow-left"
            variant="ghost"
            to="/agency/expenses"
          />
        </template>
        <template #right>
          <template v-if="expense">
            <template v-if="expense.status === 'submitted' || expense.status === 'pending'">
              <UButton
                label="Reject"
                icon="i-lucide-x"
                color="error"
                variant="outline"
                @click="showRejectModal = true"
              />
              <UButton
                label="Approve"
                icon="i-lucide-check"
                color="success"
                :loading="approving"
                @click="approveExpense"
              />
            </template>
            <UButton
              v-if="expense.status === 'draft'"
              label="Edit"
              icon="i-lucide-edit"
              variant="outline"
              @click="openEditModal"
            />
          </template>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <div v-else-if="expense" class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Main Content -->
          <div class="lg:col-span-2 space-y-6">
            <!-- Expense Summary -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <div>
                    <h2 class="text-xl font-semibold">{{ expense.merchant || 'Expense' }}</h2>
                    <p class="text-sm text-gray-500">{{ expense.categoryName }}</p>
                  </div>
                  <UBadge :color="getStatusColor(expense.status)" size="lg">
                    {{ getStatusLabel(expense.status) }}
                  </UBadge>
                </div>
              </template>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-6">
                <div>
                  <p class="text-sm text-gray-500">Amount</p>
                  <p class="text-2xl font-bold">{{ formatCurrency(expense.amount, expense.currency) }}</p>
                </div>
                <div v-if="expense.taxAmount > 0">
                  <p class="text-sm text-gray-500">Tax</p>
                  <p class="text-xl font-semibold text-gray-600">{{ formatCurrency(expense.taxAmount, expense.currency) }}</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Total</p>
                  <p class="text-2xl font-bold text-emerald-600">{{ formatCurrency(expense.totalAmount, expense.currency) }}</p>
                </div>
                <div>
                  <p class="text-sm text-gray-500">Date</p>
                  <p class="text-lg font-medium">{{ formatDate(expense.expenseDate) }}</p>
                </div>
              </div>

              <div v-if="expense.description" class="mt-4 pt-4 border-t">
                <p class="text-sm text-gray-500 mb-1">Description</p>
                <p class="text-gray-700 dark:text-gray-300">{{ expense.description }}</p>
              </div>
            </UCard>

            <!-- Receipts -->
            <UCard>
              <template #header>
                <div class="flex items-center justify-between">
                  <h3 class="font-semibold">Receipts</h3>
                  <UBadge variant="subtle" color="neutral">{{ receipts.length }}</UBadge>
                </div>
              </template>

              <div v-if="receipts.length > 0" class="space-y-3">
                <div
                  v-for="receipt in receipts"
                  :key="receipt.id"
                  class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div class="flex items-center gap-3">
                    <div class="p-2 rounded-lg bg-primary-500/10">
                      <UIcon
                        :name="receipt.fileType.includes('pdf') ? 'i-lucide-file-text' : 'i-lucide-image'"
                        class="w-5 h-5 text-primary-500"
                      />
                    </div>
                    <div>
                      <p class="font-medium">{{ receipt.fileName }}</p>
                      <p class="text-xs text-gray-500">
                        {{ formatFileSize(receipt.fileSize) }} • Uploaded {{ formatDateTime(receipt.uploadedAt) }}
                      </p>
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <UBadge v-if="receipt.ocrProcessed" variant="subtle" color="success" size="xs">
                      OCR Processed
                    </UBadge>
                    <UButton
                      v-if="receipt.fileUrl"
                      icon="i-lucide-download"
                      variant="ghost"
                      size="xs"
                      :to="receipt.fileUrl"
                      target="_blank"
                    />
                  </div>
                </div>
              </div>

              <div v-else class="text-center text-gray-500 py-8">
                <UIcon name="i-lucide-receipt" class="w-8 h-8 mx-auto mb-2 opacity-50" />
                <p>No receipts attached</p>
              </div>
            </UCard>

            <!-- Rejection Reason -->
            <UCard v-if="expense.status === 'rejected' && expense.rejectionReason">
              <template #header>
                <div class="flex items-center gap-2 text-red-500">
                  <UIcon name="i-lucide-alert-circle" />
                  <h3 class="font-semibold">Rejection Reason</h3>
                </div>
              </template>
              <p class="text-gray-700 dark:text-gray-300">{{ expense.rejectionReason }}</p>
            </UCard>

            <!-- Linked Report -->
            <UCard v-if="report">
              <template #header>
                <h3 class="font-semibold">Expense Report</h3>
              </template>
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium">{{ report.title }}</p>
                  <p class="text-sm text-gray-500">{{ report.reportNumber }}</p>
                </div>
                <UBadge :color="getStatusColor(report.status)" variant="subtle">
                  {{ report.status }}
                </UBadge>
              </div>
            </UCard>

            <!-- Notes -->
            <UCard v-if="expense.notes">
              <template #header>
                <h3 class="font-semibold">Notes</h3>
              </template>
              <p class="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{{ expense.notes }}</p>
            </UCard>
          </div>

          <!-- Sidebar -->
          <div class="space-y-6">
            <!-- Expense Details -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Details</h3>
              </template>

              <dl class="space-y-4">
                <div>
                  <dt class="text-sm text-gray-500">Submitted By</dt>
                  <dd class="font-medium">{{ expense.userName }}</dd>
                  <dd class="text-sm text-gray-500">{{ expense.userEmail }}</dd>
                </div>

                <div>
                  <dt class="text-sm text-gray-500">Category</dt>
                  <dd class="font-medium">{{ expense.categoryName }}</dd>
                </div>

                <div>
                  <dt class="text-sm text-gray-500">Payment Method</dt>
                  <dd class="font-medium">{{ paymentMethodLabels[expense.paymentMethod] || expense.paymentMethod }}</dd>
                </div>

                <div v-if="expense.projectName">
                  <dt class="text-sm text-gray-500">Project</dt>
                  <dd>
                    <NuxtLink
                      :to="`/agency/projects/${expense.projectId}`"
                      class="font-medium text-primary-500 hover:underline"
                    >
                      {{ expense.projectName }}
                    </NuxtLink>
                  </dd>
                </div>

                <div v-if="expense.clientName">
                  <dt class="text-sm text-gray-500">Client</dt>
                  <dd>
                    <NuxtLink
                      :to="`/agency/clients/${expense.clientId}`"
                      class="font-medium text-primary-500 hover:underline"
                    >
                      {{ expense.clientName }}
                    </NuxtLink>
                  </dd>
                </div>

                <div v-if="expense.taskTitle">
                  <dt class="text-sm text-gray-500">Task</dt>
                  <dd>
                    <NuxtLink
                      :to="`/agency/tasks/${expense.taskId}`"
                      class="font-medium text-primary-500 hover:underline"
                    >
                      {{ expense.taskTitle }}
                    </NuxtLink>
                  </dd>
                </div>
              </dl>
            </UCard>

            <!-- Billing Info -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Billing</h3>
              </template>

              <div class="space-y-3">
                <div class="flex items-center justify-between">
                  <span class="text-gray-500">Billable</span>
                  <UBadge :color="expense.billable ? 'success' : 'neutral'" variant="subtle">
                    {{ expense.billable ? 'Yes' : 'No' }}
                  </UBadge>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-gray-500">Invoiced</span>
                  <UBadge :color="expense.invoiced ? 'success' : 'neutral'" variant="subtle">
                    {{ expense.invoiced ? 'Yes' : 'No' }}
                  </UBadge>
                </div>

                <div class="flex items-center justify-between">
                  <span class="text-gray-500">Reimbursable</span>
                  <UBadge :color="expense.reimbursable ? 'warning' : 'neutral'" variant="subtle">
                    {{ expense.reimbursable ? 'Yes' : 'No' }}
                  </UBadge>
                </div>

                <div v-if="expense.reimbursable" class="flex items-center justify-between">
                  <span class="text-gray-500">Reimbursed</span>
                  <UBadge :color="expense.reimbursed ? 'success' : 'warning'" variant="subtle">
                    {{ expense.reimbursed ? 'Yes' : 'Pending' }}
                  </UBadge>
                </div>
              </div>
            </UCard>

            <!-- Timeline -->
            <UCard>
              <template #header>
                <h3 class="font-semibold">Timeline</h3>
              </template>

              <div class="space-y-3">
                <div class="flex items-start gap-3">
                  <div class="p-1 rounded-full bg-gray-200 dark:bg-gray-700">
                    <UIcon name="i-lucide-plus" class="w-3 h-3" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">Created</p>
                    <p class="text-xs text-gray-500">{{ formatDateTime(expense.createdAt) }}</p>
                  </div>
                </div>

                <div v-if="expense.submittedAt" class="flex items-start gap-3">
                  <div class="p-1 rounded-full bg-blue-200 dark:bg-blue-900">
                    <UIcon name="i-lucide-send" class="w-3 h-3 text-blue-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">Submitted</p>
                    <p class="text-xs text-gray-500">{{ formatDateTime(expense.submittedAt) }}</p>
                  </div>
                </div>

                <div v-if="expense.approvedAt" class="flex items-start gap-3">
                  <div class="p-1 rounded-full bg-emerald-200 dark:bg-emerald-900">
                    <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">Approved</p>
                    <p class="text-xs text-gray-500">
                      {{ formatDateTime(expense.approvedAt) }}
                      <span v-if="expense.approvedByName"> by {{ expense.approvedByName }}</span>
                    </p>
                  </div>
                </div>

                <div v-if="expense.reimbursedAt" class="flex items-start gap-3">
                  <div class="p-1 rounded-full bg-purple-200 dark:bg-purple-900">
                    <UIcon name="i-lucide-wallet" class="w-3 h-3 text-purple-600" />
                  </div>
                  <div>
                    <p class="text-sm font-medium">Reimbursed</p>
                    <p class="text-xs text-gray-500">{{ formatDateTime(expense.reimbursedAt) }}</p>
                    <p v-if="expense.reimbursementReference" class="text-xs text-gray-400">
                      Ref: {{ expense.reimbursementReference }}
                    </p>
                  </div>
                </div>
              </div>
            </UCard>

            <!-- Tags -->
            <UCard v-if="expense.tags && expense.tags.length > 0">
              <template #header>
                <h3 class="font-semibold">Tags</h3>
              </template>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="tag in expense.tags"
                  :key="tag"
                  variant="subtle"
                  color="neutral"
                >
                  {{ tag }}
                </UBadge>
              </div>
            </UCard>
          </div>
        </div>

        <!-- Not Found -->
        <div v-else class="text-center py-12">
          <UIcon name="i-lucide-receipt" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 class="text-lg font-medium text-gray-900 dark:text-white">Expense not found</h3>
          <p class="text-gray-500 mt-2">The expense you're looking for doesn't exist.</p>
          <UButton label="Back to Expenses" to="/agency/expenses" class="mt-4" />
        </div>
      </div>
    </UDashboardPanel>

    <!-- Edit Modal -->
    <UModal v-model:open="showEditModal" class="max-w-lg">
      <template #header>
        <h3 class="font-semibold">Edit Expense</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Category" required>
            <USelectMenu
              v-model="editForm.categoryId"
              :items="categoryOptions"
              value-key="value"
              placeholder="Select category"
            />
          </UFormField>

          <UFormField label="Project">
            <USelectMenu
              v-model="editForm.projectId"
              :items="projectOptions"
              value-key="value"
              placeholder="Select project (optional)"
            />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Amount" required>
              <UInput v-model.number="editForm.amount" type="number" step="0.01" min="0" />
            </UFormField>
            <UFormField label="Tax Amount">
              <UInput v-model.number="editForm.taxAmount" type="number" step="0.01" min="0" />
            </UFormField>
          </div>

          <UFormField label="Merchant">
            <UInput v-model="editForm.merchant" placeholder="Vendor or merchant name" />
          </UFormField>

          <UFormField label="Expense Date" required>
            <UInput v-model="editForm.expenseDate" type="date" />
          </UFormField>

          <UFormField label="Payment Method">
            <USelectMenu
              v-model="editForm.paymentMethod"
              :items="paymentMethodOptions"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Description">
            <UTextarea v-model="editForm.description" :rows="2" placeholder="What was this expense for?" />
          </UFormField>

          <div class="flex gap-4">
            <UCheckbox v-model="editForm.billable" label="Billable to client" />
            <UCheckbox v-model="editForm.reimbursable" label="Reimbursable" />
          </div>

          <UFormField label="Notes">
            <UTextarea v-model="editForm.notes" :rows="2" placeholder="Additional notes..." />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" label="Cancel" @click="showEditModal = false" />
          <UButton
            color="primary"
            label="Save Changes"
            :loading="saving"
            @click="saveExpense"
          />
        </div>
      </template>
    </UModal>

    <!-- Reject Modal -->
    <UModal v-model:open="showRejectModal" class="max-w-md">
      <template #header>
        <h3 class="font-semibold text-red-500">Reject Expense</h3>
      </template>
      <template #body>
        <UFormField label="Reason for rejection" required>
          <UTextarea
            v-model="rejectionReason"
            :rows="3"
            placeholder="Please provide a reason for rejecting this expense..."
          />
        </UFormField>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3">
          <UButton variant="ghost" label="Cancel" @click="showRejectModal = false" />
          <UButton
            color="error"
            label="Reject Expense"
            :loading="rejecting"
            :disabled="!rejectionReason.trim()"
            @click="rejectExpense"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
