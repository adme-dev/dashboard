<script setup lang="ts">
definePageMeta({ layout: 'portal' })

interface IdentityCase {
  id: string
  caseType: string
  status: string
  riskLevel: string
  title: string
  reason: string
  createdAt: string
}

interface IdentityResponse {
  enabled: boolean
  generatedAt: string
  healthy: boolean
  metrics: {
    profiles: number
    identityKeys: number
    linkedLeads: number
    leadsWithoutIdentity: number
    anonymousSignals: number
    unlinkedConsent: number
    unmatchedSubmissions: number
    conflictEvidence: number
    openCases: number
    appliedResolutions: number
  } | null
  cases: IdentityCase[]
  recentConflicts: Array<{
    profileId: string
    source: string
    occurredAt: string
  }>
}

const { data, status, error, refresh } = await useFetch<IdentityResponse>(
  '/api/portal/analytics/identity-reconciliation',
  { key: 'portal-identity-reconciliation' }
)

const cards = computed(() => {
  const metrics = data.value?.metrics
  return [
    { label: 'Known personas', value: metrics?.profiles ?? 0, icon: 'i-lucide-users' },
    { label: 'Linked leads', value: metrics?.linkedLeads ?? 0, icon: 'i-lucide-link-2' },
    { label: 'Unmatched submissions', value: metrics?.unmatchedSubmissions ?? 0, icon: 'i-lucide-unlink' },
    { label: 'Open reviews', value: metrics?.openCases ?? 0, icon: 'i-lucide-shield-question' }
  ]
})

function dateTime(value: string) {
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function badgeColor(statusValue: string): 'success' | 'neutral' | 'primary' | 'warning' {
  if (statusValue === 'applied') return 'success'
  if (statusValue === 'rejected' || statusValue === 'rolled_back') return 'neutral'
  if (statusValue === 'approved') return 'primary'
  return 'warning'
}
</script>

<template>
  <div class="w-full space-y-6 p-4 sm:p-6 lg:p-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.18em] text-muted">
          Persona governance
        </p>
        <h1 class="mt-1 text-2xl font-semibold tracking-tight">
          Identity reconciliation
        </h1>
        <p class="mt-2 max-w-3xl text-sm text-muted">
          Deterministic identity coverage, unresolved submissions and governed
          merge or split decisions. Raw evidence is never rewritten.
        </p>
      </div>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="outline"
        :loading="status === 'pending'"
        @click="refresh()"
      >
        Refresh
      </UButton>
    </div>

    <UAlert
      v-if="error"
      color="error"
      icon="i-lucide-circle-alert"
      title="Identity reconciliation is unavailable"
      :description="error.message"
    />

    <UAlert
      v-else-if="data && !data.enabled"
      color="neutral"
      icon="i-lucide-lock-keyhole"
      title="Full CRM is required"
      description="Identity reconciliation is available when the client's full CRM plan is enabled."
    />

    <template v-else>
      <UAlert
        :color="data?.healthy ? 'success' : 'warning'"
        :icon="data?.healthy ? 'i-lucide-shield-check' : 'i-lucide-triangle-alert'"
        :title="data?.healthy ? 'Identity pipeline is reconciled' : 'Identity review is required'"
        :description="data?.healthy
          ? 'No unresolved lead, submission or identity-case gaps were detected.'
          : 'Review the coverage gaps and open cases below before activating audiences.'"
      />

      <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <UCard v-for="card in cards" :key="card.label">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-muted">
                {{ card.label }}
              </p>
              <p class="mt-2 text-3xl font-semibold">
                {{ card.value.toLocaleString() }}
              </p>
            </div>
            <UIcon :name="card.icon" class="size-5 text-primary" />
          </div>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-2">
        <UCard>
          <template #header>
            <div>
              <h2 class="font-medium">Coverage gaps</h2>
              <p class="mt-1 text-xs text-muted">Current tenant-scoped reconciliation counts.</p>
            </div>
          </template>
          <div class="divide-y divide-default">
            <div class="flex justify-between gap-4 py-3">
              <span class="text-sm text-muted">Confirmed leads without identity</span>
              <span class="font-medium">{{ data?.metrics?.leadsWithoutIdentity ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-4 py-3">
              <span class="text-sm text-muted">Anonymous behavioural signals</span>
              <span class="font-medium">{{ data?.metrics?.anonymousSignals ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-4 py-3">
              <span class="text-sm text-muted">Consent records awaiting identity</span>
              <span class="font-medium">{{ data?.metrics?.unlinkedConsent ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-4 py-3">
              <span class="text-sm text-muted">Identity conflict evidence</span>
              <span class="font-medium">{{ data?.metrics?.conflictEvidence ?? 0 }}</span>
            </div>
            <div class="flex justify-between gap-4 py-3">
              <span class="text-sm text-muted">Applied governed resolutions</span>
              <span class="font-medium">{{ data?.metrics?.appliedResolutions ?? 0 }}</span>
            </div>
          </div>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h2 class="font-medium">Resolution cases</h2>
              <p class="mt-1 text-xs text-muted">Read-only client evidence; agency owners govern changes.</p>
            </div>
          </template>
          <div v-if="data?.cases.length" class="space-y-3">
            <div
              v-for="identityCase in data.cases"
              :key="identityCase.id"
              class="rounded-xl border border-default p-4"
            >
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium">{{ identityCase.title }}</p>
                  <p class="mt-1 text-xs text-muted">{{ identityCase.reason }}</p>
                </div>
                <div class="flex gap-2">
                  <UBadge color="neutral" variant="subtle">{{ identityCase.caseType }}</UBadge>
                  <UBadge :color="badgeColor(identityCase.status)" variant="subtle">
                    {{ identityCase.status.replaceAll('_', ' ') }}
                  </UBadge>
                </div>
              </div>
              <p class="mt-3 text-xs text-muted">{{ dateTime(identityCase.createdAt) }}</p>
            </div>
          </div>
          <div v-else class="grid min-h-40 place-items-center text-center">
            <div>
              <UIcon name="i-lucide-shield-check" class="mx-auto size-6 text-success" />
              <p class="mt-2 text-sm font-medium">No identity cases</p>
              <p class="mt-1 text-xs text-muted">No governed merge, split or conflict reviews are open.</p>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </div>
</template>
