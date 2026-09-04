<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { MeasurementPlatform } from '~/types/measurement'
import { isMeasurementProviderCredentialRef } from '~~/shared/utils/measurementProviderCredential'

const props = defineProps<{
  clientId: string
  profileConfigVersion: number
}>()

const emit = defineEmits<{
  saved: [result: { destination: { id: string }, profileConfigVersion: number, warnings: Array<{ code: string }> }]
  cancel: []
}>()

type Platform = Extract<MeasurementPlatform, 'meta' | 'google_data_manager' | 'tiktok'>
type ManagementOrigin = 'zero' | 'gtm' | 'partner' | 'external'

interface ConnectedAccount {
  id: string
  accountId: string
  accountName: string
  status: string
}

interface CapabilityDefinition {
  mode: string
  label: string
  description: string
  defaultOrigin: ManagementOrigin
}

interface MappingDefinition {
  name: string
  label: string
}

interface GoogleConversionAction {
  id: string
  name: string
  status: 'ENABLED'
  type: 'UPLOAD_CLICKS' | 'WEBPAGE'
  category: string
  isPrimary: boolean
  includesInConversions: boolean
  deliveryMode: 'offline_click' | 'additional_data_source'
}

const capabilityDefinitions: Record<Platform, CapabilityDefinition[]> = {
  meta: [
    { mode: 'meta_pixel', label: 'Meta Pixel', description: 'Browser events, usually managed in GTM or the client website.', defaultOrigin: 'gtm' },
    { mode: 'meta_web_capi', label: 'Meta Web CAPI', description: 'Server-side web events with browser-event deduplication.', defaultOrigin: 'gtm' },
    { mode: 'meta_crm_capi', label: 'Meta CRM CAPI', description: 'Zero lead and CRM lifecycle outcomes sent server-side.', defaultOrigin: 'zero' },
    { mode: 'meta_conversion_leads', label: 'Meta Conversion Leads', description: 'Qualified and downstream lead outcomes used for optimisation.', defaultOrigin: 'zero' }
  ],
  google_data_manager: [
    { mode: 'google_tag_enhanced_conversions', label: 'Google tag enhanced conversions', description: 'Browser conversion tags enriched with consented first-party data.', defaultOrigin: 'gtm' },
    { mode: 'google_enhanced_conversions_for_leads', label: 'Google enhanced conversions for leads', description: 'Qualified and downstream lead outcomes matched to ad clicks.', defaultOrigin: 'zero' },
    { mode: 'google_data_manager', label: 'Google Data Manager', description: 'Server-side audience and conversion data delivery.', defaultOrigin: 'zero' }
  ],
  tiktok: [
    { mode: 'tiktok_pixel', label: 'TikTok Pixel', description: 'Consent-aware browser events using the shared event ID.', defaultOrigin: 'gtm' },
    { mode: 'tiktok_events_api', label: 'TikTok Events API', description: 'Server-side web and confirmed conversion delivery with provider deduplication.', defaultOrigin: 'zero' }
  ]
}

const mappingDefinitions: MappingDefinition[] = [
  { name: 'lead_created', label: 'Lead created' },
  { name: 'lead_contacted', label: 'Lead contacted' },
  { name: 'lead_qualified', label: 'Qualified lead' },
  { name: 'lead_won', label: 'Lead won' },
  { name: 'lead_lost', label: 'Lead lost' },
  { name: 'purchase', label: 'Purchase' },
  { name: 'web_conversion', label: 'Web conversion' },
  { name: 'vehicle_view', label: 'Vehicle view' },
  { name: 'site_search', label: 'Site search' },
  { name: 'phone_contact', label: 'Phone contact' },
  { name: 'test_drive_booked', label: 'Test drive booked' },
  { name: 'phone_click', label: 'Phone click' },
  { name: 'directions_click', label: 'Directions click' },
  { name: 'add_to_wishlist', label: 'Add to wishlist' },
  { name: 'form_submit', label: 'Form submit' }
]

const platform = ref<Platform>('meta')
const socialConnectionId = ref('')
const credentialRef = ref('')
const externalDestinationId = ref('')
const selectedCapabilities = reactive<Record<string, boolean>>({})
const capabilityOrigins = reactive<Record<string, ManagementOrigin>>({})
const activeMappings = reactive<Record<string, boolean>>({})
const providerEventNames = reactive<Record<string, string>>({})
const reason = ref('')
const accounts = ref<Record<Platform, ConnectedAccount[]>>({ meta: [], google_data_manager: [], tiktok: [] })
const accountsPending = ref(true)
const accountError = ref<string | null>(null)
const googleActions = ref<GoogleConversionAction[]>([])
const googleActionsPending = ref(false)
const googleActionError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)
let accountRequestId = 0
let googleActionRequestId = 0

const apiFetch = $fetch as <T>(
  request: string,
  options?: { method?: 'POST', body?: unknown }
) => Promise<T>

const currentCapabilities = computed(() => capabilityDefinitions[platform.value])
const currentAccounts = computed(() => accounts.value[platform.value].filter(account => (
  ['connected', 'active', 'healthy'].includes(account.status.toLowerCase())
)))
const selectedCapabilityRows = computed(() => currentCapabilities.value.filter(definition => selectedCapabilities[definition.mode]))
const selectedMappingRows = computed(() => mappingDefinitions.filter(definition => activeMappings[definition.name]))
const hasZeroManagedCapability = computed(() => selectedCapabilityRows.value.some(definition => capabilityOrigins[definition.mode] === 'zero'))
const requiresConnection = computed(() => platform.value !== 'tiktok' && hasZeroManagedCapability.value)
const requiresCredentialRef = computed(() => platform.value === 'tiktok' && hasZeroManagedCapability.value)
const credentialRefIsValid = computed(() => {
  const value = credentialRef.value.trim()
  return value ? isMeasurementProviderCredentialRef(value) : !requiresCredentialRef.value
})
const mappingsComplete = computed(() => selectedMappingRows.value.every(definition => providerEventNames[definition.name]?.trim()))
const selectedGoogleAction = computed(() => googleActions.value.find(action => action.id === externalDestinationId.value) ?? null)
// Data Manager supports both offline-click actions and WEBPAGE actions used as
// an additional source. Only the enhanced-leads capability requires UPLOAD_CLICKS.
const needsOfflineClickAction = computed(() => selectedCapabilityRows.value.some(definition => (
  capabilityOrigins[definition.mode] === 'zero'
  && definition.mode === 'google_enhanced_conversions_for_leads'
)))
const needsWebsiteAction = computed(() => selectedCapabilityRows.value.some(definition => (
  definition.mode === 'google_tag_enhanced_conversions'
  && capabilityOrigins[definition.mode] !== 'zero'
)))
const googleActionCompatible = computed(() => {
  if (platform.value !== 'google_data_manager') return true
  if (!selectedGoogleAction.value) return false
  if (needsOfflineClickAction.value && needsWebsiteAction.value) return false
  if (needsOfflineClickAction.value) return selectedGoogleAction.value.type === 'UPLOAD_CLICKS'
  if (needsWebsiteAction.value) return selectedGoogleAction.value.type === 'WEBPAGE'
  return true
})
const canSave = computed(() => (
  externalDestinationId.value.trim().length > 0
  && selectedCapabilityRows.value.length > 0
  && (!requiresConnection.value || Boolean(socialConnectionId.value))
  && credentialRefIsValid.value
  && mappingsComplete.value
  && googleActionCompatible.value
  && Boolean(reason.value.trim())
  && !saving.value
))

function resetPlatformState() {
  googleActionRequestId += 1
  socialConnectionId.value = ''
  credentialRef.value = ''
  externalDestinationId.value = ''
  reason.value = ''
  saveError.value = null
  googleActions.value = []
  googleActionError.value = null
  googleActionsPending.value = false

  for (const definition of Object.values(capabilityDefinitions).flat()) {
    selectedCapabilities[definition.mode] = false
    capabilityOrigins[definition.mode] = definition.defaultOrigin
  }
  for (const mapping of mappingDefinitions) {
    activeMappings[mapping.name] = false
    providerEventNames[mapping.name] = ''
  }
}

watch(platform, (nextPlatform) => {
  resetPlatformState()
  void loadAccounts(nextPlatform)
})
watch(socialConnectionId, (connectionId) => {
  googleActionRequestId += 1
  externalDestinationId.value = ''
  googleActions.value = []
  googleActionError.value = null
  if (platform.value === 'google_data_manager' && connectionId) {
    void loadGoogleActions(connectionId)
  }
}, { flush: 'sync' })
resetPlatformState()

function errorMessage(error: unknown, fallback: string) {
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

async function loadAccounts(targetPlatform: Platform = platform.value) {
  const requestId = ++accountRequestId
  accountsPending.value = true
  accountError.value = null
  if (targetPlatform === 'tiktok') {
    accounts.value = { ...accounts.value, tiktok: [] }
    accountsPending.value = false
    return
  }
  try {
    const endpoint = targetPlatform === 'meta'
      ? '/api/agency/social/meta/accounts'
      : '/api/agency/social/google/accounts'
    const result = await apiFetch<ConnectedAccount[]>(endpoint)
    accounts.value = { ...accounts.value, [targetPlatform]: result }
  } catch (error: unknown) {
    if (requestId === accountRequestId) {
      accountError.value = errorMessage(error, 'Connected accounts could not be loaded')
    }
  } finally {
    if (requestId === accountRequestId) {
      accountsPending.value = false
    }
  }
}

async function loadGoogleActions(connectionId: string) {
  const requestId = ++googleActionRequestId
  googleActionsPending.value = true
  googleActionError.value = null
  try {
    const result = await apiFetch<{
      items: GoogleConversionAction[]
      pagination: { hasNextPage: boolean }
    }>(`/api/agency/measurement/clients/${props.clientId}/google-conversion-actions?connectionId=${encodeURIComponent(connectionId)}&page=1&pageSize=100`)
    if (requestId !== googleActionRequestId) return
    googleActions.value = result.items
    if (result.pagination.hasNextPage) {
      googleActionError.value = 'More than 100 eligible actions exist. Refine the account in Google Ads before activation.'
    }
  } catch (error: unknown) {
    if (requestId === googleActionRequestId) {
      googleActionError.value = errorMessage(error, 'Google conversion actions could not be loaded')
    }
  } finally {
    if (requestId === googleActionRequestId) googleActionsPending.value = false
  }
}

async function saveDestination() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null

  try {
    const result = await apiFetch<{
      destination: { id: string }
      profileConfigVersion: number
      warnings: Array<{ code: string }>
    }>(`/api/agency/measurement/clients/${props.clientId}/destinations`, {
      method: 'POST',
      body: {
        expectedProfileVersion: props.profileConfigVersion,
        reason: reason.value.trim(),
        destination: {
          platform: platform.value,
          socialConnectionId: socialConnectionId.value || null,
          ...(platform.value === 'tiktok'
            ? { credentialRef: credentialRef.value.trim() || null }
            : {}),
          externalDestinationId: externalDestinationId.value.trim(),
          capabilities: selectedCapabilityRows.value.map(definition => ({
            mode: definition.mode,
            status: 'configured',
            managementOrigin: capabilityOrigins[definition.mode],
            canZeroMutate: capabilityOrigins[definition.mode] === 'zero',
            blockingReason: null
          })),
          mappings: selectedMappingRows.value.map(definition => ({
            canonicalEventName: definition.name,
            providerEventName: providerEventNames[definition.name].trim(),
            isActive: true
          }))
        }
      }
    })
    emit('saved', result)
  } catch (error: unknown) {
    saveError.value = errorMessage(error, 'The destination could not be saved')
  } finally {
    saving.value = false
  }
}

void loadAccounts('meta')
</script>

<template>
  <section class="rounded-xl border border-primary/30 bg-default p-5 shadow-xs sm:p-6" data-testid="measurement-destination-editor">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h3 class="font-semibold text-highlighted">
          Configure conversion destination
        </h3>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          Select a connected account only as the credential source, then map the exact provider Dataset or Conversion Action independently.
        </p>
      </div>
      <UButton
        label="Cancel"
        color="neutral"
        variant="ghost"
        :disabled="saving"
        @click="emit('cancel')"
      />
    </div>

    <div class="mt-5 grid gap-5 md:grid-cols-2">
      <label class="space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Provider</span>
        <select v-model="platform" data-testid="measurement-platform" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
          <option value="meta">Meta</option>
          <option value="google_data_manager">Google Data Manager</option>
          <option value="tiktok">TikTok</option>
        </select>
      </label>

      <label v-if="platform !== 'tiktok'" class="space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Connected credential source</span>
        <select
          v-model="socialConnectionId"
          data-testid="measurement-connection"
          class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
          :disabled="accountsPending"
        >
          <option value="">{{ accountsPending ? 'Loading connected accounts…' : 'Select connected account' }}</option>
          <option v-for="account in currentAccounts" :key="account.id" :value="account.id">
            {{ account.accountName }} · {{ account.accountId }}
          </option>
        </select>
        <span v-if="accountError" role="alert" class="flex items-center gap-2 text-xs text-error">
          {{ accountError }}
          <button type="button" class="font-medium underline" @click="loadAccounts()">
            Retry
          </button>
        </span>
        <span v-else-if="!accountsPending && !currentAccounts.length" class="text-xs text-warning">No connected account is available for this provider.</span>
      </label>

      <UFormField
        v-else
        label="Cloudflare secret binding reference"
        help="Enter the purpose-scoped binding name only. Never paste the TikTok access token here."
        :error="credentialRef && !credentialRefIsValid ? 'Use a MEASUREMENT_PROVIDER_… binding name.' : undefined"
      >
        <UInput
          v-model="credentialRef"
          data-testid="measurement-credential-ref"
          autocomplete="off"
          maxlength="128"
          placeholder="MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE"
          class="w-full font-mono"
        />
      </UFormField>

      <label class="space-y-1.5 text-sm md:col-span-2">
        <span class="font-medium text-highlighted">{{ platform === 'meta' ? 'Dataset ID' : platform === 'tiktok' ? 'Pixel / Data Source ID' : 'Conversion Action ID' }}</span>
        <input
          v-if="platform !== 'google_data_manager'"
          v-model="externalDestinationId"
          data-testid="measurement-destination-id"
          type="text"
          maxlength="255"
          :placeholder="platform === 'tiktok' ? 'e.g. CABC1234567890' : 'e.g. 573284833843027'"
          class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
        >
        <select
          v-else
          v-model="externalDestinationId"
          data-testid="measurement-destination-id"
          class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
          :disabled="!socialConnectionId || googleActionsPending"
        >
          <option value="">
            {{ googleActionsPending ? 'Loading eligible conversion actions…' : 'Select an enabled conversion action' }}
          </option>
          <option v-for="action in googleActions" :key="action.id" :value="action.id">
            {{ action.name }} · ID {{ action.id }} · {{ action.deliveryMode === 'offline_click' ? 'Offline click' : 'Website tag' }}{{ action.isPrimary ? ' · Primary' : ' · Secondary' }}
          </option>
        </select>
        <span v-if="googleActionError" role="alert" class="block text-xs text-error">{{ googleActionError }}</span>
        <span v-else-if="platform === 'google_data_manager' && socialConnectionId && !googleActionsPending && !googleActions.length" class="block text-xs text-warning">
          No enabled WEBPAGE or UPLOAD_CLICKS conversion action is available in this account.
        </span>
        <span class="block text-xs text-muted">This explicit mapping prevents an ad account from being mistaken for a conversion destination.</span>
        <span v-if="platform === 'google_data_manager' && selectedGoogleAction && !googleActionCompatible" class="block text-xs text-error">
          The selected action type does not match the capability owner. Zero-managed delivery requires an Offline click action; GTM-owned tag delivery requires a Website tag action.
        </span>
      </label>
    </div>

    <div class="mt-6 border-t border-default pt-5">
      <h4 class="font-medium text-highlighted">
        Capability matrix
      </h4>
      <p class="mt-1 text-sm text-muted">
        Record each configured tracking mode and who owns its implementation. Provider validation supplies readiness evidence separately.
      </p>
      <div class="mt-4 space-y-3">
        <div
          v-for="capability in currentCapabilities"
          :key="capability.mode"
          class="grid gap-3 rounded-lg border border-default bg-elevated/35 p-4 md:grid-cols-[minmax(0,1fr)_14rem] md:items-center"
        >
          <label class="flex cursor-pointer items-start gap-3">
            <input
              v-model="selectedCapabilities[capability.mode]"
              :data-testid="`capability-${capability.mode}`"
              type="checkbox"
              class="mt-1 size-4 rounded border-default"
            >
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ capability.label }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-muted">{{ capability.description }}</span>
            </span>
          </label>
          <label v-if="selectedCapabilities[capability.mode]" class="space-y-1 text-xs">
            <span class="font-medium text-muted">Implementation owner</span>
            <select v-model="capabilityOrigins[capability.mode]" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
              <option value="zero">Zero</option>
              <option value="gtm">Google Tag Manager</option>
              <option value="partner">Partner</option>
              <option value="external">External/client</option>
            </select>
          </label>
        </div>
      </div>
      <p v-if="requiresConnection && !socialConnectionId" class="mt-3 text-sm text-warning">
        Zero-managed capabilities require a connected credential source.
      </p>
      <p v-if="requiresCredentialRef && !credentialRefIsValid" class="mt-3 text-sm text-warning">
        TikTok Events API requires a purpose-scoped Cloudflare secret binding reference.
      </p>
    </div>

    <div class="mt-6 border-t border-default pt-5">
      <h4 class="font-medium text-highlighted">
        Canonical event mappings
      </h4>
      <p class="mt-1 text-sm text-muted">
        Choose which canonical browser or lifecycle signals map to provider events. Qualified lead is represented once as <code>lead_qualified</code>.
      </p>
      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <div v-for="mapping in mappingDefinitions" :key="mapping.name" class="rounded-lg border border-default p-3">
          <label class="flex cursor-pointer items-center gap-3 text-sm font-medium text-highlighted">
            <input
              v-model="activeMappings[mapping.name]"
              :data-testid="`mapping-${mapping.name}`"
              type="checkbox"
              class="size-4 rounded border-default"
            >
            {{ mapping.label }}
            <code class="ml-auto text-xs font-normal text-muted">{{ mapping.name }}</code>
          </label>
          <input
            v-if="activeMappings[mapping.name]"
            v-model="providerEventNames[mapping.name]"
            :data-testid="`provider-event-${mapping.name}`"
            type="text"
            maxlength="255"
            placeholder="Provider event name"
            class="mt-3 w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
          >
        </div>
      </div>
    </div>

    <div class="mt-6 border-t border-default pt-5">
      <div class="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm text-muted">
        <span class="font-medium text-highlighted">Destination delivery remains dormant.</span>
        Saving configuration does not enable sending; validation, privacy approval, live approval, and explicit activation remain separate gates.
      </div>
      <label class="mt-4 block space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Change reason</span>
        <textarea
          v-model="reason"
          data-testid="measurement-destination-reason"
          rows="2"
          maxlength="1000"
          placeholder="Describe the approved destination, evidence source, and intended test"
          class="w-full resize-y rounded-md border border-default bg-default px-3 py-2 text-sm"
        />
      </label>
      <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role="alert" class="text-sm text-error">
          {{ saveError }}
        </p>
        <UButton
          data-testid="save-measurement-destination"
          label="Save dormant destination"
          icon="i-lucide-save"
          :loading="saving"
          :disabled="!canSave"
          @click="saveDestination"
        />
      </div>
    </div>
  </section>
</template>
