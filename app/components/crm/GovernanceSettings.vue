<script setup lang="ts">
// Admin-only CRM governance: record visibility + auto-assignment rules.
// Agency surface only (endpoints live under /api/crm); save actions enforce ADMIN.
const props = defineProps<{ clientId: string }>()
const clientId = toRef(props, 'clientId')
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

// ── staff pool (team_members via the mention search) ──────────────────────────
const usersData = ref<{ suggestions: { id: string, name: string }[] }>({ suggestions: [] })

async function refreshUsers() {
  usersData.value = await apiFetch<{ suggestions: { id: string, name: string }[] }>(
    '/api/users/search',
    { query: { q: '', limit: '20' } },
  )
}

refreshUsers()

const userOptions = computed(() => (usersData.value?.suggestions ?? []).map(u => ({ label: u.name, value: u.id })))
const nameOf = (id: string) => userOptions.value.find(o => o.value === id)?.label ?? id

// ── record visibility ─────────────────────────────────────────────────────────
const visQuery = computed(() => ({ client_id: clientId.value }))
const settings = ref<{ record_visibility: string }>({ record_visibility: 'team' })

async function refreshSettings() {
  settings.value = await apiFetch<{ record_visibility: string }>('/api/crm/settings', { query: visQuery.value })
}

watch(visQuery, () => {
  refreshSettings()
}, { immediate: true })

const visibility = ref('team')
watch(settings, s => { visibility.value = s?.record_visibility ?? 'team' }, { immediate: true })
const VIS_OPTIONS = [
  { label: 'Team — everyone sees all records', value: 'team' },
  { label: 'Owner — reps see only records they own or are assigned', value: 'owner' },
]
const savingVis = ref(false)
async function saveVisibility() {
  savingVis.value = true
  try {
    await apiFetch('/api/crm/settings', { method: 'PUT', body: { client_id: clientId.value, record_visibility: visibility.value } })
    await refreshSettings()
    toast.add({ title: 'Visibility updated', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not update visibility', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { savingVis.value = false }
}

// ── assignment rules (one per object type) ────────────────────────────────────
const rulesQuery = computed(() => ({ client_id: clientId.value }))
const rulesData = ref<{ items: any[] }>({ items: [] })

async function refreshRules() {
  rulesData.value = await apiFetch<{ items: any[] }>('/api/crm/assignment-rules', { query: rulesQuery.value })
}

watch(rulesQuery, () => {
  refreshRules()
}, { immediate: true })
const STRATEGIES = [
  { label: 'Round robin', value: 'round_robin' },
  { label: 'Load balanced', value: 'load_balanced' },
  { label: 'Priority (first available)', value: 'priority' },
  { label: 'Single owner', value: 'single' },
]
const OBJECT_TYPES = [
  { key: 'person', label: 'New people' },
  { key: 'opportunity', label: 'New opportunities' },
]
// Editable draft per object type, seeded from the saved rule.
const drafts = reactive<Record<string, { strategy: string, pool: string[], is_active: boolean }>>({
  person: { strategy: 'round_robin', pool: [], is_active: true },
  opportunity: { strategy: 'round_robin', pool: [], is_active: true },
})
watch(rulesData, (d) => {
  for (const ot of OBJECT_TYPES) {
    const r = (d?.items ?? []).find(x => x.object_type === ot.key)
    drafts[ot.key] = r
      ? { strategy: r.strategy, pool: Array.isArray(r.pool) ? r.pool : [], is_active: r.is_active }
      : { strategy: 'round_robin', pool: [], is_active: true }
  }
}, { immediate: true })

const savingRule = ref<string | null>(null)
async function saveRule(objectType: string) {
  savingRule.value = objectType
  try {
    await apiFetch('/api/crm/assignment-rules', {
      method: 'POST',
      body: { client_id: clientId.value, object_type: objectType, ...drafts[objectType] },
    })
    await refreshRules()
    toast.add({ title: 'Assignment rule saved', color: 'success' })
  } catch (e: any) {
    toast.add({ title: 'Could not save rule', description: e?.data?.statusMessage || e?.message, color: 'error' })
  } finally { savingRule.value = null }
}
</script>

<template>
  <div class="space-y-6 max-w-2xl">
    <!-- Record visibility -->
    <div class="rounded-xl border border-default p-4 space-y-3">
      <div>
        <h3 class="text-sm font-semibold">Record visibility</h3>
        <p class="text-xs text-muted mt-0.5">
          Controls which staff can see this client's CRM records. Managers &amp; admins always see everything.
        </p>
      </div>
      <div class="flex items-end gap-2">
        <UFormField label="Visibility" class="flex-1">
          <USelectMenu v-model="visibility" :items="VIS_OPTIONS" value-key="value" />
        </UFormField>
        <UButton :loading="savingVis" :disabled="visibility === (settings?.record_visibility ?? 'team')" @click="saveVisibility">Save</UButton>
      </div>
    </div>

    <!-- Auto-assignment -->
    <div class="rounded-xl border border-default p-4 space-y-4">
      <div>
        <h3 class="text-sm font-semibold">Auto-assignment</h3>
        <p class="text-xs text-muted mt-0.5">
          Distribute newly-created records (without an owner) across a pool of reps.
        </p>
      </div>
      <div v-for="ot in OBJECT_TYPES" :key="ot.key" class="space-y-2 rounded-lg bg-elevated/40 p-3">
        <p class="text-xs font-medium text-muted uppercase tracking-wide">{{ ot.label }}</p>
        <div class="grid grid-cols-2 gap-3">
          <UFormField label="Strategy">
            <USelectMenu v-model="drafts[ot.key].strategy" :items="STRATEGIES" value-key="value" />
          </UFormField>
          <UFormField label="Active">
            <USwitch v-model="drafts[ot.key].is_active" />
          </UFormField>
        </div>
        <UFormField label="Pool" help="Reps to assign from. Round-robin rotates; load-balanced picks the lightest.">
          <USelectMenu
            v-model="drafts[ot.key].pool"
            :items="userOptions"
            value-key="value"
            multiple
            searchable
            placeholder="Select reps"
          />
        </UFormField>
        <div v-if="drafts[ot.key].pool.length" class="flex flex-wrap gap-1">
          <UBadge v-for="uid in drafts[ot.key].pool" :key="uid" color="neutral" variant="soft" size="sm">{{ nameOf(uid) }}</UBadge>
        </div>
        <div class="flex justify-end">
          <UButton size="sm" :loading="savingRule === ot.key" @click="saveRule(ot.key)">Save rule</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
