<script setup lang="ts">
// Kanban for a pipeline-enabled config object. Stages are this client's crm_stages whose code
// is namespaced `${objectKey}:` (seeded by the engine). Native HTML5 DnD (matches Slice 2).
import type { CrmStage } from '~/types/crm'
const props = defineProps<{ clientId: string, objectKey: string }>()
const clientId = toRef(props, 'clientId')
const objectKey = toRef(props, 'objectKey')
const base = inject<string>('crmApiBase', '/api/crm')
const isPortal = base.includes('client-portal')
const { data, move, refresh } = useCrmRecords(clientId, objectKey)

const stageQuery = computed(() => isPortal ? {} : { client_id: clientId.value })
const { data: stagesData } = useFetch<{ items?: CrmStage[] } | CrmStage[]>(`${base}/stages`, { query: stageQuery, default: () => ({ items: [] }) })
const stages = computed<CrmStage[]>(() => {
  const all = Array.isArray(stagesData.value) ? stagesData.value : (stagesData.value?.items ?? [])
  return all.filter(s => s.code.startsWith(`${objectKey.value}:`)).sort((a, b) => a.sort_order - b.sort_order)
})
const recordsByStage = computed(() => {
  const map: Record<string, any[]> = {}
  for (const s of stages.value) map[s.id] = []
  for (const r of data.value?.items ?? []) { if (r.stage_id && map[r.stage_id]) map[r.stage_id].push(r) }
  return map
})
const titleField = computed(() => (data.value?.fields ?? []).find(f => f.is_title) ?? (data.value?.fields ?? [])[0])
function titleOf(r: any) {
  return titleField.value ? String(r.data?.[titleField.value.key] ?? '—') : String(r.id).slice(0, 8)
}
async function onDrop(e: DragEvent, stageId: string) {
  const id = e.dataTransfer?.getData('id')
  if (id) { await move(id, stageId); await refresh() }
}
</script>

<template>
  <div class="flex gap-3 overflow-x-auto pb-3">
    <div
      v-for="s in stages"
      :key="s.id"
      class="min-w-64 flex-1 rounded-lg border border-default bg-elevated/20"
      @dragover.prevent
      @drop="(e) => onDrop(e, s.id)"
    >
      <div class="px-3 py-2 border-b border-default flex items-center gap-2">
        <span class="size-2 rounded-full shrink-0" :style="{ background: s.color }" />
        <span class="font-medium text-sm truncate">{{ s.name }}</span>
        <span class="text-xs text-muted ml-auto">{{ recordsByStage[s.id]?.length || 0 }}</span>
      </div>
      <div class="p-2 space-y-2 min-h-24">
        <div
          v-for="r in recordsByStage[s.id]"
          :key="r.id"
          draggable="true"
          class="rounded-md border border-default bg-default p-2 text-sm cursor-grab active:cursor-grabbing"
          @dragstart="(e) => e.dataTransfer?.setData('id', r.id)"
        >
          {{ titleOf(r) }}
        </div>
      </div>
    </div>
    <p v-if="!stages.length" class="text-sm text-muted p-4">No pipeline stages for this object.</p>
  </div>
</template>
