import { describe, expect, it } from 'vitest'
import {
  parseCrmEmailReplySecrets,
  parseCrmEmailRouteIssuanceConfig
} from '~~/server/utils/crm/emailInboundConfig'

const SECRET_ONE = 'one-secret-that-is-at-least-32-bytes-long'
const SECRET_TWO = 'two-secret-that-is-at-least-32-bytes-long'

describe('CRM inbound email reply-secret configuration', () => {
  it.each([
    undefined,
    '',
    'not-json',
    '[]',
    'null',
    '{}',
    '{"0":"one-secret-that-is-at-least-32-bytes-long"}',
    '{"01":"one-secret-that-is-at-least-32-bytes-long"}',
    '{"1000000":"one-secret-that-is-at-least-32-bytes-long"}',
    '{"1":"short"}',
    '{"1":42}'
  ])('rejects missing or unsafe keyring configuration: %s', (value) => {
    expect(() => parseCrmEmailReplySecrets(value)).toThrow(
      'CRM email reply secrets are not configured safely'
    )
  })

  it('returns an immutable multi-version keyring', () => {
    const secrets = parseCrmEmailReplySecrets(JSON.stringify({
      1: SECRET_ONE,
      2: SECRET_TWO
    }))

    expect(secrets).toEqual({
      1: SECRET_ONE,
      2: SECRET_TWO
    })
    expect(Object.isFrozen(secrets)).toBe(true)
  })

  it('selects the explicitly configured key version and canonicalizes its domain', () => {
    expect(parseCrmEmailRouteIssuanceConfig({
      secrets: JSON.stringify({ 1: 'a'.repeat(32), 2: 'b'.repeat(32) }),
      currentVersion: '2',
      domain: 'XeroFlow.io.'
    })).toEqual({
      currentVersion: 2,
      domain: 'xeroflow.io',
      secret: 'b'.repeat(32)
    })
  })

  it('fails closed when the explicit version is absent from the keyring', () => {
    expect(() => parseCrmEmailRouteIssuanceConfig({
      secrets: JSON.stringify({ 1: 'a'.repeat(32) }),
      currentVersion: '2',
      domain: 'xeroflow.io'
    })).toThrow('CRM email route issuance is not configured safely')
  })
})
