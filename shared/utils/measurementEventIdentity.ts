export type MeasurementEventIdentityMode = 'browser_server_dedup' | 'server_only'

export interface MeasurementEventIdentity {
  mode: MeasurementEventIdentityMode
  label: string
}

const DOWNSTREAM_LIFECYCLE_EVENTS = new Set([
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost'
])

const WEB_DELIVERY_CAPABILITIES = new Set([
  'meta_web_capi',
  'google_tag_enhanced_conversions',
  'tiktok_events_api'
])

export function classifyMeasurementEventIdentity(
  canonicalEventName: string,
  capabilityModes: string[]
): MeasurementEventIdentity {
  if (DOWNSTREAM_LIFECYCLE_EVENTS.has(canonicalEventName)) {
    return { mode: 'server_only', label: 'Server-only lifecycle event' }
  }

  if (capabilityModes.some(mode => WEB_DELIVERY_CAPABILITIES.has(mode))) {
    return {
      mode: 'browser_server_dedup',
      label: 'Shared browser/server event ID'
    }
  }

  return { mode: 'server_only', label: 'Server-only provider event' }
}
