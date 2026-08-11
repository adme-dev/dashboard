import { afterEach, describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_ANALYTICS_KEYRING_BINDING,
  parseCrmSearchAnalyticsKeyring,
  resolveCrmSearchAnalyticsKeyring
} from '~~/server/utils/crm/searchIndex/analyticsKeyring'

const activeSecret = 'a'.repeat(32)
const previousSecret = 'b'.repeat(48)
const keyring = {
  activeKeyVersion: 'analytics-v2',
  keys: {
    'analytics-v1': previousSecret,
    'analytics-v2': activeSecret
  }
}

afterEach(() => {
  delete process.env.CRM_SEARCH_ANALYTICS_KEYRING
})

describe('dedicated CRM search analytics keyring', () => {
  it('strictly parses a bounded active version-to-secret map without aliasing caller state', () => {
    const parsed = parseCrmSearchAnalyticsKeyring(JSON.stringify(keyring))

    expect(parsed).toEqual(keyring)
    expect(parsed).not.toBe(keyring)
    expect(Object.getPrototypeOf(parsed?.keys)).toBeNull()
    expect(Object.isFrozen(parsed?.keys)).toBe(true)
    expect(CRM_SEARCH_ANALYTICS_KEYRING_BINDING).toBe('CRM_SEARCH_ANALYTICS_KEYRING')
  })

  it.each([
    ['missing', undefined],
    ['not JSON', 'not-json'],
    ['array', []],
    ['extra field', { ...keyring, unexpected: true }],
    ['missing active version', { activeKeyVersion: 'analytics-v3', keys: keyring.keys }],
    ['bad version', { activeKeyVersion: 'bad version', keys: { 'bad version': activeSecret } }],
    ['empty keys', { activeKeyVersion: 'analytics-v1', keys: {} }],
    ['too many keys', {
      activeKeyVersion: 'analytics-v1',
      keys: Object.fromEntries(Array.from({ length: 9 }, (_, index) => [
        `analytics-v${index + 1}`,
        String.fromCharCode(97 + index).repeat(32)
      ]))
    }],
    ['short UTF-8 secret', { activeKeyVersion: 'analytics-v1', keys: { 'analytics-v1': 'x'.repeat(31) } }],
    ['oversized UTF-8 secret', { activeKeyVersion: 'analytics-v1', keys: { 'analytics-v1': 'é'.repeat(65) } }],
    ['duplicate secret', {
      activeKeyVersion: 'analytics-v2',
      keys: { 'analytics-v1': activeSecret, 'analytics-v2': activeSecret }
    }]
  ])('rejects %s keyring input', (_label, value) => {
    expect(parseCrmSearchAnalyticsKeyring(value)).toBeNull()
  })

  it('prefers the Cloudflare event binding and never falls back from malformed deployed state', () => {
    process.env.CRM_SEARCH_ANALYTICS_KEYRING = JSON.stringify({
      activeKeyVersion: 'local-v1',
      keys: { 'local-v1': 'l'.repeat(32) }
    })
    const eventKeyring = {
      activeKeyVersion: 'edge-v1',
      keys: { 'edge-v1': 'e'.repeat(32) }
    }

    expect(resolveCrmSearchAnalyticsKeyring({
      context: { cloudflare: { env: { CRM_SEARCH_ANALYTICS_KEYRING: JSON.stringify(eventKeyring) } } }
    } as never)).toEqual(eventKeyring)
    expect(resolveCrmSearchAnalyticsKeyring({
      context: { cloudflare: { env: { CRM_SEARCH_ANALYTICS_KEYRING: 123 } } }
    } as never)).toBeNull()
    expect(resolveCrmSearchAnalyticsKeyring({ context: {} } as never)).toEqual({
      activeKeyVersion: 'local-v1',
      keys: { 'local-v1': 'l'.repeat(32) }
    })
  })

  it('documents only the dedicated binding and forbids secret fallback names', async () => {
    const { readFile } = await import('node:fs/promises')
    const envExample = await readFile('.env.example', 'utf8')
    const source = await readFile(
      'server/utils/crm/searchIndex/analyticsKeyring.ts',
      'utf8'
    )

    expect(envExample).toMatch(/^CRM_SEARCH_ANALYTICS_KEYRING=$/m)
    expect(envExample.replace(/\s+/gu, ' ')).toMatch(
      /analytics.*never reuse.*confirmation.*service.*cron/i
    )
    expect(source).not.toMatch(/CRM_SEARCH_CONFIRMATION_KEYRING|CRM_SEARCH_SERVICE_KEYRING|CRON_SECRET/)
  })
})
