<script setup lang="ts">
import type {
  AiCatalogGovernanceItem,
  AiDepartmentOwnerCandidate,
  AiDepartmentReadinessItem,
  AiDepartmentReadinessStatus,
  AiEvaluationRunView
} from '~/types/aiGovernance'

const props = defineProps<{
  items: AiDepartmentReadinessItem[]
  catalogItems?: AiCatalogGovernanceItem[]
  evaluationRuns?: AiEvaluationRunView[]
  catalogPending?: boolean
  catalogError?: string | null
  evaluationsPending?: boolean
  evaluationsError?: string | null
}>()
const emit = defineEmits<{
  seed: [item: AiDepartmentReadinessItem, candidate?: AiDepartmentOwnerCandidate]
  changed: []
  retryCatalog: []
  retryEvaluations: []
}>()

const OWNER_RESOLUTION_STATUSES = new Set<AiDepartmentReadinessStatus>([
  'ready_for_owner_confirmation',
  'missing_owner',
  'owner_inactive',
  'owner_not_member'
])

const statusMeta: Record<AiDepartmentReadinessStatus, { label: string, color: 'info' | 'warning' | 'error' | 'neutral', icon: string }> = {
  ready_for_owner_confirmation: { label: 'Owner confirmation required', color: 'info', icon: 'i-lucide-user-check' },
  draft_seeded: { label: 'Draft seeded', color: 'info', icon: 'i-lucide-file-check-2' },
  released: { label: 'Governed release exists', color: 'neutral', icon: 'i-lucide-rocket' },
  missing_department: { label: 'Department missing', color: 'error', icon: 'i-lucide-building-2' },
  ambiguous_department: { label: 'Department match ambiguous', color: 'warning', icon: 'i-lucide-git-compare-arrows' },
  missing_owner: { label: 'Owner missing', color: 'warning', icon: 'i-lucide-user-x' },
  owner_inactive: { label: 'Owner inactive', color: 'error', icon: 'i-lucide-user-x' },
  owner_not_member: { label: 'Owner not a member', color: 'error', icon: 'i-lucide-user-round-x' }
}

function formatReleaseState(state: AiDepartmentReadinessItem['releaseState']) {
  return state === 'not_seeded'
    ? 'Not seeded'
    : state.replace(/_/g, ' ').replace(/^\w/, character => character.toUpperCase())
}

function canNominate(item: AiDepartmentReadinessItem) {
  return item.releaseState === 'not_seeded'
    && Boolean(item.department)
    && OWNER_RESOLUTION_STATUSES.has(item.status)
}

function candidateRole(candidate: AiDepartmentOwnerCandidate) {
  if (candidate.isManager) return 'Department manager'
  if (candidate.membershipRole) {
    return candidate.membershipRole.replace(/^\w/, character => character.toUpperCase())
  }
  return 'Primary assignment only'
}

function candidateIsEligible(candidate: AiDepartmentOwnerCandidate) {
  return candidate.eligible && candidate.source === 'department_member'
}

function catalogFor(item: AiDepartmentReadinessItem) {
  return props.catalogItems?.find(candidate => candidate.kind === 'pack' && candidate.key === item.packKey && candidate.department.id === item.department?.id) ?? null
}

function evaluationCount(item: AiDepartmentReadinessItem) {
  return item.coverage.evaluationCases || 1
}

function headingId(prefix: string, item: AiDepartmentReadinessItem, catalog: AiCatalogGovernanceItem) {
  return `${prefix}-${item.key}-${catalog.release.id}`
}
</script>

<template>
  <section class="space-y-3" aria-labelledby="pack-readiness-title">
    <div>
      <h2 id="pack-readiness-title" class="text-sm font-semibold text-highlighted">
        Required department packs
      </h2>
      <p class="text-xs text-muted">
        Every pack includes authenticated staff basics, bounded budgets, and three starter safety evaluations.
      </p>
    </div>

    <UCard v-for="item in items" :key="item.key" :ui="{ body: 'p-4 sm:p-5' }">
      <div class="flex flex-col gap-4">
        <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <h3 class="font-semibold text-highlighted">
                {{ item.name }}
              </h3>
              <UBadge color="neutral" variant="soft">
                {{ formatReleaseState(item.releaseState) }}
              </UBadge>
            </div>
            <p class="mt-1 text-sm text-muted">
              {{ item.description }}
            </p>
          </div>
          <UBadge :color="statusMeta[item.status].color" variant="soft" class="shrink-0">
            <UIcon :name="statusMeta[item.status].icon" class="mr-1 size-3.5" />
            {{ statusMeta[item.status].label }}
          </UBadge>
        </div>

        <dl class="grid gap-3 text-sm sm:grid-cols-2">
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs font-medium text-muted">
              Organizational department
            </dt>
            <dd class="mt-1 text-default">
              {{ item.department?.name ?? (item.departmentMatches.length ? `${item.departmentMatches.length} matches` : 'Not mapped') }}
            </dd>
          </div>
          <div class="rounded-lg bg-elevated p-3">
            <dt class="text-xs font-medium text-muted">
              Proposed owner
            </dt>
            <dd class="mt-1 text-default">
              {{ item.ownerCandidate?.name ?? (item.ownerCandidates.some(candidateIsEligible) ? 'Choose below' : 'Not eligible yet') }}
            </dd>
          </div>
        </dl>

        <div class="flex flex-wrap gap-2" aria-label="Pack coverage">
          <UBadge color="neutral" variant="outline">
            {{ item.coverage.capabilities }} capabilities
          </UBadge>
          <UBadge color="neutral" variant="outline">
            {{ item.coverage.tools }} tools
          </UBadge>
          <UBadge color="neutral" variant="outline">
            {{ item.coverage.evaluationCases }} evaluation cases
          </UBadge>
        </div>

        <p class="text-xs font-semibold uppercase tracking-wide text-muted">Overview</p>

        <ul v-if="item.blockers.length" class="space-y-1.5 text-sm" aria-label="Activation blockers">
          <li v-for="blocker in item.blockers" :key="blocker" class="flex items-start gap-2 text-warning">
            <UIcon name="i-lucide-shield-alert" class="mt-0.5 size-4 shrink-0" /><span>{{ blocker }}</span>
          </li>
        </ul>

        <template v-if="catalogFor(item)">
          <UAlert v-if="catalogError" color="warning" variant="soft" icon="i-lucide-clock-alert" title="Catalog data may be stale" :description="catalogError"><template #actions><UButton size="xs" color="warning" variant="soft" @click="emit('retryCatalog')">Retry catalog</UButton></template></UAlert>
          <UAlert v-if="evaluationsPending" color="neutral" variant="soft" icon="i-lucide-loader-circle" title="Evaluation evidence loading" description="Loading the latest exact-version evaluation results." />
          <UAlert v-else-if="evaluationsError" color="error" variant="soft" icon="i-lucide-triangle-alert" title="Evaluation evidence unavailable" :description="evaluationsError"><template #actions><UButton size="xs" color="error" variant="soft" @click="emit('retryEvaluations')">Retry evaluations</UButton></template></UAlert>
          <div class="border-t border-default pt-4">
            <AiGovernanceEvaluationRunPanel
              :item="catalogFor(item)!"
              :runs="evaluationRuns ?? []"
              :default-case-count="evaluationCount(item)"
              :heading-id="headingId('evaluation', item, catalogFor(item)!)"
              @changed="emit('changed')"
            />
          </div>
          <div class="border-t border-default pt-4">
            <AiGovernancePilotMembershipDialog
              :item="catalogFor(item)!"
              :candidates="item.ownerCandidates"
              :heading-id="headingId('pilots', item, catalogFor(item)!)"
              @changed="emit('changed')"
            />
          </div>
          <div class="border-t border-default pt-4">
            <AiGovernanceCatalogReleasePanel
              :item="catalogFor(item)!"
              :runs="evaluationRuns ?? []"
              :heading-id="headingId('release', item, catalogFor(item)!)"
              :evidence-unavailable="evaluationsPending || Boolean(evaluationsError)"
              @changed="emit('changed')"
            />
          </div>
        </template>
        <UAlert
          v-else-if="catalogPending"
          color="neutral"
          variant="soft"
          icon="i-lucide-clock-3"
          title="Catalog controls loading"
          description="Loading the exact catalog release identity before controls are shown."
        />
        <UAlert
          v-else-if="catalogError"
          color="error"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Catalog controls unavailable"
          :description="`${catalogError} Suspend and retire will be available after the exact catalog release identity is reloaded.`"
        >
          <template #actions><UButton size="xs" color="error" variant="soft" @click="emit('retryCatalog')">Retry catalog</UButton></template>
        </UAlert>
        <UAlert
          v-else-if="item.releaseState === 'draft'"
          color="neutral"
          variant="soft"
          icon="i-lucide-clock-3"
          title="Catalog controls unavailable"
          description="The draft is seeded. Refresh to load its governed evaluation, pilot, and release controls."
        />
        <UAlert
          v-else
          color="warning"
          variant="soft"
          icon="i-lucide-triangle-alert"
          title="Catalog controls unavailable"
          description="Suspend and retire remain unavailable until the exact catalog release identity is loaded."
        >
          <template #actions><UButton size="xs" color="warning" variant="soft" @click="emit('retryCatalog')">Retry catalog</UButton></template>
        </UAlert>

        <div
          v-if="item.releaseState === 'not_seeded' && item.ownerCandidates.length"
          class="space-y-2 rounded-lg border border-default p-3"
        >
          <div>
            <p class="text-xs font-medium text-default">
              Active department-linked people
            </p>
            <p class="mt-0.5 text-xs text-muted">
              Choosing a person opens the existing confirmation step; it does not assign or notify them by itself.
            </p>
          </div>
          <ul class="divide-y divide-default" aria-label="Eligible department owner candidates">
            <li
              v-for="candidate in item.ownerCandidates"
              :key="candidate.id"
              class="flex flex-col gap-2 py-2 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-default">
                  {{ candidate.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ candidateRole(candidate) }}
                </p>
              </div>
              <UButton
                v-if="candidateIsEligible(candidate) && canNominate(item) && candidate.id !== item.ownerCandidate?.id"
                size="xs"
                color="warning"
                variant="soft"
                icon="i-lucide-user-check"
                :data-testid="`choose-owner-${item.key}-${candidate.id}`"
                :aria-label="`Use ${candidate.name} as owner for ${item.name}`"
                @click="emit('seed', item, candidate)"
              >
                Use as owner
              </UButton>
              <UBadge v-else-if="!candidateIsEligible(candidate)" color="warning" variant="outline">
                Membership required
              </UBadge>
              <UBadge v-else color="neutral" variant="outline">
                Proposed owner
              </UBadge>
            </li>
          </ul>
        </div>
        <details v-if="item.knownGaps.length" class="text-sm">
          <summary class="cursor-pointer font-medium text-muted">
            Known gaps
          </summary>
          <ul class="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li v-for="gap in item.knownGaps" :key="gap">
              {{ gap }}
            </li>
          </ul>
        </details>

        <div v-if="item.status === 'ready_for_owner_confirmation' && item.department && item.ownerCandidate" class="flex justify-end border-t border-default pt-4">
          <UButton
            icon="i-lucide-user-check"
            color="warning"
            variant="soft"
            :data-testid="`open-seed-${item.key}`"
            @click="emit('seed', item)"
          >
            Confirm owner and seed draft
          </UButton>
        </div>
      </div>
    </UCard>
  </section>
</template>
