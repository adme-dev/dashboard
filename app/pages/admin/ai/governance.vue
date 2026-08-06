<script setup lang="ts">
import type {
  AiCatalogGovernanceItem,
  AiCompanyRolloutReadiness,
  AiPilotMetricsResponse,
  AiDepartmentDraftSeedInput,
  AiDepartmentDraftSeedResult,
  AiDepartmentOwnerCandidate,
  AiDepartmentReadinessItem,
  AiDepartmentReadinessResponse,
  AiEvaluationRunView
} from '~/types/aiGovernance'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const apiFetch = $fetch as <T>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, string | number> }
) => Promise<T>

function defaultPilotWindow() {
  const through = new Date()
  through.setUTCHours(0, 0, 0, 0)
  through.setUTCDate(through.getUTCDate() + 1)
  const from = new Date(through)
  from.setUTCDate(from.getUTCDate() - 30)
  return { from: from.toISOString(), to: through.toISOString() }
}

function initialPilotWindow() {
  const query = typeof window === 'undefined' ? null : new URL(window.location.href).searchParams
  const from = query?.get('pilotFrom') ?? ''
  const to = query?.get('pilotTo') ?? ''
  const fromMs = Date.parse(from)
  const toMs = Date.parse(to)
  if (Number.isFinite(fromMs) && Number.isFinite(toMs)
    && new Date(fromMs).toISOString() === from && new Date(toMs).toISOString() === to
    && fromMs < toMs && toMs - fromMs <= 31 * 24 * 60 * 60 * 1_000) return { from, to }
  return defaultPilotWindow()
}

function persistPilotWindow(windowValue: { from: string, to: string }) {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('pilotFrom', windowValue.from)
  url.searchParams.set('pilotTo', windowValue.to)
  window.history.replaceState(window.history.state, '', url)
}

const data = ref<AiDepartmentReadinessResponse | null>(null)
const catalogItems = ref<AiCatalogGovernanceItem[]>([])
const evaluationRuns = ref<AiEvaluationRunView[]>([])
const rollout = ref<AiCompanyRolloutReadiness | null>(null)
const pilotMetrics = ref<AiPilotMetricsResponse | null>(null)
const pilotWindow = ref(initialPilotWindow())
const pending = ref(false)
const error = ref<unknown>(null)
const catalogPending = ref(false)
const catalogError = ref<string | null>(null)
const evaluationsPending = ref(false)
const evaluationsError = ref<string | null>(null)
const rolloutPending = ref(false)
const rolloutError = ref<string | null>(null)
const pilotMetricsPending = ref(false)
const pilotMetricsError = ref<string | null>(null)
const seedOpen = ref(false)
const selectedSeedItem = ref<AiDepartmentReadinessItem | null>(null)

persistPilotWindow(pilotWindow.value)

function errorMessage(caught: unknown, fallback: string) {
  return (caught as { data?: { statusMessage?: string } })?.data?.statusMessage ?? fallback
}

async function refresh() {
  await Promise.all([refreshReadiness(), refreshCatalog(), refreshEvaluations(), refreshRollout(), refreshPilotMetrics()])
}

await refresh()

const cards = computed(() => [
  { label: 'Required packs', value: data.value?.summary.total ?? 0, icon: 'i-lucide-layers-3' },
  { label: 'Owner confirmation', value: data.value?.summary.readyForOwnerConfirmation ?? 0, icon: 'i-lucide-user-check' },
  { label: 'Seeded drafts', value: data.value?.summary.draftSeeded ?? 0, icon: 'i-lucide-file-check-2' },
  { label: 'Released', value: data.value?.summary.released ?? 0, icon: 'i-lucide-rocket' },
  { label: 'Blocked', value: data.value?.summary.blocked ?? 0, icon: 'i-lucide-shield-alert' },
  { label: 'Missing departments', value: data.value?.summary.missingDepartments ?? 0, icon: 'i-lucide-building-2' }
])

function errorDescription() {
  const value = error.value as { data?: { statusMessage?: string } } | null
  return value?.data?.statusMessage ?? 'The governance readiness service could not be loaded.'
}

function openSeedDialog(item: AiDepartmentReadinessItem, candidate?: AiDepartmentOwnerCandidate) {
  if (!item.department) return
  if (candidate && (!candidate.eligible || candidate.source !== 'department_member')) return
  const ownerCandidate = candidate
    ? { id: candidate.id, name: candidate.name, source: 'department_member' as const }
    : item.ownerCandidate
  if (!ownerCandidate || (!candidate && item.status !== 'ready_for_owner_confirmation')) return
  selectedSeedItem.value = { ...item, ownerCandidate }
  seedOpen.value = true
}

async function seedDraft(input: AiDepartmentDraftSeedInput) {
  const result = await apiFetch<AiDepartmentDraftSeedResult>('/api/admin/ai/governance/draft-packs', {
    method: 'POST',
    body: { ...input, confirmation: 'SEED_DRAFT' }
  })
  await refresh()
  return result
}

async function refreshRollout() {
  rolloutPending.value = true
  rolloutError.value = null
  try {
    rollout.value = await apiFetch<AiCompanyRolloutReadiness>('/api/admin/ai/governance/rollout')
  } catch (caught) {
    rolloutError.value = errorMessage(caught, 'The company rollout readiness service could not be loaded.')
  } finally {
    rolloutPending.value = false
  }
}

async function refreshPilotMetrics() {
  pilotMetricsPending.value = true
  pilotMetricsError.value = null
  try {
    pilotMetrics.value = await apiFetch<AiPilotMetricsResponse>('/api/admin/ai/governance/pilot-metrics', {
      query: { from: pilotWindow.value.from, to: pilotWindow.value.to }
    })
  } catch (caught) {
    pilotMetricsError.value = errorMessage(caught, 'The pilot evidence service could not be loaded.')
  } finally {
    pilotMetricsPending.value = false
  }
}

async function applyPilotWindow(window: { from: string, to: string }) {
  pilotWindow.value = window
  persistPilotWindow(window)
  await refreshPilotMetrics()
}

async function refreshReadiness() {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch<AiDepartmentReadinessResponse>('/api/admin/ai/governance/readiness')
  } catch (caught) {
    error.value = caught
  } finally {
    pending.value = false
  }
}

async function refreshCatalog() {
  const maxPages = 5
  catalogPending.value = true
  catalogError.value = null
  try {
    const items: AiCatalogGovernanceItem[] = []
    let cursor: string | null = null
    for (let page = 0; page < maxPages; page += 1) {
      const response = await apiFetch<{ items: AiCatalogGovernanceItem[], nextCursor: string | null }>('/api/admin/ai/governance/catalog', {
        query: { kind: 'pack', limit: 100, ...(cursor ? { cursor } : {}) }
      })
      items.push(...response.items)
      cursor = response.nextCursor
      if (!cursor) break
    }
    if (cursor) throw new Error('Catalog exceeds the supported 500-pack control-plane bound.')
    catalogItems.value = items
  } catch (caught) {
    catalogError.value = errorMessage(caught, 'The catalog governance service could not be loaded.')
  } finally {
    catalogPending.value = false
  }
}

async function refreshEvaluations() {
  evaluationsPending.value = true
  evaluationsError.value = null
  try {
    evaluationRuns.value = (await apiFetch<{ items: AiEvaluationRunView[] }>('/api/admin/ai/governance/evaluations')).items
  } catch (caught) {
    evaluationsError.value = errorMessage(caught, 'The evaluation service could not be loaded.')
  } finally {
    evaluationsPending.value = false
  }
}
</script>

<template>
  <main
    class="mx-auto h-full min-h-0 max-w-6xl overflow-y-auto space-y-6 p-4 sm:p-6"
    aria-labelledby="governance-page-title"
    tabindex="0"
  >
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>Admin</span><UIcon name="i-lucide-chevron-right" class="size-3" /><span>AI governance</span>
        </div>
        <h1 id="governance-page-title" class="text-xl font-semibold text-highlighted">
          Department pack readiness
        </h1>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Review department matches, eligible owners, capability coverage, draft seeding, and governed release state.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          to="/admin/ai/model-ops"
          icon="i-lucide-brain-circuit"
          color="neutral"
          variant="ghost"
        >
          Model Ops
        </UButton>
        <UButton
          icon="i-lucide-refresh-cw"
          color="neutral"
          variant="soft"
          :loading="pending"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </header>

    <UAlert
      color="info"
      variant="soft"
      icon="i-lucide-shield-check"
      title="Governance command centre"
      description="Drafts, evaluations, pilot membership, and release transitions are separate audited steps. Runtime access changes only after exact-version evidence and explicit confirmation."
    />

    <div
      v-if="pending && !data"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading department pack readiness"
    >
      <USkeleton class="h-24 w-full" />
      <USkeleton v-for="index in 4" :key="index" class="h-40 w-full" />
    </div>

    <UAlert
      v-else-if="error && !data"
      color="error"
      variant="soft"
      icon="i-lucide-triangle-alert"
      title="Couldn’t load AI governance readiness"
      :description="errorDescription()"
    >
      <template #actions>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-refresh-cw"
          @click="refresh()"
        >
          Try again
        </UButton>
      </template>
    </UAlert>

    <template v-else-if="data">
      <UAlert v-if="error" color="warning" variant="soft" icon="i-lucide-clock-alert" title="Readiness data may be stale" :description="errorDescription()"><template #actions><UButton color="warning" variant="soft" @click="refreshReadiness">Retry readiness</UButton></template></UAlert>
      <section aria-labelledby="readiness-summary-title">
        <h2 id="readiness-summary-title" class="sr-only">
          Readiness summary
        </h2>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" role="status" aria-live="polite">
          <UCard v-for="card in cards" :key="card.label" :ui="{ body: 'p-4' }">
            <div class="flex items-center gap-2 text-muted">
              <UIcon :name="card.icon" class="size-4" />
              <span class="text-[10px] font-semibold uppercase tracking-wider">{{ card.label }}</span>
            </div>
            <p class="mt-1.5 text-xl font-semibold text-highlighted">
              {{ card.value }}
            </p>
          </UCard>
        </div>
      </section>

      <AiGovernanceRolloutReadinessPanel
        :data="rollout"
        :pending="rolloutPending"
        :error="rolloutError"
        @refresh="refreshRollout"
      />

      <AiGovernancePilotMetricsPanel
        :data="pilotMetrics"
        :window="pilotWindow"
        :pending="pilotMetricsPending"
        :error="pilotMetricsError"
        @refresh="refreshPilotMetrics"
        @apply-window="applyPilotWindow"
      />

      <UAlert
        v-if="data.unmappedDepartments.length"
        color="warning"
        variant="soft"
        icon="i-lucide-map-pin-off"
        title="Unmapped organizational departments"
        :description="data.unmappedDepartments.map(item => item.name).join(', ')"
      />

      <AiDepartmentPackReadinessList
        :items="data.items"
        :catalog-items="catalogItems"
        :evaluation-runs="evaluationRuns"
        :catalog-pending="catalogPending"
        :catalog-error="catalogError"
        :evaluations-pending="evaluationsPending"
        :evaluations-error="evaluationsError"
        @seed="openSeedDialog"
        @changed="refresh"
        @retry-catalog="refreshCatalog"
        @retry-evaluations="refreshEvaluations"
      />
    </template>

    <AiDepartmentDraftSeedDialog
      v-model:open="seedOpen"
      :item="selectedSeedItem"
      :on-seed="seedDraft"
    />
  </main>
</template>
