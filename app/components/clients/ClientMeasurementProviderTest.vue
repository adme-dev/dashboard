<script setup lang="ts">
import { computed, ref } from 'vue'
import type { MeasurementDestination } from '~/types/measurement'
import { classifyMeasurementEventIdentity } from '~~/shared/utils/measurementEventIdentity'

const props = defineProps<{
  clientId: string
  profileConfigVersion: number
  destination: Pick<MeasurementDestination, 'id' | 'platform' | 'capabilities' | 'mappings'>
}>()

const emit = defineEmits<{ close: [], completed: [] }>()

const activeMappings = computed(() => props.destination.mappings.filter(mapping => mapping.isActive))
const canonicalEventName = ref(activeMappings.value[0]?.canonicalEventName ?? '')
const selectedIdentity = computed(() => classifyMeasurementEventIdentity(
  canonicalEventName.value,
  props.destination.capabilities.map(capability => capability.mode)
))
const testEventCode = ref('')
const metaLeadId = ref('')
const browserEventId = ref('')
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

const metaLeadIdIsValid = computed(() => /^\d{15,16}$/.test(metaLeadId.value.trim()))
const showMetaLeadIdError = computed(() => (
  props.destination.platform === 'meta'
  && Boolean(metaLeadId.value)
  && !metaLeadIdIsValid.value
))

const canRun = computed(() => (
  Boolean(canonicalEventName.value)
  && Boolean(reason.value.trim())
  && confirmed.value
  && (props.destination.platform === 'meta'
    ? Boolean(testEventCode.value.trim() && metaLeadIdIsValid.value)
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

async function runTest() {
  if (!canRun.value) return
  pending.value = true
  error.value = null
  result.value = null
  const isMeta = props.destination.platform === 'meta'

  try {
    const response = await $fetch<{ run: typeof result.value }>(
      `/api/agency/measurement/clients/${props.clientId}/destinations/${props.destination.id}/test`,
      {
        method: 'POST',
        body: {
          expectedConfigVersion: props.profileConfigVersion,
          canonicalEventName: canonicalEventName.value,
          occurredAt: new Date().toISOString(),
          idempotencyKey: idempotencyKey.value,
          reason: reason.value.trim(),
          confirmed: true,
          ...(isMeta
            ? {
                mode: 'meta_test_events',
                testEventCode: testEventCode.value.trim(),
                metaLeadId: metaLeadId.value.trim(),
                browserEventId: selectedIdentity.value.mode === 'browser_server_dedup'
                  ? browserEventId.value.trim() || null
                  : null
              }
            : {
                mode: 'google_validate_only',
                clickIdentifier: { type: clickType.value, value: clickValue.value.trim() }
              })
        }
      }
    )
    result.value = response.run
    if (response.run?.status !== 'requested') idempotencyKey.value = crypto.randomUUID()
    testEventCode.value = ''
    metaLeadId.value = ''
    browserEventId.value = ''
    clickValue.value = ''
    confirmed.value = false
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
          {{ destination.platform === 'meta' ? 'Meta Test Events' : 'Google validate-only' }}
        </h5>
        <p class="mt-1 text-xs leading-5 text-muted">
          {{ destination.platform === 'meta'
            ? 'Sends one CRM event to the dataset Test Events stream. The temporary code and identifiers are never stored by Zero.'
            : 'Validates one request against the exact conversion action without executing a conversion. The click identifier is never stored by Zero.' }}
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

    <div class="mt-4 grid gap-4 sm:grid-cols-2">
      <label class="space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Canonical event</span>
        <select v-model="canonicalEventName" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
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
            class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
          >
        </label>
        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Approved Meta lead ID</span>
          <input
            v-model="metaLeadId"
            data-testid="provider-test-meta-lead-id"
            inputmode="numeric"
            autocomplete="off"
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
        <label v-if="selectedIdentity.mode === 'browser_server_dedup'" class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Shared browser event ID</span>
          <input
            v-model="browserEventId"
            data-testid="provider-test-browser-event-id"
            autocomplete="off"
            maxlength="128"
            class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
          >
        </label>
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
            class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
          >
        </label>
      </template>

      <label class="space-y-1.5 text-sm sm:col-span-2">
        <span class="font-medium text-highlighted">Approval reason</span>
        <textarea
          v-model="reason"
          data-testid="provider-test-reason"
          rows="2"
          maxlength="1000"
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

    <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p v-if="error" role="alert" class="text-sm text-error">
          {{ error }}
        </p>
        <p v-else-if="result?.status === 'accepted'" role="status" class="text-sm text-success">
          Provider accepted the test request.
        </p>
        <p v-else-if="result?.status === 'requested'" role="status" class="text-sm text-warning">
          This request is already reserved. Verify provider evidence before starting another test.
        </p>
        <p v-else-if="result" role="alert" class="text-sm text-error">
          {{ result.redactedError || result.errorClass || 'Provider rejected the test request.' }}
        </p>
      </div>
      <UButton
        data-testid="run-provider-test"
        :label="destination.platform === 'meta' ? 'Send Meta test event' : 'Validate Google request'"
        icon="i-lucide-flask-conical"
        :loading="pending"
        :disabled="!canRun"
        @click="runTest"
      />
    </div>
  </section>
</template>
