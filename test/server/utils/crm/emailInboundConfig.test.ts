import { describe, expect, it } from 'vitest'
import { parseCrmEmailReplySecrets } from '~~/server/utils/crm/emailInboundConfig'

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
})
