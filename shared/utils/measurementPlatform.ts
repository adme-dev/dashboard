export const MEASUREMENT_PLATFORMS = ['meta', 'google_data_manager', 'ga4'] as const
export type MeasurementPlatform = typeof MEASUREMENT_PLATFORMS[number]

export const PLATFORM_LABELS: Record<MeasurementPlatform, string> = {
  meta: 'Meta',
  google_data_manager: 'Google Data Manager',
  ga4: 'Google Analytics 4'
}

export const PLATFORM_MODE_PREFIX: Record<MeasurementPlatform, string> = {
  meta: 'meta_',
  google_data_manager: 'google_',
  ga4: 'ga4_'
}

export type CapabilityManagementOrigin = 'zero' | 'gtm' | 'partner' | 'external'

export interface CapabilityDefinition {
  mode: string
  label: string
  description: string
  defaultOrigin: CapabilityManagementOrigin
}

export const CAPABILITY_DEFINITIONS: Record<MeasurementPlatform, CapabilityDefinition[]> = {
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
  ],
  ga4: [
    { mode: 'ga4_measurement_protocol', label: 'GA4 Measurement Protocol', description: 'Server-side micro-conversions delivered to GA4, forwarded to Google Ads by the client GA4 link.', defaultOrigin: 'zero' }
  ]
}

export type ProviderTestMode = 'meta_test_events' | 'google_validate_only' | 'ga4_debug_validation'

export const TEST_PLATFORM: Record<ProviderTestMode, MeasurementPlatform> = {
  meta_test_events: 'meta',
  google_validate_only: 'google_data_manager',
  ga4_debug_validation: 'ga4'
}

/**
 * Capability modes a successful test proves.
 *
 * Meta's three CAPI capabilities are deliberately collapsed onto a single test
 * so onboarding needs one test plus one meta_pixel attestation. No single test
 * can genuinely exercise both Meta paths — web mode is restricted to
 * lead_created/purchase/web_conversion while meta_conversion_leads covers
 * downstream outcomes — so at least one capability is always proven by
 * inference. Use directlyExercisedModes() to record which is which.
 */
export const TEST_COVERAGE: Record<ProviderTestMode, readonly string[]> = {
  meta_test_events: ['meta_web_capi', 'meta_crm_capi', 'meta_conversion_leads'],
  google_validate_only: ['google_enhanced_conversions_for_leads', 'google_data_manager'],
  ga4_debug_validation: ['ga4_measurement_protocol']
}

const DOWNSTREAM_LIFECYCLE_EVENTS = new Set([
  'lead_contacted',
  'lead_qualified',
  'lead_won',
  'lead_lost'
])

const TEST_COVERED_MODES = new Set(Object.values(TEST_COVERAGE).flatMap(modes => [...modes]))

export function coveredCapabilityModes(mode: ProviderTestMode): string[] {
  return [...(TEST_COVERAGE[mode] ?? [])]
}

/**
 * The subset of coveredCapabilityModes() the provider call actually exercised.
 * Everything else in the covered set was inferred from the Meta collapse.
 */
export function directlyExercisedModes(
  mode: ProviderTestMode,
  deliveryMode: 'crm' | 'web' | null,
  canonicalEventName: string
): string[] {
  if (mode !== 'meta_test_events') return coveredCapabilityModes(mode)
  if (deliveryMode === 'web') return ['meta_web_capi']
  return DOWNSTREAM_LIFECYCLE_EVENTS.has(canonicalEventName)
    ? ['meta_crm_capi', 'meta_conversion_leads']
    : ['meta_crm_capi']
}

/** A capability is attestation-only precisely when no provider test covers it. */
export function isAttestationOnly(capabilityMode: string): boolean {
  return !TEST_COVERED_MODES.has(capabilityMode)
}
