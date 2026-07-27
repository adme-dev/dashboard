<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MeasurementDestination } from '~/types/measurement'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'

const props = defineProps<{
  clientId: string
  destinationConfigVersion: number
  destination: Pick<MeasurementDestination, 'id' | 'platform' | 'capabilities' | 'mappings'>
}>()

const emit = defineEmits<{ close: [], completed: [] }>()

const RUNNABLE_CAPABILITY_STATUSES = new Set(['configured', 'validating', 'ready', 'degraded'])
const META_BROWSER_IDENTIFIER_PATTERN = /^fb\.\d+\.\d{10,16}\.[^\s]{1,384}$/
const activeMappings = computed(() => props.destination.mappings.filter(mapping => mapping.isActive))
const canonicalEventName = ref(activeMappings.value[0]?.canonicalEventName ?? '')
const deliveryCapabilityModes = computed(() => props.destination.capabilities
  .filter(capability => (
    capability.managementOrigin === 'zero'
    && capability.canZeroMutate
    && RUNNABLE_CAPABILITY_STATUSES.has(capability.status)
  ))
  .map(capability => capability.mode))
const selectedIdentity = computed(() => classifyMeasurementEventIdentity(
  canonicalEventName.value,
  deliveryCapabilityModes.value
))
const testEventCode = ref('')
const metaLeadId = ref('')
const browserEventId = ref('')
const fbc = ref('')
const fbp = ref('')
const eventSourceUrl = ref('')
const clientUserAgent = ref('')
const clickType = ref<'gclid' | 'gbraid' | 'wbraid'>('gclid')
const clickValue = ref('')
const GA_CLIENT_ID_PATTERN = /^[0-9]+\.[0-9]+$/
const gaClientId = ref('')
const reason = ref('')
const confirmed = ref(false)
const idempotencyKey = ref(crypto.randomUUID())
const pending = ref(false)
const error = ref<string | null>(null)
const result = ref<{
  status: 'requested' | 'accepted' | 'failed'
  providerRequestId: string | null
  errorClass: string | null
  redactedError: string | null
} | null>(null)
const resultContext = ref<{
  canonicalEventName: string
  deliveryLabel: string
} | null>(null)
const validation = ref<{
  recorded: boolean
  skippedReason: 'version_conflict' | 'record_failed' | 'already_run' | 'no_covered_capabilities' | null
  healthStatus: string | null
} | null>(null)
let suppressPayloadInvalidation = false

const isMetaWeb = computed(() => (
  props.destination.platform === 'meta'
  && selectedIdentity.value.mode === 'browser_server_dedup'
))
const metaLeadIdIsValid = computed(() => /^\d{15,16}$/.test(metaLeadId.value.trim()))
const eventSourceUrlIsValid = computed(() => {
  try {
    const url = new URL(eventSourceUrl.value.trim())
    return (url.protocol === 'https:' || url.protocol === 'http:')
      && !url.username
      && !url.password
      && !url.search
      && !url.hash
  } catch {
    return false
  }
})
const fbcIsValid = computed(() => !fbc.value || META_BROWSER_IDENTIFIER_PATTERN.test(fbc.value.trim()))
const fbpIsValid = computed(() => !fbp.value || META_BROWSER_IDENTIFIER_PATTERN.test(fbp.value.trim()))
const metaBrowserContextIsValid = computed(() => (
  Boolean(fbc.value.trim() || fbp.value.trim())
  && fbcIsValid.value
  && fbpIsValid.value
))
const metaCapabilityReady = computed(() => (
  isMetaWeb.value
    ? deliveryCapabilityModes.value.includes('meta_web_capi')
    : deliveryCapabilityModes.value.includes('meta_crm_capi')
      || deliveryCapabilityModes.value.includes('meta_conversion_leads')
))
const showMetaLeadIdError = computed(() => (
  props.destination.platform === 'meta'
  && !isMetaWeb.value
  && Boolean(metaLeadId.value)
  && !metaLeadIdIsValid.value
))
const showEventSourceUrlError = computed(() => (
  isMetaWeb.value
  && Boolean(eventSourceUrl.value)
  && !eventSourceUrlIsValid.value
))
const metaInputsReady = computed(() => (
  Boolean(testEventCode.value.trim())
  && (isMetaWeb.value
    ? Boolean(
        browserEventId.value.trim()
        && metaBrowserContextIsValid.value
        && eventSourceUrlIsValid.value
        && clientUserAgent.value.trim()
      )
    : metaLeadIdIsValid.value)
  && metaCapabilityReady.value
))
const gaClientIdIsValid = computed(() => GA_CLIENT_ID_PATTERN.test(gaClientId.value.trim()))
const showGaClientIdError = computed(() => (
  props.destination.platform === 'ga4'
  && Boolean(gaClientId.value)
  && !gaClientIdIsValid.value
))

const canRun = computed(() => (
  Boolean(canonicalEventName.value)
  && Boolean(reason.value.trim())
  && confirmed.value
  && (props.destination.platform === 'meta'
    ? metaInputsReady.value
    : props.destination.platform === 'ga4'
      ? gaClientIdIsValid.value
      : Boolean(clickValue.value.trim()))
    && !pending.value
))

// Three-way lookups (not nested ternaries) so a new platform can't silently fall through to
// whichever branch happened to be the `else` when there were only two platforms.
const testModeLabel = computed(() => ({
  meta: 'Meta Test Events',
  google_data_manager: 'Google validate-only',
  ga4: 'GA4 debug validation'
}[props.destination.platform]))

const testModeDescription = computed(() => {
  if (props.destination.platform === 'meta') {
    return isMetaWeb.value
      ? 'Sends one website server event to the dataset Test Events stream using the shared browser event ID. Temporary browser context is never stored by Zero.'
      : 'Sends one CRM event to the dataset Test Events stream. The temporary code and identifiers are never stored by Zero.'
  }
  if (props.destination.platform === 'ga4') {
    return 'Sends one Measurement Protocol event to GA4\'s debug endpoint without recording a real hit. A test has no real visitor, so the client ID does not need to belong to one. The client ID is never stored by Zero.'
  }
  return 'Validates one request against the exact conversion action without executing a conversion. The click identifier is never stored by Zero.'
})

const submitLabel = computed(() => ({
  meta: 'Send Meta test event',
  google_data_manager: 'Validate Google request',
  ga4: 'Validate GA4 event'
}[props.destination.platform]))

const validationAlert = computed(() => {
  if (!validation.value) return null
  if (validation.value.recorded) {
    return {
      color: 'success' as const,
      icon: 'i-lucide-shield-check',
      title: 'Destination health updated',
      description: `Health status is now ${validation.value.healthStatus}.`
    }
  }
  if (validation.value.skippedReason === 'version_conflict') {
    return {
      color: 'warning' as const,
      icon: 'i-lucide-refresh-cw',
      title: 'Configuration changed during the test',
      description: 'Destination health was not updated. Reload this page and run the test again.'
    }
  }
  if (validation.value.skippedReason === 'already_run') {
    return {
      color: 'info' as const,
      icon: 'i-lucide-info',
      title: 'Replayed an earlier test',
      description: 'This was an idempotent replay of a previous run, so destination health was not re-recorded.'
    }
  }
  if (validation.value.skippedReason === 'record_failed') {
    return {
      color: 'error' as const,
      icon: 'i-lucide-alert-circle',
      title: 'Destination health could not be updated',
      description: 'The provider accepted the test, but recording the result failed. Retry the test.'
    }
  }
  if (validation.value.skippedReason === 'no_covered_capabilities') {
    return {
      color: 'warning' as const,
      icon: 'i-lucide-alert-triangle',
      title: 'Nothing recordable',
      description: 'This test does not cover any capability, so no destination health was recorded.'
    }
  }
  return null
})

function errorMessage(value: unknown) {
  const candidate = value as {
    data?: { statusMessage?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
  } | null
  return candidate?.data?.error?.message
    || candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'Provider validation could not be completed'
}

function resetTransientApproval(preserveResult = false) {
  suppressPayloadInvalidation = true
  testEventCode.value = ''
  metaLeadId.value = ''
  browserEventId.value = ''
  fbc.value = ''
  fbp.value = ''
  eventSourceUrl.value = ''
  clientUserAgent.value = ''
  clickValue.value = ''
  gaClientId.value = ''
  reason.value = ''
  confirmed.value = false
  error.value = null
  if (!preserveResult) {
    result.value = null
    resultContext.value = null
    validation.value = null
  }
  idempotencyKey.value = crypto.randomUUID()
  suppressPayloadInvalidation = false
}

function invalidatePayloadApproval() {
  if (suppressPayloadInvalidation) return
  confirmed.value = false
  error.value = null
  result.value = null
  resultContext.value = null
  validation.value = null
  idempotencyKey.value = crypto.randomUUID()
}

watch(canonicalEventName, () => resetTransientApproval())
watch(
  () => activeMappings.value.map(mapping => `${mapping.id}:${mapping.canonicalEventName}`).join('|'),
  () => {
    if (!activeMappings.value.some(mapping => mapping.canonicalEventName === canonicalEventName.value)) {
      canonicalEventName.value = activeMappings.value[0]?.canonicalEventName ?? ''
    } else {
      resetTransientApproval()
    }
  }
)
watch(() => deliveryCapabilityModes.value.join('|'), () => resetTransientApproval())
watch(
  [
    testEventCode,
    metaLeadId,
    browserEventId,
    fbc,
    fbp,
    eventSourceUrl,
    clientUserAgent,
    clickType,
    clickValue,
    gaClientId,
    reason
  ],
  invalidatePayloadApproval,
  { flush: 'sync' }
)

async function runTest() {
  if (!canRun.value) return
  pending.value = true
  error.value = null
  result.value = null
  validation.value = null
  const platform = props.destination.platform
  const submittedContext = {
    canonicalEventName: canonicalEventName.value,
    deliveryLabel: platform === 'meta'
      ? (isMetaWeb.value ? 'Web CAPI' : 'CRM CAPI')
      : platform === 'ga4'
        ? 'GA4 debug validation'
        : 'Google validate-only'
  }

  try {
    const requestBody: Record<string, unknown> = {
      expectedConfigVersion: props.destinationConfigVersion,
      canonicalEventName: canonicalEventName.value,
      occurredAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey.value,
      reason: reason.value.trim(),
      confirmed: true,
      ...(platform === 'meta'
        ? isMetaWeb.value
          ? {
              mode: 'meta_test_events',
              deliveryMode: 'web',
              testEventCode: testEventCode.value.trim(),
              browserEventId: browserEventId.value.trim(),
              fbc: fbc.value.trim() || null,
              fbp: fbp.value.trim() || null,
              eventSourceUrl: eventSourceUrl.value.trim(),
              clientUserAgent: clientUserAgent.value.trim()
            }
          : {
              mode: 'meta_test_events',
              deliveryMode: 'crm',
              testEventCode: testEventCode.value.trim(),
              metaLeadId: metaLeadId.value.trim(),
              browserEventId: null
            }
        : platform === 'ga4'
          ? {
              mode: 'ga4_debug_validation',
              gaClientId: gaClientId.value.trim()
            }
          : {
              mode: 'google_validate_only',
              clickIdentifier: { type: clickType.value, value: clickValue.value.trim() }
            })
    }
    const response = await $fetch(
      `/api/agency/measurement/clients/${props.clientId}/destinations/${props.destination.id}/test` as string,
      {
        method: 'POST',
        body: requestBody
      }
    ) as { run: typeof result.value, validation: typeof validation.value }
    result.value = response.run
    validation.value = response.validation
    resultContext.value = submittedContext
    resetTransientApproval(true)
    emit('completed')
  } catch (value) {
    error.value = errorMessage(value)
  } finally {
    pending.value = false
  }
}
</script>

<template>
  <section class="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4" data-testid="measurement-provider-test">
    <div class="flex items-start justify-between gap-4">
      <div>
        <h5 class="text-sm font-semibold text-highlighted">
          {{ testModeLabel }}
        </h5>
        <p class="mt-1 text-xs leading-5 text-muted">
          {{ testModeDescription }}
        </p>
      </div>
      <UButton
        label="Close"
        color="neutral"
        variant="ghost"
        size="xs"
        :disabled="pending"
        @click="emit('close')"
      />
    </div>

    <fieldset :disabled="pending" class="min-w-0 border-0 p-0" data-testid="provider-test-controls">
      <div class="mt-4 grid gap-4 sm:grid-cols-2">
        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Canonical event</span>
          <select
            v-model="canonicalEventName"
            required
            aria-required="true"
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
          >
            <option v-for="mapping in activeMappings" :key="mapping.id" :value="mapping.canonicalEventName">
              {{ mapping.canonicalEventName }} → {{ mapping.providerEventName }}
            </option>
          </select>
          <span class="block text-xs text-muted">{{ selectedIdentity.label }}</span>
        </label>

        <template v-if="destination.platform === 'meta'">
          <label class="space-y-1.5 text-sm">
            <span class="font-medium text-highlighted">Temporary Test Events code</span>
            <input
              v-model="testEventCode"
              data-testid="provider-test-code"
              autocomplete="off"
              maxlength="128"
              required
              aria-required="true"
              class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
            >
          </label>
          <label v-if="!isMetaWeb" class="space-y-1.5 text-sm">
            <span class="font-medium text-highlighted">Approved Meta lead ID</span>
            <input
              v-model="metaLeadId"
              data-testid="provider-test-meta-lead-id"
              inputmode="numeric"
              autocomplete="off"
              required
              aria-required="true"
              aria-describedby="provider-test-meta-lead-id-help"
              :aria-invalid="showMetaLeadIdError"
              class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
            >
            <span
              id="provider-test-meta-lead-id-help"
              data-testid="provider-test-meta-lead-id-help"
              class="block text-xs"
              :class="showMetaLeadIdError ? 'text-error' : 'text-muted'"
            >Meta Lead Ads leadgen_id; exactly 15 or 16 digits.</span>
          </label>
          <label v-if="isMetaWeb" class="space-y-1.5 text-sm">
            <span class="font-medium text-highlighted">Shared browser event ID</span>
            <input
              v-model="browserEventId"
              data-testid="provider-test-browser-event-id"
              autocomplete="off"
              maxlength="128"
              required
              aria-required="true"
              aria-describedby="provider-test-browser-event-id-help"
              :aria-invalid="Boolean(browserEventId) && !browserEventId.trim()"
              class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
            >
            <span id="provider-test-browser-event-id-help" class="block text-xs text-muted">Required; must exactly match the approved browser event.</span>
          </label>
          <div
            v-if="isMetaWeb"
            role="group"
            aria-label="Approved Meta browser context"
            aria-required="true"
            class="contents"
          >
            <label class="space-y-1.5 text-sm">
              <span class="font-medium text-highlighted">Approved browser fbc</span>
              <input
                v-model="fbc"
                data-testid="provider-test-fbc"
                autocomplete="off"
                maxlength="512"
                aria-describedby="provider-test-browser-context-help"
                :aria-invalid="Boolean(fbc || fbp) && !metaBrowserContextIsValid"
                class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
              >
              <span
                id="provider-test-browser-context-help"
                class="block text-xs"
                :class="(fbc || fbp) && !metaBrowserContextIsValid ? 'text-error' : 'text-muted'"
              >Provide at least one valid fbc or fbp from the approved browser event.</span>
            </label>
            <label class="space-y-1.5 text-sm">
              <span class="font-medium text-highlighted">Approved browser fbp</span>
              <input
                v-model="fbp"
                data-testid="provider-test-fbp"
                autocomplete="off"
                maxlength="512"
                aria-describedby="provider-test-browser-context-help"
                :aria-invalid="Boolean(fbc || fbp) && !metaBrowserContextIsValid"
                class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
              >
            </label>
            <label class="space-y-1.5 text-sm">
              <span class="font-medium text-highlighted">Event source URL</span>
              <input
                v-model="eventSourceUrl"
                data-testid="provider-test-source-url"
                type="url"
                autocomplete="off"
                maxlength="2048"
                required
                aria-required="true"
                aria-describedby="provider-test-source-url-help"
                :aria-invalid="showEventSourceUrlError"
                class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
              >
              <span
                id="provider-test-source-url-help"
                class="block text-xs"
                :class="showEventSourceUrlError ? 'text-error' : 'text-muted'"
              >Use an approved tracking-site URL without credentials, query parameters, or a fragment.</span>
            </label>
            <label class="space-y-1.5 text-sm">
              <span class="font-medium text-highlighted">Approved browser user agent</span>
              <input
                v-model="clientUserAgent"
                data-testid="provider-test-user-agent"
                autocomplete="off"
                maxlength="1024"
                required
                aria-required="true"
                aria-describedby="provider-test-user-agent-help"
                :aria-invalid="Boolean(clientUserAgent) && !clientUserAgent.trim()"
                class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
              >
              <span id="provider-test-user-agent-help" class="block text-xs text-muted">Required; copy it from the same approved browser event.</span>
            </label>
          </div>
        </template>

        <template v-else-if="destination.platform === 'ga4'">
          <UFormField
            label="Test _ga client ID"
            help="The _ga cookie value from a real visitor, formatted 123456789.1234567890. A test run has no real visitor, so any well-formed value works."
            :error="showGaClientIdError ? 'Must be two dot-separated numbers, e.g. 123456789.1234567890.' : undefined"
            required
          >
            <UInput
              v-model="gaClientId"
              data-testid="provider-test-ga-client-id"
              autocomplete="off"
              maxlength="255"
              class="w-full font-mono"
            />
          </UFormField>
        </template>

        <template v-else>
          <label class="space-y-1.5 text-sm">
            <span class="font-medium text-highlighted">Click identifier type</span>
            <select v-model="clickType" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
              <option value="gclid">GCLID</option>
              <option value="gbraid">GBRAID</option>
              <option value="wbraid">WBRAID</option>
            </select>
          </label>
          <label class="space-y-1.5 text-sm">
            <span class="font-medium text-highlighted">Approved test click identifier</span>
            <input
              v-model="clickValue"
              data-testid="provider-test-click-id"
              autocomplete="off"
              maxlength="512"
              required
              aria-required="true"
              class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
            >
          </label>
        </template>

        <p
          v-if="destination.platform === 'meta' && !metaCapabilityReady"
          role="status"
          class="text-sm text-warning sm:col-span-2"
        >
          Zero does not own a runnable capability for this event's required delivery path.
        </p>

        <label class="space-y-1.5 text-sm sm:col-span-2">
          <span class="font-medium text-highlighted">Approval reason</span>
          <textarea
            v-model="reason"
            data-testid="provider-test-reason"
            rows="2"
            maxlength="1000"
            required
            aria-required="true"
            class="w-full resize-y rounded-md border border-default bg-default px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label class="mt-4 flex items-start gap-3 rounded-md border border-warning/25 bg-warning/5 p-3 text-sm">
        <input
          v-model="confirmed"
          data-testid="provider-test-confirmed"
          type="checkbox"
          class="mt-0.5 size-4 rounded border-default"
        >
        <span class="text-muted">I approve this single provider validation against the displayed destination and understand it creates external test traffic.</span>
      </label>
    </fieldset>

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ error }}
        </p>
        <p v-else-if="result?.status === 'accepted'" role="status" class="text-sm text-success">
          Provider accepted the test request for {{ resultContext?.canonicalEventName }} via {{ resultContext?.deliveryLabel }}.
        </p>
        <p v-else-if="result?.status === 'requested'" role="status" class="text-sm text-warning">
          The {{ resultContext?.canonicalEventName }} request via {{ resultContext?.deliveryLabel }} is already reserved. Verify provider evidence before starting another test.
        </p>
        <p v-else-if="result" role="alert" class="text-sm text-error">
          {{ result.redactedError || result.errorClass || 'Provider rejected the test request.' }}
        </p>
      </div>
      <UButton
        data-testid="run-provider-test"
        :label="submitLabel"
        icon="i-lucide-flask-conical"
        :loading="pending"
        :disabled="!canRun"
        @click="runTest"
      />
    </div>

    <UAlert
      v-if="validationAlert"
      data-testid="provider-test-validation"
      class="mt-3"
      variant="subtle"
      :color="validationAlert.color"
      :icon="validationAlert.icon"
      :title="validationAlert.title"
      :description="validationAlert.description"
    />
  </section>
</template>
