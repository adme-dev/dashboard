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
const notesState = ref<'idle' | 'saving' | 'saved'>('idle')
let savedTimer: ReturnType<typeof setTimeout> | null = null

async function load() {
  if (!props.leadId) return
  loading.value = true
  try {
    const r = await $fetch<{ lead: Lead, deliveries: LeadDelivery[] }>(`/api/leads/${props.leadId}`)
    lead.value = r.lead
    deliveries.value = r.deliveries
  } finally { loading.value = false }
}

watch(() => props.leadId, (id) => {
  if (id && open.value) load()
})
watch(open, (v) => {
  if (v && props.leadId) load()
})

const STATUS_OPTIONS: { value: LeadStatus, label: string, icon: string, color: string }[] = [
  { value: 'new', label: 'New', icon: 'i-lucide-circle', color: 'text-blue-500' },
  { value: 'contacted', label: 'Contacted', icon: 'i-lucide-phone', color: 'text-primary-500' },
  { value: 'qualified', label: 'Qualified', icon: 'i-lucide-check-circle-2', color: 'text-green-500' },
  { value: 'won', label: 'Won', icon: 'i-lucide-trophy', color: 'text-green-600' },
  { value: 'lost', label: 'Lost', icon: 'i-lucide-x-circle', color: 'text-neutral-500' },
  { value: 'spam_suspected', label: 'Spam?', icon: 'i-lucide-shield-alert', color: 'text-amber-500' }
]

async function changeStatus(s: LeadStatus) {
  if (!lead.value) return
  await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { status: s } })
  await load()
  emit('changed')
  toast.add({ title: 'Status updated', color: 'success' })
}

const statusMenuItems = computed(() =>
  STATUS_OPTIONS.map(s => ({
    label: s.label,
    icon: s.icon,
    onSelect: () => changeStatus(s.value)
  }))
)

async function saveNotes(text: string) {
  if (!lead.value) return
  notesState.value = 'saving'
  try {
    await $fetch(`/api/leads/${lead.value.id}`, { method: 'PATCH', body: { notes: text } })
    notesState.value = 'saved'
    if (savedTimer) clearTimeout(savedTimer)
    savedTimer = setTimeout(() => {
      notesState.value = 'idle'
    }, 2000)
  } catch (e: unknown) {
    notesState.value = 'idle'
    toast.add({ title: 'Failed to save notes', description: e instanceof Error ? e.message : '', color: 'error' })
  }
}

async function retryAll() {
  if (!lead.value) return
  const r = await $fetch<{ retried: number }>(`/api/leads/${lead.value.id}/retry`, { method: 'POST' })
  toast.add({ title: `Retrying ${r.retried} delivery(s)`, color: 'success' })
  await load()
}

// Pretty-print field keys: snake_case → Sentence case
// e.g. full_name → "Full name", phone_number → "Phone number"
function prettyKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/^./, c => c.toUpperCase())
}

function prettyValue(val: unknown): string {
  if (val == null || val === '') return '—'
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  if (Array.isArray(val)) return val.join(', ')
  try {
    return JSON.stringify(val)
  } catch {
    return String(val)
  }
}

const fieldRows = computed(() => Object.entries(lead.value?.field_data ?? {}))
const attrRows = computed(() => Object.entries(lead.value?.attribution ?? {}))

onBeforeUnmount(() => {
  if (savedTimer) clearTimeout(savedTimer)
})
</script>

<template>
  <USlideover v-model:open="open">
    <template #content>
      <div v-if="loading" class="p-6 text-sm text-muted">
        Loading…
      </div>
      <div v-else-if="lead" class="flex flex-col h-full">
        <header class="px-6 py-4 border-b border-default">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-2 min-w-0">
              <LeadsSourceIcon :source="lead.source" />
              <h2 class="text-base font-semibold truncate">
                {{ lead.form_name || lead.form_id || 'Lead' }}
              </h2>
            </div>
            <div class="flex items-center gap-1">
              <UDropdownMenu :items="statusMenuItems" :content="{ align: 'end' }">
                <button
                  class="flex items-center gap-1 hover:opacity-80 transition-opacity"
                  type="button"
                  aria-label="Change lead status"
                >
                  <LeadsStatusBadge :status="lead.status" />
                  <UIcon name="i-lucide-chevron-down" class="size-3 text-muted" />
                </button>
              </UDropdownMenu>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                size="sm"
                aria-label="Close lead details"
                @click="open = false"
              />
            </div>
          </div>
          <p class="text-xs text-muted mt-1">
            {{ format(new Date(lead.submitted_at), 'PPpp') }} · {{ lead.source }} · {{ lead.id.slice(0, 8) }}
          </p>
        </header>

        <div class="flex-1 overflow-auto p-6 space-y-6">
          <section>
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">
              Field data
            </h3>
            <dl v-if="fieldRows.length" class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <template v-for="[k, v] in fieldRows" :key="k">
                <dt class="text-muted col-span-1">
                  {{ prettyKey(k) }}
                </dt>
                <dd class="break-all col-span-2">
                  {{ prettyValue(v) }}
                </dd>
              </template>
            </dl>
            <p v-else class="text-muted text-sm">
              No field data.
            </p>
          </section>

          <section v-if="attrRows.length">
            <h3 class="text-xs font-semibold uppercase text-muted mb-2">
              Attribution
            </h3>
            <dl class="grid grid-cols-3 gap-x-3 gap-y-2 text-sm">
              <template v-for="[k, v] in attrRows" :key="k">
                <dt class="text-muted col-span-1">
                  {{ prettyKey(k) }}
                </dt>
                <dd class="break-all col-span-2">
                  {{ prettyValue(v) }}
                </dd>
              </template>
            </dl>
          </section>

          <section>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold uppercase text-muted">
                Notes
              </h3>
              <span class="flex items-center gap-1 text-xs">
                <template v-if="notesState === 'saving'">
                  <UIcon name="i-lucide-loader-2" class="size-3 animate-spin text-muted" />
                  <span class="text-muted">Saving…</span>
                </template>
                <template v-else-if="notesState === 'saved'">
                  <UIcon name="i-lucide-check" class="size-3 text-green-500" />
                  <span class="text-green-500">Saved</span>
                </template>
              </span>
            </div>
            <UTextarea
              :model-value="lead.notes ?? ''"
              :rows="5"
              class="w-full"
              :ui="{ base: 'ring-1 ring-default rounded' }"
              placeholder="Add a note (saved automatically when you click away)…"
              @blur="(e: any) => saveNotes(e.target.value)"
            />
          </section>

          <section>
            <div class="flex items-center justify-between mb-2">
              <h3 class="text-xs font-semibold uppercase text-muted">
                Delivery history
              </h3>
              <UButton
                size="xs"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                @click="retryAll"
              >
                Retry failed
              </UButton>
            </div>
            <LeadsDeliveryHistory :deliveries="deliveries" @retried="load" />
          </section>
        </div>
      </div>
    </template>
  </USlideover>
</template>
