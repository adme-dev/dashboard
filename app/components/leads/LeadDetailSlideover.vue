<script setup lang="ts">
import { format } from 'date-fns'
import type { Lead, LeadDelivery, LeadStatus } from '~/types'

const props = defineProps<{ leadId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ (e: 'changed'): void }>()

const toast = useToast()
const lead = ref<Lead | null>(null)
const deliveries = ref<LeadDelivery[]>([])
const loading = ref(false)

async function load() {
  if (!props.leadId) return
  loading.value = true
  try {
    const r = await $fetch<{ lead: Lead; deliveries: LeadDelivery[] }>(`/api/leads/${props.leadId}`)
    lead.value = r.lead
    deliveries.value = r.deliveries
  } finally { loading.value = false }
}

watch(() => props.leadId, (id) => { if (id && open.value) load() })
watch(open, (v) => { if (v && props.leadId) load() })

const STATUS_OPTIONS: { value: LeadStatus; label: string }[] = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'spam_suspected', label: 'Spam?' },
]

async function changeStatus(s: LeadStatus) {
  if (!lead.value) return
  await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { status: s } })
  await load()
  emit('changed')
  toast.add({ title: 'Status updated', color: 'success' })
}

async function saveNotes(text: string) {
  if (!lead.value) return
  await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { notes: text } })
  toast.add({ title: 'Notes saved', color: 'success' })
}

async function retryAll() {
  if (!lead.value) return
  const r = await $fetch<{ retried: number }>(`/api/leads/${lead.value.id}/retry`, { method: 'POST' })
  toast.add({ title: `Retrying ${r.retried} delivery(s)`, color: 'success' })
  await load()
}

const fieldRows = computed(() => Object.entries(lead.value?.field_data ?? {}))
const attrRows = computed(() => Object.entries(lead.value?.attribution ?? {}))
</script>

<template>
  <USlideover v-model:open="open">
    <template #content>
      <div v-if="loading" class="p-6 text-sm text-muted">Loading…</div>
      <div v-else-if="lead" class="flex flex-col h-full">
        <header class="px-6 py-4 border-b border-default">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <LeadsSourceIcon :source="lead.source" />
              <h2 class="text-base font-semibold">{{ lead.form_name || lead.form_id || 'Lead' }}</h2>
              <LeadsStatusBadge :status="lead.status" />
            </div>
            <UButton icon="i-lucide-x" variant="ghost" size="sm" @click="open = false" />
          </div>
          <p class="text-xs text-muted mt-1">
            {{ format(new Date(lead.submitted_at), 'PPpp') }} · {{ lead.source }} · {{ lead.id.slice(0, 8) }}
          </p>
        </header>

        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Field data</h3>
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <template v-for="[k, v] in fieldRows" :key="k">
                <dt class="text-muted">{{ k }}</dt>
                <dd class="break-all">{{ v }}</dd>
              </template>
              <p v-if="!fieldRows.length" class="col-span-2 text-muted text-sm">No field data.</p>
            </dl>
          </section>

          <section v-if="attrRows.length">
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Attribution</h3>
            <dl class="grid grid-cols-2 gap-2 text-sm">
              <template v-for="[k, v] in attrRows" :key="k">
                <dt class="text-muted">{{ k }}</dt>
                <dd class="break-all">{{ v }}</dd>
              </template>
            </dl>
          </section>

          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Status</h3>
            <USelectMenu
              :model-value="lead.status"
              :items="STATUS_OPTIONS"
              value-key="value"
              @update:model-value="changeStatus"
            />
          </section>

          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">Notes</h3>
            <UTextarea
              :model-value="lead.notes ?? ''"
              :rows="5"
              class="ring-1 ring-default rounded"
              placeholder="Add a note (saved on blur)…"
              @blur="(e: any) => saveNotes(e.target.value)"
            />
          </section>

          <section>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold uppercase text-muted">Delivery history</h3>
              <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" @click="retryAll">Retry failed</UButton>
            </div>
            <LeadsDeliveryHistory :deliveries="deliveries" @retried="load" />
          </section>
        </div>
      </div>
    </template>
  </USlideover>
</template>
