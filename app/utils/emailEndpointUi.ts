export type EmailEndpointParserMode = 'auto' | 'adf' | 'generic'
export type EmailEndpointAiMode = 'disabled' | 'fallback'
export type EmailEndpointCadence = 'none' | 'hourly' | 'daily' | 'weekly' | 'custom'
export type EmailEndpointRoutingPreset = 'none' | 'portal' | 'portal_notification' | 'assign_user'

export interface SafeEmailLeadEndpoint {
  id: string
  client_id: string
  label: string
  address_prefix: string
  email_address: string
  expected_provider: string | null
  parser_mode: EmailEndpointParserMode
  ai_extraction_mode: EmailEndpointAiMode
  ai_privacy_approval_version: number | null
  ai_privacy_approved_at: string | null
  allowed_sender_domains: string[]
  expected_max_silence_hours: number | null
  first_response_sla_minutes: number | null
  form_id: string
  form_name: string
  enabled: boolean
  last_received_at: string | null
  last_accepted_at: string | null
  last_failure_at: string | null
  consecutive_failures: number
  oldest_nonterminal_at: string | null
  non_terminal_count: number
  recovery_attempt_count: number
  exhausted_recovery_count: number
  recovery_state: 'idle' | 'pending' | 'retrying' | 'exhausted'
  address_prefix_locked: boolean
  retired_at: string | null
  created_at: string
  updated_at: string
}

export interface EmailEndpointDraft {
  clientId: string
  label: string
  addressPrefix: string
  expectedProvider: string
  parserMode: EmailEndpointParserMode
  aiExtractionMode: EmailEndpointAiMode
  allowedSenderDomains: string[]
  cadence: EmailEndpointCadence
  customSilenceHours: number | null
  firstResponseSlaMinutes: number | null
  formName: string
  routingPreset: EmailEndpointRoutingPreset
  notificationEmail: string
  assignedUserId: string
}

export interface EmailEndpointClientOption {
  id: string
  name: string
}

export interface EmailEndpointTeamOption {
  id: string
  name: string
}

export type EmailEndpointHealth = {
  label: 'Retired' | 'Disabled' | 'Needs attention' | 'Awaiting first message' | 'Overdue' | 'Healthy' | 'Active'
  color: 'neutral' | 'error' | 'warning' | 'success' | 'info'
  description: string
}

export type EmailEndpointRecovery = {
  label: 'Clear' | 'Pending' | 'Recovering' | 'Exhausted'
  color: 'neutral' | 'error' | 'warning' | 'info'
  description: string
}

export function normalizeEmailEndpointPrefixInput(value: string | number): string {
  return String(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
}

function silenceHours(draft: EmailEndpointDraft): number | null {
  if (draft.cadence === 'hourly') return 1
  if (draft.cadence === 'daily') return 24
  if (draft.cadence === 'weekly') return 168
  if (draft.cadence === 'custom') return draft.customSilenceHours
  return null
}

function sharedMutationBody(draft: EmailEndpointDraft) {
  const domains = [...new Set(
    draft.allowedSenderDomains
      .map(domain => domain.trim().toLowerCase())
      .filter(Boolean)
  )]
  return {
    label: draft.label.trim(),
    ...(draft.addressPrefix.trim()
      ? { address_prefix: draft.addressPrefix.trim().toLowerCase() }
      : {}),
    expected_provider: draft.expectedProvider === 'none'
      ? null
      : draft.expectedProvider,
    parser_mode: draft.parserMode,
    ai_extraction_mode: draft.aiExtractionMode,
    allowed_sender_domains: domains,
    expected_max_silence_hours: silenceHours(draft),
    first_response_sla_minutes: draft.firstResponseSlaMinutes,
    form_name: draft.formName.trim()
  }
}

export function buildCreateEmailEndpointBody(draft: EmailEndpointDraft) {
  const preset = draft.routingPreset
  return {
    client_id: draft.clientId,
    ...sharedMutationBody(draft),
    ...(preset !== 'none' ? { routing_preset: preset } : {}),
    ...(preset === 'portal_notification'
      ? { notification_email: draft.notificationEmail.trim() }
      : {}),
    ...(preset === 'assign_user'
      ? { assigned_user_id: draft.assignedUserId }
      : {})
  }
}

export function buildUpdateEmailEndpointBody(draft: EmailEndpointDraft) {
  return sharedMutationBody(draft)
}

export function routingPresetPreview(
  draft: EmailEndpointDraft,
  team: EmailEndpointTeamOption[]
): string[] {
  if (draft.routingPreset === 'portal') return ['Client portal']
  if (draft.routingPreset === 'portal_notification') {
    return [
      'Client portal',
      `Email notification · ${draft.notificationEmail.trim() || 'Email required'}`
    ]
  }
  if (draft.routingPreset === 'assign_user') {
    const user = team.find(member => member.id === draft.assignedUserId)
    return [`Assign user · ${user?.name ?? 'User required'}`]
  }
  return []
}

export function classifyEmailEndpointHealth(
  endpoint: SafeEmailLeadEndpoint,
  nowMs = Date.now()
): EmailEndpointHealth {
  if (endpoint.retired_at) {
    return { label: 'Retired', color: 'neutral', description: 'This endpoint can no longer receive mail.' }
  }
  if (!endpoint.enabled) {
    return { label: 'Disabled', color: 'neutral', description: 'Inbound mail is currently rejected.' }
  }
  if (endpoint.consecutive_failures > 0) {
    return {
      label: 'Needs attention',
      color: 'error',
      description: `${endpoint.consecutive_failures} consecutive processing failure${endpoint.consecutive_failures === 1 ? '' : 's'}.`
    }
  }
  if (!endpoint.expected_max_silence_hours) {
    return { label: 'Active', color: 'info', description: 'No delivery cadence is configured.' }
  }
  const cadenceReference = endpoint.last_received_at ?? endpoint.created_at
  const deadline = new Date(cadenceReference).getTime()
    + endpoint.expected_max_silence_hours * 60 * 60_000
  if (Number.isFinite(deadline) && nowMs >= deadline) {
    return {
      label: 'Overdue',
      color: 'warning',
      description: `No message within the expected ${endpoint.expected_max_silence_hours}-hour window.`
    }
  }
  if (!endpoint.last_received_at) {
    return {
      label: 'Awaiting first message',
      color: 'info',
      description: `Waiting for the first message within the expected ${endpoint.expected_max_silence_hours}-hour window.`
    }
  }
  return { label: 'Healthy', color: 'success', description: 'Messages are arriving within the expected cadence.' }
}

export function classifyEmailEndpointRecovery(
  endpoint: SafeEmailLeadEndpoint
): EmailEndpointRecovery {
  if (endpoint.recovery_state === 'exhausted' || endpoint.exhausted_recovery_count > 0) {
    const count = endpoint.exhausted_recovery_count
    return {
      label: 'Exhausted',
      color: 'error',
      description: `${count} message${count === 1 ? '' : 's'} exhausted automatic recovery.`
    }
  }
  if (endpoint.recovery_state === 'retrying') {
    const count = endpoint.non_terminal_count
    return {
      label: 'Recovering',
      color: 'warning',
      description: `${count} message${count === 1 ? '' : 's'} pending; highest attempt ${endpoint.recovery_attempt_count}.`
    }
  }
  if (endpoint.recovery_state === 'pending' || endpoint.non_terminal_count > 0) {
    const count = endpoint.non_terminal_count
    return {
      label: 'Pending',
      color: 'info',
      description: `${count} message${count === 1 ? '' : 's'} awaiting recovery.`
    }
  }
  return {
    label: 'Clear',
    color: 'neutral',
    description: 'No message is waiting for recovery.'
  }
}
