<script setup lang="ts">
import { computed, ref } from 'vue'
import ClientMeasurementActivationControls from '~/components/clients/ClientMeasurementActivationControls.vue'
import type {
  ClientMeasurementProfile,
  MeasurementAuditEntry,
  MeasurementCallSummary,
  MeasurementCapability,
  MeasurementCapabilityStatus,
  MeasurementDestination,
  MeasurementFreshnessResponse,
  MeasurementReconciliationResponse,
  MeasurementReadinessStatus,
  MeasurementReadinessSummary,
  PaginatedMeasurementResponse
} from '~/types/measurement'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'
import {
  CAPABILITY_DEFINITIONS,
  isAttestationOnly,
  PLATFORM_LABELS
} from '~~/shared/utils/measurementPlatform'

const props = defineProps<{
  clientId: string
  clientName?: string
  canConfigure?: boolean
  canOwnerOverride?: boolean
}>()

type AttestationStatus = 'ready' | 'degraded' | 'blocked'

interface AttestationResponse {
  healthStatus: string
  capabilities: Array<{ mode: string, status: AttestationStatus, blockingReason: string | null }>
}

interface ClassifiedGoogleConversionAction {
  id: string
  resourceName: string
  name: string
  status: string
  type: string
  category: string
  origin: string
  deliveryClass: string
  managementOwner: string
  primaryState: string
  goalBiddability: string
  mappingState: string
  providerSyncedAt: string
  lastEvidenceAt: string | null
  recentActivity: null | {
    window: string
    allConversions: number
    state: 'observed' | 'zero'
  }
}

const toast = useToast()
const apiFetch = $fetch as <T>(request: string) => Promise<T>
const apiPost = $fetch as <T>(
  request: string,
  options: { method: 'POST', body: Record<string, unknown> }
) => Promise<T>
const profile = ref<ClientMeasurementProfile | null>(null)
const readiness = ref<MeasurementReadinessSummary | null>(null)
const destinations = ref<MeasurementDestination[]>([])
const auditEntries = ref<MeasurementAuditEntry[]>([])
const reconciliation = ref<MeasurementReconciliationResponse | null>(null)
const freshness = ref<MeasurementFreshnessResponse | null>(null)
const callSummary = ref<MeasurementCallSummary | null>(null)
const conversionActions = ref<ClassifiedGoogleConversionAction[]>([])
const accountSearch = ref(props.clientName ?? '')
const pending = ref(true)
const loadError = ref<string | null>(null)
const showDestinationEditor = ref(false)
const testingDestinationId = ref<string | null>(null)
const readinessUnavailable = ref(false)
const destinationsUnavailable = ref(false)
const auditUnavailable = ref(false)
const operationsUnavailable = ref(false)
const operationNotice = ref<{ tone: 'success' | 'warning', message: string } | null>(null)

const titleCase = (value: string) => value
  .replaceAll('_', ' ')
  .replace(/\b\w/g, character => character.toUpperCase())

const collectionTierLabels: Record<ClientMeasurementProfile['collectionTier'], string> = {
  cloudflare_owned: 'Cloudflare owned',
  first_party_cname: 'First-party hostname',
  shared_endpoint: 'Shared endpoint',
  backend_only: 'Backend only'
}

const consentLabels: Record<ClientMeasurementProfile['consentMode'], string> = {
  off: 'Consent off',
  au_optout: 'Australian opt-out',
  consent_gated: 'Consent gated'
}

const outcomeAuthorityLabels: Record<ClientMeasurementProfile['outcomeAuthority'], string> = {
  zero_native: 'Zero CRM',
  client_webhook: 'Client webhook',
  connector_sync: 'Connector sync',
  manual_import: 'Manual import'
}

const lifecycleLabels: Record<ClientMeasurementProfile['nativeLifecycleMode'], string> = {
  crm_preferred: 'CRM preferred',
  leads_only: 'Lead intake only'
}

const portalOutcomeLabels: Record<ClientMeasurementProfile['portalOutcomeMode'], string> = {
  disabled: 'Disabled',
  propose: 'Client proposes outcomes',
  authoritative: 'Client outcomes are authoritative'
}

const capabilityDefinitionByMode = new Map(
  Object.values(CAPABILITY_DEFINITIONS)
    .flat()
    .map(definition => [definition.mode, definition] as const)
)

const originLabels: Record<string, string> = {
  zero: 'Managed by Zero',
  gtm: 'Managed in Google Tag Manager',
  partner: 'Partner managed',
  external: 'Externally managed'
}

const profileState = computed(() => {
  if (!profile.value?.enabled) return 'Dormant'
  if (profile.value.environment === 'paused') return 'Paused'
  return profile.value.environment === 'live' ? 'Live' : 'Test enabled'
})

function statusColor(status: MeasurementCapabilityStatus | MeasurementReadinessStatus) {
  if (status === 'ready') return 'success' as const
  if (status === 'degraded' || status === 'validating' || status === 'onboarding') return 'warning' as const
  if (status === 'blocked') return 'error' as const
  if (status === 'configured' || status === 'detected') return 'info' as const
  return 'neutral' as const
}

function operationStatusColor(status: string) {
  if (['fresh', 'delivered', 'provider_accepted', 'healthy'].includes(status)) return 'success' as const
  if (['stale', 'syncing', 'pending', 'provider_reporting_pending', 'success_empty'].includes(status)) return 'warning' as const
  if (['failed', 'destination_not_configured', 'consent_denied'].includes(status)) return 'error' as const
  return 'neutral' as const
}

function callWindow() {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 30)
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10)
  }
}

function formatDateTime(value: string | null) {
  if (!value) return 'No evidence yet'
  return new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value))
}

function credentialSourceLabel(destination: MeasurementDestination) {
  if (destination.credentialConfigured) return 'Credential reference configured'
  if (destination.socialConnectionId) return 'Connected account linked'
  return 'No credential source configured'
}

function capabilityLabel(mode: string) {
  return capabilityDefinitionByMode.get(mode)?.label ?? titleCase(mode)
}

function capabilityDescription(mode: string) {
  return capabilityDefinitionByMode.get(mode)?.description ?? ''
}

/**
 * How a capability earns its ready status. A provider test can only prove what the
 * provider itself observes, so browser tags are only ever proven by an operator.
 */
function capabilityAssurance(mode: string) {
  return isAttestationOnly(mode)
    ? { label: 'Requires operator attestation', icon: 'i-lucide-user-check' }
    : { label: 'Verified by provider test', icon: 'i-lucide-flask-conical' }
}

function readyCapabilityCount(destination: MeasurementDestination) {
  return destination.capabilities.filter(capability => capability.status === 'ready').length
}

function outstandingCapabilities(destination: MeasurementDestination) {
  return destination.capabilities.filter(capability => capability.status !== 'ready')
}

function destinationIsLive(destination: MeasurementDestination) {
  return destination.enabled && destination.environment === 'live'
}

function canAttestCapability(capability: MeasurementCapability) {
  // Deliberately does not require `status !== 'ready'`: a ready capability still
  // has to be attestable so an operator can report a tag going missing (e.g. a
  // Meta Pixel removed from GTM) and downgrade a live destination. Server-side
  // force/warning handling already exists for exactly this case.
  return isAttestationOnly(capability.mode)
}

function mappingIdentityLabel(
  destination: MeasurementDestination,
  canonicalEventName: string
) {
  return classifyMeasurementEventIdentity(
    canonicalEventName,
    destination.capabilities.map(capability => capability.mode)
  ).label
}

function measurementErrorMessage(
  error: unknown,
  fallback = 'Measurement configuration could not be loaded'
) {
  const candidate = error as {
    data?: { statusMessage?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
  } | null

  return candidate?.data?.error?.message
    || candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || fallback
}

function measurementErrorStatus(error: unknown) {
  const candidate = error as { statusCode?: number, data?: { statusCode?: number } } | null
  return candidate?.statusCode ?? candidate?.data?.statusCode ?? null
}

async function refreshMeasurement() {
  pending.value = true
  loadError.value = null
  readinessUnavailable.value = false
  destinationsUnavailable.value = false
  auditUnavailable.value = false
  operationsUnavailable.value = false

  const basePath = `/api/agency/measurement/clients/${props.clientId}`
  const accountQuery = accountSearch.value.trim()
    ? `?accountQuery=${encodeURIComponent(accountSearch.value.trim())}`
    : ''
  const calls = callWindow()
  const [
    profileResult,
    readinessResult,
    destinationResult,
    auditResult,
    reconciliationResult,
    freshnessResult,
    callResult
  ] = await Promise.allSettled([
    apiFetch<{ profile: ClientMeasurementProfile }>(basePath),
    apiFetch<MeasurementReadinessSummary>(`${basePath}/readiness`),
    apiFetch<PaginatedMeasurementResponse<MeasurementDestination>>(`${basePath}/destinations`),
    apiFetch<PaginatedMeasurementResponse<MeasurementAuditEntry>>(`${basePath}/audit`),
    apiFetch<MeasurementReconciliationResponse>(`${basePath}/reconciliation${accountQuery}`),
    apiFetch<MeasurementFreshnessResponse>(`${basePath}/freshness`),
    apiFetch<MeasurementCallSummary>(
      `/api/agency/analytics/google-calls?startDate=${calls.startDate}&endDate=${calls.endDate}&clientId=${props.clientId}`
    )
  ])

  if (profileResult.status === 'fulfilled') {
    profile.value = profileResult.value.profile
  } else {
    profile.value = null
    loadError.value = measurementErrorMessage(profileResult.reason)
  }

  if (readinessResult.status === 'fulfilled') {
    readiness.value = readinessResult.value
  } else {
    readiness.value = null
    readinessUnavailable.value = true
  }

  if (destinationResult.status === 'fulfilled') {
    destinations.value = destinationResult.value.items
  } else {
    destinations.value = []
    destinationsUnavailable.value = true
  }

  if (auditResult.status === 'fulfilled') {
    auditEntries.value = auditResult.value.items
  } else {
    auditEntries.value = []
    auditUnavailable.value = true
  }

  reconciliation.value = reconciliationResult.status === 'fulfilled'
    ? reconciliationResult.value
    : null
  freshness.value = freshnessResult.status === 'fulfilled' ? freshnessResult.value : null
  callSummary.value = callResult.status === 'fulfilled' ? callResult.value : null
  operationsUnavailable.value = [reconciliationResult, freshnessResult, callResult]
    .some(result => result.status === 'rejected')

  conversionActions.value = []
  const resolvedConnectionId = reconciliation.value?.accountResolution?.status === 'resolved'
    ? reconciliation.value.accountResolution.accounts?.[0]?.connectionId
    : null
  if (resolvedConnectionId) {
    try {
      const registry = await apiFetch<{ items: ClassifiedGoogleConversionAction[] }>(
        `${basePath}/google-conversion-actions?connectionId=${encodeURIComponent(resolvedConnectionId)}&mode=registry&page=1&pageSize=100`
      )
      conversionActions.value = registry.items
    } catch {
      operationsUnavailable.value = true
    }
  }

  pending.value = false
}

function applyAccountSearch() {
  void refreshMeasurement()
}

function mutationNotice(warnings: Array<{ code: string }>) {
  if (warnings.some(warning => warning.code === 'MEASUREMENT_CACHE_STALE')) {
    return {
      tone: 'warning' as const,
      message: 'Saved in Zero; edge publication needs attention.'
    }
  }

  return {
    tone: 'success' as const,
    message: 'Configuration saved in Zero.'
  }
}

async function handleProfileSaved(result: { warnings: Array<{ code: string }> }) {
  operationNotice.value = mutationNotice(result.warnings)
  await refreshMeasurement()
}

async function handleDestinationSaved(result: { warnings: Array<{ code: string }> }) {
  operationNotice.value = mutationNotice(result.warnings)
  showDestinationEditor.value = false
  await refreshMeasurement()
}

function handleProviderTestCompleted() {
  operationNotice.value = {
    tone: 'success',
    message: 'Provider test evidence recorded in Zero.'
  }
}

function openDestinationEditor() {
  showDestinationEditor.value = true
}

function toggleProviderTest(destinationId: string) {
  testingDestinationId.value = testingDestinationId.value === destinationId
    ? null
    : destinationId
}

const attestTarget = ref<{
  destination: MeasurementDestination
  capability: MeasurementCapability
} | null>(null)
const attestOpen = ref(false)
const attestStatus = ref<AttestationStatus>('ready')
const attestBlockingReason = ref('')
const attestReason = ref('')
const attestConfirmed = ref(false)
const attestForce = ref(false)
const attestPending = ref(false)
const attestError = ref<string | null>(null)

const attestStatusOptions: Array<{ value: AttestationStatus, label: string }> = [
  { value: 'ready', label: 'Ready — the tag is in place and sending' },
  { value: 'degraded', label: 'Degraded — sending, but not completely' },
  { value: 'blocked', label: 'Blocked — not sending at all' }
]

// Attesting `blocked` is the one path that can take a live destination down, so
// the server keeps it behind an explicit force. Anything else is a safe record.
const attestStopsLiveDelivery = computed(() => Boolean(
  attestTarget.value
  && destinationIsLive(attestTarget.value.destination)
  && attestStatus.value === 'blocked'
))

const canSubmitAttestation = computed(() => Boolean(
  attestTarget.value
  && !attestPending.value
  && attestReason.value.trim()
  && attestConfirmed.value
  && (attestStatus.value === 'ready' || attestBlockingReason.value.trim())
))

function openAttestation(destination: MeasurementDestination, capability: MeasurementCapability) {
  attestTarget.value = { destination, capability }
  attestStatus.value = 'ready'
  attestBlockingReason.value = ''
  attestReason.value = ''
  attestConfirmed.value = false
  attestForce.value = false
  attestError.value = null
  attestOpen.value = true
}

function setAttestOpen(open: boolean) {
  if (open) return
  attestOpen.value = false
  attestTarget.value = null
}

async function submitAttestation() {
  const target = attestTarget.value
  if (!target || !canSubmitAttestation.value) return

  const status = attestStatus.value
  const force = attestStopsLiveDelivery.value && attestForce.value
  attestPending.value = true
  attestError.value = null

  try {
    const response = await apiPost<AttestationResponse>(
      `/api/agency/measurement/clients/${props.clientId}/destinations/${target.destination.id}/attest`,
      {
        method: 'POST',
        body: {
          expectedConfigVersion: target.destination.configVersion,
          capabilities: [{
            mode: target.capability.mode,
            status,
            blockingReason: status === 'ready' ? null : attestBlockingReason.value.trim()
          }],
          reason: attestReason.value.trim(),
          confirmed: true,
          force
        }
      }
    )

    // The server silently downgrades an unforced `blocked` on a live destination.
    // Report what was actually recorded, not what was asked for.
    const recorded = response.capabilities?.[0]?.status ?? status
    const label = capabilityLabel(target.capability.mode)
    toast.add({
      title: 'Attestation recorded',
      description: recorded === status
        ? `${label} is now ${recorded}. Destination health is ${titleCase(response.healthStatus)}.`
        : `${label} was recorded as ${recorded}, not ${status}, because live delivery was not forced. Destination health is ${titleCase(response.healthStatus)}.`,
      color: recorded === status ? 'success' : 'warning'
    })
    setAttestOpen(false)
    await refreshMeasurement()
  } catch (error) {
    const message = measurementErrorStatus(error) === 409
      ? 'The configuration changed while this was open. Reload the page and attest again.'
      : measurementErrorMessage(error, 'Attestation could not be recorded')
    attestError.value = message
    toast.add({ title: 'Attestation not recorded', description: message, color: 'error' })
  } finally {
    attestPending.value = false
  }
}

async function handleActivationCompleted(result: {
  kind: 'privacy' | 'live' | 'owner_override' | 'activation'
  warnings: Array<{ code: string }>
}) {
  if (result.kind === 'activation') {
    operationNotice.value = mutationNotice(result.warnings)
    operationNotice.value.message = result.warnings.length
      ? 'Live delivery activated in Zero; edge publication needs attention.'
      : 'Live delivery activated in Zero.'
  } else {
    operationNotice.value = {
      tone: 'success',
      message: result.kind === 'privacy'
        ? 'Privacy approval recorded for the current configuration.'
        : result.kind === 'owner_override'
          ? 'Audited owner override recorded for the current configuration.'
          : 'Live approval recorded for the current configuration.'
    }
  }
  await refreshMeasurement()
}

void refreshMeasurement()
</script>

<template>
  <section class="space-y-6" data-testid="client-measurement-panel">
    <div class="overflow-hidden rounded-xl border border-default bg-default shadow-xs">
      <div class="border-b border-default bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-5 py-5 sm:px-6">
        <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div class="max-w-3xl">
            <div class="mb-2 flex items-center gap-2 text-sm font-medium text-primary">
              <UIcon name="i-lucide-activity" class="size-4" />
              Measurement signal hub
            </div>
            <h2 class="text-xl font-semibold text-highlighted">
              Configuration and delivery health
            </h2>
            <p class="mt-1 text-sm leading-6 text-muted">
              Zero is the canonical configuration and delivery-health source. Provider tools remain evidence sources; external web and GTM ownership is shown separately from Zero CRM delivery.
            </p>
          </div>

          <div v-if="profile" class="flex flex-wrap items-center gap-2">
            <UButton
              v-if="canConfigure"
              :to="`/agency/tracking?clientId=${clientId}`"
              size="sm"
              color="neutral"
              variant="soft"
              icon="i-lucide-container"
              label="Site tracking & GTM"
            />
            <UBadge :color="profile.enabled ? 'success' : 'neutral'" variant="subtle">
              {{ profileState }}
            </UBadge>
            <UBadge v-if="readiness" :color="statusColor(readiness.status)" variant="subtle">
              {{ titleCase(readiness.status) }}
            </UBadge>
            <UBadge v-if="readiness" :color="readiness.liveEligible ? 'success' : 'warning'" variant="outline">
              {{ readiness.liveEligible ? 'Eligible for live delivery' : 'Not eligible for live delivery' }}
            </UBadge>
            <UBadge v-else color="warning" variant="outline">
              Readiness unavailable
            </UBadge>
          </div>
        </div>
      </div>

      <div v-if="pending" class="grid gap-4 p-6 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        <div v-for="index in 4" :key="index" class="h-20 animate-pulse rounded-lg bg-elevated" />
      </div>

      <div v-else-if="loadError" class="p-6">
        <div class="flex flex-col gap-4 rounded-lg border border-error/30 bg-error/5 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="font-medium text-error">
              Measurement data unavailable
            </p>
            <p class="mt-1 text-sm text-muted">
              {{ loadError }}
            </p>
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Try again"
            color="neutral"
            variant="outline"
            @click="refreshMeasurement"
          />
        </div>
      </div>

      <div v-else-if="profile" class="p-5 sm:p-6">
        <dl class="grid gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">
              Collection
            </dt>
            <dd class="mt-1 text-sm font-medium text-highlighted">
              {{ collectionTierLabels[profile.collectionTier] }}
            </dd>
            <p class="mt-1 text-xs text-muted">
              {{ profile.firstPartyHostname || 'No first-party hostname required' }}
            </p>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">
              Consent
            </dt>
            <dd class="mt-1 text-sm font-medium text-highlighted">
              {{ consentLabels[profile.consentMode] }}
            </dd>
            <p class="mt-1 text-xs text-muted">
              Hostname: {{ titleCase(profile.hostnameStatus) }}
            </p>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">
              Lifecycle authority
            </dt>
            <dd class="mt-1 text-sm font-medium text-highlighted">
              {{ outcomeAuthorityLabels[profile.outcomeAuthority] }}
            </dd>
            <p class="mt-1 text-xs text-muted">
              {{ lifecycleLabels[profile.nativeLifecycleMode] }}
            </p>
          </div>
          <div>
            <dt class="text-xs font-medium uppercase tracking-wide text-dimmed">
              Portal outcomes
            </dt>
            <dd class="mt-1 text-sm font-medium text-highlighted">
              {{ portalOutcomeLabels[profile.portalOutcomeMode] }}
            </dd>
            <p class="mt-1 text-xs text-muted">
              Config version {{ profile.configVersion }} · Cache {{ titleCase(profile.cacheStatus) }}
            </p>
          </div>
        </dl>
      </div>
    </div>

    <div
      v-if="operationNotice"
      role="status"
      class="rounded-lg border p-4 text-sm"
      :class="operationNotice.tone === 'warning'
        ? 'border-warning/30 bg-warning/5 text-warning'
        : 'border-success/30 bg-success/5 text-success'"
    >
      {{ operationNotice.message }}
    </div>

    <ClientsClientMeasurementProfileForm
      v-if="!pending && !loadError && profile"
      :client-id="clientId"
      :profile="profile"
      :can-configure="canConfigure ?? false"
      @saved="handleProfileSaved"
    />

    <section
      v-if="!pending && !loadError && profile"
      class="space-y-4"
      data-testid="measurement-operations"
    >
      <div>
        <p class="text-xs font-medium uppercase tracking-[0.16em] text-primary">
          Measurement operations
        </p>
        <h3 class="mt-1 text-lg font-semibold text-highlighted">
          Account, evidence, calls and freshness
        </h3>
        <p class="mt-1 text-sm text-muted">
          Each layer keeps its own evidence and timestamp. A click is never presented as a connected call.
        </p>
      </div>

      <UAlert
        v-if="operationsUnavailable"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Some operational evidence is unavailable"
        description="Configuration remains visible. Retry before making measurement or bidding decisions."
      />

      <div class="grid gap-4 lg:grid-cols-2">
        <article class="rounded-xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
                Resolved Google Ads account
              </p>
              <h4 class="mt-1 font-semibold text-highlighted">
                {{ reconciliation?.accountResolution?.status === 'resolved'
                  ? reconciliation.accountResolution.matchedName
                  : 'Account mapping not resolved' }}
              </h4>
            </div>
            <UBadge
              :color="reconciliation?.accountResolution?.status === 'resolved' ? 'success' : 'warning'"
              variant="subtle"
            >
              {{ titleCase(reconciliation?.accountResolution?.status ?? 'unavailable') }}
            </UBadge>
          </div>
          <dl
            v-if="reconciliation?.accountResolution?.accounts?.[0]"
            class="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2"
          >
            <div class="rounded-lg bg-elevated p-3">
              <dt class="text-xs text-muted">
                Operating customer
              </dt>
              <dd class="mt-1 font-mono font-medium text-highlighted">
                {{ reconciliation.accountResolution.accounts[0].operatingCustomerId }}
              </dd>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <dt class="text-xs text-muted">
                Account role
              </dt>
              <dd class="mt-1 font-medium text-highlighted">
                {{ titleCase(reconciliation.accountResolution.accounts[0].accountRole) }}
              </dd>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <dt class="text-xs text-muted">
                Login customer
              </dt>
              <dd class="mt-1 font-mono font-medium text-highlighted">
                {{ reconciliation.accountResolution.accounts[0].loginCustomerId ?? 'Direct login' }}
              </dd>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <dt class="text-xs text-muted">
                Connection
              </dt>
              <dd class="mt-1 break-all font-mono text-xs font-medium text-highlighted">
                {{ reconciliation.accountResolution.accounts[0].connectionId }}
              </dd>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <dt class="text-xs text-muted">
                Resolution basis
              </dt>
              <dd class="mt-1 font-medium text-highlighted">
                {{ titleCase(reconciliation.accountResolution.resolutionKind ?? 'unknown') }} ·
                {{ titleCase(reconciliation.accountResolution.matchKind ?? 'unknown') }}
              </dd>
            </div>
          </dl>
          <form class="mt-4 border-t border-default pt-4" @submit.prevent="applyAccountSearch">
            <UFormField
              label="Dealership or group account"
              help="Use the exact dealership alias. Group aggregation is never assumed."
            >
              <div class="flex flex-col gap-2 sm:flex-row">
                <UInput
                  v-model="accountSearch"
                  data-testid="measurement-account-search"
                  class="w-full"
                  placeholder="e.g. Northern GAC"
                />
                <UButton
                  type="submit"
                  color="neutral"
                  variant="outline"
                  label="Resolve account"
                  :disabled="!accountSearch.trim()"
                />
              </div>
            </UFormField>
          </form>
        </article>

        <article class="rounded-xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
                Telephone evidence · last 30 days
              </p>
              <h4 class="mt-1 font-semibold text-highlighted">
                Four separate layers
              </h4>
            </div>
            <UBadge
              :color="operationStatusColor(callSummary?.health.status ?? 'unavailable')"
              variant="subtle"
            >
              {{ titleCase(callSummary?.health.status ?? 'unavailable') }}
            </UBadge>
          </div>
          <dl class="mt-4 grid grid-cols-2 gap-3">
            <div
              v-for="item in [
                { label: 'Website phone clicks', value: callSummary?.layers.websitePhoneClicks ?? 0 },
                { label: 'Google-hosted interactions', value: callSummary?.layers.googleHostedCallInteractions ?? 0 },
                { label: 'Connected calls', value: callSummary?.layers.connectedCalls ?? 0 },
                { label: 'Qualified calls', value: callSummary?.layers.qualifiedCalls ?? 0 }
              ]"
              :key="item.label"
              class="rounded-lg bg-elevated p-3"
            >
              <dt class="text-xs text-muted">
                {{ item.label }}
              </dt>
              <dd class="mt-1 text-xl font-semibold tabular-nums text-highlighted">
                {{ item.value }}
              </dd>
            </div>
          </dl>
          <p class="mt-3 text-xs text-muted">
            {{ callSummary?.health.outcome ?? 'Call sync status unavailable' }}
          </p>
        </article>
      </div>

      <article class="rounded-xl border border-default bg-default p-5 shadow-xs">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h4 class="font-semibold text-highlighted">
              Classified Google conversion actions
            </h4>
            <p class="mt-1 text-xs text-muted">
              Website tags and Google-hosted interactions are separate delivery paths.
            </p>
          </div>
          <UBadge color="neutral" variant="subtle">
            {{ conversionActions.length }} actions
          </UBadge>
        </div>
        <div v-if="conversionActions.length" class="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            v-for="action in conversionActions"
            :key="action.resourceName"
            class="rounded-lg border border-default bg-elevated/40 p-4"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  {{ action.name }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  {{ titleCase(action.deliveryClass) }} · {{ titleCase(action.managementOwner) }} managed
                </p>
              </div>
              <UBadge :color="action.primaryState === 'primary' ? 'warning' : 'neutral'" variant="subtle">
                {{ titleCase(action.primaryState) }}
              </UBadge>
            </div>
            <dl class="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <dt class="text-dimmed">
                  Provider type
                </dt>
                <dd class="mt-1 text-highlighted">
                  {{ titleCase(action.type) }}
                </dd>
              </div>
              <div>
                <dt class="text-dimmed">
                  Goal biddability
                </dt>
                <dd class="mt-1 text-highlighted">
                  {{ titleCase(action.goalBiddability) }}
                </dd>
              </div>
              <div>
                <dt class="text-dimmed">
                  Mapping
                </dt>
                <dd class="mt-1 text-highlighted">
                  {{ titleCase(action.mappingState) }}
                </dd>
              </div>
              <div>
                <dt class="text-dimmed">
                  Recent provider activity
                </dt>
                <dd class="mt-1 text-highlighted">
                  {{ action.recentActivity
                    ? `${action.recentActivity.allConversions} conversions · ${titleCase(action.recentActivity.window)}`
                    : 'Not requested' }}
                </dd>
              </div>
              <div>
                <dt class="text-dimmed">
                  Last provider sync
                </dt>
                <dd class="mt-1 text-highlighted">
                  {{ formatDateTime(action.providerSyncedAt) }}
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <p v-else class="mt-4 text-sm text-muted">
          No provider actions are available for the resolved account.
        </p>
      </article>

      <article class="rounded-xl border border-default bg-default p-5 shadow-xs">
        <div class="flex items-center justify-between gap-3">
          <h4 class="font-semibold text-highlighted">
            Independent data freshness
          </h4>
          <span class="text-xs text-muted">No shared “last updated” shortcut</span>
        </div>
        <div class="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div
            v-for="stream in freshness?.streams ?? []"
            :key="stream.stream"
            class="rounded-lg border border-default bg-elevated/40 p-3"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-xs font-medium text-highlighted">
                {{ titleCase(stream.stream) }}
              </p>
              <UBadge :color="operationStatusColor(stream.status)" variant="subtle">
                {{ titleCase(stream.status) }}
              </UBadge>
            </div>
            <p class="mt-2 text-xs leading-5 text-muted">
              {{ stream.reason }}
            </p>
            <p class="mt-2 text-xs text-dimmed">
              {{ formatDateTime(stream.lastSuccessAt) }}
            </p>
          </div>
        </div>
      </article>

      <article class="rounded-xl border border-default bg-default p-5 shadow-xs">
        <div class="flex items-center justify-between gap-3">
          <h4 class="font-semibold text-highlighted">
            Website conversion reconciliation
          </h4>
          <span class="text-xs text-muted">Captured → consent → destination → delivery → provider</span>
        </div>
        <div class="mt-4 grid gap-3 lg:grid-cols-2">
          <div
            v-for="item in reconciliation?.reconciliation.items ?? []"
            :key="`${item.identity.canonicalEventName}:${item.identity.enquiryType ?? 'none'}`"
            class="rounded-lg border border-default bg-elevated/40 p-4"
          >
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-highlighted">
                {{ titleCase(item.identity.enquiryType ?? item.identity.canonicalEventName) }}
              </p>
              <UBadge :color="operationStatusColor(item.state)" variant="subtle">
                {{ titleCase(item.state) }}
              </UBadge>
            </div>
            <p class="mt-2 text-xs leading-5 text-muted">
              {{ item.diagnostic }}
            </p>
          </div>
        </div>
      </article>
    </section>

    <div v-if="!pending && !loadError && profile" class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div class="space-y-4">
        <div class="flex items-end justify-between gap-4">
          <div>
            <h3 class="font-semibold text-highlighted">
              Destinations and capabilities
            </h3>
            <p class="mt-1 text-sm text-muted">
              Provider identifiers are visible for mapping; credentials remain redacted.
            </p>
          </div>
          <div class="flex items-center gap-3">
            <span class="text-xs text-muted">{{ destinations.length }} configured</span>
            <UButton
              v-if="canConfigure"
              label="Configure destination"
              icon="i-lucide-plus"
              size="sm"
              variant="outline"
              @click="openDestinationEditor"
            />
          </div>
        </div>

        <ClientsClientMeasurementDestinationEditor
          v-if="showDestinationEditor && profile"
          :client-id="clientId"
          :profile-config-version="profile.configVersion"
          @saved="handleDestinationSaved"
          @cancel="showDestinationEditor = false"
        />

        <div v-if="destinationsUnavailable" role="alert" class="rounded-xl border border-warning/30 bg-warning/5 p-5">
          <p class="font-medium text-warning">
            Destination health unavailable
          </p>
          <p class="mt-1 text-sm text-muted">
            Profile configuration remains available. Retry before making readiness decisions.
          </p>
        </div>

        <div v-else-if="destinations.length" class="space-y-4">
          <article
            v-for="destination in destinations"
            :key="destination.id"
            class="rounded-xl border border-default bg-default p-5 shadow-xs"
          >
            <header class="flex flex-col gap-3 border-b border-default pb-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <h4 class="font-semibold text-highlighted">
                    {{ PLATFORM_LABELS[destination.platform] }}
                  </h4>
                  <UBadge :color="statusColor(destination.healthStatus)" variant="subtle">
                    {{ titleCase(destination.healthStatus) }}
                  </UBadge>
                  <UBadge color="neutral" variant="outline">
                    {{ destination.enabled ? titleCase(destination.environment) : 'Dormant' }}
                  </UBadge>
                </div>
                <p class="mt-1 break-all font-mono text-xs text-muted">
                  {{ destination.externalDestinationId }}
                </p>
              </div>
              <div class="text-left sm:text-right">
                <p class="text-xs font-medium text-highlighted">
                  {{ credentialSourceLabel(destination) }}
                </p>
                <p class="mt-1 text-xs text-muted">
                  Last success: {{ formatDateTime(destination.lastSuccessAt) }}
                </p>
              </div>
            </header>

            <div class="mt-4 grid gap-3 lg:grid-cols-2">
              <div
                v-for="capability in destination.capabilities"
                :key="capability.id"
                class="rounded-lg border border-default bg-elevated/40 p-4"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <p class="text-sm font-medium text-highlighted">
                      {{ capabilityLabel(capability.mode) }}
                    </p>
                    <p class="mt-1 text-xs text-muted">
                      {{ originLabels[capability.managementOrigin] }}
                    </p>
                  </div>
                  <UBadge :color="statusColor(capability.status)" variant="subtle">
                    {{ titleCase(capability.status) }}
                  </UBadge>
                </div>
                <p v-if="capabilityDescription(capability.mode)" class="mt-2 text-xs leading-5 text-muted">
                  {{ capabilityDescription(capability.mode) }}
                </p>
                <p
                  class="mt-2 flex items-center gap-1.5 text-xs font-medium text-dimmed"
                  :data-testid="`capability-assurance-${capability.mode}`"
                >
                  <UIcon :name="capabilityAssurance(capability.mode).icon" class="size-3.5 shrink-0" />
                  {{ capabilityAssurance(capability.mode).label }}
                </p>
                <p class="mt-2 text-xs text-muted">
                  Evidence: {{ formatDateTime(capability.evidenceAt) }}
                </p>
                <p v-if="capability.blockingReason" class="mt-2 text-xs text-error">
                  {{ capability.blockingReason }}
                </p>
                <UButton
                  v-if="canConfigure && canAttestCapability(capability)"
                  class="mt-3"
                  :data-testid="`attest-${capability.mode}`"
                  :label="`Attest ${capabilityLabel(capability.mode)}`"
                  icon="i-lucide-user-check"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="openAttestation(destination, capability)"
                />
              </div>
            </div>

            <div
              v-if="outstandingCapabilities(destination).length"
              class="mt-4 rounded-lg border border-warning/25 bg-warning/5 p-4"
              data-testid="destination-readiness-breakdown"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-warning">
                Why this destination is not ready
              </p>
              <p class="mt-1 text-xs leading-5 text-muted">
                {{ readyCapabilityCount(destination) }} of {{ destination.capabilities.length }}
                capabilities are ready. Every capability has to be ready before the destination is.
              </p>
              <ul class="mt-3 space-y-2">
                <li
                  v-for="capability in outstandingCapabilities(destination)"
                  :key="capability.id"
                  class="flex items-start gap-2 text-xs leading-5"
                >
                  <UIcon
                    :name="capabilityAssurance(capability.mode).icon"
                    class="mt-0.5 size-3.5 shrink-0 text-dimmed"
                  />
                  <span class="text-muted">
                    <span class="font-medium text-highlighted">{{ capabilityLabel(capability.mode) }}</span>
                    is {{ titleCase(capability.status) }} —
                    {{ isAttestationOnly(capability.mode)
                      ? 'no provider test can prove this one, so an operator has to attest it'
                      : 'run a provider test to record evidence for it' }}.
                  </span>
                </li>
              </ul>
            </div>

            <div class="mt-4 border-t border-default pt-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
                  Canonical event mappings
                </p>
                <UButton
                  v-if="canConfigure && !profile.enabled && profile.environment === 'test' && !destination.enabled && destination.environment === 'test' && destination.mappings.some(mapping => mapping.isActive)"
                  :label="testingDestinationId === destination.id ? 'Hide provider test' : 'Run provider test'"
                  icon="i-lucide-flask-conical"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="toggleProviderTest(destination.id)"
                />
              </div>
              <div v-if="destination.mappings.length" class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="mapping in destination.mappings"
                  :key="mapping.id"
                  class="rounded-md border border-default bg-elevated px-2.5 py-1 text-xs text-highlighted"
                >
                  {{ mapping.canonicalEventName }} → {{ mapping.providerEventName }}
                  <span class="ml-1 text-muted">{{ mapping.isActive ? 'Active' : 'Inactive' }}</span>
                  <span class="ml-1 text-muted">· {{ mappingIdentityLabel(destination, mapping.canonicalEventName) }}</span>
                </span>
              </div>
              <p v-else class="mt-2 text-sm text-muted">
                No event mappings configured.
              </p>

              <ClientsClientMeasurementProviderTest
                v-if="testingDestinationId === destination.id"
                :client-id="clientId"
                :destination-config-version="destination.configVersion"
                :destination="destination"
                @close="testingDestinationId = null"
                @completed="handleProviderTestCompleted"
              />
            </div>
          </article>
        </div>

        <div v-else class="rounded-xl border border-dashed border-default bg-default p-8 text-center">
          <UIcon name="i-lucide-unplug" class="mx-auto size-6 text-dimmed" />
          <p class="mt-3 font-medium text-highlighted">
            No conversion destinations configured
          </p>
          <p class="mt-1 text-sm text-muted">
            The profile remains dormant until a destination is explicitly mapped and validated.
          </p>
        </div>
      </div>

      <aside class="space-y-6">
        <ClientMeasurementActivationControls
          v-if="readiness"
          :client-id="clientId"
          :profile="profile"
          :readiness="readiness"
          :can-configure="canConfigure ?? false"
          :can-owner-override="canOwnerOverride ?? false"
          @completed="handleActivationCompleted"
        />

        <div v-if="readiness" class="rounded-xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold text-highlighted">
              Readiness gates
            </h3>
            <UBadge :color="statusColor(readiness.status)" variant="subtle">
              {{ titleCase(readiness.status) }}
            </UBadge>
          </div>

          <div class="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div class="rounded-lg bg-elevated p-3">
              <p class="text-xs text-muted">
                Destinations ready
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ readiness.counts.readyDestinations }}/{{ readiness.counts.destinations }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <p class="text-xs text-muted">
                Capabilities ready
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ readiness.counts.readyCapabilities }}/{{ readiness.counts.capabilities }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <p class="text-xs text-muted">
                Active mappings
              </p>
              <p class="mt-1 font-semibold text-highlighted">
                {{ readiness.counts.activeMappings }}
              </p>
            </div>
            <div class="rounded-lg bg-elevated p-3">
              <p class="text-xs text-muted">
                Last validated
              </p>
              <p class="mt-1 text-xs font-medium text-highlighted">
                {{ formatDateTime(readiness.lastValidatedAt) }}
              </p>
            </div>
          </div>

          <ul v-if="readiness.blockers.length" class="mt-4 space-y-2">
            <li
              v-for="blocker in readiness.blockers"
              :key="blocker.code"
              class="flex gap-2 rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm"
            >
              <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0 text-warning" />
              <span class="text-muted">{{ blocker.message }}</span>
            </li>
          </ul>
          <p v-else class="mt-4 flex items-center gap-2 text-sm text-success">
            <UIcon name="i-lucide-circle-check" class="size-4" />
            All current readiness gates are satisfied.
          </p>
        </div>

        <div v-else-if="readinessUnavailable" role="alert" class="rounded-xl border border-warning/30 bg-warning/5 p-5">
          <p class="font-medium text-warning">
            Readiness summary unavailable
          </p>
          <p class="mt-1 text-sm text-muted">
            Review the canonical profile and destination evidence, then retry before activation decisions.
          </p>
        </div>

        <div class="rounded-xl border border-default bg-default p-5 shadow-xs">
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold text-highlighted">
              Recent configuration history
            </h3>
            <span class="text-xs text-muted">Audit trail</span>
          </div>
          <p v-if="auditUnavailable" role="alert" class="mt-4 text-sm text-warning">
            Audit history unavailable. Canonical configuration and delivery evidence are still shown.
          </p>
          <ol v-else-if="auditEntries.length" class="mt-4 space-y-4">
            <li v-for="entry in auditEntries" :key="entry.id" class="border-l-2 border-default pl-3">
              <div class="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span class="font-medium text-highlighted">{{ titleCase(entry.entityType) }} {{ titleCase(entry.action) }}</span>
                <span>v{{ entry.configVersion }}</span>
              </div>
              <p class="mt-1 text-sm text-muted">
                {{ entry.reason }}
              </p>
              <p class="mt-1 text-xs text-dimmed">
                {{ formatDateTime(entry.createdAt) }}
              </p>
            </li>
          </ol>
          <p v-else class="mt-4 text-sm text-muted">
            No configuration changes have been recorded.
          </p>
        </div>
      </aside>
    </div>

    <UModal
      :open="attestOpen"
      :title="attestTarget ? `Attest ${capabilityLabel(attestTarget.capability.mode)}` : ''"
      :description="attestTarget ? capabilityDescription(attestTarget.capability.mode) : ''"
      :ui="{ content: 'max-w-xl' }"
      @update:open="setAttestOpen"
    >
      <template #body>
        <div v-if="attestTarget" class="space-y-5" data-testid="measurement-attestation-modal">
          <div class="rounded-lg bg-elevated p-3">
            <p class="text-xs font-medium uppercase tracking-wide text-dimmed">
              {{ PLATFORM_LABELS[attestTarget.destination.platform] }}
            </p>
            <p class="mt-0.5 break-all font-mono text-xs text-highlighted">
              {{ attestTarget.destination.externalDestinationId }}
            </p>
            <p class="mt-2 text-xs leading-5 text-muted">
              Zero cannot observe this capability from the server, so its status comes from you.
              Your name, your reason, and configuration version
              {{ attestTarget.destination.configVersion }} are written to the audit trail.
            </p>
          </div>

          <UAlert
            v-if="attestError"
            data-testid="attestation-error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            :description="attestError"
          />

          <UFormField label="Capability status" required>
            <USelect
              v-model="attestStatus"
              data-testid="attestation-status"
              :items="attestStatusOptions"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="attestStatus !== 'ready'"
            label="What is limiting this capability"
            help="Shown on the capability until it is ready again."
            required
          >
            <UTextarea
              v-model="attestBlockingReason"
              data-testid="attestation-blocking-reason"
              :rows="5"
              :maxlength="1000"
              placeholder="e.g. The pixel fires on the thank-you page but not on the enquiry form."
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Why you are recording this"
            help="Kept in the measurement audit trail against your name."
            required
          >
            <UTextarea
              v-model="attestReason"
              data-testid="attestation-reason"
              :rows="5"
              :maxlength="1000"
              placeholder="e.g. Verified the pixel in Meta Events Manager after the GTM container publish."
              class="w-full"
            />
          </UFormField>

          <template v-if="attestStopsLiveDelivery">
            <UAlert
              data-testid="attestation-live-warning"
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="Blocking this stops live delivery"
              description="This destination is live. Recording the capability as blocked takes it out of delivery immediately. Without the force option below, Zero records it as degraded instead and delivery continues."
            />
            <UFormField label="Force">
              <UCheckbox
                v-model="attestForce"
                data-testid="attestation-force"
                label="Stop live delivery and record this capability as blocked"
              />
            </UFormField>
          </template>

          <UFormField label="Confirmation" required>
            <UCheckbox
              v-model="attestConfirmed"
              data-testid="attestation-confirmed"
              label="I have checked this capability myself and stand behind the status above."
            />
          </UFormField>
        </div>
      </template>

      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            label="Cancel"
            color="neutral"
            variant="ghost"
            :disabled="attestPending"
            @click="setAttestOpen(false)"
          />
          <UButton
            data-testid="submit-attestation"
            label="Record attestation"
            icon="i-lucide-user-check"
            :loading="attestPending"
            :disabled="!canSubmitAttestation"
            @click="submitAttestation"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
