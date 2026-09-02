import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_DEFINITIONS,
  MEASUREMENT_PLATFORMS,
  PLATFORM_MODE_PREFIX,
  TEST_PLATFORM,
  coveredCapabilityModes,
  directlyExercisedModes,
  isAttestationOnly
} from '../../../../shared/utils/measurementPlatform'

describe('measurementPlatform', () => {
  it('lists every supported platform', () => {
    expect(MEASUREMENT_PLATFORMS).toEqual(['meta', 'google_data_manager', 'ga4'])
  })

  it('gives every platform a mode prefix and capability set', () => {
    for (const platform of MEASUREMENT_PLATFORMS) {
      expect(PLATFORM_MODE_PREFIX[platform]).toBeTruthy()
      expect(CAPABILITY_DEFINITIONS[platform].length).toBeGreaterThan(0)
    }
  })

  it('keeps every capability mode inside its platform prefix', () => {
    for (const platform of MEASUREMENT_PLATFORMS) {
      for (const capability of CAPABILITY_DEFINITIONS[platform]) {
        expect(capability.mode.startsWith(PLATFORM_MODE_PREFIX[platform])).toBe(true)
      }
    }
  })

  it('maps each test mode to its platform', () => {
    expect(TEST_PLATFORM.meta_test_events).toBe('meta')
    expect(TEST_PLATFORM.google_validate_only).toBe('google_data_manager')
    expect(TEST_PLATFORM.ga4_debug_validation).toBe('ga4')
  })

  it('collapses all three Meta CAPI capabilities onto one test', () => {
    expect(coveredCapabilityModes('meta_test_events')).toEqual([
      'meta_web_capi',
      'meta_crm_capi',
      'meta_conversion_leads'
    ])
  })

  it('never lets a test cover meta_pixel', () => {
    expect(coveredCapabilityModes('meta_test_events')).not.toContain('meta_pixel')
  })

  it('covers both configured Google server-delivery capabilities and exactly one for ga4', () => {
    expect(coveredCapabilityModes('google_validate_only')).toEqual([
      'google_enhanced_conversions_for_leads',
      'google_data_manager'
    ])
    expect(coveredCapabilityModes('ga4_debug_validation')).toEqual(['ga4_measurement_protocol'])
  })

  it('treats tag capabilities as attestation-only', () => {
    expect(isAttestationOnly('meta_pixel')).toBe(true)
    expect(isAttestationOnly('google_tag_enhanced_conversions')).toBe(true)
    expect(isAttestationOnly('google_enhanced_conversions_for_leads')).toBe(false)
  })

  it('does not treat test-covered capabilities as attestation-only', () => {
    expect(isAttestationOnly('meta_web_capi')).toBe(false)
    expect(isAttestationOnly('ga4_measurement_protocol')).toBe(false)
  })

  it('reports a web Meta test as directly exercising only the web path', () => {
    expect(directlyExercisedModes('meta_test_events', 'web', 'lead_created'))
      .toEqual(['meta_web_capi'])
  })

  it('reports a crm Meta test on a downstream outcome as exercising both crm capabilities', () => {
    expect(directlyExercisedModes('meta_test_events', 'crm', 'lead_qualified'))
      .toEqual(['meta_crm_capi', 'meta_conversion_leads'])
  })

  it('reports a crm Meta test on lead_created as exercising only crm capi', () => {
    expect(directlyExercisedModes('meta_test_events', 'crm', 'lead_created'))
      .toEqual(['meta_crm_capi'])
  })

  it('reports non-Meta tests as directly exercising everything they cover', () => {
    expect(directlyExercisedModes('ga4_debug_validation', null, 'purchase'))
      .toEqual(['ga4_measurement_protocol'])
  })
})
