<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type {
  ClientMeasurementProfile,
  MeasurementReadinessSummary
} from '~/types/measurement'

const props = defineProps<{
  clientId: string
  profile: ClientMeasurementProfile
  readiness: MeasurementReadinessSummary
  canConfigure: boolean
  canOwnerOverride?: boolean
}>()

const emit = defineEmits<{
  completed: [result: {
    kind: 'privacy' | 'live' | 'owner_override' | 'activation'
    warnings: Array<{ code: string }>
  }]
}>()

type GovernedCommand = 'privacy' | 'live' | 'owner_override' | 'activation'

const activeCommand = ref<GovernedCommand | null>(null)
const reason = ref('')
const confirmed = ref(false)
const pending = ref(false)
const commandError = ref<string | null>(null)

const configurationIsDormant = computed(() => (
  props.profile.desiredEnabled
  && !props.profile.enabled
  && props.profile.environment === 'test'
))
const deliveryOptedOut = computed(() => !props.profile.desiredEnabled)
const deliveryIsActive = computed(() => (
  props.profile.enabled && props.profile.environment === 'live'
))
const approvalsComplete = computed(() => (
  props.readiness.approvals.privacy && props.readiness.approvals.live
))
const canActivate = computed(() => (
  props.canConfigure
  && configurationIsDormant.value
  && approvalsComplete.value
  && props.readiness.liveEligible
  && !pending.value
))
const canSubmit = computed(() => (
  activeCommand.value !== null
  && Boolean(reason.value.trim())
  && confirmed.value
  && !pending.value
))

const commandTitle = computed(() => {
  if (activeCommand.value === 'privacy') return 'Record privacy approval'
  if (activeCommand.value === 'live') return 'Record live approval'
  if (activeCommand.value === 'owner_override') return 'Break-glass owner approval'
  return 'Activate live delivery'
})

const confirmationLabel = computed(() => {
  if (activeCommand.value === 'privacy') {
    return 'I have reviewed the consent and privacy configuration for this exact version.'
  }
  if (activeCommand.value === 'live') {
    return 'I approve this exact configuration for live delivery and am not the privacy approver.'
  }
  if (activeCommand.value === 'owner_override') {
    return 'I am the application owner and explicitly authorize this audited separation-of-duties exception for this exact version.'
  }
  return 'I confirm all readiness, provider evidence, rollback, and pilot approval gates are satisfied.'
})

function resetCommand() {
  activeCommand.value = null
  reason.value = ''
  confirmed.value = false
  commandError.value = null
}

function openCommand(command: GovernedCommand) {
  if (!props.canConfigure || !configurationIsDormant.value || pending.value) return
  if (command === 'privacy' && props.readiness.approvals.privacy) return
  if (command === 'live' && props.readiness.approvals.live) return
  if (command === 'owner_override' && (
    !props.canOwnerOverride || props.readiness.approvals.live
  )) return
  if (command === 'activation' && !canActivate.value) return
  resetCommand()
  activeCommand.value = command
}

function errorMessage(error: unknown) {
  const candidate = error as {
    data?: { statusMessage?: string, error?: { message?: string } }
    statusMessage?: string
    message?: string
  } | null

  return candidate?.data?.error?.message
    || candidate?.data?.statusMessage
    || candidate?.statusMessage
    || candidate?.message
    || 'The governed measurement command could not be completed'
}

async function submitCommand() {
  if (!canSubmit.value || !activeCommand.value) return
  const submittedCommand = activeCommand.value
  pending.value = true
  commandError.value = null

  try {
    if (submittedCommand === 'activation') {
      const response = await $fetch(
        `/api/agency/measurement/clients/${props.clientId}/activate` as string,
        {
          method: 'POST',
          body: {
            expectedConfigVersion: props.readiness.configVersion,
            reason: reason.value.trim()
          }
        }
      ) as { warnings?: Array<{ code: string }> }
      emit('completed', {
        kind: 'activation',
        warnings: response.warnings ?? []
      })
    } else if (submittedCommand === 'owner_override') {
      await $fetch(
        `/api/agency/measurement/clients/${props.clientId}/owner-override` as string,
        {
          method: 'POST',
          body: {
            expectedConfigVersion: props.readiness.configVersion,
            reason: reason.value.trim()
          }
        }
      )
      emit('completed', { kind: submittedCommand, warnings: [] })
    } else {
      await $fetch(
        `/api/agency/measurement/clients/${props.clientId}/approvals` as string,
        {
          method: 'POST',
          body: {
            expectedConfigVersion: props.readiness.configVersion,
            approvalKind: submittedCommand,
            reason: reason.value.trim()
          }
        }
      )
      emit('completed', { kind: submittedCommand, warnings: [] })
    }
    resetCommand()
  } catch (error: unknown) {
    commandError.value = errorMessage(error)
  } finally {
    pending.value = false
  }
}

watch(
  () => [
    props.readiness.configVersion,
    props.profile.desiredEnabled,
    props.profile.enabled,
    props.profile.environment
  ],
  resetCommand
)
</script>

<template>
  <section class="rounded-xl border border-default bg-default p-5 shadow-xs" data-testid="measurement-activation-controls">
    <div class="flex items-start justify-between gap-3">
      <div>
        <h3 class="font-semibold text-highlighted">
          Governed activation
        </h3>
        <p v-if="deliveryOptedOut" class="mt-1 text-sm leading-5 text-muted">
          Measurement signals are off. Restore the desired-on state before recording approvals or activating delivery.
        </p>
        <p v-else-if="!deliveryIsActive" class="mt-1 text-sm leading-5 text-muted">
          Approvals apply only to configuration version {{ readiness.configVersion }}. Activation rechecks canonical readiness before enabling delivery.
        </p>
        <p v-else class="mt-1 text-sm leading-5 text-muted">
          Delivery is active. Approval gates were consumed at activation and remain available in the audit log.
        </p>
      </div>
      <UIcon name="i-lucide-shield-check" class="mt-0.5 size-5 shrink-0 text-primary" />
    </div>

    <div v-if="!deliveryIsActive && !deliveryOptedOut" class="mt-4 space-y-2">
      <div class="flex items-center justify-between gap-3 rounded-lg bg-elevated p-3 text-sm">
        <span class="text-highlighted">Privacy approval</span>
        <UBadge :color="readiness.approvals.privacy ? 'success' : 'warning'" variant="subtle">
          {{ readiness.approvals.privacy ? 'Recorded' : 'Privacy approval pending' }}
        </UBadge>
      </div>
      <div class="flex items-center justify-between gap-3 rounded-lg bg-elevated p-3 text-sm">
        <span class="text-highlighted">Live approval</span>
        <UBadge :color="readiness.approvals.live ? 'success' : 'warning'" variant="subtle">
          {{ readiness.approvals.live ? 'Recorded' : 'Live approval pending' }}
        </UBadge>
      </div>
    </div>

    <p v-if="!deliveryIsActive && !deliveryOptedOut" class="mt-3 text-xs leading-5 text-muted">
      A different team member must record the other approval. Zero enforces the two-person rule for the same configuration version. The application owner may use the explicit audited break-glass exception when a second approver is unavailable.
    </p>

    <div v-if="canConfigure && configurationIsDormant" class="mt-4 flex flex-wrap gap-2">
      <UButton
        v-if="!readiness.approvals.privacy"
        data-testid="open-privacy-approval"
        label="Approve privacy"
        icon="i-lucide-shield"
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="pending"
        @click="openCommand('privacy')"
      />
      <UButton
        v-if="!readiness.approvals.live"
        data-testid="open-live-approval"
        label="Approve live"
        icon="i-lucide-user-check"
        size="sm"
        color="neutral"
        variant="outline"
        :disabled="pending"
        @click="openCommand('live')"
      />
      <UButton
        v-if="canOwnerOverride && !readiness.approvals.live"
        data-testid="open-owner-override"
        label="Owner override"
        icon="i-lucide-shield-alert"
        size="sm"
        color="warning"
        variant="outline"
        :disabled="pending"
        @click="openCommand('owner_override')"
      />
      <UButton
        data-testid="open-live-activation"
        :label="canActivate ? 'Activate live delivery' : 'Activation blocked'"
        icon="i-lucide-power"
        size="sm"
        :color="canActivate ? 'primary' : 'neutral'"
        :variant="canActivate ? 'solid' : 'outline'"
        :disabled="!canActivate"
        @click="openCommand('activation')"
      />
    </div>

    <p v-else-if="!canConfigure" class="mt-4 flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-lock" class="size-4" />
      Read-only access
    </p>
    <p v-else-if="deliveryOptedOut" class="mt-4 flex items-center gap-2 text-sm text-muted">
      <UIcon name="i-lucide-toggle-left" class="size-4" />
      Approvals and activation are unavailable while measurement signals are deliberately off.
    </p>
    <p v-else-if="deliveryIsActive" class="mt-4 text-sm text-muted">
      Live delivery is active. Configuration changes create a new governed version.
    </p>
    <p v-else class="mt-4 text-sm text-muted">
      Approval commands are available only while the profile is dormant in test mode.
    </p>

    <div v-if="activeCommand" class="mt-4 rounded-lg border border-primary/25 bg-primary/5 p-4">
      <h4 class="text-sm font-semibold text-highlighted">
        {{ commandTitle }}
      </h4>
      <p class="mt-1 text-xs leading-5 text-muted">
        This command is audited against configuration version {{ readiness.configVersion }} and will fail if the configuration changes.
      </p>

      <label class="mt-4 block space-y-1.5 text-sm">
        <span class="font-medium text-highlighted">Approval reason and evidence</span>
        <UTextarea
          v-model="reason"
          :rows="3"
          :maxlength="1000"
          placeholder="Describe the reviewed evidence and controlled-pilot decision"
          class="w-full"
        />
      </label>

      <UCheckbox
        v-model="confirmed"
        class="mt-4"
        :label="confirmationLabel"
      />

      <p v-if="commandError" role="alert" class="mt-3 text-sm text-error">
        {{ commandError }}
      </p>

      <div class="mt-4 flex flex-wrap justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="pending"
          @click="resetCommand"
        />
        <UButton
          data-testid="submit-governed-command"
          :label="activeCommand === 'activation' ? 'Confirm activation' : 'Record approval'"
          :loading="pending"
          :disabled="!canSubmit"
          @click="submitCommand"
        />
      </div>
    </div>
  </section>
</template>
