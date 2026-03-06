<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Quote Details',
  middleware: ['sales']
})

const route = useRoute()
const router = useRouter()
const toast = useToast()
const quoteId = route.params.id as string

// Fetch quote
const { data: quoteData, pending, error, refresh } = await useFetch(`/api/agency/quotes/${quoteId}`)

// Action states
const sending = ref(false)
const accepting = ref(false)
const rejecting = ref(false)
const deleting = ref(false)
const deletingItemId = ref<string | null>(null)

// Modals
const showRejectModal = ref(false)
const showDeleteModal = ref(false)
const rejectReason = ref('')

const quote = computed(() => quoteData.value?.quote as any)

// Format helpers
const formatCurrency = (value: number, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2
  }).format(value)
}

// Status badge
const getStatusColor = (status: string): 'neutral' | 'warning' | 'primary' | 'info' | 'success' | 'error' | 'secondary' => {
  switch (status) {
    case 'draft': return 'neutral'
    case 'pending': return 'warning'
    case 'sent': return 'primary'
    case 'viewed': return 'info'
    case 'accepted': return 'success'
    case 'rejected': return 'error'
    case 'expired': return 'neutral'
    case 'revised': return 'secondary'
    default: return 'neutral'
  }
}

// Actions
const sendQuote = async () => {
  sending.value = true
  try {
    await $fetch(`/api/agency/quotes/${quoteId}/send`, {
      method: 'POST'
    })
    toast.add({ title: 'Quote sent successfully', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to send quote', description: err.message, color: 'error' })
  } finally {
    sending.value = false
  }
}

const acceptQuote = async () => {
  accepting.value = true
  try {
    await $fetch(`/api/agency/quotes/${quoteId}/accept`, {
      method: 'POST'
    })
    toast.add({ title: 'Quote accepted! Job pricing created.', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to accept quote', description: err.message, color: 'error' })
  } finally {
    accepting.value = false
  }
}

const confirmReject = async () => {
  rejecting.value = true
  try {
    await $fetch(`/api/agency/quotes/${quoteId}/reject`, {
      method: 'POST',
      body: { reason: rejectReason.value }
    })
    toast.add({ title: 'Quote rejected', color: 'warning' })
    showRejectModal.value = false
    rejectReason.value = ''
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to reject quote', description: err.message, color: 'error' })
  } finally {
    rejecting.value = false
  }
}

const confirmDelete = async () => {
  deleting.value = true
  try {
    await ($fetch as any)(`/api/agency/quotes/${quoteId}`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Quote deleted', color: 'success' })
    router.push('/agency/sales/quotes')
  } catch (err: any) {
    toast.add({ title: 'Failed to delete quote', description: err.message, color: 'error' })
  } finally {
    deleting.value = false
    showDeleteModal.value = false
  }
}

const deleteLineItem = async (itemId: string) => {
  deletingItemId.value = itemId
  try {
    await ($fetch as any)(`/api/agency/quotes/${quoteId}/line-items/${itemId}`, {
      method: 'DELETE'
    })
    toast.add({ title: 'Line item deleted', color: 'success' })
    refresh()
  } catch (err: any) {
    toast.add({ title: 'Failed to delete line item', description: err.message, color: 'error' })
  } finally {
    deletingItemId.value = null
  }
}

// Item type badge
const getItemTypeColor = (type: string): 'primary' | 'success' | 'warning' | 'secondary' | 'error' | 'info' | 'neutral' => {
  switch (type) {
    case 'service': return 'primary'
    case 'product': return 'success'
    case 'hourly': return 'warning'
    case 'fixed': return 'secondary'
    case 'media_spend': return 'error'
    case 'production': return 'info'
    default: return 'neutral'
  }
}
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar>
        <template #left>
          <div class="flex items-center gap-4">
            <UButton
              variant="ghost"
              icon="i-lucide-arrow-left"
              @click="router.push('/agency/sales/quotes')"
            />
            <div v-if="quote">
              <div class="flex items-center gap-2">
                <h1 class="text-xl font-semibold">{{ quote.quoteNumber }}</h1>
                <UBadge :color="getStatusColor(quote.status)" variant="subtle">
                  {{ quote.status }}
                </UBadge>
              </div>
              <p class="text-sm text-gray-500">{{ quote.title }}</p>
            </div>
          </div>
        </template>
        <template #right>
          <template v-if="quote">
            <UButton
              v-if="['draft', 'pending', 'revised'].includes(quote.status)"
              variant="outline"
              label="Send"
              icon="i-lucide-send"
              :loading="sending"
              @click="sendQuote"
            />
            <UButton
              v-if="['sent', 'viewed'].includes(quote.status)"
              color="success"
              label="Accept"
              icon="i-lucide-check"
              :loading="accepting"
              @click="acceptQuote"
            />
            <UButton
              v-if="['sent', 'viewed', 'pending'].includes(quote.status)"
              variant="outline"
              color="error"
              label="Reject"
              icon="i-lucide-x"
              @click="showRejectModal = true"
            />
            <UDropdownMenu>
              <UButton
                variant="ghost"
                icon="i-lucide-more-vertical"
              />
              <template #content>
                <UDropdownMenuItem
                  v-if="quote.status !== 'accepted'"
                  icon="i-lucide-trash-2"
                  label="Delete Quote"
                  color="error"
                  @click="showDeleteModal = true"
                />
              </template>
            </UDropdownMenu>
          </template>
        </template>
      </UDashboardNavbar>

      <div class="flex-1 overflow-y-auto p-4 sm:p-6">
        <!-- Loading state -->
        <div v-if="pending" class="flex items-center justify-center py-12">
          <XfLoader />
        </div>

        <!-- Error state -->
        <UCard v-else-if="error" class="border-red-500/50">
          <div class="flex items-center gap-3 text-red-500">
            <UIcon name="i-lucide-alert-circle" class="w-5 h-5" />
            <div>
              <p class="font-medium">Error loading quote</p>
              <p class="text-sm text-gray-500">{{ error.message }}</p>
            </div>
          </div>
        </UCard>

        <template v-else-if="quote">
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Main Content -->
            <div class="lg:col-span-2 space-y-6">
              <!-- Quote Info -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Quote Details</h3>
                </template>

                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <p class="text-sm text-gray-500">Quote Number</p>
                    <p class="font-mono font-medium">{{ quote.quoteNumber }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Version</p>
                    <p class="font-medium">v{{ quote.version }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Valid From</p>
                    <p class="font-medium">{{ quote.validFrom ? format(new Date(quote.validFrom), 'MMM dd, yyyy') : '-' }}</p>
                  </div>
                  <div>
                    <p class="text-sm text-gray-500">Valid Until</p>
                    <p class="font-medium">{{ quote.validUntil ? format(new Date(quote.validUntil), 'MMM dd, yyyy') : '-' }}</p>
                  </div>
                  <div class="col-span-2">
                    <p class="text-sm text-gray-500">Description</p>
                    <p>{{ quote.description || '-' }}</p>
                  </div>
                </div>
              </UCard>

              <!-- Line Items -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Line Items</h3>
                </template>

                <div class="overflow-x-auto">
                  <table class="w-full">
                    <thead>
                      <tr class="border-b border-gray-200 dark:border-gray-700">
                        <th class="text-left py-2 px-2 font-medium text-sm text-gray-500">Item</th>
                        <th class="text-left py-2 px-2 font-medium text-sm text-gray-500">Type</th>
                        <th class="text-right py-2 px-2 font-medium text-sm text-gray-500">Qty</th>
                        <th class="text-right py-2 px-2 font-medium text-sm text-gray-500">Unit Price</th>
                        <th class="text-right py-2 px-2 font-medium text-sm text-gray-500">Discount</th>
                        <th class="text-right py-2 px-2 font-medium text-sm text-gray-500">Total</th>
                        <th v-if="!['accepted', 'rejected'].includes(quote.status)" class="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="item in quote.lineItems"
                        :key="item.id"
                        class="border-b border-gray-100 dark:border-gray-800"
                        :class="{ 'opacity-50': !item.isIncluded }"
                      >
                        <td class="py-3 px-2">
                          <div>
                            <p class="font-medium">
                              {{ item.name }}
                              <UBadge v-if="item.isOptional" size="xs" color="warning" variant="subtle" class="ml-1">
                                Optional
                              </UBadge>
                            </p>
                            <p v-if="item.description" class="text-sm text-gray-500">{{ item.description }}</p>
                          </div>
                        </td>
                        <td class="py-3 px-2">
                          <UBadge :color="getItemTypeColor(item.itemType)" variant="subtle" size="xs">
                            {{ item.itemType }}
                          </UBadge>
                        </td>
                        <td class="py-3 px-2 text-right">
                          {{ item.quantity }} {{ item.unit }}
                        </td>
                        <td class="py-3 px-2 text-right">
                          {{ formatCurrency(item.unitPrice, quote.currency) }}
                        </td>
                        <td class="py-3 px-2 text-right">
                          {{ item.discountPercent > 0 ? `${item.discountPercent}%` : '-' }}
                        </td>
                        <td class="py-3 px-2 text-right font-medium">
                          {{ formatCurrency(item.lineTotal, quote.currency) }}
                        </td>
                        <td v-if="!['accepted', 'rejected'].includes(quote.status)" class="py-3 px-2">
                          <UButton
                            variant="ghost"
                            color="error"
                            icon="i-lucide-trash-2"
                            size="xs"
                            :loading="deletingItemId === item.id"
                            @click="deleteLineItem(item.id)"
                          />
                        </td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr class="border-t-2 border-gray-200 dark:border-gray-700">
                        <td colspan="5" class="py-2 px-2 text-right font-medium">Subtotal</td>
                        <td class="py-2 px-2 text-right font-medium">{{ formatCurrency(quote.subtotal, quote.currency) }}</td>
                      </tr>
                      <tr v-if="quote.discountPercent > 0">
                        <td colspan="5" class="py-2 px-2 text-right text-gray-500">Discount ({{ quote.discountPercent }}%)</td>
                        <td class="py-2 px-2 text-right text-red-500">-{{ formatCurrency(quote.discountAmount, quote.currency) }}</td>
                      </tr>
                      <tr v-if="quote.taxPercent > 0">
                        <td colspan="5" class="py-2 px-2 text-right text-gray-500">Tax ({{ quote.taxPercent }}%)</td>
                        <td class="py-2 px-2 text-right">+{{ formatCurrency(quote.taxAmount, quote.currency) }}</td>
                      </tr>
                      <tr class="border-t border-gray-200 dark:border-gray-700">
                        <td colspan="5" class="py-3 px-2 text-right font-semibold text-lg">Total</td>
                        <td class="py-3 px-2 text-right font-semibold text-lg text-primary-500">{{ formatCurrency(quote.total, quote.currency) }}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </UCard>

              <!-- Terms -->
              <UCard v-if="quote.terms || quote.paymentTerms || quote.clientNotes">
                <template #header>
                  <h3 class="font-semibold">Terms & Notes</h3>
                </template>

                <div class="space-y-4">
                  <div v-if="quote.paymentTerms">
                    <p class="text-sm font-medium text-gray-500">Payment Terms</p>
                    <p>{{ quote.paymentTerms }}</p>
                  </div>
                  <div v-if="quote.terms">
                    <p class="text-sm font-medium text-gray-500">Terms & Conditions</p>
                    <p class="whitespace-pre-wrap">{{ quote.terms }}</p>
                  </div>
                  <div v-if="quote.clientNotes">
                    <p class="text-sm font-medium text-gray-500">Notes for Client</p>
                    <p>{{ quote.clientNotes }}</p>
                  </div>
                </div>
              </UCard>
            </div>

            <!-- Sidebar -->
            <div class="space-y-6">
              <!-- Client Info -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Client</h3>
                </template>

                <div v-if="quote.client" class="space-y-2">
                  <p class="font-medium">{{ quote.client.name }}</p>
                  <p v-if="quote.client.company" class="text-sm text-gray-500">{{ quote.client.company }}</p>
                  <p v-if="quote.client.email" class="text-sm text-gray-500">{{ quote.client.email }}</p>
                </div>
                <p v-else class="text-gray-500">No client assigned</p>
              </UCard>

              <!-- Related -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Related</h3>
                </template>

                <div class="space-y-3">
                  <div v-if="quote.brief">
                    <p class="text-sm text-gray-500">Brief</p>
                    <NuxtLink :to="`/agency/briefs/${quote.briefId}`" class="text-primary-500 hover:underline">
                      {{ quote.brief.referenceNumber }} - {{ quote.brief.title }}
                    </NuxtLink>
                  </div>
                  <div v-if="quote.project">
                    <p class="text-sm text-gray-500">Project</p>
                    <NuxtLink :to="`/agency/projects/${quote.projectId}`" class="text-primary-500 hover:underline">
                      {{ quote.project.name }}
                    </NuxtLink>
                  </div>
                  <div v-if="quote.parentQuote">
                    <p class="text-sm text-gray-500">Previous Version</p>
                    <NuxtLink :to="`/agency/sales/quotes/${quote.parentQuoteId}`" class="text-primary-500 hover:underline">
                      {{ quote.parentQuote.quoteNumber }}
                    </NuxtLink>
                  </div>
                </div>
              </UCard>

              <!-- Team -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Team</h3>
                </template>

                <div class="space-y-3">
                  <div v-if="quote.creator">
                    <p class="text-sm text-gray-500">Created By</p>
                    <p class="font-medium">{{ quote.creator.name }}</p>
                  </div>
                  <div v-if="quote.assignee">
                    <p class="text-sm text-gray-500">Assigned To</p>
                    <p class="font-medium">{{ quote.assignee.name }}</p>
                  </div>
                  <div v-if="quote.approver">
                    <p class="text-sm text-gray-500">Approved By</p>
                    <p class="font-medium">{{ quote.approver.name }}</p>
                    <p class="text-xs text-gray-400">{{ quote.approvedAt ? format(new Date(quote.approvedAt), 'MMM dd, yyyy') : '' }}</p>
                  </div>
                </div>
              </UCard>

              <!-- Timeline -->
              <UCard>
                <template #header>
                  <h3 class="font-semibold">Timeline</h3>
                </template>

                <div class="space-y-3 text-sm">
                  <div class="flex justify-between">
                    <span class="text-gray-500">Created</span>
                    <span>{{ format(new Date(quote.createdAt), 'MMM dd, yyyy') }}</span>
                  </div>
                  <div v-if="quote.sentAt" class="flex justify-between">
                    <span class="text-gray-500">Sent</span>
                    <span>{{ format(new Date(quote.sentAt), 'MMM dd, yyyy') }}</span>
                  </div>
                  <div v-if="quote.viewedAt" class="flex justify-between">
                    <span class="text-gray-500">Viewed</span>
                    <span>{{ format(new Date(quote.viewedAt), 'MMM dd, yyyy') }}</span>
                  </div>
                  <div v-if="quote.acceptedAt" class="flex justify-between text-emerald-500">
                    <span>Accepted</span>
                    <span>{{ format(new Date(quote.acceptedAt), 'MMM dd, yyyy') }}</span>
                  </div>
                  <div v-if="quote.rejectedAt" class="flex justify-between text-red-500">
                    <span>Rejected</span>
                    <span>{{ format(new Date(quote.rejectedAt), 'MMM dd, yyyy') }}</span>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </template>
      </div>
    </UDashboardPanel>

    <!-- Reject Modal -->
    <UModal v-model:open="showRejectModal">
      <template #header>
        <h3 class="font-semibold">Reject Quote</h3>
      </template>
      <template #body>
        <div class="space-y-4">
          <p class="text-gray-600">Are you sure you want to reject this quote?</p>
          <UFormField label="Rejection Reason (Optional)">
            <UTextarea
              v-model="rejectReason"
              placeholder="Enter reason for rejection..."
              :rows="3"
            />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            label="Cancel"
            @click="showRejectModal = false"
          />
          <UButton
            color="error"
            label="Reject Quote"
            :loading="rejecting"
            @click="confirmReject"
          />
        </div>
      </template>
    </UModal>

    <!-- Delete Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #header>
        <h3 class="font-semibold text-red-500">Delete Quote</h3>
      </template>
      <template #body>
        <p class="text-gray-600">
          Are you sure you want to delete quote <strong>{{ quote?.quoteNumber }}</strong>?
          This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton
            variant="ghost"
            label="Cancel"
            @click="showDeleteModal = false"
          />
          <UButton
            color="error"
            label="Delete Quote"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
