<script setup lang="ts">
// Native HTML5 drag-and-drop kanban (no external dep). Columns = stages, cards = opportunities.
import type { CrmOpportunity, CrmStage } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const toast = useToast()
const { stages } = useCrmStages(clientId)
const { data, pending, refresh, filters, move, create, update } = useCrmOpportunities(clientId)
const { summary, refresh: refreshSummary } = useCrmPipeline(clientId)

// F9 — advanced filters + export on the pipeline (reuses the F9 backend).
const exportBase = inject<string>('crmApiBase', '/api/crm')
function exportUrl(format: 'csv' | 'xlsx') {
  const p = new URLSearchParams({ entity: 'opportunities', format })
  if (exportBase === '/api/crm') p.set('client_id', clientId.value)
  if (filters.value.length) p.set('filters', JSON.stringify(filters.value))
  return `${exportBase}/export?${p.toString()}`
}

// Local per-stage buckets derived from the fetched list.
const buckets = computed<Record<string, CrmOpportunity[]>>(() => {
  const map: Record<string, CrmOpportunity[]> = {}
  for (const s of stages.value) map[s.id] = []
  for (const o of data.value?.items ?? []) (map[o.stage_id] ??= []).push(o)
  return map
})

const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)

function onDragStart(o: CrmOpportunity) { draggingId.value = o.id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }

async function onDrop(stage: CrmStage) {
  const id = draggingId.value
  dragOverStage.value = null
  draggingId.value = null
  if (!id) return
  const current = (data.value?.items ?? []).find(o => o.id === id)
  if (!current || current.stage_id === stage.id) return
  try {
    await move(id, stage.id)
    await Promise.all([refresh(), refreshSummary()])
  } catch (e: any) {
    toast.add({ title: 'Move failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
    await refresh()
  }
}

const slideoverOpen = ref(false)
const editing = ref<CrmOpportunity | null>(null)
function openNew() { editing.value = null; slideoverOpen.value = true }
function openEdit(o: CrmOpportunity) { editing.value = o; slideoverOpen.value = true }

async function onSave(body: Record<string, unknown>) {
  try {
    if (editing.value) await update(editing.value.id, body)
    else await create(body)
    slideoverOpen.value = false
    await refreshSummary()
    toast.add({ title: editing.value ? 'Opportunity updated' : 'Opportunity created', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Save failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  }
}

function money(n: number) {
  return (n ?? 0).toLocaleString(undefined, { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 })
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <div class="flex gap-6 text-sm">
        <div><span class="text-muted">Open value</span> <span class="font-semibold ml-1">{{ money(summary?.openTotal ?? 0) }}</span></div>
        <div><span class="text-muted">Weighted</span> <span class="font-semibold ml-1">{{ money(summary?.weightedTotal ?? 0) }}</span></div>
      </div>
      <div class="flex items-center gap-2">
        <CrmFilterBuilder v-model="filters" entity="opportunities" />
        <UDropdownMenu :items="[[
          { label: 'Export CSV', icon: 'i-lucide-file-text', to: exportUrl('csv'), target: '_blank', external: true },
          { label: 'Export Excel', icon: 'i-lucide-sheet', to: exportUrl('xlsx'), target: '_blank', external: true },
        ]]">
          <UButton icon="i-lucide-download" variant="ghost" color="neutral" size="sm" trailing-icon="i-lucide-chevron-down">Export</UButton>
        </UDropdownMenu>
        <UButton icon="i-lucide-plus" @click="openNew">Add opportunity</UButton>
      </div>
    </div>

    <div v-if="pending" class="text-sm text-muted py-8 text-center">Loading pipeline…</div>
    <div v-else class="flex gap-3 overflow-x-auto pb-2">
      <div
        v-for="stage in stages"
        :key="stage.id"
        class="flex flex-col w-72 shrink-0"
        @dragover.prevent="dragOverStage = stage.id"
        @drop.prevent="onDrop(stage)"
      >
        <div class="flex items-center gap-2 px-1 pb-2">
          <span class="size-2.5 rounded-full" :style="{ backgroundColor: stage.color }" />
          <span class="font-medium text-sm">{{ stage.name }}</span>
          <UBadge variant="soft" color="neutral" size="xs">{{ (buckets[stage.id] ?? []).length }}</UBadge>
          <span class="ml-auto text-xs text-muted">{{ money(summary?.byStage?.[stage.id]?.total ?? 0) }}</span>
        </div>
        <div
          class="flex flex-col gap-2 min-h-[160px] rounded-lg border border-dashed p-2 transition-colors"
          :class="dragOverStage === stage.id ? 'border-primary bg-primary/5' : 'border-default bg-elevated/30'"
        >
          <div
            v-for="o in buckets[stage.id]"
            :key="o.id"
            draggable="true"
            class="rounded-md border border-default bg-default p-2.5 cursor-grab active:cursor-grabbing hover:border-primary/50 transition-colors"
            :class="{ 'opacity-50': draggingId === o.id }"
            @dragstart="onDragStart(o)"
            @dragend="onDragEnd"
            @click="openEdit(o)"
          >
            <p class="font-medium text-sm truncate">{{ o.name }}</p>
            <p class="text-xs text-muted truncate">{{ o.company_name || o.person_name || '—' }}</p>
            <p class="text-xs font-medium mt-1">{{ money(o.amount) }}</p>
          </div>
          <p v-if="!(buckets[stage.id] ?? []).length" class="text-xs text-muted text-center py-4">Drop here</p>
        </div>
      </div>
    </div>

    <CrmOpportunitySlideover
      v-model:open="slideoverOpen"
      :client-id="clientId"
      :record="editing"
      :stages="stages"
      @save="onSave"
    />
  </div>
</template>
