<script setup lang="ts">
import type {
  AiDepartmentDraftSeedInput,
  AiDepartmentDraftSeedResult,
  AiDepartmentReadinessItem,
  AiDepartmentReadinessResponse
} from '~/types/aiGovernance'

definePageMeta({ layout: 'agency', middleware: ['role-admin'] })

const apiFetch = $fetch as <T>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const data = ref<AiDepartmentReadinessResponse | null>(null)
const pending = ref(false)
const error = ref<unknown>(null)
const seedOpen = ref(false)
const selectedSeedItem = ref<AiDepartmentReadinessItem | null>(null)

async function refresh() {
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

function openSeedDialog(item: AiDepartmentReadinessItem) {
  if (item.status !== 'ready_for_owner_confirmation' || !item.department || !item.ownerCandidate) return
  selectedSeedItem.value = item
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
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <header class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div class="mb-2 flex items-center gap-2 text-xs text-muted">
          <span>Admin</span><UIcon name="i-lucide-chevron-right" class="size-3" /><span>AI governance</span>
        </div>
        <h1 class="text-xl font-semibold text-highlighted">
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
      title="Guarded draft control plane"
      description="Readiness is read-only by default. A confirmed admin may seed one dormant draft at a time; activation, pilot assignment, AI execution, permission changes, and notifications remain unavailable here."
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

      <UAlert
        v-if="data.unmappedDepartments.length"
        color="warning"
        variant="soft"
        icon="i-lucide-map-pin-off"
        title="Unmapped organizational departments"
        :description="data.unmappedDepartments.map(item => item.name).join(', ')"
      />

      <AiDepartmentPackReadinessList :items="data.items" @seed="openSeedDialog" />
    </template>

    <AiDepartmentDraftSeedDialog
      v-model:open="seedOpen"
      :item="selectedSeedItem"
      :on-seed="seedDraft"
    />
  </div>
</template>
