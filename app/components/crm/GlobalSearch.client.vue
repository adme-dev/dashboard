<script setup lang="ts">
// F8 — global CRM command-palette search. Works on both the agency surface
// (default base /api/crm) and the portal (provide 'crmApiBase'). Searches across
// people, companies, opportunities, activities and tasks server-side; selecting a
// result emits it so the page can route to the matching tab.
import { refDebounced } from '@vueuse/core'
import type { CrmSearchResult, CrmSearchTargetType } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ select: [CrmSearchResult] }>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'

const open = ref(false)
const term = ref('')
const debounced = refDebounced(term, 200)
const results = ref<CrmSearchResult[]>([])
const loading = ref(false)

const TYPE_META: Record<CrmSearchTargetType, { label: string, icon: string }> = {
  person: { label: 'People', icon: 'i-lucide-user' },
  company: { label: 'Companies', icon: 'i-lucide-building-2' },
  opportunity: { label: 'Opportunities', icon: 'i-lucide-trending-up' },
  activity: { label: 'Activity', icon: 'i-lucide-activity' },
  task: { label: 'Tasks', icon: 'i-lucide-check-square' },
}
const TYPE_ORDER: CrmSearchTargetType[] = ['person', 'company', 'opportunity', 'activity', 'task']

watch(debounced, async (q) => {
  const trimmed = q.trim()
  if (!trimmed || !props.clientId) { results.value = []; return }
  loading.value = true
  try {
    const query: Record<string, string> = { q: trimmed }
    if (isAgency) query.client_id = props.clientId
    const res = await $fetch<{ results: CrmSearchResult[] }>(`${base}/search`, { query })
    results.value = res.results
  } catch {
    results.value = []
  } finally {
    loading.value = false
  }
})

// One UCommandPalette group per entity type that has hits. ignoreFilter keeps the
// server's ranking/matching intact (no client-side re-filter).
const groups = computed(() => {
  const byType = new Map<CrmSearchTargetType, CrmSearchResult[]>()
  for (const r of results.value) {
    if (!byType.has(r.type)) byType.set(r.type, [])
    byType.get(r.type)!.push(r)
  }
  return TYPE_ORDER.filter(t => byType.has(t)).map(t => ({
    id: t,
    label: TYPE_META[t].label,
    ignoreFilter: true,
    items: byType.get(t)!.map(r => ({
      label: r.title,
      suffix: r.subtitle || undefined,
      icon: TYPE_META[t].icon,
      onSelect: () => choose(r),
    })),
  }))
})

function choose(r: CrmSearchResult) {
  emit('select', r)
  open.value = false
  term.value = ''
  results.value = []
}

// ⌘K / Ctrl-K opens the palette.
function onKey(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    open.value = true
  }
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div>
    <UButton
      color="neutral"
      variant="outline"
      icon="i-lucide-search"
      label="Search CRM"
      @click="open = true"
    >
      <template #trailing>
        <UKbd value="meta" />
        <UKbd value="K" />
      </template>
    </UButton>

    <UModal v-model:open="open" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <UCommandPalette
          v-model:search-term="term"
          :groups="groups"
          :loading="loading"
          placeholder="Search people, companies, deals, activity…"
          class="h-96"
        >
          <template #empty>
            <div class="py-8 text-center text-sm text-muted">
              {{ term.trim() ? 'No matches.' : 'Type to search this client’s CRM.' }}
            </div>
          </template>
        </UCommandPalette>
      </template>
    </UModal>
  </div>
</template>
