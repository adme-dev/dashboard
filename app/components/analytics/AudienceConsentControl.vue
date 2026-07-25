<script setup lang="ts">
type ConsentState = 'granted' | 'denied' | 'unknown'
type Destination = 'google_ads' | 'meta' | 'all'

type ConsentControlResponse = {
  generatedAt: string
  canManage: boolean
  summary: {
    recordedProfiles: number
    grantedProfiles: number
    deniedProfiles: number
    unknownProfiles: number
    activeSuppressions: number
    googleSuppressions: number
    metaSuppressions: number
    allProviderSuppressions: number
  }
  decisions: Array<{
    profileId: string | null
    subjectReference: string
    marketing: ConsentState
    analytics: ConsentState
    tracking: ConsentState
    consentSource: string
    policyVersion: string
    noticeUrl: string | null
    decisionMethod: string
    occurredAt: string
  }>
  suppressions: Array<{
    id: string
    profileId: string | null
    subjectReference: string | null
    purpose: string
    channel: string
    destination: Destination
    reasonCode: string
    sourceType: string
    actorType: string
    occurredAt: string
  }>
}

const apiFetch = $fetch as (request: string, options?: Record<string, any>) => Promise<any>
const data = ref<ConsentControlResponse | null>(null)
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const message = ref('')
const selectedProfile = ref<{ profileId: string, subjectReference: string } | null>(null)
const destination = ref<Destination>('all')
const reasonCode = ref('client_request')
const reason = ref('')

const destinationOptions = [
  { value: 'all', label: 'All advertising providers' },
  { value: 'google_ads', label: 'Google Ads only' },
  { value: 'meta', label: 'Meta only' },
]
const reasonOptions = [
  { value: 'client_request', label: 'Client request' },
  { value: 'privacy_request', label: 'Privacy request' },
  { value: 'incorrect_consent', label: 'Consent record disputed' },
  { value: 'legal_hold', label: 'Legal or compliance hold' },
]

const formatNumber = (value: number) => new Intl.NumberFormat('en-AU').format(value || 0)
const formatDate = (value: string) => new Intl.DateTimeFormat('en-AU', {
  dateStyle: 'medium',
  timeStyle: 'short',
}).format(new Date(value))
const statusColor = (value: ConsentState) => value === 'granted'
  ? 'success'
  : value === 'denied'
    ? 'error'
    : 'neutral'

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    data.value = await apiFetch('/api/portal/analytics/audiences/consent-control', {
      credentials: 'include',
    }) as ConsentControlResponse
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Consent controls are unavailable'
  } finally {
    loading.value = false
  }
}

function beginSuppression(decision: ConsentControlResponse['decisions'][number]) {
  if (!decision.profileId) return
  selectedProfile.value = {
    profileId: decision.profileId,
    subjectReference: decision.subjectReference,
  }
  destination.value = 'all'
  reasonCode.value = 'client_request'
  reason.value = ''
  error.value = ''
}

async function saveSuppression() {
  if (!selectedProfile.value || reason.value.trim().length < 3) {
    error.value = 'Add a reason of at least three characters.'
    return
  }
  saving.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/portal/analytics/audiences/consent-control', {
      method: 'PUT',
      credentials: 'include',
      body: {
        action: 'suppress',
        profileId: selectedProfile.value.profileId,
        destination: destination.value,
        reasonCode: reasonCode.value,
        reason: reason.value.trim(),
      },
    })
    message.value = response.message
    selectedProfile.value = null
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Suppression could not be recorded'
  } finally {
    saving.value = false
  }
}

async function releaseSuppression(suppressionId: string) {
  const releaseReason = window.prompt('Reason for releasing this suppression')
  if (!releaseReason || releaseReason.trim().length < 3) return

  saving.value = true
  error.value = ''
  try {
    const response = await apiFetch('/api/portal/analytics/audiences/consent-control', {
      method: 'PUT',
      credentials: 'include',
      body: {
        action: 'release',
        suppressionId,
        reason: releaseReason.trim(),
      },
    })
    message.value = response.message
    await refresh()
  } catch (cause: any) {
    error.value = cause?.data?.statusMessage || cause?.message || 'Suppression could not be released'
  } finally {
    saving.value = false
  }
}

onMounted(refresh)
</script>

<template>
  <section class="space-y-4">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 class="text-lg font-semibold text-default">Consent ledger & suppression</h2>
        <p class="mt-1 text-sm text-muted">
          Person-level consent and opt-outs are enforced independently of provider authorization.
        </p>
      </div>
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

    <UAlert
      v-if="error"
      color="error"
      variant="subtle"
      icon="i-lucide-circle-alert"
      :description="error"
    />
    <UAlert
      v-if="message"
      color="success"
      variant="subtle"
      icon="i-lucide-circle-check"
      :description="message"
      :close="{ onClick: () => { message = '' } }"
    />

    <template v-if="data">
      <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UCard>
          <p class="text-xs text-muted">Consent profiles</p>
          <p class="mt-2 text-2xl font-semibold text-highlighted">{{ formatNumber(data.summary.recordedProfiles) }}</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Marketing granted</p>
          <p class="mt-2 text-2xl font-semibold text-emerald-500">{{ formatNumber(data.summary.grantedProfiles) }}</p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Denied or unknown</p>
          <p class="mt-2 text-2xl font-semibold text-amber-500">
            {{ formatNumber(data.summary.deniedProfiles + data.summary.unknownProfiles) }}
          </p>
        </UCard>
        <UCard>
          <p class="text-xs text-muted">Active ad suppressions</p>
          <p class="mt-2 text-2xl font-semibold text-rose-500">{{ formatNumber(data.summary.activeSuppressions) }}</p>
        </UCard>
      </div>

      <div class="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
        <UCard>
          <template #header>
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Current consent decisions</h3>
              <p class="mt-1 text-xs text-muted">Pseudonymous references only; raw customer identifiers are not exposed.</p>
            </div>
          </template>
          <div v-if="data.decisions.length" class="divide-y divide-default">
            <div
              v-for="decision in data.decisions"
              :key="`${decision.subjectReference}:${decision.occurredAt}`"
              class="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <div class="min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">Profile •••{{ decision.subjectReference }}</p>
                <p class="mt-1 text-xs text-muted">
                  {{ decision.consentSource }} · {{ decision.policyVersion }} · {{ formatDate(decision.occurredAt) }}
                </p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <UBadge :color="statusColor(decision.marketing)" variant="subtle">
                  Marketing {{ decision.marketing }}
                </UBadge>
                <UButton
                  v-if="data.canManage && decision.profileId"
                  type="button"
                  color="error"
                  variant="ghost"
                  size="xs"
                  @click="beginSuppression(decision)"
                >
                  Suppress ads
                </UButton>
              </div>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No consent decisions have been recorded.</p>
        </UCard>

        <UCard>
          <template #header>
            <div>
              <h3 class="text-sm font-semibold text-highlighted">Active suppressions</h3>
              <p class="mt-1 text-xs text-muted">Suppressed profiles cannot be added during audience synchronization.</p>
            </div>
          </template>
          <div v-if="data.suppressions.length" class="space-y-3">
            <div
              v-for="suppression in data.suppressions"
              :key="suppression.id"
              class="rounded-lg border border-default bg-elevated/40 p-3"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    {{ suppression.destination === 'all' ? 'All providers' : suppression.destination === 'google_ads' ? 'Google Ads' : 'Meta' }}
                  </p>
                  <p class="mt-1 text-xs text-muted">
                    {{ suppression.reasonCode.replaceAll('_', ' ') }} · {{ formatDate(suppression.occurredAt) }}
                  </p>
                </div>
                <UButton
                  v-if="data.canManage"
                  type="button"
                  color="neutral"
                  variant="ghost"
                  size="xs"
                  :loading="saving"
                  @click="releaseSuppression(suppression.id)"
                >
                  Release
                </UButton>
              </div>
            </div>
          </div>
          <p v-else class="py-8 text-center text-sm text-muted">No active advertising suppressions.</p>
        </UCard>
      </div>
    </template>

    <UModal
      :open="Boolean(selectedProfile)"
      title="Suppress advertising use"
      description="This creates an append-only suppression event. Provider removals occur through audience reconciliation."
      @update:open="value => { if (!value) selectedProfile = null }"
    >
      <template #body>
        <div class="space-y-4">
          <UAlert
            color="warning"
            variant="subtle"
            icon="i-lucide-shield-alert"
            :description="selectedProfile ? `Profile reference •••${selectedProfile.subjectReference}` : ''"
          />
          <UFormField label="Destination">
            <select v-model="destination" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted">
              <option v-for="option in destinationOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Reason category">
            <select v-model="reasonCode" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm text-highlighted">
              <option v-for="option in reasonOptions" :key="option.value" :value="option.value">
                {{ option.label }}
              </option>
            </select>
          </UFormField>
          <UFormField label="Audit reason">
            <UTextarea v-model="reason" class="w-full" placeholder="Required for the consent audit trail" />
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton type="button" color="neutral" variant="ghost" @click="selectedProfile = null">Cancel</UButton>
          <UButton type="button" color="error" :loading="saving" @click="saveSuppression">Confirm suppression</UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>

