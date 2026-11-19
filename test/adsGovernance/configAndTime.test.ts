import { afterEach, describe, expect, it } from 'vitest'
import { ADS_GOVERNANCE_DEFAULTS } from '~~/shared/adsGovernanceDefaults'
import { parseAdsGovernanceOverride, resolveAdsGovernanceConfig } from '~~/server/utils/adsGovernance/config'
import { addBusinessAwareHours, isWithinBusinessHours } from '~~/server/utils/adsGovernance/businessTime'
import { marketingProposalExpiresAt } from '~~/server/utils/adsGovernance/proposalExpiry'
import { resolveMcpRuntimeConfig } from '~~/server/utils/ai/mcp/runtimeConfig'

const eventWith = (env: Record<string, unknown>) => ({ context: { cloudflare: { env } } }) as never

afterEach(() => {
  delete process.env.MCP_SUITE_CONFIG
})

describe('ads governance config (dormant by default)', () => {
  it('commits every automation switch OFF', () => {
    expect(ADS_GOVERNANCE_DEFAULTS.automation).toBe(false)
    expect(ADS_GOVERNANCE_DEFAULTS.autoApply).toBe(false)
    expect(resolveAdsGovernanceConfig(eventWith({}))).toEqual({ automation: false, autoApply: false, proposalExpiryHours: 72, proposalExpiryBusinessDays: true })
  })

  it('is overridable only through the nested adsGovernance key of MCP_SUITE_CONFIG', () => {
    const event = eventWith({ MCP_SUITE_CONFIG: JSON.stringify({ writes: true, adsGovernance: { automation: true, proposalExpiryHours: 48 } }) })
    expect(resolveAdsGovernanceConfig(event)).toMatchObject({ automation: true, autoApply: false, proposalExpiryHours: 48 })
    // The nested key never disturbs suite-flag parsing.
    expect(resolveMcpRuntimeConfig(event).suiteFlags.writes).toBe(true)
    expect(Object.keys(resolveMcpRuntimeConfig(event).suiteFlags)).not.toContain('adsGovernance')
  })

  it('autoApply cannot stand alone without the governance master switch', () => {
    expect(resolveAdsGovernanceConfig(eventWith({ MCP_SUITE_CONFIG: '{"adsGovernance":{"autoApply":true}}' })).autoApply).toBe(false)
    expect(resolveAdsGovernanceConfig(eventWith({ MCP_SUITE_CONFIG: '{"adsGovernance":{"automation":true,"autoApply":true}}' })).autoApply).toBe(true)
  })

  it('rejects the whole override on any invalid field (fail closed to defaults)', () => {
    for (const raw of [
      '{"adsGovernance":{"automation":"true"}}',
      '{"adsGovernance":{"automation":true,"surprise":true}}',
      '{"adsGovernance":{"automation":true,"proposalExpiryHours":0}}',
      '{"adsGovernance":{"automation":true,"proposalExpiryHours":500}}',
      '{"adsGovernance":[true]}',
      'not json'
    ]) {
      expect(parseAdsGovernanceOverride(raw), raw).toEqual({})
    }
  })

  it('a present binding wins over process env', () => {
    process.env.MCP_SUITE_CONFIG = '{"adsGovernance":{"automation":true}}'
    expect(resolveAdsGovernanceConfig(eventWith({ MCP_SUITE_CONFIG: '{}' })).automation).toBe(false)
    expect(resolveAdsGovernanceConfig(eventWith({})).automation).toBe(true)
  })
})

describe('business time (Australia/Melbourne)', () => {
  it('business hours are Mon–Fri 09:00–17:00 Melbourne, DST-correct', () => {
    // 2026-11-19 is a Thursday; Melbourne is UTC+11 (AEDT).
    expect(isWithinBusinessHours(new Date('2026-11-18T22:00:00Z'))).toBe(true) // Thu 09:00
    expect(isWithinBusinessHours(new Date('2026-11-18T21:59:00Z'))).toBe(false) // Thu 08:59
    expect(isWithinBusinessHours(new Date('2026-11-19T06:00:00Z'))).toBe(false) // Thu 17:00
    expect(isWithinBusinessHours(new Date('2026-11-21T00:00:00Z'))).toBe(false) // Sat 11:00
    // July: AEST UTC+10.
    expect(isWithinBusinessHours(new Date('2026-07-06T23:00:00Z'))).toBe(true) // Tue 09:00
  })

  it('72 h from a Friday afternoon skips the weekend', () => {
    // Fri 2026-11-20 15:00 AEDT = 04:00Z → Wed 2026-11-25 15:00 AEDT = 04:00Z.
    expect(addBusinessAwareHours(new Date('2026-11-20T04:00:00Z'), 72).toISOString()).toBe('2026-11-25T04:00:00.000Z')
    // Mid-week: plain 72 h when no weekend intervenes (Mon 10:00 → Thu 10:00).
    expect(addBusinessAwareHours(new Date('2026-11-16T23:00:00Z'), 72).toISOString()).toBe('2026-11-19T23:00:00.000Z')
    // Weekend start: the clock only begins Monday 00:00.
    expect(addBusinessAwareHours(new Date('2026-11-21T02:00:00Z'), 24).toISOString()).toBe('2026-11-23T13:00:00.000Z')
    expect(addBusinessAwareHours(new Date('2026-11-20T04:00:00Z'), 72, { skipNonBusinessDays: false }).toISOString()).toBe('2026-11-23T04:00:00.000Z')
    expect(() => addBusinessAwareHours(new Date(), 0)).toThrow()
  })

  it('marketing proposal expiry defaults to 72 business-aware hours, never the old 24 h', () => {
    const now = new Date('2026-11-16T23:00:00Z')
    const expiry = marketingProposalExpiresAt(eventWith({}), now)
    expect(expiry.getTime() - now.getTime()).toBe(72 * 3_600_000)
    const configured = marketingProposalExpiresAt(eventWith({ MCP_SUITE_CONFIG: '{"adsGovernance":{"proposalExpiryHours":24,"proposalExpiryBusinessDays":false}}' }), now)
    expect(configured.getTime() - now.getTime()).toBe(24 * 3_600_000)
  })
})
