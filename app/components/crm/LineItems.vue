<script setup lang="ts">
// F14 — opportunity line-items editor + quote link. Editing a line recomputes the
// opportunity value server-side (deriveOppValue rule); we emit 'changed' so the
// parent can refresh the opp. Quote link is agency-only (quotes are an agency feature).
const props = defineProps<{ clientId: string, opportunity: Record<string, any> }>()
const emit = defineEmits<{ changed: [] }>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const toast = useToast()

interface Row { id: string, description: string, quantity: number, unit_price: number, line_total: number, position: number }

const query = computed(() => ({ client_id: props.clientId, opportunity_id: props.opportunity.id }))
const { data, refresh } = useFetch<{ items: Row[] }>(`${base}/line-items`, {
  query, watch: [query], default: () => ({ items: [] }),
})

// pg returns NUMERIC as strings — coerce for display + math.
const rows = computed(() => (data.value?.items ?? []).map(r => ({
  ...r, quantity: Number(r.quantity), unit_price: Number(r.unit_price), line_total: Number(r.line_total),
})))
const total = computed(() => rows.value.reduce((s, r) => s + r.quantity * r.unit_price, 0))
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const busy = ref(false)
async function addRow() {
  busy.value = true
  try {
    await $fetch(`${base}/line-items`, {
      method: 'POST',
      body: { client_id: props.clientId, opportunity_id: props.opportunity.id, description: 'New item', quantity: 1, unit_price: 0, position: rows.value.length },
    })
    await refresh(); emit('changed')
  } finally { busy.value = false }
}
async function saveRow(r: Row, patch: Record<string, unknown>) {
  try {
    await $fetch(`${base}/line-items/${r.id}`, { method: 'PATCH', body: { client_id: props.clientId, ...patch } })
    await refresh(); emit('changed')
  } catch (e: any) { toast.add({ title: 'Could not save line', description: e?.data?.statusMessage || e?.message, color: 'error' }) }
}
async function removeRow(r: Row) {
  await $fetch(`${base}/line-items/${r.id}`, { method: 'DELETE', query: { client_id: props.clientId } })
  await refresh(); emit('changed')
}

// ── Quote link (agency only) ──────────────────────────────────────────────────
const quoteId = computed(() => props.opportunity.quote_id as string | null)
const { data: quoteData, refresh: refreshQuote } = useFetch<{ quote: any }>(`${base}/quotes`, {
  query: computed(() => ({ client_id: props.clientId, quote_id: quoteId.value || '' })),
  watch: [quoteId], immediate: isAgency && !!quoteId.value, default: () => ({ quote: null }),
})
const linkOpen = ref(false)
const { data: quoteList, refresh: refreshList } = useFetch<{ items: any[] }>(`${base}/quotes`, {
  query: computed(() => ({ client_id: props.clientId })),
  immediate: false, default: () => ({ items: [] }),
})
const quotePickItems = computed(() => (quoteList.value?.items ?? []).map(q => ({ label: `${q.quote_number} · ${q.title || 'Untitled'}`, value: q.id })))
async function openLink() { await refreshList() }
async function linkQuote(id: string) {
  await $fetch(`${base}/opportunities/${props.opportunity.id}`, { method: 'PATCH', body: { client_id: props.clientId, quote_id: id } })
  emit('changed'); linkOpen.value = false; await refreshQuote()
}
async function unlinkQuote() {
  await $fetch(`${base}/opportunities/${props.opportunity.id}`, { method: 'PATCH', body: { client_id: props.clientId, quote_id: null } })
  emit('changed')
}
const STATUS_COLOR: Record<string, string> = { draft: 'neutral', sent: 'info', accepted: 'success', rejected: 'error', expired: 'warning' }
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted">Line items</h3>
      <UButton size="xs" icon="i-lucide-plus" variant="ghost" color="neutral" :loading="busy" @click="addRow">Add line</UButton>
    </div>

    <div v-if="!rows.length" class="text-sm text-muted py-3 text-center border border-dashed border-default rounded-lg">
      No line items — the opportunity value is entered manually.
    </div>
    <div v-else class="space-y-1.5">
      <div v-for="r in rows" :key="r.id" class="flex items-center gap-2">
        <UInput
          :model-value="r.description" size="sm" class="flex-1"
          @change="(e: any) => saveRow(r, { description: typeof e === 'string' ? e : e?.target?.value })"
        />
        <UInput
          :model-value="r.quantity" type="number" size="sm" class="w-20" :ui="{ base: 'text-right' }"
          @change="(e: any) => saveRow(r, { quantity: Number(typeof e === 'string' ? e : e?.target?.value) })"
        />
        <UInput
          :model-value="r.unit_price" type="number" size="sm" class="w-24" :ui="{ base: 'text-right' }"
          @change="(e: any) => saveRow(r, { unit_price: Number(typeof e === 'string' ? e : e?.target?.value) })"
        />
        <span class="w-24 text-right text-sm tabular-nums">{{ fmt(r.quantity * r.unit_price) }}</span>
        <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="removeRow(r)" />
      </div>
      <div class="flex items-center justify-end gap-2 pt-1 border-t border-default">
        <span class="text-sm font-medium">Total</span>
        <span class="w-24 text-right text-sm font-semibold tabular-nums">{{ fmt(total) }}</span>
        <span class="w-6" />
      </div>
    </div>

    <!-- Quote link (agency only) -->
    <div v-if="isAgency" class="flex items-center gap-2 pt-1">
      <span class="text-xs text-muted">Quote:</span>
      <template v-if="quoteId && quoteData?.quote">
        <ULink :to="`/agency/quotes/${quoteId}`" class="text-sm font-medium hover:underline">{{ quoteData.quote.quote_number }}</ULink>
        <UBadge size="sm" variant="subtle" :color="(STATUS_COLOR[quoteData.quote.status] || 'neutral') as any">{{ quoteData.quote.status }}</UBadge>
        <UButton icon="i-lucide-unlink" size="xs" variant="ghost" color="neutral" @click="unlinkQuote">Unlink</UButton>
      </template>
      <template v-else>
        <UPopover v-model:open="linkOpen">
          <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-link" @click="openLink">Link a quote</UButton>
          <template #content>
            <div class="w-72 p-3 space-y-2">
              <USelectMenu :items="quotePickItems" value-key="value" placeholder="Pick a quote" searchable @update:model-value="(v: string) => linkQuote(v)" />
              <UButton :to="`/agency/quotes`" size="xs" variant="ghost" color="neutral" icon="i-lucide-external-link" block>Create a quote in Pricing</UButton>
            </div>
          </template>
        </UPopover>
      </template>
    </div>
  </div>
</template>
