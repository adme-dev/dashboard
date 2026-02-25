<script setup lang="ts">
definePageMeta({ layout: 'portal', middleware: 'portal-auth' })

const { hasPermission } = usePortalAuth()

const activeTab = ref('all')
const statusFilter = computed(() => activeTab.value === 'all' ? undefined : activeTab.value)

const { data, pending } = useFetch('/api/portal/invoices', {
  query: { status: statusFilter }
})

const tabs = [
  { label: 'All', value: 'all' },
  { label: 'Outstanding', value: 'sent' },
  { label: 'Overdue', value: 'overdue' },
  { label: 'Paid', value: 'paid' }
]

function formatDate(date: string | null) {
  if (!date) return '-'
  return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(amount)
}

const statusColors: Record<string, string> = {
  paid: 'success',
  sent: 'warning',
  overdue: 'error',
  draft: 'neutral'
}
</script>

<template>
  <div class="p-6 space-y-6 max-w-5xl mx-auto">
    <div v-if="!hasPermission('canViewInvoices')" class="text-center py-20">
      <UIcon name="i-lucide-lock" class="w-12 h-12 text-muted mx-auto mb-4" />
      <h2 class="text-xl font-semibold">Access Restricted</h2>
      <p class="text-muted mt-1">You do not have permission to view invoices.</p>
    </div>

    <template v-else>
      <h1 class="text-2xl font-bold">Invoices</h1>

      <!-- Summary Cards -->
      <div v-if="data?.summary" class="grid grid-cols-3 gap-4">
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">Outstanding</p>
            <p class="text-2xl font-bold text-warning">{{ formatCurrency(data.summary.totalOutstanding) }}</p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">Paid This Year</p>
            <p class="text-2xl font-bold text-success">{{ formatCurrency(data.summary.totalPaid) }}</p>
          </div>
        </UCard>
        <UCard>
          <div class="text-center">
            <p class="text-sm text-muted">Overdue</p>
            <p class="text-2xl font-bold" :class="data.summary.overdue > 0 ? 'text-error' : 'text-muted'">
              {{ data.summary.overdue }}
            </p>
          </div>
        </UCard>
      </div>

      <UTabs :items="tabs" v-model="activeTab" />

      <div v-if="pending" class="space-y-3">
        <div v-for="i in 5" :key="i" class="h-16 rounded-lg bg-elevated animate-pulse" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default">
              <th class="text-left py-3 px-4 font-medium text-muted">Invoice</th>
              <th class="text-left py-3 px-4 font-medium text-muted">Date</th>
              <th class="text-left py-3 px-4 font-medium text-muted">Due</th>
              <th class="text-left py-3 px-4 font-medium text-muted">Project</th>
              <th class="text-right py-3 px-4 font-medium text-muted">Amount</th>
              <th class="text-right py-3 px-4 font-medium text-muted">Due</th>
              <th class="text-center py-3 px-4 font-medium text-muted">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="invoice in data?.invoices"
              :key="invoice.id"
              class="border-b border-default/50 hover:bg-elevated transition-colors"
            >
              <td class="py-3 px-4 font-medium">{{ invoice.invoiceNumber }}</td>
              <td class="py-3 px-4 text-muted">{{ formatDate(invoice.issueDate) }}</td>
              <td class="py-3 px-4" :class="invoice.isOverdue ? 'text-error font-medium' : 'text-muted'">
                {{ formatDate(invoice.dueDate) }}
              </td>
              <td class="py-3 px-4 text-muted">{{ invoice.projectName || '-' }}</td>
              <td class="py-3 px-4 text-right">{{ formatCurrency(invoice.totalAmount) }}</td>
              <td class="py-3 px-4 text-right font-medium">
                {{ invoice.amountDue > 0 ? formatCurrency(invoice.amountDue) : '-' }}
              </td>
              <td class="py-3 px-4 text-center">
                <UBadge :color="(statusColors[invoice.status] as any) || 'neutral'" variant="subtle" size="xs">
                  {{ invoice.status }}
                </UBadge>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p v-if="!pending && (!data?.invoices || data.invoices.length === 0)" class="text-center text-muted py-12">
        No invoices found
      </p>
    </template>
  </div>
</template>
