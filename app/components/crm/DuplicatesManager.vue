<script setup lang="ts">
// Admin data-quality tool: surface likely-duplicate contacts and merge them.
// Agency-only (dedupe endpoints live under /api/crm; merge is admin-gated server-side).
interface Side { id: string, name: string, email: string | null, phone: string | null }
interface Pair { score: number, a: Side, b: Side }

const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const toast = useToast()

const entityType = ref<'person' | 'company'>('person')
const typeItems = [
  { label: 'People', value: 'person' },
  { label: 'Companies', value: 'company' },
]
const query = computed(() => ({ client_id: clientId.value, entity_type: entityType.value }))
const { data, pending, refresh } = useFetch<{ items: Pair[] }>('/api/crm/dedupe/suggestions', {
  query, watch: [query], default: () => ({ items: [] }),
})
const pairs = computed(() => data.value?.items ?? [])

const mergeOpen = ref(false)
const activePair = ref<Pair | null>(null)
const winnerId = ref<string | null>(null)
const merging = ref(false)
const winnerOptions = computed(() => activePair.value
  ? [
      { label: `Keep “${activePair.value.a.name}”`, value: activePair.value.a.id },
      { label: `Keep “${activePair.value.b.name}”`, value: activePair.value.b.id },
    ]
  : [])

function openMerge(pair: Pair) {
  activePair.value = pair
  winnerId.value = pair.a.id
  mergeOpen.value = true
}
async function doMerge() {
  if (!activePair.value || !winnerId.value) return
  const loserId = winnerId.value === activePair.value.a.id ? activePair.value.b.id : activePair.value.a.id
  merging.value = true
  try {
    await $fetch('/api/crm/dedupe/merge', {
      method: 'POST',
      body: { client_id: clientId.value, entity_type: entityType.value, winner_id: winnerId.value, loser_id: loserId },
    })
    toast.add({ title: 'Records merged', color: 'success' })
    mergeOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Merge failed', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally {
    merging.value = false
  }
}
function scoreColor(s: number) { return s >= 0.95 ? 'error' : s >= 0.8 ? 'warning' : 'neutral' }
</script>

<template>
  <div class="space-y-4 max-w-3xl">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3 class="text-sm font-semibold">Duplicate suggestions</h3>
        <p class="text-xs text-muted mt-0.5">Likely matches by email, phone and name. Merging moves all activity to the survivor and deletes the other.</p>
      </div>
      <USelectMenu v-model="entityType" :items="typeItems" value-key="value" size="sm" class="w-40" />
    </div>

    <div v-if="pending" class="text-sm text-muted">Scanning…</div>
    <div v-else-if="!pairs.length" class="border border-dashed border-default rounded-xl p-10 text-center text-sm text-muted">
      <UIcon name="i-lucide-copy-check" class="size-7 mx-auto mb-2 opacity-60" />
      No likely duplicates found.
    </div>
    <ul v-else class="space-y-2">
      <li v-for="(p, i) in pairs" :key="i" class="rounded-xl border border-default p-3">
        <div class="flex items-center justify-between gap-3">
          <UBadge :color="(scoreColor(p.score) as any)" variant="subtle" size="sm">{{ Math.round(p.score * 100) }}% match</UBadge>
          <UButton size="xs" icon="i-lucide-merge" @click="openMerge(p)">Merge…</UButton>
        </div>
        <div class="grid grid-cols-2 gap-3 mt-2 text-sm">
          <div v-for="side in [p.a, p.b]" :key="side.id" class="rounded-lg bg-elevated/40 px-3 py-2 min-w-0">
            <p class="font-medium truncate">{{ side.name || '(no name)' }}</p>
            <p class="text-xs text-muted truncate">{{ side.email || '—' }}</p>
            <p class="text-xs text-muted truncate">{{ side.phone || '—' }}</p>
          </div>
        </div>
      </li>
    </ul>

    <UModal v-model:open="mergeOpen" title="Merge duplicates">
      <template #content>
        <div class="p-4 space-y-4">
          <h3 class="text-sm font-semibold">Merge duplicates</h3>
          <p class="text-xs text-muted">
            Choose which record to keep. All opportunities, activities, tasks and history from the other will move to it, and the other record will be permanently deleted.
          </p>
          <UFormField label="Survivor">
            <USelectMenu v-model="winnerId" :items="winnerOptions" value-key="value" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="mergeOpen = false">Cancel</UButton>
            <UButton color="error" :loading="merging" icon="i-lucide-merge" @click="doMerge">Merge &amp; delete other</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
