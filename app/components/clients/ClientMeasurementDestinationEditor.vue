<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

const props = defineProps<{
  clientId: string
  profileConfigVersion: number
}>()

const emit = defineEmits<{
  saved: [result: { destination: { id: string }, profileConfigVersion: number }]
  cancel: []
}>()

type Platform = 'meta' | 'google_data_manager'
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
  ]
}

const mappingDefinitions: MappingDefinition[] = [
  { name: 'lead_created', label: 'Lead created' },
  { name: 'lead_contacted', label: 'Lead contacted' },
  { name: 'lead_qualified', label: 'Qualified lead' },
  { name: 'lead_won', label: 'Lead won' },
  { name: 'lead_lost', label: 'Lead lost' },
  { name: 'purchase', label: 'Purchase' },
  { name: 'web_conversion', label: 'Web conversion' }
]

const platform = ref<Platform>('meta')
const socialConnectionId = ref('')
const externalDestinationId = ref('')
const selectedCapabilities = reactive<Record<string, boolean>>({})
const capabilityOrigins = reactive<Record<string, ManagementOrigin>>({})
const activeMappings = reactive<Record<string, boolean>>({})
const providerEventNames = reactive<Record<string, string>>({})
const reason = ref('')
const accounts = ref<Record<Platform, ConnectedAccount[]>>({ meta: [], google_data_manager: [] })
const accountsPending = ref(true)
const accountError = ref<string | null>(null)
const saving = ref(false)
const saveError = ref<string | null>(null)

const apiFetch = $fetch as <T>(
  request: string,
  options?: { method?: 'POST', body?: unknown }
) => Promise<T>

const currentCapabilities = computed(() => capabilityDefinitions[platform.value])
const currentAccounts = computed(() => accounts.value[platform.value])
const selectedCapabilityRows = computed(() => currentCapabilities.value.filter(definition => selectedCapabilities[definition.mode]))
const selectedMappingRows = computed(() => mappingDefinitions.filter(definition => activeMappings[definition.name]))
const requiresConnection = computed(() => selectedCapabilityRows.value.some(definition => capabilityOrigins[definition.mode] === 'zero'))
const mappingsComplete = computed(() => selectedMappingRows.value.every(definition => providerEventNames[definition.name]?.trim()))
const canSave = computed(() => (
  externalDestinationId.value.trim().length > 0
  && selectedCapabilityRows.value.length > 0
  && (!requiresConnection.value || Boolean(socialConnectionId.value))
  && mappingsComplete.value
  && Boolean(reason.value.trim())
  && !saving.value
))

function resetPlatformState() {
  socialConnectionId.value = ''
  externalDestinationId.value = ''
  reason.value = ''
  saveError.value = null

  for (const definition of Object.values(capabilityDefinitions).flat()) {
    selectedCapabilities[definition.mode] = false
    capabilityOrigins[definition.mode] = definition.defaultOrigin
  }
  for (const mapping of mappingDefinitions) {
    activeMappings[mapping.name] = false
    providerEventNames[mapping.name] = ''
  }
}

watch(platform, resetPlatformState)
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

async function loadAccounts() {
  accountsPending.value = true
  accountError.value = null
  try {
    const [meta, google] = await Promise.all([
      apiFetch<ConnectedAccount[]>('/api/agency/social/meta/accounts'),
      apiFetch<ConnectedAccount[]>('/api/agency/social/google/accounts')
    ])
    accounts.value = { meta, google_data_manager: google }
  } catch (error: unknown) {
    accountError.value = errorMessage(error, 'Connected accounts could not be loaded')
  } finally {
    accountsPending.value = false
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
    }>(`/api/agency/measurement/clients/${props.clientId}/destinations`, {
      method: 'POST',
      body: {
        expectedProfileVersion: props.profileConfigVersion,
        reason: reason.value.trim(),
        destination: {
          platform: platform.value,
          socialConnectionId: socialConnectionId.value || null,
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

void loadAccounts()
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
        @click="emit('cancel')"
      />
    </div>

    <div class="mt-5 grid gap-5 md:grid-cols-2">
      <label class="space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Provider</span>
        <select v-model="platform" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
          <option value="meta">Meta</option>
          <option value="google_data_manager">Google Data Manager</option>
        </select>
      </label>

      <label class="space-y-1.5 text-sm">
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
        <span v-if="accountError" class="text-xs text-error">{{ accountError }}</span>
        <span v-else-if="!accountsPending && !currentAccounts.length" class="text-xs text-warning">No connected account is available for this provider.</span>
      </label>

      <label class="space-y-1.5 text-sm md:col-span-2">
        <span class="font-medium text-highlighted">{{ platform === 'meta' ? 'Dataset ID' : 'Conversion Action resource' }}</span>
        <input
          v-model="externalDestinationId"
          data-testid="measurement-destination-id"
          type="text"
          maxlength="255"
          :placeholder="platform === 'meta' ? 'e.g. 573284833843027' : 'e.g. customers/123/conversionActions/456'"
          class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
        >
        <span class="text-xs text-muted">This explicit mapping prevents an ad account from being mistaken for a conversion destination.</span>
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
        <p class="text-sm text-error">
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
