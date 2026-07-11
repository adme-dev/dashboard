<script setup lang="ts">
import type { EomRun } from '~/types'

const toast = useToast()
const { generateRun, fetchRuns, deleteRun, exportCSV } = useEom()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { params?: Record<string, unknown> }) => Promise<T>

const now = new Date()
const selectedMonth = ref(now.getMonth())
const selectedYear = ref(now.getFullYear())
const generating = ref(false)

// Default to previous month
if (now.getDate() <= 15) {
  selectedMonth.value = now.getMonth() === 0 ? 11 : now.getMonth() - 1
  if (now.getMonth() === 0) selectedYear.value = now.getFullYear() - 1
}

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const runs = ref<EomRun[]>([])

async function refresh() {
  runs.value = await apiFetch<EomRun[]>('/api/agency/eom/runs', {
    params: { year: selectedYear.value },
  })
}

watch(selectedYear, () => {
  refresh()
}, { immediate: true })

const currentRun = computed(() => {
  if (!runs.value) return null
  return runs.value.find(r => r.month === selectedMonth.value + 1 && r.year === selectedYear.value)
})

const statusConfig: Record<string, { color: string; label: string; icon: string }> = {
  draft: { color: 'neutral', label: 'Draft', icon: 'i-lucide-file-edit' },
  generating: { color: 'info', label: 'Generating...', icon: 'i-lucide-loader-2' },
  review: { color: 'warning', label: 'Ready for Review', icon: 'i-lucide-eye' },
  pushed: { color: 'success', label: 'Pushed to Xero', icon: 'i-lucide-check-circle' },
  complete: { color: 'success', label: 'Complete', icon: 'i-lucide-circle-check' },
  failed: { color: 'error', label: 'Failed', icon: 'i-lucide-alert-circle' },
}

function formatCurrency(val: number | null) {
  if (val === null || val === undefined) return '$0'
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(val)
}

async function handleGenerate() {
  generating.value = true
  try {
    await generateRun(selectedMonth.value + 1, selectedYear.value)
    toast.add({ title: 'Generation started', description: 'Invoices are being generated...', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Generation failed', description: e.data?.statusMessage || e.message, color: 'error' })
  } finally {
    generating.value = false
  }
}

const deleteTarget = ref<string | null>(null)
const showDeleteModal = ref(false)

function confirmDelete(runId: string) {
  deleteTarget.value = runId
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!deleteTarget.value) return
  try {
    await deleteRun(deleteTarget.value)
    toast.add({ title: 'Deleted', color: 'success' })
    showDeleteModal.value = false
    deleteTarget.value = null
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Error', description: e.message, color: 'error' })
  }
}

watch(selectedMonth, () => refresh())
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">EOM Invoicing</h1>
        <p class="text-muted text-sm mt-1">Monthly invoice generation, review, and Xero push</p>
      </div>
    </div>

    <!-- Month Selector -->
    <div class="flex items-center gap-4">
      <div class="flex items-center gap-2">
        <USelect v-model="selectedMonth" :items="months.map((m, i) => ({ label: m, value: i }))" value-key="value" class="w-40" />
        <USelect v-model="selectedYear" :items="[2024, 2025, 2026].map(y => ({ label: String(y), value: y }))" value-key="value" class="w-28" />
      </div>
    </div>

    <!-- Current Run Status -->
    <div class="border border-default rounded-lg p-6">
      <template v-if="currentRun">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-3">
            <UIcon :name="statusConfig[currentRun.status]?.icon || 'i-lucide-circle'" class="w-5 h-5" />
            <div>
              <h2 class="font-semibold">{{ months[currentRun.month - 1] }} {{ currentRun.year }}</h2>
              <UBadge :color="(statusConfig[currentRun.status]?.color as any) || 'neutral'" variant="subtle" size="xs">
                {{ statusConfig[currentRun.status]?.label || currentRun.status }}
              </UBadge>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton v-if="currentRun.status === 'review'" :to="`/agency/eom/${currentRun.id}`" color="primary" size="sm">
              Review & Push
            </UButton>
            <UButton v-else-if="currentRun.status === 'pushed'" :to="`/agency/eom/${currentRun.id}`" variant="soft" size="sm">
              View Status
            </UButton>
            <UButton v-else-if="currentRun.status === 'complete'" :to="`/agency/eom/${currentRun.id}`" variant="ghost" size="sm">
              View
            </UButton>
            <UButton v-if="['review', 'failed'].includes(currentRun.status)" variant="soft" size="sm" icon="i-lucide-download" @click="exportCSV(currentRun.id)">
              CSV
            </UButton>
          </div>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <p class="text-xs text-muted">Revenue (ex-GST)</p>
            <p class="text-lg font-bold">{{ formatCurrency(currentRun.totalExGst) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">GST Collected</p>
            <p class="text-lg font-bold">{{ formatCurrency(currentRun.totalGst) }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Invoices</p>
            <p class="text-lg font-bold">{{ currentRun.invoiceCount }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Line Items</p>
            <p class="text-lg font-bold">{{ currentRun.lineItemCount }}</p>
          </div>
          <div>
            <p class="text-xs text-muted">Flagged</p>
            <p class="text-lg font-bold" :class="currentRun.flaggedCount > 0 ? 'text-error' : ''">
              {{ currentRun.flaggedCount }}
            </p>
          </div>
        </div>
      </template>

      <template v-else>
        <div class="text-center py-8">
          <p class="text-muted mb-4">No invoices generated for {{ months[selectedMonth] }} {{ selectedYear }}</p>
          <UButton color="primary" icon="i-lucide-play" :loading="generating" @click="handleGenerate">
            Generate Invoices
          </UButton>
        </div>
      </template>
    </div>

    <!-- Past Runs -->
    <div v-if="runs?.length">
      <h3 class="font-semibold mb-3">Past Runs</h3>
      <div class="border border-default rounded-lg overflow-hidden">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default bg-elevated/50">
              <th class="py-2 px-3 text-left font-medium text-muted">Period</th>
              <th class="py-2 px-3 text-left font-medium text-muted">Status</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Total (ex-GST)</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Invoices</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Flagged</th>
              <th class="py-2 px-3 text-right font-medium text-muted">Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="run in runs" :key="run.id" class="border-b border-default/50 hover:bg-elevated/30">
              <td class="py-2 px-3">{{ months[run.month - 1] }} {{ run.year }}</td>
              <td class="py-2 px-3">
                <UBadge :color="(statusConfig[run.status]?.color as any) || 'neutral'" variant="subtle" size="xs">
                  {{ statusConfig[run.status]?.label || run.status }}
                </UBadge>
              </td>
              <td class="py-2 px-3 text-right font-medium">{{ formatCurrency(run.totalExGst) }}</td>
              <td class="py-2 px-3 text-right">{{ run.invoiceCount }}</td>
              <td class="py-2 px-3 text-right" :class="run.flaggedCount > 0 ? 'text-error' : ''">{{ run.flaggedCount }}</td>
              <td class="py-2 px-3 text-right">
                <div class="flex gap-1 justify-end">
                  <UButton :to="`/agency/eom/${run.id}`" variant="ghost" size="xs" icon="i-lucide-eye" />
                  <UButton v-if="['draft', 'review', 'failed'].includes(run.status)" variant="ghost" size="xs" color="error" icon="i-lucide-trash-2" @click="confirmDelete(run.id)" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteModal">
      <template #content>
        <div class="p-6 space-y-4">
          <div class="flex items-start gap-3">
            <div class="rounded-full bg-red-100 dark:bg-red-950/40 p-2">
              <UIcon name="i-lucide-trash-2" class="size-5 text-red-500" />
            </div>
            <div>
              <h3 class="font-semibold">Delete this run?</h3>
              <p class="text-sm text-muted mt-1">This cannot be undone. All generated invoices in this run will be permanently removed.</p>
            </div>
          </div>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" label="Cancel" @click="showDeleteModal = false" />
            <UButton color="error" label="Delete" icon="i-lucide-trash-2" @click="handleDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
