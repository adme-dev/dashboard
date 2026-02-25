<template>
  <div class="space-y-6">
    <!-- Loading -->
    <div v-if="loading" class="flex items-center justify-center py-12">
      <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-gray-400" />
      <span class="ml-2 text-sm text-gray-500">Loading billing info...</span>
    </div>

    <!-- No billing data -->
    <div v-else-if="!billing || (!billing.lineItems?.length && !billing.invoiceStatus)" class="text-center py-12">
      <UIcon name="i-lucide-receipt" class="w-8 h-8 text-gray-300 mx-auto mb-3" />
      <p class="text-sm text-gray-500">No billing data for this task.</p>
      <p class="text-xs text-gray-400 mt-1">This task hasn't been included in any EOM run yet.</p>
    </div>

    <!-- Billing content -->
    <template v-else>
      <!-- Invoice Status -->
      <div class="flex items-center justify-between">
        <span class="text-sm font-medium text-gray-700">Invoice Status</span>
        <InvoiceStatusBadge :status="billing.invoiceStatus" />
      </div>

      <!-- Summary -->
      <div v-if="billing.lineItems.length > 0" class="grid grid-cols-3 gap-3">
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 mb-1">Ex-GST</p>
          <p class="text-sm font-semibold">${{ formatCurrency(billing.totals.exGst) }}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 mb-1">GST</p>
          <p class="text-sm font-semibold">${{ formatCurrency(billing.totals.gst) }}</p>
        </div>
        <div class="bg-gray-50 rounded-lg p-3 text-center">
          <p class="text-xs text-gray-500 mb-1">Inc-GST</p>
          <p class="text-sm font-semibold">${{ formatCurrency(billing.totals.incGst) }}</p>
        </div>
      </div>

      <!-- Latest Run Info -->
      <div v-if="billing.latestRun" class="bg-blue-50 border border-blue-100 rounded-lg p-3">
        <div class="flex items-center justify-between">
          <span class="text-xs font-medium text-blue-700">
            EOM Run: {{ monthName(billing.latestRun.month) }} {{ billing.latestRun.year }}
          </span>
          <UBadge :color="runStatusColor(billing.latestRun.status)" variant="soft" size="xs">
            {{ billing.latestRun.status }}
          </UBadge>
        </div>
        <div v-if="billing.latestRun.xeroBatchId" class="mt-1">
          <span class="text-xs text-blue-600">Xero Batch: {{ billing.latestRun.xeroBatchId }}</span>
        </div>
      </div>

      <!-- Line Items -->
      <div v-if="billing.lineItems.length > 0">
        <h4 class="text-sm font-medium text-gray-700 mb-3">Line Items</h4>
        <div class="space-y-2">
          <div
            v-for="item in billing.lineItems"
            :key="item.id"
            class="border rounded-lg p-3 hover:bg-gray-50 transition-colors"
          >
            <div class="flex items-start justify-between mb-2">
              <div class="flex-1 min-w-0">
                <p class="text-sm font-medium text-gray-900 truncate">{{ item.description }}</p>
                <p class="text-xs text-gray-500">{{ item.clientName }}</p>
              </div>
              <span class="text-sm font-semibold ml-3">${{ formatCurrency(item.unitAmount * item.quantity) }}</span>
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">COA {{ item.accountCode }}</span>
              <span class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{{ item.taxType }}</span>
              <span v-if="item.invoiceNumber" class="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                INV-{{ item.invoiceNumber }}
              </span>
              <span v-if="item.trackingCategory" class="text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded">
                {{ item.trackingCategory }}
              </span>
              <UBadge
                :color="confidenceColor(item.confidence)"
                variant="soft"
                size="xs"
              >
                {{ item.confidence }}
              </UBadge>
              <UBadge
                v-if="item.reviewStatus === 'corrected'"
                color="warning"
                variant="soft"
                size="xs"
              >
                overridden
              </UBadge>
            </div>

            <!-- Revision history -->
            <div v-if="item.originalValues && Object.keys(item.originalValues).length" class="mt-2 bg-amber-50 border border-amber-100 rounded p-2">
              <p class="text-xs font-medium text-amber-700 mb-1">Revision History</p>
              <div v-if="item.originalValues.previousAccountCode" class="text-xs text-amber-600">
                COA changed from {{ item.originalValues.previousAccountCode }} by {{ item.originalValues.accountCodeOverrideBy }}
              </div>
              <div v-if="item.originalValues.previousTaxType" class="text-xs text-amber-600">
                GST changed from {{ item.originalValues.previousTaxType }} by {{ item.originalValues.taxTypeOverrideBy }}
              </div>
              <div v-if="item.originalValues.originalClientName" class="text-xs text-amber-600">
                Client name fuzzy-matched from "{{ item.originalValues.originalClientName }}" (score: {{ item.originalValues.matchScore }})
              </div>
            </div>

            <!-- Override button -->
            <div v-if="!overrideItemId" class="mt-2">
              <button
                class="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                @click="overrideItemId = item.id"
              >
                Override COA / GST
              </button>
            </div>

            <!-- Override form -->
            <div v-if="overrideItemId === item.id" class="mt-3 border-t pt-3 space-y-3">
              <div>
                <label class="text-xs font-medium text-gray-600 block mb-1">Account Code (COA)</label>
                <select
                  v-model="overrideForm.accountCode"
                  class="w-full text-sm border rounded-md px-2 py-1.5 outline-none focus:border-blue-500"
                >
                  <option value="">Keep current ({{ item.accountCode }})</option>
                  <option value="205">205 - Media Agency Commission</option>
                  <option value="210">210 - Digital Marketing Services</option>
                  <option value="215">215 - Social Media Management</option>
                  <option value="220">220 - Content Creation</option>
                  <option value="225">225 - SEO Services</option>
                  <option value="230">230 - Web Development</option>
                  <option value="300">300 - PPC Ad Spend Pass-Through</option>
                  <option value="310">310 - Print & Production</option>
                  <option value="330">330 - Third Party Costs</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 block mb-1">GST Type</label>
                <select
                  v-model="overrideForm.taxType"
                  class="w-full text-sm border rounded-md px-2 py-1.5 outline-none focus:border-blue-500"
                >
                  <option value="">Keep current ({{ item.taxType }})</option>
                  <option value="GST on Income">GST on Income</option>
                  <option value="GST on Expenses">GST on Expenses</option>
                  <option value="GST Free Expenses">GST Free Expenses</option>
                </select>
              </div>
              <div>
                <label class="text-xs font-medium text-gray-600 block mb-1">Reason for Override</label>
                <textarea
                  v-model="overrideForm.reviewNotes"
                  rows="2"
                  class="w-full text-sm border rounded-md px-2 py-1.5 outline-none focus:border-blue-500"
                  placeholder="Why is this being changed?"
                />
              </div>
              <div class="flex items-center gap-2">
                <UButton
                  size="xs"
                  color="primary"
                  :loading="overriding"
                  :disabled="!overrideForm.accountCode && !overrideForm.taxType"
                  @click="submitOverride(item.id)"
                >
                  Save Override
                </UButton>
                <UButton size="xs" variant="ghost" color="neutral" @click="cancelOverride">
                  Cancel
                </UButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import InvoiceStatusBadge from '~/components/eom/InvoiceStatusBadge.vue'

const props = defineProps<{
  taskId: string
}>()

const toast = useToast()

const loading = ref(true)
const billing = ref<any>(null)
const overrideItemId = ref<string | null>(null)
const overriding = ref(false)
const overrideForm = ref({
  accountCode: '',
  taxType: '',
  reviewNotes: '',
})

async function fetchBilling() {
  loading.value = true
  try {
    billing.value = await $fetch(`/api/agency/tasks/${props.taskId}/billing`)
  } catch {
    billing.value = null
  } finally {
    loading.value = false
  }
}

function cancelOverride() {
  overrideItemId.value = null
  overrideForm.value = { accountCode: '', taxType: '', reviewNotes: '' }
}

async function submitOverride(lineItemId: string) {
  if (!overrideForm.value.accountCode && !overrideForm.value.taxType) return
  overriding.value = true
  try {
    await $fetch(`/api/agency/tasks/${props.taskId}/billing-override`, {
      method: 'PATCH',
      body: {
        lineItemId,
        accountCode: overrideForm.value.accountCode || undefined,
        taxType: overrideForm.value.taxType || undefined,
        reviewNotes: overrideForm.value.reviewNotes || undefined,
      },
    })
    toast.add({ title: 'Override saved', color: 'success' })
    cancelOverride()
    await fetchBilling()
  } catch (err: any) {
    toast.add({ title: 'Override failed', description: err.data?.statusMessage || err.message, color: 'error' })
  } finally {
    overriding.value = false
  }
}

function formatCurrency(val: number): string {
  return val.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function monthName(month: number): string {
  return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][month - 1] || ''
}

function runStatusColor(status: string): 'primary' | 'warning' | 'success' | 'error' | 'neutral' {
  const map: Record<string, any> = {
    draft: 'neutral',
    generating: 'primary',
    review: 'warning',
    pushed: 'success',
    complete: 'success',
    failed: 'error',
  }
  return map[status] || 'neutral'
}

function confidenceColor(confidence: string): 'success' | 'warning' | 'error' {
  if (confidence === 'high') return 'success'
  if (confidence === 'medium') return 'warning'
  return 'error'
}

watch(() => props.taskId, () => fetchBilling(), { immediate: true })
</script>
