// server/utils/adsGovernance/config.ts
// Ads-governance runtime switches: committed defaults (shared/adsGovernanceDefaults.ts) overridden only
// by the nested `adsGovernance` object inside the EXISTING compact MCP_SUITE_CONFIG variable. No new
// Pages binding is introduced (production is at the 150 text-binding cap).
import type { H3Event } from 'h3'
import { ADS_GOVERNANCE_COMPACT_KEY, ADS_GOVERNANCE_DEFAULTS, type AdsGovernanceConfig } from '~~/shared/adsGovernanceDefaults'

const COMPACT_VARIABLE = 'MCP_SUITE_CONFIG'

/**
 * Same precedence as the MCP runtime-config reader (kept import-light on purpose): a present
 * request binding always wins, even when not a string (then read as absent → defaults); else process env.
 */
function readCompact(event: H3Event | undefined): unknown {
  const env = (event?.context as { cloudflare?: { env?: Record<string, unknown> } } | undefined)?.cloudflare?.env
  if (env && typeof env === 'object' && Object.prototype.hasOwnProperty.call(env, COMPACT_VARIABLE)) return env[COMPACT_VARIABLE]
  return process.env[COMPACT_VARIABLE]
}

const MIN_EXPIRY_HOURS = 1
const MAX_EXPIRY_HOURS = 168

/**
 * Parse the nested override. Any invalid shape, unknown key or wrongly typed value rejects the WHOLE
 * override (fail closed → committed defaults, which keep automation off).
 */
export function parseAdsGovernanceOverride(raw: unknown): Partial<AdsGovernanceConfig> {
  if (typeof raw !== 'string' || !raw.trim()) return {}
  let root: unknown
  try {
    root = JSON.parse(raw)
  } catch {
    return {}
  }
  if (!root || typeof root !== 'object' || Array.isArray(root)) return {}
  const value = (root as Record<string, unknown>)[ADS_GOVERNANCE_COMPACT_KEY]
  if (value === undefined) return {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Partial<AdsGovernanceConfig> = {}
  for (const [key, field] of Object.entries(value as Record<string, unknown>)) {
    switch (key) {
      case 'automation':
      case 'autoApply':
      case 'proposalExpiryBusinessDays':
        if (typeof field !== 'boolean') return {}
        out[key] = field
        break
      case 'proposalExpiryHours':
        if (typeof field !== 'number' || !Number.isInteger(field) || field < MIN_EXPIRY_HOURS || field > MAX_EXPIRY_HOURS) return {}
        out.proposalExpiryHours = field
        break
      default:
        return {}
    }
  }
  return out
}

export function resolveAdsGovernanceConfig(event?: H3Event, raw: unknown = readCompact(event)): AdsGovernanceConfig {
  const override = parseAdsGovernanceOverride(raw)
  const automation = override.automation ?? ADS_GOVERNANCE_DEFAULTS.automation
  return {
    automation,
    // autoApply never stands alone: it is only meaningful with the governance master switch on.
    autoApply: automation && (override.autoApply ?? ADS_GOVERNANCE_DEFAULTS.autoApply),
    proposalExpiryHours: override.proposalExpiryHours ?? ADS_GOVERNANCE_DEFAULTS.proposalExpiryHours,
    proposalExpiryBusinessDays: override.proposalExpiryBusinessDays ?? ADS_GOVERNANCE_DEFAULTS.proposalExpiryBusinessDays
  }
}
