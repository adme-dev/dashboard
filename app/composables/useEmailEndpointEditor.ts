import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import {
  buildCreateEmailEndpointBody,
  buildUpdateEmailEndpointBody,
  routingPresetPreview,
  type EmailEndpointCadence,
  type EmailEndpointDraft,
  type EmailEndpointTeamOption,
  type SafeEmailLeadEndpoint
} from '~/utils/emailEndpointUi'

interface EditorCallbacks {
  onSaved: (endpoint: SafeEmailLeadEndpoint) => void
  onClose: () => void
}

function cadenceFor(hours: number | null): EmailEndpointCadence {
  if (hours === null) return 'none'
  if (hours === 1) return 'hourly'
  if (hours === 24) return 'daily'
  if (hours === 168) return 'weekly'
  return 'custom'
}

function blankDraft(): EmailEndpointDraft {
  return {
    clientId: 'none',
    label: '',
    addressPrefix: '',
    expectedProvider: 'none',
    parserMode: 'auto',
    aiExtractionMode: 'disabled',
    allowedSenderDomains: [],
    cadence: 'none',
    customSilenceHours: null,
    firstResponseSlaMinutes: null,
    formName: '',
    routingPreset: 'none',
    notificationEmail: '',
    assignedUserId: 'none'
  }
}

export function useEmailEndpointEditor(
  open: MaybeRefOrGetter<boolean>,
  endpoint: MaybeRefOrGetter<SafeEmailLeadEndpoint | null>,
  team: MaybeRefOrGetter<EmailEndpointTeamOption[]>,
  callbacks: EditorCallbacks
) {
  const toast = useToast()
  const apiFetch = $fetch as <T>(
    request: string,
    options: { method: 'POST' | 'PATCH', body: Record<string, unknown> }
  ) => Promise<T>
  const saving = ref(false)
  const showAdvanced = ref(false)
  const showPresetConfirmation = ref(false)
  const draft = ref<EmailEndpointDraft>(blankDraft())
  const isEditing = computed(() => Boolean(toValue(endpoint)))
  const presetDestinations = computed(() => routingPresetPreview(draft.value, toValue(team)))

  function resetDraft() {
    const current = toValue(endpoint)
    const cadence = cadenceFor(current?.expected_max_silence_hours ?? null)
    draft.value = current
      ? {
          clientId: current.client_id,
          label: current.label,
          addressPrefix: current.address_prefix,
          expectedProvider: current.expected_provider ?? 'none',
          parserMode: current.parser_mode,
          aiExtractionMode: current.ai_extraction_mode,
          allowedSenderDomains: [...current.allowed_sender_domains],
          cadence,
          customSilenceHours: cadence === 'custom' ? current.expected_max_silence_hours : null,
          firstResponseSlaMinutes: current.first_response_sla_minutes,
          formName: current.form_name,
          routingPreset: 'none',
          notificationEmail: '',
          assignedUserId: 'none'
        }
      : blankDraft()
    showAdvanced.value = false
    showPresetConfirmation.value = false
  }

  watch(
    () => [toValue(open), toValue(endpoint)?.id] as const,
    ([isOpen]) => {
      if (isOpen) resetDraft()
    },
    { immediate: true }
  )

  function errorMessage(error: unknown) {
    const candidate = error as {
      data?: { statusMessage?: string }
      statusMessage?: string
      message?: string
    } | null
    return candidate?.data?.statusMessage
      ?? candidate?.statusMessage
      ?? candidate?.message
      ?? 'Please review the fields and retry.'
  }

  function validateDraft() {
    if (draft.value.clientId === 'none') return 'Client is required.'
    if (!draft.value.label.trim()) return 'Label is required.'
    if (!draft.value.formName.trim()) return 'Form name is required.'
    if (
      draft.value.cadence === 'custom'
      && (!Number.isInteger(draft.value.customSilenceHours)
        || Number(draft.value.customSilenceHours) < 1
        || Number(draft.value.customSilenceHours) > 8760)
    ) return 'Custom max silence must be between 1 and 8,760 hours.'
    if (
      draft.value.firstResponseSlaMinutes !== null
      && (!Number.isInteger(draft.value.firstResponseSlaMinutes)
        || draft.value.firstResponseSlaMinutes < 1
        || draft.value.firstResponseSlaMinutes > 43200)
    ) return 'First-response SLA must be between 1 and 43,200 minutes.'
    if (draft.value.routingPreset === 'portal_notification' && !draft.value.notificationEmail.trim()) {
      return 'Notification email is required for this routing preset.'
    }
    if (draft.value.routingPreset === 'assign_user' && draft.value.assignedUserId === 'none') {
      return 'A team member is required for this routing preset.'
    }
    return null
  }

  async function persist() {
    if (saving.value) return
    const validation = validateDraft()
    if (validation) {
      toast.add({ title: 'Check endpoint details', description: validation, color: 'error' })
      return
    }
    const current = toValue(endpoint)
    saving.value = true
    try {
      const response = current
        ? await apiFetch<{ endpoint: SafeEmailLeadEndpoint }>(
            `/api/leads/email-endpoints/${current.id}`,
            { method: 'PATCH', body: buildUpdateEmailEndpointBody(draft.value) }
          )
        : await apiFetch<{ endpoint: SafeEmailLeadEndpoint }>(
            '/api/leads/email-endpoints',
            { method: 'POST', body: buildCreateEmailEndpointBody(draft.value) }
          )
      toast.add({
        title: current ? 'Email address updated' : 'Email address created',
        description: response.endpoint.email_address,
        color: 'success'
      })
      showPresetConfirmation.value = false
      callbacks.onSaved(response.endpoint)
      callbacks.onClose()
    } catch (error) {
      toast.add({
        title: current ? 'Update failed' : 'Create failed',
        description: errorMessage(error),
        color: 'error'
      })
    } finally {
      saving.value = false
    }
  }

  function requestSave() {
    const validation = validateDraft()
    if (validation) {
      toast.add({ title: 'Check endpoint details', description: validation, color: 'error' })
      return
    }
    if (!isEditing.value && draft.value.routingPreset !== 'none') {
      showPresetConfirmation.value = true
      return
    }
    void persist()
  }

  return {
    draft,
    saving,
    showAdvanced,
    showPresetConfirmation,
    isEditing,
    presetDestinations,
    requestSave,
    persist
  }
}
