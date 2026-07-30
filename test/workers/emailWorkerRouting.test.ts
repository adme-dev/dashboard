import { describe, expect, it } from 'vitest'
import { classifyInboundEmailRoute } from '../../workers/email-worker/src/routing'
import {
  resolveInboundEmailLimits,
  validateInboundAttachments,
  validateInboundEmailSize
} from '../../workers/email-worker/src/safety'

const MiB = 1024 * 1024
const BOARD_TOKEN = '0123456789abcdef'
const SIGNED_TOKEN = `v2.${'A'.repeat(32)}.${'B'.repeat(43)}`

describe('inbound email route classification', () => {
  it.each([
    [
      `board-${BOARD_TOKEN}@mail.xeroflow.io`,
      { kind: 'board', token: BOARD_TOKEN }
    ],
    [
      `lead+${SIGNED_TOKEN}@mail.xeroflow.io`,
      { kind: 'lead', token: SIGNED_TOKEN }
    ],
    [
      `reply+${SIGNED_TOKEN}@reply.xeroflow.io`,
      { kind: 'crm_reply', token: SIGNED_TOKEN }
    ],
    ['board-@mail.xeroflow.io', { kind: 'invalid' }],
    ['lead+@mail.xeroflow.io', { kind: 'invalid' }],
    ['reply+v2.short.signature@reply.xeroflow.io', { kind: 'invalid' }],
    ['unknown@example.com', { kind: 'invalid' }],
    [`Name <board-${BOARD_TOKEN}@mail.xeroflow.io>`, { kind: 'invalid' }],
    [`${'x'.repeat(129)}@mail.xeroflow.io`, { kind: 'invalid' }],
    ['not-an-address', { kind: 'invalid' }]
  ])('classifies %s without exposing malformed route data', (recipient, expected) => {
    expect(classifyInboundEmailRoute(recipient)).toEqual(expected)
  })
})

describe('inbound email safety limits', () => {
  it('uses a 10 MiB default and accepts that exact message boundary', () => {
    const limits = resolveInboundEmailLimits()

    expect(limits).toEqual({
      maxMessageBytes: 10 * MiB,
      maxAttachments: 10,
      maxAttachmentBytes: 5 * MiB,
      maxCombinedAttachmentBytes: 8 * MiB
    })
    expect(validateInboundEmailSize(10 * MiB, limits)).toEqual({ safe: true })
    expect(validateInboundEmailSize(10 * MiB + 1, limits)).toEqual({
      safe: false,
      reason: 'message_too_large'
    })
  })

  it('uses the default for invalid configuration and caps overrides at 25 MiB', () => {
    expect(resolveInboundEmailLimits('invalid').maxMessageBytes).toBe(10 * MiB)
    expect(resolveInboundEmailLimits('-1').maxMessageBytes).toBe(10 * MiB)
    expect(resolveInboundEmailLimits(String(20 * MiB)).maxMessageBytes).toBe(20 * MiB)
    expect(resolveInboundEmailLimits(String(50 * MiB)).maxMessageBytes).toBe(25 * MiB)
  })

  it('rejects invalid raw-size metadata', () => {
    const limits = resolveInboundEmailLimits()

    expect(validateInboundEmailSize(-1, limits)).toEqual({
      safe: false,
      reason: 'invalid_message_size'
    })
    expect(validateInboundEmailSize(Number.NaN, limits)).toEqual({
      safe: false,
      reason: 'invalid_message_size'
    })
  })

  it('enforces attachment count, individual size, and combined size', () => {
    const limits = resolveInboundEmailLimits()
    const small = { filename: 'small.pdf', mimeType: 'application/pdf', size: 1 * MiB }

    expect(validateInboundAttachments([small], limits)).toEqual({ safe: true })
    expect(validateInboundAttachments(
      Array.from({ length: 11 }, (_, index) => ({
        ...small,
        filename: `file-${index}.pdf`
      })),
      limits
    )).toEqual({ safe: false, reason: 'too_many_attachments' })
    expect(validateInboundAttachments([
      { ...small, size: 5 * MiB + 1 }
    ], limits)).toEqual({ safe: false, reason: 'attachment_too_large' })
    expect(validateInboundAttachments([
      { ...small, filename: 'one.pdf', size: 4.5 * MiB },
      { ...small, filename: 'two.pdf', size: 4.5 * MiB }
    ], limits)).toEqual({
      safe: false,
      reason: 'attachments_too_large'
    })
  })

  it('rejects invalid attachment size metadata', () => {
    const limits = resolveInboundEmailLimits()

    expect(validateInboundAttachments([
      { filename: 'bad.pdf', mimeType: 'application/pdf', size: -1 }
    ], limits)).toEqual({
      safe: false,
      reason: 'invalid_attachment_size'
    })
  })
})
