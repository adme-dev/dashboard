<script setup lang="ts">
type IdentityHealthResponse = {
  generatedAt: string
  status: 'healthy' | 'attention' | 'action_required'
  healthy: boolean
  metrics: {
    profiles: number
    identityKeys: number
    linkedLeads: number
    leadsWithoutIdentity: number
    anonymousSignals: number
    unlinkedConsent: number
    unmatchedSubmissions: number
    openCases: number
    highRiskCases: number
    appliedResolutions: number
    leadLinkageRate: number
    consentLinkageRate: number
  }
  recommendations: Array<{ code: string, message: string }>
  governance: {
    deterministicMatching: boolean
    twoPersonApproval: boolean
    versionedResolutions: boolean
    rollbackSupported: boolean
    clientMergeAccess: boolean
  }
}

const apiFetch = $fetch as (request: string, options?: Record<string, any>) => Promise<any>
const data = ref<IdentityHealthResponse | null>(null)
const loading = ref(false)
const error = ref('')

const formatNumber = (value: number) => new Intl.NumberFormat('en-AU').format(value || 0)
const statusLabel = computed(() => data.value?.status === 'action_required'
  ? 'Action required'
  : data.value?.status === 'attention'
    ? 'Needs attention'
    : 'Healthy')
const statusColor = computed(() => data.value?.status === 'action_required'
  ? 'error'
  : data.value?.status === 'attention'
    ? 'warning'
    : 'success')

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch('/api/portal/analytics/audiences/identity-health', {
      credentials: 'include',
    }) as IdentityHealthResponse
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Identity health is unavailable'
  } finally {
    loading.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-default">Identity resolution health</h2>
        <p class="mt-1 text-sm text-muted">
          Deterministic linkage joins website behaviour, consent, leads and CRM outcomes without exposing customer identifiers.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <UBadge v-if="data" :color="statusColor" variant="subtle">{{ statusLabel }}</UBadge>
        <UButton
          type="button"
          color="neutral"
          variant="ghost"
          size="sm"
          icon="i-lucide-refresh-cw"
          :loading="loading"
          @click="refresh"
        >
          Refresh
        </UButton>
      </div>
    </div>

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />

    <template v-if="data">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard>
          <p class="text-xs text-muted">Canonical profiles</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ formatNumber(data.metrics.profiles) }}</p>
          <p class="mt-1 text-xs text-muted">{{ formatNumber(data.metrics.identityKeys) }} deterministic keys</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Lead linkage</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ data.metrics.leadLinkageRate.toFixed(1) }}%</p>
          <p class="mt-1 text-xs text-muted">{{ formatNumber(data.metrics.leadsWithoutIdentity) }} unlinked</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Consent linkage</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ data.metrics.consentLinkageRate.toFixed(1) }}%</p>
          <p class="mt-1 text-xs text-muted">{{ formatNumber(data.metrics.unlinkedConsent) }} anonymous decisions</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Resolution cases</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ formatNumber(data.metrics.openCases) }}</p>
          <p class="mt-1 text-xs text-muted">{{ formatNumber(data.metrics.highRiskCases) }} high risk</p>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <UCard>
          <template #header>
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Reconciliation attention</h3>
              <p class="mt-1 text-xs text-muted">Agency operators resolve identity conflicts under controlled approval.</p>
            </div>
          </template>
          <div v-if="data.recommendations.length" class="space-y-2">
            <UAlert
              v-for="recommendation in data.recommendations"
              :key="recommendation.code"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              :description="recommendation.message"
            />
          </div>
          <UAlert
            v-else
            color="success"
            variant="subtle"
            icon="i-lucide-circle-check"
            description="No unresolved identity reconciliation issues are currently detected."
          />
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Resolution safeguards</h3>
              <p class="mt-1 text-xs text-muted">Clients receive health visibility; profile merges remain agency-controlled.</p>
            </div>
          </template>
          <div class="space-y-3 text-sm">
            <div class="flex items-center justify-between gap-4">
              <span class="text-muted">Deterministic matching</span>
              <UBadge color="success" variant="subtle">Enabled</UBadge>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-muted">Two-person approval</span>
              <UBadge color="success" variant="subtle">Required</UBadge>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-muted">Versioned merge and split</span>
              <UBadge color="success" variant="subtle">Audited</UBadge>
            </div>
            <div class="flex items-center justify-between gap-4">
              <span class="text-muted">Rollback</span>
              <UBadge color="success" variant="subtle">Available</UBadge>
            </div>
          </div>
        </UCard>
      </div>
    </template>
  </section>
</template>

