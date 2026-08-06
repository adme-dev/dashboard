<script setup lang="ts">
import { CalendarDate, parseDate, getLocalTimeZone, type DateValue } from '@internationalized/date'

definePageMeta({ layout: 'agency', middleware: ['role-finance'] })

interface Commitment {
  id: string
  supplier: string
  contact_id: string | null
  description: string | null
  amount_cents: string
  expected_date: string
  recurrence: string
  recurrence_end: string | null
  payment_account: string
  status: string
  confidence: string
  owner: string | null
  notes: string | null
  source: string
  matched_invoice_id: string | null
}

const toast = useToast()

const statusFilter = ref<'open' | 'expected' | 'hold' | 'disputed' | 'matched' | 'closed'>('open')
const statusFilterItems = [
  { label: 'All open', value: 'open' },
  { label: 'Expected', value: 'expected' },
  { label: 'On hold', value: 'hold' },
  { label: 'Disputed', value: 'disputed' },
  { label: 'Matched', value: 'matched' },
  { label: 'Closed', value: 'closed' },
]

const { data, pending, refresh } = await useFetch<{ commitments: Commitment[] }>(
  '/api/cashflow/commitments',
  { query: computed(() => statusFilter.value === 'open' ? {} : { status: statusFilter.value }) },
)
const commitments = computed(() => data.value?.commitments ?? [])

const currency = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
const fmtAmount = (cents: string) => currency.format(Number(cents) / 100)
const dateFormatter = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const fmtDate = (iso: string | null) => iso ? dateFormatter.format(new Date(iso + 'T00:00:00')) : '—'

const ACCOUNT_LABELS: Record<string, string> = { NAB_BUSINESS: 'NAB Business', NAB_TAX: 'NAB Tax', AMEX: 'Amex' }
const STATUS_COLORS: Record<string, 'primary' | 'warning' | 'error' | 'success' | 'neutral'> = {
  expected: 'primary', hold: 'warning', disputed: 'error', matched: 'success', closed: 'neutral',
}
const CONFIDENCE_COLORS: Record<string, 'success' | 'primary' | 'neutral'> = {
  committed: 'success', probable: 'primary', provisional: 'neutral',
}

const openTotal = computed(() =>
  commitments.value
    .filter(c => c.status === 'expected' || c.status === 'hold')
    .reduce((s, c) => s + Number(c.amount_cents), 0),
)

// ---- Create / edit form ----
const showForm = ref(false)
const editing = ref<Commitment | null>(null)
const saving = ref(false)

const blankForm = () => ({
  supplier: '',
  description: '',
  amountDollars: '' as string | number,
  expectedDate: '',
  recurrence: 'none',
  recurrenceEnd: '',
  paymentAccount: 'NAB_BUSINESS',
  status: 'expected',
  confidence: 'probable',
  owner: '',
  notes: '',
})
const form = ref(blankForm())

const recurrenceItems = [
  { label: 'One-off', value: 'none' },
  { label: 'Weekly', value: 'weekly' },
  { label: 'Fortnightly', value: 'fortnightly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Yearly', value: 'yearly' },
]
const accountItems = [
  { label: 'NAB Business', value: 'NAB_BUSINESS' },
  { label: 'NAB Tax', value: 'NAB_TAX' },
  { label: 'Amex', value: 'AMEX' },
]
const statusItems = [
  { label: 'Expected', value: 'expected' },
  { label: 'On hold', value: 'hold' },
  { label: 'Disputed', value: 'disputed' },
  { label: 'Matched to Xero bill', value: 'matched' },
  { label: 'Closed', value: 'closed' },
]
const confidenceItems = [
  { label: 'Committed', value: 'committed' },
  { label: 'Probable', value: 'probable' },
  { label: 'Provisional', value: 'provisional' },
]

// Date picker helpers — bridge between ISO YYYY-MM-DD strings and CalendarDate
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try {
    return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso)
  } catch {
    return null
  }
}
function fmtPicker(iso: string): string {
  const cd = toCalendarDate(iso)
  if (!cd) return 'Pick a date'
  return dateFormatter.format((cd as CalendarDate).toDate(getLocalTimeZone()))
}
const expectedDateModel = computed<DateValue | null>({
  get: () => toCalendarDate(form.value.expectedDate),
  set: (v) => { form.value.expectedDate = v ? v.toString() : '' },
})
const recurrenceEndModel = computed<DateValue | null>({
  get: () => toCalendarDate(form.value.recurrenceEnd),
  set: (v) => { form.value.recurrenceEnd = v ? v.toString() : '' },
})

function openCreate() {
  editing.value = null
  form.value = blankForm()
  showForm.value = true
}
function openEdit(c: Commitment) {
  editing.value = c
  form.value = {
    supplier: c.supplier,
    description: c.description ?? '',
    amountDollars: Number(c.amount_cents) / 100,
    expectedDate: c.expected_date,
    recurrence: c.recurrence,
    recurrenceEnd: c.recurrence_end ?? '',
    paymentAccount: c.payment_account,
    status: c.status,
    confidence: c.confidence,
    owner: c.owner ?? '',
    notes: c.notes ?? '',
  }
  showForm.value = true
}

async function save() {
  const amountCents = Math.round(Number(form.value.amountDollars) * 100)
  if (!form.value.supplier.trim()) {
    toast.add({ title: 'Supplier is required', color: 'error' })
    return
  }
  if (!Number.isFinite(amountCents) || amountCents <= 0) {
    toast.add({ title: 'Enter a positive amount', color: 'error' })
    return
  }
  if (!form.value.expectedDate) {
    toast.add({ title: 'Expected payment date is required', color: 'error' })
    return
  }
  saving.value = true
  try {
    const payload = {
      supplier: form.value.supplier,
      description: form.value.description || null,
      amountCents,
      expectedDate: form.value.expectedDate,
      recurrence: form.value.recurrence,
      recurrenceEnd: form.value.recurrenceEnd || null,
      paymentAccount: form.value.paymentAccount,
      status: form.value.status,
      confidence: form.value.confidence,
      owner: form.value.owner || null,
      notes: form.value.notes || null,
    }
    if (editing.value) {
      await $fetch(`/api/cashflow/commitments/${editing.value.id}`, { method: 'PATCH', body: payload })
      toast.add({ title: 'Commitment updated', color: 'success' })
    } else {
      await $fetch('/api/cashflow/commitments', { method: 'POST', body: payload })
      toast.add({ title: 'Commitment added', color: 'success' })
    }
    showForm.value = false
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Save failed', description: err?.statusMessage ?? err?.message, color: 'error' })
  } finally {
    saving.value = false
  }
}

// ---- Delete ----
const deleting = ref<Commitment | null>(null)
const deleteBusy = ref(false)
async function confirmDelete() {
  if (!deleting.value) return
  deleteBusy.value = true
  try {
    await $fetch(`/api/cashflow/commitments/${deleting.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Commitment deleted', color: 'success' })
    deleting.value = null
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Delete failed', description: err?.statusMessage ?? err?.message, color: 'error' })
  } finally {
    deleteBusy.value = false
  }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold">Commitment register</h1>
        <p class="text-sm text-muted mt-1 max-w-xl">
          Payments expected before a Xero document exists — bills not yet received, held payments
          and recurring costs awaiting invoices. Entries feed the 13-week forecast until the real
          bill arrives in Xero.
        </p>
      </div>
      <div class="flex items-center gap-3">
        <USelectMenu v-model="statusFilter" :items="statusFilterItems" value-key="value" class="w-36" />
        <UButton icon="i-lucide-plus" @click="openCreate">Add commitment</UButton>
      </div>
    </div>

    <UCard>
      <div class="flex items-center justify-between text-sm mb-4">
        <span class="text-muted">{{ commitments.length }} commitment{{ commitments.length === 1 ? '' : 's' }}</span>
        <span v-if="openTotal" class="font-medium">
          Open exposure: {{ currency.format(openTotal / 100) }}
        </span>
      </div>

      <div v-if="pending" class="py-12 text-center text-muted text-sm">Loading commitments…</div>
      <div v-else-if="!commitments.length" class="py-12 text-center">
        <p class="text-sm text-muted">No commitments yet.</p>
        <p class="text-sm text-muted mt-1">Add a payment you expect before its invoice exists in Xero.</p>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted border-b border-default">
              <th class="py-2 pr-4 font-medium">Supplier</th>
              <th class="py-2 pr-4 font-medium text-right">Amount</th>
              <th class="py-2 pr-4 font-medium">Expected</th>
              <th class="py-2 pr-4 font-medium">Repeats</th>
              <th class="py-2 pr-4 font-medium">Pays from</th>
              <th class="py-2 pr-4 font-medium">Status</th>
              <th class="py-2 pr-4 font-medium">Confidence</th>
              <th class="py-2 pr-4 font-medium">Owner</th>
              <th class="py-2 font-medium"><span class="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in commitments"
              :key="c.id"
              class="border-b border-default last:border-0 hover:bg-elevated/50"
            >
              <td class="py-2.5 pr-4">
                <div class="font-medium">{{ c.supplier }}</div>
                <div v-if="c.description" class="text-xs text-muted truncate max-w-[28ch]">{{ c.description }}</div>
              </td>
              <td class="py-2.5 pr-4 text-right tabular-nums">{{ fmtAmount(c.amount_cents) }}</td>
              <td class="py-2.5 pr-4 whitespace-nowrap">{{ fmtDate(c.expected_date) }}</td>
              <td class="py-2.5 pr-4 capitalize">
                {{ c.recurrence === 'none' ? '—' : c.recurrence }}
                <span v-if="c.recurrence_end" class="text-xs text-muted"> to {{ fmtDate(c.recurrence_end) }}</span>
              </td>
              <td class="py-2.5 pr-4 whitespace-nowrap">{{ ACCOUNT_LABELS[c.payment_account] ?? c.payment_account }}</td>
              <td class="py-2.5 pr-4">
                <UBadge :color="STATUS_COLORS[c.status] ?? 'neutral'" variant="subtle" class="capitalize">
                  {{ c.status === 'hold' ? 'On hold' : c.status }}
                </UBadge>
              </td>
              <td class="py-2.5 pr-4">
                <UBadge :color="CONFIDENCE_COLORS[c.confidence] ?? 'neutral'" variant="outline" class="capitalize">
                  {{ c.confidence }}
                </UBadge>
              </td>
              <td class="py-2.5 pr-4">{{ c.owner ?? '—' }}</td>
              <td class="py-2.5 text-right whitespace-nowrap">
                <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral" aria-label="Edit" @click="openEdit(c)" />
                <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" aria-label="Delete" @click="deleting = c" />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </UCard>

    <!-- Create / edit -->
    <UModal v-model:open="showForm">
      <template #content>
        <div class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">{{ editing ? 'Edit commitment' : 'Add commitment' }}</h2>

          <UFormField label="Supplier" required>
            <UInput v-model="form.supplier" placeholder="e.g. Seven Network Operations" class="w-full" />
          </UFormField>

          <UFormField label="Description" help="What the payment is for">
            <UInput v-model="form.description" placeholder="e.g. McRae Kia campaign — invoice awaited" class="w-full" />
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Amount (AUD)" required>
              <UInput v-model="form.amountDollars" type="number" min="0" step="0.01" placeholder="0.00" class="w-full" />
            </UFormField>
            <UFormField label="Expected payment date" required>
              <UPopover>
                <UButton variant="outline" color="neutral" icon="i-lucide-calendar" class="w-full justify-start">
                  {{ fmtPicker(form.expectedDate) }}
                </UButton>
                <template #content>
                  <UCalendar v-model="expectedDateModel" class="p-2" />
                  <div class="p-2 pt-0 flex justify-end">
                    <UButton size="xs" variant="ghost" color="neutral" @click="form.expectedDate = ''">Clear</UButton>
                  </div>
                </template>
              </UPopover>
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Repeats">
              <USelectMenu v-model="form.recurrence" :items="recurrenceItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Repeats until" :help="form.recurrence === 'none' ? 'Only for repeating commitments' : undefined">
              <UPopover>
                <UButton
                  variant="outline" color="neutral" icon="i-lucide-calendar"
                  class="w-full justify-start" :disabled="form.recurrence === 'none'"
                >
                  {{ fmtPicker(form.recurrenceEnd) }}
                </UButton>
                <template #content>
                  <UCalendar v-model="recurrenceEndModel" class="p-2" />
                  <div class="p-2 pt-0 flex justify-end">
                    <UButton size="xs" variant="ghost" color="neutral" @click="form.recurrenceEnd = ''">Clear</UButton>
                  </div>
                </template>
              </UPopover>
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Pays from">
              <USelectMenu v-model="form.paymentAccount" :items="accountItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Owner" help="Who is accountable">
              <UInput v-model="form.owner" placeholder="e.g. Kellie" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Status">
              <USelectMenu v-model="form.status" :items="statusItems" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Confidence">
              <USelectMenu v-model="form.confidence" :items="confidenceItems" value-key="value" class="w-full" />
            </UFormField>
          </div>

          <UFormField label="Notes">
            <UTextarea v-model="form.notes" :rows="3" placeholder="Assumptions, hold reasons, follow-ups" class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2 pt-2">
            <UButton variant="ghost" color="neutral" @click="showForm = false">Cancel</UButton>
            <UButton :loading="saving" @click="save">{{ editing ? 'Save changes' : 'Add commitment' }}</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation -->
    <UModal :open="!!deleting" @update:open="(v: boolean) => { if (!v) deleting = null }">
      <template #content>
        <div class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">Delete commitment</h2>
          <p class="text-sm text-muted">
            Delete the {{ deleting ? fmtAmount(deleting.amount_cents) : '' }} commitment for
            <span class="font-medium text-default">{{ deleting?.supplier }}</span>?
            This removes it from the forecast. To keep history, set its status to Closed instead.
          </p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="deleting = null">Cancel</UButton>
            <UButton color="error" :loading="deleteBusy" @click="confirmDelete">Delete commitment</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
