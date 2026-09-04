<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MeasurementDestination } from '~/types/measurement'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'

const props = defineProps<{
  clientId: string
  profileConfigVersion: number
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
const ttclid = ref('')
const ttp = ref('')
const eventSourceUrl = ref('')
const clientUserAgent = ref('')
const clickType = ref<'gclid' | 'gbraid' | 'wbraid'>('gclid')
const clickValue = ref('')
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
let suppressPayloadInvalidation = false

const isMetaWeb = computed(() => (
  props.destination.platform === 'meta'
  && selectedIdentity.value.mode === 'browser_server_dedup'
))
const isTikTok = computed(() => props.destination.platform === 'tiktok')
const requiresBrowserContext = computed(() => isMetaWeb.value || isTikTok.value)
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
  requiresBrowserContext.value
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
const tiktokInputsReady = computed(() => (
  Boolean(testEventCode.value.trim())
  && Boolean(browserEventId.value.trim())
  && Boolean(ttclid.value.trim() || ttp.value.trim())
  && eventSourceUrlIsValid.value
  && Boolean(clientUserAgent.value.trim())
  && deliveryCapabilityModes.value.includes('tiktok_events_api')
))
const providerHeading = computed(() => (
  props.destination.platform === 'meta'
    ? 'Meta Test Events'
    : isTikTok.value
      ? 'TikTok Test Events'
      : 'Google validate-only'
))
const providerDescription = computed(() => {
  if (props.destination.platform === 'meta') {
    return isMetaWeb.value
      ? 'Sends one website server event to the dataset Test Events stream using the shared browser event ID. Temporary browser context is never stored by Zero.'
      : 'Sends one CRM event to the dataset Test Events stream. The temporary code and identifiers are never stored by Zero.'
  }
  if (isTikTok.value) {
    return 'Sends one server event to TikTok Test Events using the shared browser event ID. The test code and browser identifiers are never stored by Zero.'
  }
  return 'Validates one request against the exact conversion action without executing a conversion. The click identifier is never stored by Zero.'
})
const runButtonLabel = computed(() => (
  props.destination.platform === 'meta'
    ? 'Send Meta test event'
    : isTikTok.value
      ? 'Send TikTok test event'
      : 'Validate Google request'
))

const canRun = computed(() => (
  Boolean(canonicalEventName.value)
  && Boolean(reason.value.trim())
  && confirmed.value
  && (props.destination.platform === 'meta'
    ? metaInputsReady.value
    : isTikTok.value
      ? tiktokInputsReady.value
      : Boolean(clickValue.value.trim()))
  && !pending.value
))

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
  ttclid.value = ''
  ttp.value = ''
  eventSourceUrl.value = ''
  clientUserAgent.value = ''
  clickValue.value = ''
  reason.value = ''
  confirmed.value = false
  error.value = null
  if (!preserveResult) {
    result.value = null
    resultContext.value = null
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
    ttclid,
    ttp,
    eventSourceUrl,
    clientUserAgent,
    clickType,
    clickValue,
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
  const isMeta = props.destination.platform === 'meta'
  const submittedContext = {
    canonicalEventName: canonicalEventName.value,
    deliveryLabel: isMeta
      ? (isMetaWeb.value ? 'Web CAPI' : 'CRM CAPI')
      : isTikTok.value
        ? 'TikTok Events API'
        : 'Google validate-only'
  }

  try {
    const requestBody: Record<string, unknown> = {
      expectedConfigVersion: props.profileConfigVersion,
      canonicalEventName: canonicalEventName.value,
      occurredAt: new Date().toISOString(),
      idempotencyKey: idempotencyKey.value,
      reason: reason.value.trim(),
      confirmed: true,
      ...(isMeta
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
        : isTikTok.value
          ? {
              mode: 'tiktok_test_events',
              testEventCode: testEventCode.value.trim(),
              browserEventId: browserEventId.value.trim(),
              ttclid: ttclid.value.trim() || null,
              ttp: ttp.value.trim() || null,
              eventSourceUrl: eventSourceUrl.value.trim(),
              clientUserAgent: clientUserAgent.value.trim()
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
    ) as { run: typeof result.value }
    result.value = response.run
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
          {{ providerHeading }}
        </h5>
        <p class="mt-1 text-xs leading-5 text-muted">
          {{ providerDescription }}
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

        <template v-else-if="isTikTok">
          <UFormField label="Temporary Test Events code">
            <UInput
              v-model="testEventCode"
              data-testid="provider-test-code"
              autocomplete="off"
              maxlength="128"
              required
              aria-required="true"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Shared browser event ID" help="Required; use the event ID from the same approved browser conversion.">
            <UInput
              v-model="browserEventId"
              data-testid="provider-test-browser-event-id"
              autocomplete="off"
              maxlength="128"
              required
              aria-required="true"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Approved TikTok click ID" help="Provide at least one consent-eligible ttclid or _ttp value from the same browser event.">
            <UInput
              v-model="ttclid"
              data-testid="provider-test-ttclid"
              autocomplete="off"
              maxlength="512"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Approved TikTok first-party cookie">
            <UInput
              v-model="ttp"
              data-testid="provider-test-ttp"
              autocomplete="off"
              maxlength="512"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField
            label="Event source URL"
            help="Use an approved tracking-site URL without credentials, query parameters, or a fragment."
            :error="showEventSourceUrlError ? 'Enter a clean HTTP or HTTPS URL without query parameters.' : undefined"
          >
            <UInput
              v-model="eventSourceUrl"
              data-testid="provider-test-source-url"
              type="url"
              autocomplete="off"
              maxlength="2048"
              required
              aria-required="true"
              :aria-invalid="showEventSourceUrlError"
              class="w-full font-mono"
            />
          </UFormField>
          <UFormField label="Approved browser user agent" help="Required; copy it from the same approved browser event.">
            <UInput
              v-model="clientUserAgent"
              data-testid="provider-test-user-agent"
              autocomplete="off"
              maxlength="1024"
              required
              aria-required="true"
              class="w-full font-mono"
            />
          </UFormField>
          <p v-if="!deliveryCapabilityModes.includes('tiktok_events_api')" role="status" class="text-sm text-warning sm:col-span-2">
            Zero does not own a runnable TikTok Events API capability for this destination.
          </p>
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
        :label="runButtonLabel"
        icon="i-lucide-flask-conical"
        :loading="pending"
        :disabled="!canRun"
        @click="runTest"
      />
    </div>
  </section>
</template>
