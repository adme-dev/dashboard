<script setup lang="ts">
import { ref, watch } from 'vue'

type PilotGateState
  = 'ready' | 'blocked' | 'unavailable' | 'not_started'
type PilotGateKey
  = | 'site'
    | 'searchConsole'
    | 'ownedCollection'
    | 'competitorCollection'
    | 'contentPublisher'
    | 'googleBusiness'

interface PilotGate {
  state: PilotGateState
  reasonCode: string | null
  action: string | null
  evidenceAt: string | null
}

interface PilotReadiness {
  clientId: string
  coreReady: boolean
  gates: Record<PilotGateKey, PilotGate>
}

const props = defineProps<{
  clientId: string | null
  clientName?: string | null
}>()

const readiness = ref<PilotReadiness | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)

const gateOrder: Array<{ key: PilotGateKey, label: string, optional?: boolean }> = [
  { key: 'site', label: 'Client site' },
  { key: 'searchConsole', label: 'Search Console' },
  { key: 'ownedCollection', label: 'Owned-site collection' },
  { key: 'competitorCollection', label: 'Competitor collection' },
  { key: 'contentPublisher', label: 'Content publisher' },
  { key: 'googleBusiness', label: 'GBP (optional)', optional: true }
]

const statePresentation: Record<PilotGateState, {
  label: string
  color: 'success' | 'error' | 'warning' | 'neutral'
  icon: string
}> = {
  ready: { label: 'Ready', color: 'success', icon: 'i-lucide-circle-check' },
  blocked: { label: 'Blocked', color: 'error', icon: 'i-lucide-circle-alert' },
  unavailable: { label: 'Unavailable', color: 'neutral', icon: 'i-lucide-circle-minus' },
  not_started: { label: 'Not started', color: 'warning', icon: 'i-lucide-clock-3' }
}

function errorMessage(error: unknown): string {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Pilot readiness could not be loaded'
}

async function loadReadiness(clientId: string | null) {
  readiness.value = null
  loadError.value = null
  if (!clientId) {
    loading.value = false
    return
  }

  loading.value = true
  try {
    readiness.value = await $fetch<PilotReadiness>(
      '/api/agency/search-authority/pilot-readiness',
      { query: { clientId } }
    )
  } catch (error: unknown) {
    loadError.value = errorMessage(error)
  } finally {
    loading.value = false
  }
}

watch(() => props.clientId, (clientId) => {
  void loadReadiness(clientId)
}, { immediate: true })
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-highlighted">
            Pilot completion
          </h2>
          <p class="mt-1 text-sm text-muted">
            Live activation gates<span v-if="clientName"> for {{ clientName }}</span>.
          </p>
        </div>
        <UBadge
          v-if="readiness"
          :label="readiness.coreReady ? 'Core pilot ready' : 'Core pilot blocked'"
          :color="readiness.coreReady ? 'success' : 'warning'"
          variant="subtle"
        />
      </div>
    </template>

    <UAlert
      v-if="!clientId"
      title="Choose a client to view pilot readiness"
      description="The checklist is scoped to one authorised client at a time."
      icon="i-lucide-building-2"
      color="neutral"
      variant="subtle"
    />

    <div
      v-else-if="loading"
      class="space-y-3"
      aria-busy="true"
      aria-label="Loading pilot readiness"
    >
      <USkeleton v-for="index in 4" :key="index" class="h-14 w-full rounded-lg" />
    </div>

    <UAlert
      v-else-if="loadError"
      title="Pilot readiness unavailable"
      :description="loadError"
      icon="i-lucide-triangle-alert"
      color="error"
      variant="subtle"
    />

    <ul v-else-if="readiness" class="divide-y divide-default" role="list">
      <li
        v-for="item in gateOrder"
        :key="item.key"
        class="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"
      >
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <UIcon
              :name="statePresentation[readiness.gates[item.key].state].icon"
              class="size-4 shrink-0 text-muted"
              aria-hidden="true"
            />
            <span class="text-sm font-medium text-highlighted">{{ item.label }}</span>
            <span v-if="item.optional" class="text-xs text-muted">Does not block core launch</span>
          </div>
          <p
            v-if="readiness.gates[item.key].action"
            class="mt-1 pl-6 text-sm leading-5 text-muted"
          >
            {{ readiness.gates[item.key].action }}
          </p>
        </div>
        <UBadge
          :label="statePresentation[readiness.gates[item.key].state].label"
          :color="statePresentation[readiness.gates[item.key].state].color"
          variant="subtle"
          class="shrink-0 self-start"
        />
      </li>
    </ul>
  </UCard>
</template>
