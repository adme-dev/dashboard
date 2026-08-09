<script setup lang="ts">
// F8 — global CRM command-palette search. Works on both the agency surface
// (default base /api/crm) and the portal (provide 'crmApiBase'). Searches across
// people, companies, opportunities, activities and tasks server-side; selecting a
// result emits it so the page can route to the matching tab.
import { refDebounced } from '@vueuse/core'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CrmSearchResult, CrmSearchTargetType } from '~/types/crm'

const props = defineProps<{ clientId: string }>()
const emit = defineEmits<{ select: [CrmSearchResult] }>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const searchEndpoint = isAgency ? '/api/crm/search' : '/api/client-portal/crm/search'
const apiFetch = $fetch as <T = unknown>(request: string, options: {
  method: 'POST'
  body: { clientId?: string, query: string }
}) => Promise<T>

const open = ref(false)
const term = ref('')
const debounced = refDebounced(term, 200)
const results = ref<CrmSearchResult[]>([])
const loading = ref(false)
const errorMessage = ref<string | null>(null)
let searchGeneration = 0

const TYPE_META: Record<CrmSearchTargetType, { label: string, icon: string }> = {
  person: { label: 'People', icon: 'i-lucide-user' },
  company: { label: 'Companies', icon: 'i-lucide-building-2' },
  opportunity: { label: 'Opportunities', icon: 'i-lucide-trending-up' },
  activity: { label: 'Activity', icon: 'i-lucide-activity' },
  task: { label: 'Tasks', icon: 'i-lucide-check-square' }
}
const TYPE_ORDER: CrmSearchTargetType[] = ['person', 'company', 'opportunity', 'activity', 'task']

function invalidateSearchUi() {
  searchGeneration += 1
  results.value = []
  loading.value = false
  errorMessage.value = null
}

interface SearchInvocation {
  generation: number
  rawTerm: string
  debouncedTerm: string
  clientId: string
}

function isCurrentSearch(invocation: SearchInvocation) {
  return invocation.generation === searchGeneration
    && invocation.rawTerm === term.value
    && invocation.debouncedTerm === debounced.value
    && invocation.clientId === props.clientId
    && invocation.rawTerm.trim() === invocation.debouncedTerm.trim()
}

async function invokeSearch(debouncedTerm: string, clientId: string) {
  const invocation: SearchInvocation = {
    generation: ++searchGeneration,
    rawTerm: term.value,
    debouncedTerm,
    clientId
  }
  const trimmed = debouncedTerm.trim()
  errorMessage.value = null
  if (!trimmed || !clientId) {
    results.value = []
    loading.value = false
    return
  }
  loading.value = true
  try {
    const body = isAgency
      ? { clientId, query: trimmed }
      : { query: trimmed }
    const response = await apiFetch<{ results: CrmSearchResult[] }>(searchEndpoint, {
      method: 'POST',
      body
    })
    if (isCurrentSearch(invocation)) results.value = response.results
  } catch {
    if (isCurrentSearch(invocation)) {
      results.value = []
      errorMessage.value = 'CRM search is unavailable. Try again.'
    }
  } finally {
    if (isCurrentSearch(invocation)) loading.value = false
  }
}

watch([term, () => props.clientId], invalidateSearchUi, { flush: 'sync' })

watch([debounced, () => props.clientId], async ([q, clientId]) => {
  await invokeSearch(q, clientId)
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
      onSelect: () => choose(r)
    }))
  }))
})

function choose(r: CrmSearchResult) {
  emit('select', r)
  open.value = false
  term.value = ''
  results.value = []
}

function openSearch() {
  open.value = true
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
      @click="openSearch"
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
          :aria-busy="loading"
          placeholder="Search people, companies, deals, activity…"
          class="h-96"
        >
          <template #empty>
            <div
              v-if="loading"
              role="status"
              aria-live="polite"
              class="py-8 text-center text-sm text-muted"
            >
              Searching CRM…
            </div>
            <div
              v-else-if="errorMessage"
              role="alert"
              class="py-8 text-center text-sm text-error"
            >
              {{ errorMessage }}
            </div>
            <div
              v-else
              role="status"
              class="py-8 text-center text-sm text-muted"
            >
              {{ term.trim() ? 'No matches.' : 'Type to search this client’s CRM.' }}
            </div>
          </template>
        </UCommandPalette>
      </template>
    </UModal>
  </div>
</template>
