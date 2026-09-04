<script setup lang="ts">
import { computed, ref } from 'vue'
import ClientMeasurementActivationControls from '~/components/clients/ClientMeasurementActivationControls.vue'
import type {
  ClientMeasurementProfile,
  MeasurementAuditEntry,
  MeasurementCapabilityStatus,
  MeasurementDestination,
  MeasurementReadinessStatus,
  MeasurementReadinessSummary,
  PaginatedMeasurementResponse
} from '~/types/measurement'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'

const props = defineProps<{
  clientId: string
  canConfigure?: boolean
  canOwnerOverride?: boolean
}>()

const apiFetch = $fetch as <T>(request: string) => Promise<T>
const profile = ref<ClientMeasurementProfile | null>(null)
const readiness = ref<MeasurementReadinessSummary | null>(null)
const destinations = ref<MeasurementDestination[]>([])
const auditEntries = ref<MeasurementAuditEntry[]>([])
const pending = ref(true)
const loadError = ref<string | null>(null)
const showDestinationEditor = ref(false)
const testingDestinationId = ref<string | null>(null)
const readinessUnavailable = ref(false)
const destinationsUnavailable = ref(false)
const auditUnavailable = ref(false)
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

const capabilityLabels: Record<string, string> = {
  meta_pixel: 'Meta Pixel',
  meta_web_capi: 'Meta Web CAPI',
  meta_crm_capi: 'Meta CRM CAPI',
  meta_conversion_leads: 'Meta Conversion Leads',
  google_tag_enhanced_conversions: 'Google tag enhanced conversions',
  google_enhanced_conversions_for_leads: 'Google enhanced conversions for leads',
  google_data_manager: 'Google Data Manager',
  ga4_measurement_protocol: 'GA4 Measurement Protocol',
  tiktok_pixel: 'TikTok Pixel',
  tiktok_events_api: 'TikTok Events API'
}

const originLabels: Record<string, string> = {
  zero: 'Managed by Zero',
  gtm: 'Managed in Google Tag Manager',
  partner: 'Partner managed',
  external: 'Externally managed'
}

const platformLabels: Record<MeasurementDestination['platform'], string> = {
  meta: 'Meta',
  google_data_manager: 'Google Data Manager',
  ga4: 'Google Analytics 4',
  tiktok: 'TikTok'
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

function mappingIdentityLabel(
  destination: MeasurementDestination,
  canonicalEventName: string
) {
  return classifyMeasurementEventIdentity(
    canonicalEventName,
    destination.capabilities.map(capability => capability.mode)
  ).label
}

function measurementErrorMessage(error: unknown) {
  const candidate = error as {
    data?: { statusMessage?: string }
    statusMessage?: string
    message?: string
  } | null

  return candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Measurement configuration could not be loaded'
}

async function refreshMeasurement() {
  pending.value = true
  loadError.value = null
  readinessUnavailable.value = false
  destinationsUnavailable.value = false
  auditUnavailable.value = false

  const basePath = `/api/agency/measurement/clients/${props.clientId}`
  const [profileResult, readinessResult, destinationResult, auditResult] = await Promise.allSettled([
    apiFetch<{ profile: ClientMeasurementProfile }>(basePath),
    apiFetch<MeasurementReadinessSummary>(`${basePath}/readiness`),
    apiFetch<PaginatedMeasurementResponse<MeasurementDestination>>(`${basePath}/destinations`),
    apiFetch<PaginatedMeasurementResponse<MeasurementAuditEntry>>(`${basePath}/audit`)
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

  pending.value = false
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
                    {{ platformLabels[destination.platform] }}
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
                      {{ capabilityLabels[capability.mode] || titleCase(capability.mode) }}
                    </p>
                    <p class="mt-1 text-xs text-muted">
                      {{ originLabels[capability.managementOrigin] }}
                    </p>
                  </div>
                  <UBadge :color="statusColor(capability.status)" variant="subtle">
                    {{ titleCase(capability.status) }}
                  </UBadge>
                </div>
                <p class="mt-3 text-xs text-muted">
                  Evidence: {{ formatDateTime(capability.evidenceAt) }}
                </p>
                <p v-if="capability.blockingReason" class="mt-2 text-xs text-error">
                  {{ capability.blockingReason }}
                </p>
              </div>
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
                :profile-config-version="profile.configVersion"
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
  </section>
</template>
