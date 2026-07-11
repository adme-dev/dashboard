<script setup lang="ts">
definePageMeta({ layout: 'agency', middleware: ['role-admin'] })
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

interface AgingBuckets {
  current: number
  '1-30': number
  '31-60': number
  '61-90': number
  '90+': number
}

interface Tag { id: string; label: string; color: string }

interface QueueCustomer {
  id: string
  name: string
  email: string | null
  phone: string | null
  currency: string
  paymentTermsDays: number | null
  outstanding: number
  overdue: number
  oldestOverdueDays: number
  agingBuckets: AgingBuckets
  dsoDays: number | null
  paidLatePct: number | null
  creditHold: boolean
  holdReason: string | null
  paymentPriority: number
  accountManager: string | null
  lastAction: string | null
  lastActionAt: string | null
  lastActionBy: string | null
  tags: Tag[]
  churnRiskScore: number
  churnRiskBand: 'low' | 'moderate' | 'high' | 'critical'
}

interface QueueResponse {
  customers: QueueCustomer[]
  metrics: {
    total: number
    totalOverdue: number
    oldestDays: number
    onHold: number
    untouched7d: number
  }
}

// ── Filters ──
const minOverdue = ref(0)
const staleDays = ref<0 | 7 | 14 | 30>(0)
const search = ref('')

const queryParams = computed(() => {
  const p = new URLSearchParams()
  if (minOverdue.value > 0) p.set('minOverdue', String(minOverdue.value))
  if (staleDays.value > 0) p.set('staleDays', String(staleDays.value))
  return p.toString() ? `?${p.toString()}` : ''
})

const data = ref<QueueResponse | null>(null)
const pending = ref(false)

async function refresh() {
  pending.value = true
  try {
    data.value = await apiFetch<QueueResponse>(`/api/customers/collections${queryParams.value}`)
  } catch {
    data.value = null
  } finally {
    pending.value = false
  }
}

onMounted(() => {
  void refresh()
})

watch(queryParams, () => {
  void refresh()
})

const filtered = computed(() => {
  const list = data.value?.customers ?? []
  if (!search.value) return list
  const q = search.value.toLowerCase()
  return list.filter(c =>
    c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q),
  )
})

// ── Send-reminder action ──
const toast = useToast()
const busyContactId = ref<string | null>(null)

async function sendBulkReminder(c: QueueCustomer) {
  busyContactId.value = c.id
  try {
    // Pick the escalation level based on oldest_overdue_days
    let action: 'reminder_gentle' | 'reminder_firm' | 'reminder_final' = 'reminder_gentle'
    if (c.oldestOverdueDays > 60) action = 'reminder_final'
    else if (c.oldestOverdueDays > 30) action = 'reminder_firm'
    await apiFetch(`/api/customers/${c.id}/collections`, {
      method: 'POST',
      body: { action },
    })
    toast.add({
      title: 'Logged',
      description: `${action.replace('_', ' ')} recorded for ${c.name}.`,
      color: 'success',
    })
    await refresh()
  } catch (err: any) {
    toast.add({
      title: 'Could not log action',
      description: err?.statusMessage || err?.message,
      color: 'error',
    })
  } finally {
    busyContactId.value = null
  }
}

async function logCall(c: QueueCustomer) {
  busyContactId.value = c.id
  try {
    await apiFetch(`/api/customers/${c.id}/collections`, {
      method: 'POST',
      body: { action: 'phone_call' },
    })
    toast.add({ title: 'Call logged', color: 'success' })
    await refresh()
  } catch (err: any) {
    toast.add({ title: 'Could not log call', description: err?.message, color: 'error' })
  } finally {
    busyContactId.value = null
  }
}

// ── Formatters ──
function fmt(value?: number | null, currency = 'AUD'): string {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toLocaleString('en-AU', { style: 'currency', currency, maximumFractionDigits: 0 })
}

function relativeTime(value?: string | null): string {
  if (!value) return 'never'
  const dt = new Date(value)
  const days = Math.floor((Date.now() - dt.getTime()) / (1000 * 60 * 60 * 24))
  if (days < 1) return 'today'
  if (days === 1) return '1d ago'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function actionLabel(a: string | null): string {
  if (!a) return '—'
  return ({
    reminder_gentle: 'Gentle reminder',
    reminder_firm: 'Firm reminder',
    reminder_final: 'Final notice',
    phone_call: 'Phone call',
    email_custom: 'Custom email',
    escalated_to_handover: 'Escalated',
    note: 'Note',
    paid: 'Paid',
  } as Record<string, string>)[a] ?? a
}

function ageBadge(days: number) {
  if (days >= 90) return 'error'
  if (days >= 60) return 'error'
  if (days >= 30) return 'warning'
  return 'info'
}

function priorityLabel(p: number): string {
  if (p > 0) return 'High'
  if (p < 0) return 'Low'
  return 'Normal'
}

function bucketSegments(b: AgingBuckets) {
  const total = b.current + b['1-30'] + b['31-60'] + b['61-90'] + b['90+']
  if (total <= 0) return []
  const order: Array<{ key: keyof AgingBuckets; color: string }> = [
    { key: 'current', color: 'bg-emerald-500' },
    { key: '1-30',    color: 'bg-blue-500' },
    { key: '31-60',   color: 'bg-amber-500' },
    { key: '61-90',   color: 'bg-orange-500' },
    { key: '90+',     color: 'bg-red-500' },
  ]
  return order
    .map(o => ({ ...o, amount: b[o.key], pct: (b[o.key] / total) * 100 }))
    .filter(s => s.amount > 0)
}

const breadcrumbs = computed(() => ([
  { label: 'XeroFlow', to: '/xeroflow' },
  { label: 'Customers', to: '/customers' },
  { label: 'Collections', to: '/customers/collections' },
]))
</script>

<template>
  <UDashboardPanel id="collections">
    <template #header>
      <UDashboardNavbar
        title="Collections queue"
        description="Customers with overdue invoices, ranked by priority and age"
      >
        <template #leading>
          <UButton icon="i-lucide-arrow-left" color="neutral" variant="ghost" to="/customers" />
        </template>
        <template #right>
          <UButton
            label="Refresh"
            color="neutral"
            variant="ghost"
            icon="i-lucide-refresh-cw"
            :loading="pending"
            @click="() => refresh()"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar>
        <template #left>
          <UBreadcrumb :items="breadcrumbs" />
        </template>
        <template #right>
          <UInput v-model="search" placeholder="Search..." icon="i-lucide-search" class="w-56" />
          <USelect
            :model-value="staleDays"
            :items="[
              { label: 'All', value: 0 },
              { label: 'Untouched 7d+', value: 7 },
              { label: 'Untouched 14d+', value: 14 },
              { label: 'Untouched 30d+', value: 30 },
            ]"
            class="min-w-40"
            @update:model-value="(v: any) => (staleDays = v)"
          />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <USkeleton v-for="n in 4" :key="`sk-${n}`" class="h-24" />
        </div>
        <USkeleton class="h-96" />
      </div>

      <div v-else class="space-y-6">
        <!-- KPIs -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase">Customers in queue</p>
            <p class="text-2xl font-bold">{{ data?.metrics.total ?? 0 }}</p>
          </UCard>
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase">Total overdue</p>
            <p class="text-2xl font-bold text-red-500">{{ fmt(data?.metrics.totalOverdue) }}</p>
          </UCard>
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase">Oldest overdue</p>
            <p class="text-2xl font-bold">{{ data?.metrics.oldestDays ?? 0 }}d</p>
          </UCard>
          <UCard :ui="{ body: '!p-4' }">
            <p class="text-xs text-muted uppercase">Untouched 7d+</p>
            <p class="text-2xl font-bold">{{ data?.metrics.untouched7d ?? 0 }}</p>
            <p v-if="(data?.metrics.onHold ?? 0) > 0" class="text-[11px] text-amber-500 mt-1">
              {{ data?.metrics.onHold }} on credit hold
            </p>
          </UCard>
        </div>

        <UCard :ui="{ body: '!p-0' }">
          <template #header>
            <div class="flex items-center justify-between px-6">
              <h3 class="text-base font-semibold">Queue · ranked by priority + age</h3>
              <p class="text-xs text-muted">{{ filtered.length }} customers shown</p>
            </div>
          </template>

          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="bg-elevated/50 text-xs uppercase text-muted">
                <tr>
                  <th class="text-left font-medium px-4 py-3">Customer</th>
                  <th class="text-right font-medium px-4 py-3">Overdue</th>
                  <th class="text-left font-medium px-4 py-3">Aging</th>
                  <th class="text-right font-medium px-4 py-3">Oldest</th>
                  <th class="text-left font-medium px-4 py-3">Pays in</th>
                  <th class="text-left font-medium px-4 py-3">Last contact</th>
                  <th class="text-left font-medium px-4 py-3">Priority</th>
                  <th class="text-right font-medium px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-default">
                <tr
                  v-for="c in filtered"
                  :key="c.id"
                  class="hover:bg-elevated/40 transition-colors"
                  :class="c.creditHold ? 'bg-amber-50/40 dark:bg-amber-500/5' : ''"
                >
                  <td class="px-4 py-3 max-w-xs">
                    <NuxtLink :to="`/customers/${c.id}`" class="block">
                      <div class="flex items-center gap-3 min-w-0">
                        <UAvatar :label="c.name.charAt(0)" size="sm" />
                        <div class="min-w-0">
                          <p class="font-medium truncate hover:text-primary">{{ c.name }}</p>
                          <p class="text-xs text-muted truncate">{{ c.email || '—' }}</p>
                          <div v-if="c.tags.length" class="flex gap-1 mt-1 flex-wrap">
                            <UBadge v-for="t in c.tags" :key="t.id" :color="t.color as any" variant="subtle" size="xs">
                              {{ t.label }}
                            </UBadge>
                          </div>
                        </div>
                      </div>
                    </NuxtLink>
                  </td>
                  <td class="px-4 py-3 text-right tabular-nums">
                    <p class="font-semibold text-red-500">{{ fmt(c.overdue, c.currency) }}</p>
                    <p class="text-[11px] text-muted">of {{ fmt(c.outstanding, c.currency) }} total</p>
                  </td>
                  <td class="px-4 py-3 min-w-32">
                    <div class="flex h-2 rounded-full overflow-hidden bg-muted/10">
                      <div
                        v-for="seg in bucketSegments(c.agingBuckets)"
                        :key="seg.key"
                        :class="seg.color"
                        :style="{ width: `${seg.pct}%` }"
                        :title="`${seg.key}: ${fmt(seg.amount, c.currency)}`"
                      />
                    </div>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UBadge :color="ageBadge(c.oldestOverdueDays) as any" variant="subtle" size="xs">
                      {{ c.oldestOverdueDays }}d
                    </UBadge>
                  </td>
                  <td class="px-4 py-3 text-xs">
                    <span v-if="c.dsoDays">{{ Math.round(c.dsoDays) }}d avg</span>
                    <span v-else class="text-muted">—</span>
                    <p v-if="c.paymentTermsDays" class="text-muted text-[11px]">terms: {{ c.paymentTermsDays }}d</p>
                  </td>
                  <td class="px-4 py-3 text-xs">
                    <p>{{ actionLabel(c.lastAction) }}</p>
                    <p class="text-muted text-[11px]">
                      {{ relativeTime(c.lastActionAt) }}<span v-if="c.lastActionBy"> · {{ c.lastActionBy }}</span>
                    </p>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-1 flex-wrap">
                      <UBadge
                        :color="c.paymentPriority > 0 ? 'error' : c.paymentPriority < 0 ? 'neutral' : 'info'"
                        variant="subtle"
                        size="xs"
                      >
                        {{ priorityLabel(c.paymentPriority) }}
                      </UBadge>
                      <UTooltip
                        v-if="c.churnRiskBand !== 'low'"
                        :text="`Churn risk ${c.churnRiskScore}/100`"
                      >
                        <UBadge
                          :color="c.churnRiskBand === 'critical' || c.churnRiskBand === 'high' ? 'error' : 'warning'"
                          variant="subtle"
                          size="xs"
                          class="capitalize"
                        >
                          <UIcon name="i-lucide-alert-triangle" class="size-3 mr-0.5" />
                          {{ c.churnRiskBand }}
                        </UBadge>
                      </UTooltip>
                      <UTooltip v-if="c.creditHold" :text="c.holdReason || 'Credit hold'">
                        <UIcon name="i-lucide-pause-circle" class="size-4 text-amber-500" />
                      </UTooltip>
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center justify-end gap-1">
                      <UButton
                        :label="c.oldestOverdueDays > 60 ? 'Final notice' : c.oldestOverdueDays > 30 ? 'Firm' : 'Gentle'"
                        size="xs"
                        :color="c.oldestOverdueDays > 60 ? 'error' : 'neutral'"
                        variant="outline"
                        :loading="busyContactId === c.id"
                        @click="sendBulkReminder(c)"
                      />
                      <UButton
                        icon="i-lucide-phone"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        title="Log phone call"
                        @click="logCall(c)"
                      />
                    </div>
                  </td>
                </tr>
                <tr v-if="!filtered.length">
                  <td colspan="8" class="px-4 py-12 text-center text-sm text-muted">
                    <UIcon name="i-lucide-check-circle-2" class="size-8 mx-auto mb-2 text-emerald-500" />
                    Nothing in the collections queue. Nice work.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
