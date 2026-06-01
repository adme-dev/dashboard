<script setup lang="ts">
// F15 — sales targets + attainment leaderboard (Insights tab, agency-only).
import { startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, format } from 'date-fns'

const props = defineProps<{ clientId: string }>()
const toast = useToast()

interface Row { user_id: string, user_name: string | null, target_type: 'revenue' | 'count', target_value: number, actual: number, attainment_pct: number }
interface Target { id: string, user_id: string, user_name: string | null, target_type: 'revenue' | 'count', target_value: number }

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })

// Period presets (computed via a fixed "today" from the client to avoid Date.now in SSR mismatch is fine here — client-only component).
const period = ref<'month' | 'quarter' | 'year'>('quarter')
const periodOptions = [
  { label: 'This month', value: 'month' }, { label: 'This quarter', value: 'quarter' }, { label: 'This year', value: 'year' },
]
const range = computed(() => {
  const now = new Date()
  const map = {
    month: [startOfMonth(now), endOfMonth(now)],
    quarter: [startOfQuarter(now), endOfQuarter(now)],
    year: [startOfYear(now), endOfYear(now)],
  } as const
  const [s, e] = map[period.value]
  return { start: format(s, 'yyyy-MM-dd'), end: format(e, 'yyyy-MM-dd') }
})

const query = computed(() => ({ client_id: props.clientId, period_start: range.value.start, period_end: range.value.end }))
const { data: lb, refresh: refreshLb } = useFetch<{ rows: Row[] }>('/api/crm/targets/leaderboard', {
  query, watch: [query], default: () => ({ rows: [] }),
})
const { data: targetsData, refresh: refreshTargets } = useFetch<{ items: Target[] }>('/api/crm/targets', {
  query, watch: [query], default: () => ({ items: [] }),
})

function barColor(pct: number) {
  if (pct >= 100) return 'bg-success'
  if (pct >= 70) return 'bg-warning'
  return 'bg-primary'
}
function fmtVal(r: { target_type: string, target_value?: number, actual?: number }, key: 'target_value' | 'actual') {
  const v = Number(r[key] ?? 0)
  return r.target_type === 'count' ? `${v}` : money.format(v)
}

// ── Set target modal ─────────────────────────────────────────────────────────
const setOpen = ref(false)
const { data: usersData } = useFetch<{ suggestions: { id: string, name: string }[] }>('/api/users/search', {
  query: { q: '' }, default: () => ({ suggestions: [] }),
})
const userOptions = computed(() => (usersData.value?.suggestions ?? []).map(u => ({ label: u.name, value: u.id })))
const form = reactive({ user_id: '', target_type: 'revenue' as 'revenue' | 'count', target_value: 0 })
const saving = ref(false)
async function saveTarget() {
  if (!form.user_id || form.target_value <= 0) return
  saving.value = true
  try {
    await $fetch('/api/crm/targets', {
      method: 'POST',
      body: { client_id: props.clientId, user_id: form.user_id, period_start: range.value.start, period_end: range.value.end, target_type: form.target_type, target_value: form.target_value },
    })
    await Promise.all([refreshLb(), refreshTargets()])
    toast.add({ title: 'Target set', color: 'success' })
    setOpen.value = false
    form.user_id = ''; form.target_value = 0
  } catch (e: any) {
    toast.add({ title: 'Could not set target', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { saving.value = false }
}
async function removeTarget(t: Target) {
  try { await $fetch(`/api/crm/targets/${t.id}`, { method: 'DELETE', query: { client_id: props.clientId } }); await Promise.all([refreshLb(), refreshTargets()]) }
  catch (e: any) { toast.add({ title: 'Could not delete', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between gap-2">
        <span class="text-sm font-medium">Leaderboard &amp; targets</span>
        <div class="flex items-center gap-2">
          <USelect v-model="period" :items="periodOptions" value-key="value" size="xs" class="w-36" />
          <UButton size="xs" icon="i-lucide-target" @click="setOpen = true">Set target</UButton>
        </div>
      </div>
    </template>

    <div v-if="!lb?.rows?.length" class="py-6 text-center text-sm text-muted">
      No targets for this period. Set one to start tracking attainment.
    </div>
    <ol v-else class="space-y-2.5">
      <li v-for="(r, i) in lb.rows" :key="r.user_id + r.target_type" class="flex items-center gap-3">
        <span class="w-5 text-sm font-semibold text-muted tabular-nums">{{ i + 1 }}</span>
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-2 mb-1">
            <span class="text-sm font-medium truncate">
              {{ r.user_name || 'Unknown rep' }}
              <UBadge size="sm" variant="soft" color="neutral" class="ml-1">{{ r.target_type }}</UBadge>
            </span>
            <span class="text-sm tabular-nums shrink-0">
              {{ fmtVal(r, 'actual') }} <span class="text-muted">/ {{ fmtVal(r, 'target_value') }}</span>
              <span class="ml-2 font-semibold">{{ r.attainment_pct }}%</span>
            </span>
          </div>
          <div class="h-1.5 rounded-full bg-elevated overflow-hidden">
            <div class="h-full rounded-full transition-all" :class="barColor(r.attainment_pct)" :style="{ width: Math.min(100, r.attainment_pct) + '%' }" />
          </div>
        </div>
      </li>
    </ol>

    <UModal v-model:open="setOpen">
      <template #content>
        <div class="p-4 space-y-4">
          <div>
            <h3 class="text-sm font-semibold">Set sales target</h3>
            <p class="text-xs text-muted mt-0.5">For {{ range.start }} → {{ range.end }}.</p>
          </div>
          <UFormField label="Rep">
            <USelectMenu v-model="form.user_id" :items="userOptions" value-key="value" placeholder="Choose a rep" searchable />
          </UFormField>
          <div class="grid grid-cols-2 gap-3">
            <UFormField label="Type">
              <USelect v-model="form.target_type" :items="[{ label: 'Revenue', value: 'revenue' }, { label: 'Deal count', value: 'count' }]" value-key="value" />
            </UFormField>
            <UFormField label="Target">
              <UInput v-model.number="form.target_value" type="number" :placeholder="form.target_type === 'count' ? '10' : '50000'" />
            </UFormField>
          </div>

          <div v-if="targetsData?.items?.length" class="border-t border-default pt-3 space-y-1">
            <p class="text-xs text-muted">Existing targets this period</p>
            <div v-for="t in targetsData.items" :key="t.id" class="flex items-center justify-between gap-2 text-sm">
              <span class="truncate">{{ t.user_name || 'Unknown' }} · {{ t.target_type }} · {{ fmtVal(t, 'target_value') }}</span>
              <UButton icon="i-lucide-trash-2" variant="ghost" color="error" size="xs" @click="removeTarget(t)" />
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="setOpen = false">Cancel</UButton>
            <UButton color="primary" :loading="saving" :disabled="!form.user_id || form.target_value <= 0" @click="saveTarget">Save</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </UCard>
</template>
