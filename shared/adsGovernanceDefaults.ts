/**
 * Reviewed, committed defaults for marketing ad-account automation governance (phase 2).
 *
 * Production Pages sits at Cloudflare's 150 text-binding ceiling, so no new variable exists for these
 * switches. They can be overridden at runtime only through the EXISTING compact `MCP_SUITE_CONFIG`
 * JSON, under one nested key (see server/utils/adsGovernance/config.ts):
 *   MCP_SUITE_CONFIG = '{"writes":true,"adsGovernance":{"automation":true}}'
 *
 * Flipping `automation` or `autoApply` needs Paul's explicit go-ahead.
 */
/** Nested key inside the existing compact MCP_SUITE_CONFIG reserved for these switches. */
export const ADS_GOVERNANCE_COMPACT_KEY = 'adsGovernance'

export const ADS_GOVERNANCE_DEFAULTS = {
  /**
   * Master switch for the governance core: rule-registry writes, the governance read API and the
   * kill-switch hook in the existing Google Ads automation runners. Off = everything dormant.
   */
  automation: false,
  /**
   * Separate dormant switch that, with `automation`, permits `auto_apply` rules to be REGISTERED.
   * No auto-apply execution path exists in phase 2 (phase 5 is gated).
   */
  autoApply: false,
  /** Lifetime of marketing department budget proposals, in business hours (weekends skipped). */
  proposalExpiryHours: 72,
  /** When true, Saturday/Sunday (Australia/Melbourne) hours do not count toward proposal expiry. */
  proposalExpiryBusinessDays: true
} as const

export type AdsGovernanceConfig = {
  automation: boolean
  autoApply: boolean
  proposalExpiryHours: number
  proposalExpiryBusinessDays: boolean
}
