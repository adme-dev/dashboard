import { describe, expect, it } from 'vitest'
import {
  createCrmEmailReplyToken,
  verifyCrmEmailReplyToken
} from '~~/server/utils/crm/emailReplyToken'

const VERSION_ONE_SECRET = 'v1-secret-material-at-least-32-bytes-long'
const VERSION_TWO_SECRET = 'v2-secret-material-at-least-32-bytes-long'

describe('CRM email reply tokens', () => {
  it('round-trips an opaque domain-bound token to its lookup hash', async () => {
    const created = await createCrmEmailReplyToken({
      version: 2,
      domain: 'Reply.Example.com.',
      secret: VERSION_TWO_SECRET
    })

    expect(created.token).toMatch(/^v2\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{27}$/)
    expect(`reply+${created.token}`.length).toBeLessThanOrEqual(64)
    expect(created.routeTokenHash).toMatch(/^[a-f0-9]{64}$/)

    const verified = await verifyCrmEmailReplyToken({
      token: created.token,
      domain: 'reply.example.com',
      secrets: {
        1: VERSION_ONE_SECRET,
        2: VERSION_TWO_SECRET
      }
    })

    expect(verified).toEqual({
      valid: true,
      version: 2,
      routeTokenHash: created.routeTokenHash
    })
  })

  it('supports explicit old and current secrets during rotation', async () => {
    const oldToken = await createCrmEmailReplyToken({
      version: 1,
      domain: 'reply.example.com',
      secret: VERSION_ONE_SECRET
    })
    const currentToken = await createCrmEmailReplyToken({
      version: 2,
      domain: 'reply.example.com',
      secret: VERSION_TWO_SECRET
    })
    const secrets = {
      1: VERSION_ONE_SECRET,
      2: VERSION_TWO_SECRET
    }

    await expect(verifyCrmEmailReplyToken({
      token: oldToken.token,
      domain: 'reply.example.com',
      secrets
    })).resolves.toMatchObject({ valid: true, version: 1 })
    await expect(verifyCrmEmailReplyToken({
      token: currentToken.token,
      domain: 'reply.example.com',
      secrets
    })).resolves.toMatchObject({ valid: true, version: 2 })
  })

  it('rejects a different domain, secret, route key, or signature', async () => {
    const created = await createCrmEmailReplyToken({
      version: 2,
      domain: 'reply.example.com',
      secret: VERSION_TWO_SECRET
    })
    const [version, routeKey, signature] = created.token.split('.')
    const alteredRouteKey = `${routeKey?.slice(0, -1)}${routeKey?.endsWith('A') ? 'B' : 'A'}`
    const alteredSignature = `${signature?.slice(0, -1)}${signature?.endsWith('A') ? 'B' : 'A'}`

    for (const input of [
      {
        token: created.token,
        domain: 'reply.other.example',
        secrets: { 2: VERSION_TWO_SECRET }
      },
      {
        token: created.token,
        domain: 'reply.example.com',
        secrets: { 2: VERSION_ONE_SECRET }
      },
      {
        token: `${version}.${alteredRouteKey}.${signature}`,
        domain: 'reply.example.com',
        secrets: { 2: VERSION_TWO_SECRET }
      },
      {
        token: `${version}.${routeKey}.${alteredSignature}`,
        domain: 'reply.example.com',
        secrets: { 2: VERSION_TWO_SECRET }
      }
    ]) {
      await expect(verifyCrmEmailReplyToken(input))
        .resolves.toEqual({ valid: false })
    }
  })

  it('fails closed without throwing for malformed or unknown-version input', async () => {
    for (const token of [
      '',
      'v0.route.signature',
      'v3.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'v1..',
      'v1.invalid!.AAAAAAAAAAAAAAAAAAAAAAAAAAA',
      'v1.AAAAAAAAAAAAAAAAAAAAAA.invalid!',
      `v1.${'A'.repeat(5000)}.signature`
    ]) {
      await expect(verifyCrmEmailReplyToken({
        token,
        domain: 'reply.example.com',
        secrets: { 1: VERSION_ONE_SECRET, 2: VERSION_TWO_SECRET }
      })).resolves.toEqual({ valid: false })
    }
  })

  it('generates a fresh opaque route key for each token', async () => {
    const first = await createCrmEmailReplyToken({
      version: 1,
      domain: 'reply.example.com',
      secret: VERSION_ONE_SECRET
    })
    const second = await createCrmEmailReplyToken({
      version: 1,
      domain: 'reply.example.com',
      secret: VERSION_ONE_SECRET
    })

    expect(first.token).not.toBe(second.token)
    expect(first.routeTokenHash).not.toBe(second.routeTokenHash)
  })
})
