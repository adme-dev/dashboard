import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Webhook as BarrelWebhook } from 'svix'
import { Webhook as DeepWebhook } from 'svix/dist/webhook.js'

const secret = `whsec_${Buffer.from('task-10-svix-webhook-secret').toString('base64')}`
const payload = JSON.stringify({ type: 'email.received', data: { email_id: 'email_123' } })
const messageId = 'msg_123'
const now = new Date('2026-08-05T05:00:00.000Z')

describe('Svix webhook deep import compatibility', () => {
  beforeEach(() => {
    vi.spyOn(Date, 'now').mockReturnValue(now.getTime())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps the Resend webhook route on the tree-shakeable adapter import', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/api/webhooks/resend.post.ts'),
      'utf8'
    )

    expect(source).toContain("from 'svix/dist/webhook.js'")
    expect(source.match(/from ['"]svix['"]/)).toBeNull()
  })

  it('matches barrel signing and branded-header verification', () => {
    const timestamp = now
    const barrel = new BarrelWebhook(secret)
    const deep = new DeepWebhook(secret)
    const signature = barrel.sign(messageId, timestamp, payload)

    expect(deep.sign(messageId, timestamp, payload)).toBe(signature)
    expect(deep.verify(payload, {
      'Svix-Id': messageId,
      'Svix-Timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'Svix-Signature': signature
    })).toEqual(barrel.verify(payload, {
      'Svix-Id': messageId,
      'Svix-Timestamp': String(Math.floor(timestamp.getTime() / 1000)),
      'Svix-Signature': signature
    }))
  })

  it('matches unbranded headers, timestamp rejection, and signature errors', () => {
    const currentTimestamp = now
    const expiredTimestamp = new Date(now.getTime() - 301_000)
    const futureTimestamp = new Date(now.getTime() + 301_000)
    const barrel = new BarrelWebhook(secret)
    const deep = new DeepWebhook(secret)
    const currentSignature = barrel.sign(messageId, currentTimestamp, payload)
    const expiredSignature = barrel.sign(messageId, expiredTimestamp, payload)
    const futureSignature = barrel.sign(messageId, futureTimestamp, payload)
    const currentHeaders = {
      'webhook-id': messageId,
      'webhook-timestamp': String(Math.floor(currentTimestamp.getTime() / 1000)),
      'webhook-signature': currentSignature
    }

    expect(deep.verify(payload, currentHeaders)).toEqual(barrel.verify(payload, currentHeaders))

    for (const Webhook of [BarrelWebhook, DeepWebhook]) {
      const webhook = new Webhook(secret)
      expect(() => webhook.verify(payload, {
        'svix-id': messageId,
        'svix-timestamp': String(Math.floor(expiredTimestamp.getTime() / 1000)),
        'svix-signature': expiredSignature
      })).toThrow('Message timestamp too old')
      expect(() => webhook.verify(payload, {
        ...currentHeaders,
        'webhook-signature': 'v1,invalid'
      })).toThrow('No matching signature found')
      expect(() => webhook.verify(payload, {
        'svix-id': messageId,
        'svix-timestamp': String(Math.floor(futureTimestamp.getTime() / 1000)),
        'svix-signature': futureSignature
      })).toThrow('Message timestamp too new')
      expect(() => webhook.verify(payload, {})).toThrow('Missing required headers')
    }
  })
})
