<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { ClientMeasurementProfile } from '~/types/measurement'

const props = defineProps<{
  clientId: string
  profile: ClientMeasurementProfile
  canConfigure: boolean
}>()

const emit = defineEmits<{
  saved: [profile: ClientMeasurementProfile]
}>()

type EditableProfile = Pick<
  ClientMeasurementProfile,
  | 'collectionTier'
  | 'firstPartyHostname'
  | 'consentMode'
  | 'vertical'
  | 'outcomeAuthority'
  | 'nativeLifecycleMode'
  | 'portalOutcomeMode'
>

const form = reactive<EditableProfile>({
  collectionTier: props.profile.collectionTier,
  firstPartyHostname: props.profile.firstPartyHostname,
  consentMode: props.profile.consentMode,
  vertical: props.profile.vertical,
  outcomeAuthority: props.profile.outcomeAuthority,
  nativeLifecycleMode: props.profile.nativeLifecycleMode,
  portalOutcomeMode: props.profile.portalOutcomeMode
})
const reason = ref('')
const saving = ref(false)
const saveError = ref<string | null>(null)
const savedMessage = ref<string | null>(null)
const apiFetch = $fetch as <T>(
  request: string,
  options: { method: 'PUT', body: unknown }
) => Promise<T>

function resetForm(profile: ClientMeasurementProfile) {
  form.collectionTier = profile.collectionTier
  form.firstPartyHostname = profile.firstPartyHostname
  form.consentMode = profile.consentMode
  form.vertical = profile.vertical
  form.outcomeAuthority = profile.outcomeAuthority
  form.nativeLifecycleMode = profile.nativeLifecycleMode
  form.portalOutcomeMode = profile.portalOutcomeMode
  reason.value = ''
  saveError.value = null
}

watch(() => props.profile, resetForm)

const patch = computed(() => {
  const changes: Partial<EditableProfile> = {}
  const hostname = form.collectionTier === 'first_party_cname'
    ? form.firstPartyHostname?.trim().toLowerCase() || null
    : null

  if (form.collectionTier !== props.profile.collectionTier) changes.collectionTier = form.collectionTier
  if (hostname !== props.profile.firstPartyHostname) changes.firstPartyHostname = hostname
  if (form.consentMode !== props.profile.consentMode) changes.consentMode = form.consentMode
  if (form.vertical.trim() !== props.profile.vertical) changes.vertical = form.vertical.trim()
  if (form.outcomeAuthority !== props.profile.outcomeAuthority) changes.outcomeAuthority = form.outcomeAuthority
  if (form.nativeLifecycleMode !== props.profile.nativeLifecycleMode) changes.nativeLifecycleMode = form.nativeLifecycleMode
  if (form.portalOutcomeMode !== props.profile.portalOutcomeMode) changes.portalOutcomeMode = form.portalOutcomeMode

  return changes
})

const policyConflict = computed(() => (
  form.portalOutcomeMode === 'authoritative' && form.outcomeAuthority !== 'zero_native'
))
const hostnameMissing = computed(() => (
  form.collectionTier === 'first_party_cname' && !form.firstPartyHostname?.trim()
))
const canSave = computed(() => (
  props.canConfigure
  && Object.keys(patch.value).length > 0
  && Boolean(reason.value.trim())
  && Boolean(form.vertical.trim())
  && !policyConflict.value
  && !hostnameMissing.value
  && !saving.value
))

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
    || 'The measurement profile could not be saved'
}

async function saveProfile() {
  if (!canSave.value) return
  saving.value = true
  saveError.value = null
  savedMessage.value = null

  try {
    const response = await apiFetch<{
      profile: ClientMeasurementProfile
      warnings: Array<{ code: string }>
    }>(`/api/agency/measurement/clients/${props.clientId}/profile`, {
      method: 'PUT',
      body: {
        expectedVersion: props.profile.configVersion,
        reason: reason.value.trim(),
        patch: patch.value
      }
    })

    if (response.warnings.some(warning => warning.code === 'MEASUREMENT_CACHE_STALE')) {
      savedMessage.value = 'Saved in Zero; edge publication needs attention.'
    } else {
      savedMessage.value = 'Configuration saved in Zero.'
    }
    emit('saved', response.profile)
    resetForm(response.profile)
  } catch (error: unknown) {
    saveError.value = errorMessage(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="rounded-xl border border-default bg-default p-5 shadow-xs sm:p-6">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 class="font-semibold text-highlighted">
          Edit configuration
        </h3>
        <p class="mt-1 text-sm text-muted">
          Activation is managed separately through readiness and approval gates. These settings cannot enable live delivery.
        </p>
      </div>
      <div v-if="!canConfigure" class="flex items-center gap-2 text-xs font-medium text-muted">
        <UIcon name="i-lucide-lock" class="size-4" />
        Read-only access
      </div>
    </div>

    <template v-if="canConfigure">
      <div class="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Collection tier</span>
          <select v-model="form.collectionTier" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
            <option value="backend_only">Backend only</option>
            <option value="cloudflare_owned">Cloudflare owned</option>
            <option value="first_party_cname">First-party hostname</option>
            <option value="shared_endpoint">Shared endpoint</option>
          </select>
        </label>

        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Consent mode</span>
          <select
            v-model="form.consentMode"
            data-testid="measurement-consent-mode"
            class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm"
          >
            <option value="consent_gated">Consent gated</option>
            <option value="au_optout">Australian opt-out</option>
            <option value="off">Off</option>
          </select>
        </label>

        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Client vertical</span>
          <input v-model="form.vertical" maxlength="100" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
        </label>

        <label v-if="form.collectionTier === 'first_party_cname'" class="space-y-1.5 text-sm md:col-span-2 xl:col-span-3">
          <span class="font-medium text-highlighted">First-party measurement hostname</span>
          <input
            v-model="form.firstPartyHostname"
            type="text"
            maxlength="253"
            placeholder="measure.client-domain.com.au"
            class="w-full rounded-md border border-default bg-default px-3 py-2 font-mono text-sm"
          >
          <span v-if="hostnameMissing" class="text-xs text-error">A hostname is required for first-party collection.</span>
        </label>

        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Outcome authority</span>
          <select v-model="form.outcomeAuthority" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
            <option value="zero_native">Zero CRM</option>
            <option value="client_webhook">Client webhook</option>
            <option value="connector_sync">Connector sync</option>
            <option value="manual_import">Manual import</option>
          </select>
        </label>

        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Native lifecycle source</span>
          <select v-model="form.nativeLifecycleMode" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
            <option value="crm_preferred">CRM preferred</option>
            <option value="leads_only">Lead intake only</option>
          </select>
        </label>

        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Client portal outcome mode</span>
          <select v-model="form.portalOutcomeMode" class="w-full rounded-md border border-default bg-default px-3 py-2 text-sm">
            <option value="disabled">Disabled</option>
            <option value="propose">Client proposes outcomes</option>
            <option value="authoritative">Client outcomes are authoritative</option>
          </select>
        </label>
      </div>

      <p v-if="policyConflict" class="mt-4 flex gap-2 text-sm text-error">
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 shrink-0" />
        Authoritative portal outcomes require Zero CRM to remain the lifecycle authority.
      </p>

      <div class="mt-5 border-t border-default pt-5">
        <label class="space-y-1.5 text-sm">
          <span class="font-medium text-highlighted">Change reason</span>
          <textarea
            v-model="reason"
            data-testid="measurement-change-reason"
            rows="2"
            maxlength="1000"
            placeholder="Explain the approved setup change and supporting evidence"
            class="w-full resize-y rounded-md border border-default bg-default px-3 py-2 text-sm"
          />
        </label>

        <div class="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div class="text-sm">
            <p v-if="saveError" class="text-error">
              {{ saveError }}
            </p>
            <p v-else-if="savedMessage" class="text-success">
              {{ savedMessage }}
            </p>
            <p v-else class="text-muted">
              Only changed fields will be recorded in audit history.
            </p>
          </div>
          <UButton
            data-testid="save-measurement-profile"
            label="Save configuration"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="!canSave"
            @click="saveProfile"
          />
        </div>
      </div>
    </template>
  </div>
</template>
