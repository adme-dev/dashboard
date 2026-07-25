<script setup lang="ts">
interface CohortEvidence {
  key: string
  count: number
}

interface AudienceCohort {
  key: string
  version: number
  label: string
  description: string
  allowedChannels: string[]
  estimatedSize: number
  eligibleSize: number
  suppressedSize: number
  knownProfileSize: number
  targetingAllowed: boolean
  status: 'blocked' | 'preview_ready'
  blockedReason: string | null
  topEvidence: CohortEvidence[]
}

interface CohortResponse {
  enabled: boolean
  generatedAt: string
  minAudienceSize: number
  subjectCount?: number
  analysisCapped?: boolean
  filters: {
    startDate?: string
    endDate?: string
    platform?: string | null
  }
  cohorts: AudienceCohort[]
}

defineProps<{ clientId: string }>()

const data = ref<CohortResponse | null>(null)
const status = ref<'idle' | 'pending' | 'success' | 'error'>('idle')
const error = ref<Error | null>(null)

async function refresh() {
  status.value = 'pending'
  error.value = null
  try {
    data.value = await $fetch('/api/client-portal/crm/audience-cohorts') as CohortResponse
    status.value = 'success'
  } catch (cause) {
    error.value = cause instanceof Error ? cause : new Error('Audience preview unavailable')
    status.value = 'error'
  }
}

onMounted(refresh)

const number = new Intl.NumberFormat('en-AU')
const formatNumber = (value: number) => number.format(value)
const generatedLabel = computed(() => data.value?.generatedAt
  ? new Intl.DateTimeFormat('en-AU', {
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(data.value.generatedAt))
  : 'Not generated')
</script>

<template>
  <section class="space-y-4" aria-labelledby="audience-intelligence-heading">
    <div class="flex flex-col gap-3 border-b border-default pb-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p class="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Persona intelligence</p>
        <h2 id="audience-intelligence-heading" class="mt-1 text-xl font-semibold text-highlighted">
          Audience cohort previews
        </h2>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Aggregate, consent-aware audience estimates from website behaviour, confirmed leads and product interest.
          No customer identities are exposed and no audiences are sent to advertising platforms.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      >
        Refresh preview
      </UButton>
    </div>

    <div v-if="status === 'pending' && !data" class="grid gap-3 md:grid-cols-3">
      <USkeleton v-for="index in 3" :key="index" class="h-44 rounded-xl" />
    </div>

    <UAlert
      v-else-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      title="Audience preview unavailable"
      description="The existing CRM data is unaffected. Retry when the intelligence service is available."
    />

    <UAlert
      v-else-if="data && !data.enabled"
      color="neutral"
      variant="subtle"
      icon="i-lucide-lock-keyhole"
      title="Audience intelligence is not enabled"
      description="Enable Full CRM and the Persona Identity entitlement for this client."
    />

    <template v-else-if="data">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-xl border border-default bg-elevated/40 p-4">
          <p class="text-xs uppercase tracking-wide text-muted">Observed subjects</p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">{{ formatNumber(data.subjectCount || 0) }}</p>
        </div>
        <div class="rounded-xl border border-default bg-elevated/40 p-4">
          <p class="text-xs uppercase tracking-wide text-muted">Privacy threshold</p>
          <p class="mt-1 text-2xl font-semibold text-highlighted">{{ formatNumber(data.minAudienceSize) }}</p>
        </div>
        <div class="rounded-xl border border-default bg-elevated/40 p-4">
          <p class="text-xs uppercase tracking-wide text-muted">Last calculated</p>
          <p class="mt-2 text-sm font-medium text-highlighted">{{ generatedLabel }}</p>
        </div>
      </div>

      <UAlert
        v-if="data.analysisCapped"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Preview limited"
        description="Narrow the date or platform filter before making activation decisions."
      />

      <div v-if="data.cohorts.length" class="grid gap-4 xl:grid-cols-3">
        <article
          v-for="cohort in data.cohorts"
          :key="`${cohort.key}:${cohort.version}`"
          class="flex min-h-64 flex-col rounded-xl border border-default bg-default p-5"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <h3 class="font-semibold text-highlighted">{{ cohort.label }}</h3>
              <p class="mt-1 text-xs text-muted">Definition v{{ cohort.version }}</p>
            </div>
            <UBadge
              :color="cohort.status === 'preview_ready' ? 'success' : 'neutral'"
              variant="subtle"
            >
              {{ cohort.status === 'preview_ready' ? 'Preview ready' : 'Protected' }}
            </UBadge>
          </div>

          <p class="mt-3 text-sm leading-6 text-muted">{{ cohort.description }}</p>

          <dl class="mt-4 grid grid-cols-3 gap-2 border-y border-default py-3">
            <div>
              <dt class="text-xs text-muted">Matched</dt>
              <dd class="mt-1 font-semibold text-highlighted">{{ formatNumber(cohort.estimatedSize) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Eligible</dt>
              <dd class="mt-1 font-semibold text-highlighted">{{ formatNumber(cohort.eligibleSize) }}</dd>
            </div>
            <div>
              <dt class="text-xs text-muted">Suppressed</dt>
              <dd class="mt-1 font-semibold text-highlighted">{{ formatNumber(cohort.suppressedSize) }}</dd>
            </div>
          </dl>

          <div class="mt-4">
            <p class="text-xs font-medium uppercase tracking-wide text-muted">Leading evidence</p>
            <div class="mt-2 flex flex-wrap gap-1.5">
              <UBadge
                v-for="evidence in cohort.topEvidence"
                :key="evidence.key"
                color="neutral"
                variant="outline"
              >
                {{ evidence.key.replaceAll('_', ' ') }} · {{ formatNumber(evidence.count) }}
              </UBadge>
              <span v-if="!cohort.topEvidence.length" class="text-xs text-dimmed">No qualifying signals yet</span>
            </div>
          </div>

          <p v-if="cohort.blockedReason" class="mt-auto pt-4 text-xs leading-5 text-muted">
            <UIcon name="i-lucide-shield-check" class="mr-1 align-text-bottom" />
            {{ cohort.blockedReason }}
          </p>
        </article>
      </div>

      <div v-else class="rounded-xl border border-dashed border-default p-10 text-center">
        <UIcon name="i-lucide-users-round" class="mx-auto size-7 text-dimmed" />
        <p class="mt-3 text-sm font-medium text-highlighted">No cohort evidence yet</p>
        <p class="mt-1 text-sm text-muted">Signals will appear as tracked visitors interact with inventory and forms.</p>
      </div>
    </template>
  </section>
</template>
