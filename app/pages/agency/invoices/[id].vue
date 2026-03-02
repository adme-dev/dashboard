<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Invoice Details',
  middleware: ['auth']
})

const route = useRoute()
const toast = useToast()

const invoiceId = route.params.id as string

// Fetch invoice
const { data: invoiceData, pending, refresh } = await useFetch(`/api/agency/invoices/${invoiceId}`)

const invoice = computed(() => ((invoiceData.value as any)?.invoice || null) as any)

// Format helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2
  }).format(value)
}

const formatDate = (date: string) => {
  return format(new Date(date), 'MMM d, yyyy')
}

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

// Actions
const sendingInvoice = ref(false)
const sendInvoice = async () => {
  sendingInvoice.value = true
  try {
    await ($fetch as any)(`/api/agency/invoices/${invoiceId}/send`, { method: 'POST' })
    toast.add({ title: 'Invoice sent', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to send invoice', description: err.message, color: 'error' })
  } finally {
    sendingInvoice.value = false
  }
}

// Payment modal
const showPaymentModal = ref(false)
const payment = ref({
  amount: 0,
  paymentDate: new Date().toISOString().split('T')[0],
  paymentMethod: 'bank_transfer',
  referenceNumber: '',
  notes: ''
})

const recordingPayment = ref(false)
const recordPayment = async () => {
  if (payment.value.amount <= 0) {
    toast.add({ title: 'Please enter a valid amount', color: 'error' })
    return
  }

  recordingPayment.value = true
  try {
    await $fetch(`/api/agency/invoices/${invoiceId}/payments`, {
      method: 'POST',
      body: payment.value
    })
    toast.add({ title: 'Payment recorded', color: 'success' })
    showPaymentModal.value = false
    payment.value = {
      amount: 0,
      paymentDate: new Date().toISOString().split('T')[0],
      paymentMethod: 'bank_transfer',
      referenceNumber: '',
      notes: ''
    }
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to record payment', description: err.data?.message || err.message, color: 'error' })
  } finally {
    recordingPayment.value = false
  }
}

// Open payment modal with remaining amount
const openPaymentModal = () => {
  payment.value.amount = invoice.value?.amountDue || 0
  showPaymentModal.value = true
}

// Payment method options
const paymentMethods = [
  { label: 'Bank Transfer', value: 'bank_transfer' },
  { label: 'Credit Card', value: 'credit_card' },
  { label: 'Check', value: 'check' },
  { label: 'Cash', value: 'cash' },
  { label: 'PayPal', value: 'paypal' },
  { label: 'Stripe', value: 'stripe' },
  { label: 'Other', value: 'other' }
]
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar :title="invoice?.invoiceNumber || 'Invoice'">
        <template #left>
          <UButton
            variant="ghost"
            icon="i-lucide-arrow-left"
            @click="navigateTo('/agency/billing')"
          />
        </template>
        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="invoice?.status === 'draft'"
              label="Send Invoice"
              icon="i-lucide-send"
              :loading="sendingInvoice"
              @click="sendInvoice"
            />
            <UButton
              v-if="invoice?.status !== 'paid' && invoice?.status !== 'cancelled'"
              label="Record Payment"
              icon="i-lucide-credit-card"
              color="primary"
              @click="openPaymentModal"
            />
          </div>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <UIcon name="i-lucide-loader-2" class="w-8 h-8 animate-spin text-primary-500" />
        </div>

        <!-- Not Found -->
        <div v-else-if="!invoice" class="text-center py-12">
          <UIcon name="i-lucide-file-x" class="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p class="text-gray-500">Invoice not found</p>
        </div>

        <template v-else>
          <!-- Invoice Header -->
          <UCard class="mb-6">
            <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-6">
              <div>
                <div class="flex items-center gap-3 mb-2">
                  <h1 class="text-2xl font-bold">{{ invoice.invoiceNumber }}</h1>
                  <UBadge :color="getStatusColor(invoice.status)" variant="subtle" size="lg">
                    {{ invoice.status.replace('_', ' ') }}
                  </UBadge>
                </div>
                <p class="text-gray-500">{{ invoice.clientName }}</p>
                <p v-if="invoice.projectName" class="text-sm text-gray-400">{{ invoice.projectName }}</p>
              </div>

              <div class="text-right">
                <p class="text-3xl font-bold">{{ formatCurrency(invoice.totalAmount) }}</p>
                <p v-if="invoice.amountDue > 0 && invoice.amountDue !== invoice.totalAmount" class="text-amber-500">
                  {{ formatCurrency(invoice.amountDue) }} due
                </p>
                <p v-if="invoice.daysOverdue > 0" class="text-sm text-red-500">
                  {{ invoice.daysOverdue }} days overdue
                </p>
              </div>
            </div>
          </UCard>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Main Content -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Billing Info -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Billing Information</h3>
                </template>
                <div class="grid grid-cols-2 gap-6">
                  <div>
                    <p class="text-sm text-gray-500 mb-1">Bill To</p>
                    <p class="font-medium">{{ invoice.billingName }}</p>
                    <p class="text-sm text-gray-500">{{ invoice.billingEmail }}</p>
                    <p v-if="invoice.billingAddress" class="text-sm text-gray-500 whitespace-pre-line">
                      {{ invoice.billingAddress }}
                    </p>
                  </div>
                  <div class="text-right">
                    <div class="mb-3">
                      <p class="text-sm text-gray-500">Issue Date</p>
                      <p class="font-medium">{{ formatDate(invoice.issueDate) }}</p>
                    </div>
                    <div class="mb-3">
                      <p class="text-sm text-gray-500">Due Date</p>
                      <p class="font-medium" :class="{ 'text-red-500': invoice.daysOverdue > 0 }">
                        {{ formatDate(invoice.dueDate) }}
                      </p>
                    </div>
                    <div>
                      <p class="text-sm text-gray-500">Payment Terms</p>
                      <p class="font-medium">{{ invoice.paymentTerms?.replace('_', ' ') }}</p>
                    </div>
                  </div>
                </div>
              </UCard>

              <!-- Line Items -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Line Items</h3>
                </template>
                <table class="w-full">
                  <thead>
                    <tr class="border-b border-gray-200 dark:border-gray-700">
                      <th class="text-left py-2 text-sm text-gray-500">Description</th>
                      <th class="text-right py-2 text-sm text-gray-500 w-24">Qty</th>
                      <th class="text-right py-2 text-sm text-gray-500 w-32">Rate</th>
                      <th class="text-right py-2 text-sm text-gray-500 w-32">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="item in invoice.lineItems"
                      :key="item.id"
                      class="border-b border-gray-100 dark:border-gray-800"
                    >
                      <td class="py-3">
                        <p class="font-medium">{{ item.description }}</p>
                        <p v-if="item.projectName" class="text-xs text-gray-500">{{ item.projectName }}</p>
                      </td>
                      <td class="text-right py-3">{{ item.quantity }}</td>
                      <td class="text-right py-3">{{ formatCurrency(item.unitPrice) }}</td>
                      <td class="text-right py-3 font-medium">{{ formatCurrency(item.amount) }}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr class="border-t border-gray-200 dark:border-gray-700">
                      <td colspan="3" class="text-right py-2 text-sm text-gray-500">Subtotal</td>
                      <td class="text-right py-2 font-medium">{{ formatCurrency(invoice.subtotal) }}</td>
                    </tr>
                    <tr v-if="invoice.taxAmount > 0">
                      <td colspan="3" class="text-right py-2 text-sm text-gray-500">
                        Tax ({{ invoice.taxRate }}%)
                      </td>
                      <td class="text-right py-2">{{ formatCurrency(invoice.taxAmount) }}</td>
                    </tr>
                    <tr v-if="invoice.discountAmount > 0">
                      <td colspan="3" class="text-right py-2 text-sm text-gray-500">Discount</td>
                      <td class="text-right py-2 text-red-500">-{{ formatCurrency(invoice.discountAmount) }}</td>
                    </tr>
                    <tr class="border-t border-gray-200 dark:border-gray-700">
                      <td colspan="3" class="text-right py-3 font-semibold">Total</td>
                      <td class="text-right py-3 text-xl font-bold">{{ formatCurrency(invoice.totalAmount) }}</td>
                    </tr>
                    <tr v-if="invoice.amountPaid > 0">
                      <td colspan="3" class="text-right py-2 text-sm text-gray-500">Paid</td>
                      <td class="text-right py-2 text-emerald-500">-{{ formatCurrency(invoice.amountPaid) }}</td>
                    </tr>
                    <tr v-if="invoice.amountDue !== invoice.totalAmount">
                      <td colspan="3" class="text-right py-2 font-semibold">Amount Due</td>
                      <td class="text-right py-2 text-lg font-bold text-amber-500">
                        {{ formatCurrency(invoice.amountDue) }}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </UCard>

              <!-- Notes -->
              <UCard v-if="invoice.notes || invoice.terms">
                <template #header>
                  <h3 class="font-semibold">Notes & Terms</h3>
                </template>
                <div class="space-y-4">
                  <div v-if="invoice.notes">
                    <p class="text-sm text-gray-500 mb-1">Notes</p>
                    <p class="whitespace-pre-line">{{ invoice.notes }}</p>
                  </div>
                  <div v-if="invoice.terms">
                    <p class="text-sm text-gray-500 mb-1">Terms & Conditions</p>
                    <p class="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-line">{{ invoice.terms }}</p>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Sidebar -->
            <div class="space-y-6">
              <!-- Payment History -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Payment History</h3>
                </template>
                <div v-if="invoice.payments?.length > 0" class="space-y-4">
                  <div
                    v-for="pmt in invoice.payments"
                    :key="pmt.id"
                    class="p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
                  >
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-semibold text-emerald-500">{{ formatCurrency(pmt.amount) }}</span>
                      <span class="text-xs text-gray-500">{{ formatDate(pmt.paymentDate) }}</span>
                    </div>
                    <p class="text-sm text-gray-500">
                      {{ pmt.paymentMethod?.replace('_', ' ') || 'Unknown method' }}
                    </p>
                    <p v-if="pmt.referenceNumber" class="text-xs text-gray-400">
                      Ref: {{ pmt.referenceNumber }}
                    </p>
                  </div>
                </div>
                <p v-else class="text-center text-gray-500 py-4">
                  No payments recorded
                </p>
              </UCard>

              <!-- Activity -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Activity</h3>
                </template>
                <div class="space-y-3 text-sm">
                  <div class="flex items-start gap-2">
                    <UIcon name="i-lucide-file-plus" class="w-4 h-4 text-gray-400 mt-0.5" />
                    <div>
                      <p>Invoice created</p>
                      <p class="text-xs text-gray-500">{{ formatDate(invoice.createdAt) }}</p>
                    </div>
                  </div>
                  <div v-if="invoice.sentAt" class="flex items-start gap-2">
                    <UIcon name="i-lucide-send" class="w-4 h-4 text-blue-500 mt-0.5" />
                    <div>
                      <p>Invoice sent</p>
                      <p class="text-xs text-gray-500">{{ formatDate(invoice.sentAt) }}</p>
                    </div>
                  </div>
                  <div v-if="invoice.viewedAt" class="flex items-start gap-2">
                    <UIcon name="i-lucide-eye" class="w-4 h-4 text-purple-500 mt-0.5" />
                    <div>
                      <p>Viewed by client</p>
                      <p class="text-xs text-gray-500">{{ formatDate(invoice.viewedAt) }}</p>
                    </div>
                  </div>
                  <div v-if="invoice.paidDate" class="flex items-start gap-2">
                    <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-500 mt-0.5" />
                    <div>
                      <p>Fully paid</p>
                      <p class="text-xs text-gray-500">{{ formatDate(invoice.paidDate) }}</p>
                    </div>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Payment Modal -->
    <UModal v-model:open="showPaymentModal">
      <template #header>
        <h3 class="font-semibold">Record Payment</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <UFormField label="Amount" required>
            <UInput
              v-model.number="payment.amount"
              type="number"
              step="0.01"
              min="0"
              :max="invoice?.amountDue"
            />
            <p class="text-xs text-gray-500 mt-1">
              Amount due: {{ formatCurrency(invoice?.amountDue || 0) }}
            </p>
          </UFormField>

          <UFormField label="Payment Date">
            <UInput v-model="payment.paymentDate" type="date" />
          </UFormField>

          <UFormField label="Payment Method">
            <USelectMenu
              v-model="payment.paymentMethod"
              :items="paymentMethods"
              value-key="value"
            />
          </UFormField>

          <UFormField label="Reference Number">
            <UInput
              v-model="payment.referenceNumber"
              placeholder="Check #, transaction ID, etc."
            />
          </UFormField>

          <UFormField label="Notes">
            <UTextarea
              v-model="payment.notes"
              placeholder="Additional notes..."
              :rows="2"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton variant="ghost" label="Cancel" @click="showPaymentModal = false" />
          <UButton
            color="primary"
            label="Record Payment"
            :loading="recordingPayment"
            @click="recordPayment"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
