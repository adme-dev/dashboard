<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  CAPABILITY_DEFINITIONS,
  MEASUREMENT_PLATFORMS,
  PLATFORM_LABELS,
  type MeasurementPlatform
} from '~~/shared/utils/measurementPlatform'
import { isMeasurementProviderCredentialRef } from '~~/shared/utils/measurementProviderCredential'

const props = defineProps<{
  clientId: string
  profileConfigVersion: number
}>()

const emit = defineEmits<{
  saved: [result: { destination: { id: string }, profileConfigVersion: number, warnings: Array<{ code: string }> }]
  cancel: []
}>()

type Platform = MeasurementPlatform
type ManagementOrigin = 'zero' | 'gtm' | 'partner' | 'external'

interface ConnectedAccount {
  id: string
  accountId: string
  accountName: string
  status: string
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

const capabilityDefinitions = CAPABILITY_DEFINITIONS

const mappingDefinitions: MappingDefinition[] = [
  { name: 'lead_created', label: 'Lead created' },
  { name: 'lead_contacted', label: 'Lead contacted' },
  { name: 'lead_qualified', label: 'Qualified lead' },
  { name: 'lead_won', label: 'Lead won' },
  { name: 'lead_lost', label: 'Lead lost' },
  { name: 'purchase', label: 'Purchase' },
  { name: 'web_conversion', label: 'Web conversion' },
  { name: 'phone_click', label: 'Phone click' },
  { name: 'directions_click', label: 'Directions click' }
]

const platformOptions = MEASUREMENT_PLATFORMS.map(value => ({
  value,
  label: PLATFORM_LABELS[value]
}))

const platform = ref<Platform>('meta')
const socialConnectionId = ref('')
const externalDestinationId = ref('')
const credentialRef = ref('')
const selectedCapabilities = reactive<Record<string, boolean>>({})
const capabilityOrigins = reactive<Record<string, ManagementOrigin>>({})
const activeMappings = reactive<Record<string, boolean>>({})
const providerEventNames = reactive<Record<string, string>>({})
const mappingEnquiryTypes = reactive<Record<string, string>>({})
const reason = ref('')
const accounts = ref<Record<Platform, ConnectedAccount[]>>({
  meta: [],
  google_data_manager: [],
  ga4: []
})
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

const capabilityOriginItems = [
  { label: 'Zero', value: 'zero' },
  { label: 'Google Tag Manager', value: 'gtm' },
  { label: 'Partner', value: 'partner' },
  { label: 'External/client', value: 'external' }
]
const enquiryTypeItems = [
  { label: 'Aggregate (all website enquiries)', value: 'aggregate' },
  { label: 'Stock enquiry', value: 'stock' },
  { label: 'Finance application', value: 'finance' },
  { label: 'Test drive', value: 'test_drive' },
  { label: 'Contact enquiry', value: 'contact' },
  { label: 'Model / variant enquiry', value: 'model_variant' },
  { label: 'Service booking', value: 'service_booking' }
]

const currentCapabilities = computed(() => capabilityDefinitions[platform.value])
const currentAccounts = computed(() => accounts.value[platform.value].filter(account => (
  ['connected', 'active', 'healthy'].includes(account.status.toLowerCase())
)))
const selectedCapabilityRows = computed(() => currentCapabilities.value.filter(definition => selectedCapabilities[definition.mode]))
const selectedMappingRows = computed(() => mappingDefinitions.filter(definition => activeMappings[definition.name]))
const requiresConnection = computed(() => selectedCapabilityRows.value.some(definition => capabilityOrigins[definition.mode] === 'zero'))
const mappingsComplete = computed(() => selectedMappingRows.value.every(definition => providerEventNames[definition.name]?.trim()))
const selectedGoogleAction = computed(() => googleActions.value.find(action => action.id === externalDestinationId.value) ?? null)
const connectedAccountItems = computed(() => currentAccounts.value.map(account => ({
  label: `${account.accountName} · ${account.accountId}`,
  value: account.id
})))
const googleActionItems = computed(() => googleActions.value.map(action => ({
  label: `${action.name} · ID ${action.id} · ${action.deliveryMode === 'offline_click' ? 'Offline click' : 'Website tag'}${action.isPrimary ? ' · Primary' : ' · Secondary'}`,
  value: action.id
})))
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
// Only Google Data Manager resolves the destination ID from a fetched conversion-action
// list; Meta and GA4 are both typed in directly, just against different provider IDs.
const externalDestinationLabel = computed(() => ({
  meta: 'Dataset ID',
  google_data_manager: 'Conversion Action ID',
  ga4: 'Measurement ID'
}[platform.value]))
const externalDestinationPlaceholder = computed(() => ({
  meta: 'e.g. 573284833843027',
  google_data_manager: '',
  ga4: 'e.g. G-XXXXXXXXXX'
}[platform.value]))
const usesFreeTextDestinationId = computed(() => platform.value !== 'google_data_manager')
const requiresProviderCredential = computed(() => (
  platform.value === 'meta' || platform.value === 'ga4'
))
const credentialRefValid = computed(() => (
  !requiresProviderCredential.value
  || isMeasurementProviderCredentialRef(credentialRef.value.trim())
))
const canSave = computed(() => (
  externalDestinationId.value.trim().length > 0
  && selectedCapabilityRows.value.length > 0
  && (!requiresConnection.value || Boolean(socialConnectionId.value))
  && mappingsComplete.value
  && googleActionCompatible.value
  && credentialRefValid.value
  && Boolean(reason.value.trim())
  && !saving.value
))

function resetPlatformState() {
  googleActionRequestId += 1
  socialConnectionId.value = ''
  externalDestinationId.value = ''
  credentialRef.value = ''
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
    mappingEnquiryTypes[mapping.name] = 'aggregate'
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
  try {
    if (targetPlatform === 'ga4') {
      // GA4 has no flat accounts endpoint like Meta/Google. Its real credential source is
      // /api/agency/social/ga4/properties, which lists each active ga4 connection plus the
      // GA4 properties visible to it. A connection can serve multiple properties - the
      // operator still pins the exact one via the Measurement ID field below - so this list
      // only needs to identify the connection itself. There is no GA4 equivalent of a single
      // external account number the way Meta/Google have an ad-account ID, so accountId
      // reuses the connection id (the only stable per-row identifier available) rather than
      // arbitrarily picking one of the connection's properties.
      const result = await apiFetch<{
        connections: Array<{ connectionId: string, accountName: string }>
      }>('/api/agency/social/ga4/properties')
      if (requestId === accountRequestId) {
        accounts.value = {
          ...accounts.value,
          ga4: result.connections.map(connection => ({
            id: connection.connectionId,
            accountId: connection.connectionId,
            accountName: connection.accountName,
            // The endpoint's SQL already filters to platform='ga4' AND status='active', so every
            // row returned has already passed the same status gate applied to Meta/Google accounts.
            status: 'active'
          }))
        }
      }
    } else {
      const endpoint = targetPlatform === 'meta'
        ? '/api/agency/social/meta/accounts'
        : '/api/agency/social/google/accounts'
      const result = await apiFetch<ConnectedAccount[]>(endpoint)
      if (requestId === accountRequestId) {
        accounts.value = { ...accounts.value, [targetPlatform]: result }
      }
    }
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
          externalDestinationId: externalDestinationId.value.trim(),
          credentialRef: credentialRef.value.trim() || null,
          capabilities: selectedCapabilityRows.value.map(definition => ({
            mode: definition.mode,
            status: 'configured',
            managementOrigin: capabilityOrigins[definition.mode],
            canZeroMutate: capabilityOrigins[definition.mode] === 'zero',
            blockingReason: null
          })),
          mappings: selectedMappingRows.value.map(definition => ({
            canonicalEventName: definition.name,
            enquiryType: definition.name === 'web_conversion' && mappingEnquiryTypes[definition.name] !== 'aggregate'
              ? mappingEnquiryTypes[definition.name]
              : null,
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
      <UFormField label="Provider">
        <USelect
          v-model="platform"
          :items="platformOptions"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Connected credential source">
        <USelect
          v-model="socialConnectionId"
          data-testid="measurement-connection"
          :items="connectedAccountItems"
          value-key="value"
          placeholder="Select connected account"
          class="w-full"
          :disabled="accountsPending"
        />
        <span v-if="accountError" role="alert" class="flex items-center gap-2 text-xs text-error">
          {{ accountError }}
          <UButton
            label="Retry"
            size="xs"
            variant="link"
            @click="loadAccounts()"
          />
        </span>
        <span v-else-if="!accountsPending && !currentAccounts.length" class="text-xs text-warning">No connected account is available for this provider.</span>
      </UFormField>

      <UFormField :label="externalDestinationLabel" class="md:col-span-2">
        <UInput
          v-if="usesFreeTextDestinationId"
          v-model="externalDestinationId"
          data-testid="measurement-destination-id"
          maxlength="255"
          :placeholder="externalDestinationPlaceholder"
          class="w-full font-mono"
        />
        <USelect
          v-else
          v-model="externalDestinationId"
          data-testid="measurement-destination-id"
          :items="googleActionItems"
          value-key="value"
          placeholder="Select an enabled conversion action"
          class="w-full"
          :disabled="!socialConnectionId || googleActionsPending"
        />
        <span v-if="googleActionError" role="alert" class="block text-xs text-error">{{ googleActionError }}</span>
        <span v-else-if="platform === 'google_data_manager' && socialConnectionId && !googleActionsPending && !googleActions.length" class="block text-xs text-warning">
          No enabled WEBPAGE or UPLOAD_CLICKS conversion action is available in this account.
        </span>
        <span class="block text-xs text-muted">This explicit mapping prevents an ad account from being mistaken for a conversion destination.</span>
        <span v-if="platform === 'google_data_manager' && selectedGoogleAction && !googleActionCompatible" class="block text-xs text-error">
          The selected action type does not match the capability owner. Zero-managed delivery requires an Offline click action; GTM-owned tag delivery requires a Website tag action.
        </span>
      </UFormField>

      <UFormField
        v-if="requiresProviderCredential"
        class="md:col-span-2"
        label="Provider credential binding"
        help="Enter the Cloudflare secret binding name, never the provider token itself. Binding names start with MEASUREMENT_PROVIDER_."
        required
      >
        <UInput
          v-model="credentialRef"
          data-testid="measurement-credential-ref"
          class="w-full font-mono"
          autocomplete="off"
          placeholder="MEASUREMENT_PROVIDER_META_CLIENT_NAME"
        />
        <p
          v-if="credentialRef && !credentialRefValid"
          role="alert"
          class="mt-1 text-xs text-error"
        >
          Use an uppercase purpose-scoped binding such as MEASUREMENT_PROVIDER_META_CLIENT_NAME.
        </p>
      </UFormField>
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
          <div class="flex items-start gap-3">
            <UCheckbox
              v-model="selectedCapabilities[capability.mode]"
              :data-testid="`capability-${capability.mode}`"
              class="mt-0.5"
            />
            <span>
              <span class="block text-sm font-medium text-highlighted">{{ capability.label }}</span>
              <span class="mt-0.5 block text-xs leading-5 text-muted">{{ capability.description }}</span>
            </span>
          </div>
          <UFormField v-if="selectedCapabilities[capability.mode]" label="Implementation owner">
            <USelect
              v-model="capabilityOrigins[capability.mode]"
              :items="capabilityOriginItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>
      </div>
      <p v-if="requiresConnection && !socialConnectionId" class="mt-3 text-sm text-warning">
        Zero-managed capabilities require a connected credential source.
      </p>
    </div>

    <div class="mt-6 border-t border-default pt-5">
      <h4 class="font-medium text-highlighted">
        Canonical event mappings
      </h4>
      <p class="mt-1 text-sm text-muted">
        Choose which Zero lifecycle statuses map to provider events. Qualified lead is represented once as <code>lead_qualified</code>.
      </p>
      <div class="mt-4 grid gap-3 lg:grid-cols-2">
        <div v-for="mapping in mappingDefinitions" :key="mapping.name" class="rounded-lg border border-default p-3">
          <div class="flex items-center gap-3 text-sm font-medium text-highlighted">
            <UCheckbox
              v-model="activeMappings[mapping.name]"
              :data-testid="`mapping-${mapping.name}`"
            />
            {{ mapping.label }}
            <code class="ml-auto text-xs font-normal text-muted">{{ mapping.name }}</code>
          </div>
          <div v-if="activeMappings[mapping.name]" class="mt-3 grid grid-cols-1 gap-3">
            <UFormField label="Provider event name">
              <UInput
                v-model="providerEventNames[mapping.name]"
                :data-testid="`provider-event-${mapping.name}`"
                maxlength="255"
                placeholder="Provider event name"
                class="w-full font-mono"
              />
            </UFormField>
            <UFormField
              v-if="mapping.name === 'web_conversion'"
              label="Enquiry type"
              help="Choose an exact type when this destination represents one specific website action."
            >
              <USelect
                v-model="mappingEnquiryTypes[mapping.name]"
                :items="enquiryTypeItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>
          </div>
        </div>
      </div>
    </div>

    <div class="mt-6 border-t border-default pt-5">
      <div class="rounded-lg border border-warning/25 bg-warning/5 p-3 text-sm text-muted">
        <span class="font-medium text-highlighted">Destination delivery remains dormant.</span>
        Saving configuration does not enable sending; validation, privacy approval, live approval, and explicit activation remain separate gates.
      </div>
      <UFormField label="Change reason" class="mt-4">
        <UTextarea
          v-model="reason"
          data-testid="measurement-destination-reason"
          :rows="2"
          maxlength="1000"
          placeholder="Describe the approved destination, evidence source, and intended test"
          class="w-full"
        />
      </UFormField>
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
