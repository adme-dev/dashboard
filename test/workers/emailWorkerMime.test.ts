import { describe, expect, it } from 'vitest'
import {
  parseInboundEmail
} from '../../workers/email-worker/src/mime'

function rawEmail(headers: string[]): ArrayBuffer {
  return new TextEncoder().encode([
    'From: Mailer Daemon <mailer-daemon@example.net>',
    'To: reply+opaque@reply.xeroflow.io',
    'Subject: Delivery report',
    'Message-ID: <delivery-report@example.net>',
    ...headers,
    '',
    'Delivery could not be completed.'
  ].join('\r\n')).buffer
}

describe('email Worker MIME classification signals', () => {
  it('extracts only the bounded headers needed for inbound classification', async () => {
    const email = await parseInboundEmail(rawEmail([
      'Auto-Submitted: auto-replied',
      'List-Id: Customer updates <updates.example.com>',
      'Precedence: bulk',
      'X-XeroFlow-Origin: crm-email-gateway',
      'Content-Type: multipart/report; report-type=delivery-status',
      'Return-Path: <>'
    ]))

    expect(email.automationSignals).toEqual({
      autoSubmitted: 'auto-replied',
      contentType: 'multipart/report; report-type=delivery-status',
      listId: 'Customer updates <updates.example.com>',
      precedence: 'bulk',
      xXeroFlowOrigin: 'crm-email-gateway',
      returnPath: '<>'
    })
    expect(email).not.toHaveProperty('headers')
    expect(email).not.toHaveProperty('headerLines')
  })

  it('trims and caps every classification signal at the message-header limit', async () => {
    const oversized = `  ${'x'.repeat(1200)}  `
    const email = await parseInboundEmail(rawEmail([
      `Auto-Submitted:${oversized}`,
      `List-Id:${oversized}`,
      `Precedence:${oversized}`,
      `X-XeroFlow-Origin:${oversized}`,
      `Content-Type:${oversized}`,
      `Return-Path:<${'x'.repeat(1200)}>`
    ]))

    expect(Object.values(email.automationSignals)).toHaveLength(6)
    for (const value of Object.values(email.automationSignals)) {
      expect(value).not.toBeNull()
      expect(value!.length).toBeLessThanOrEqual(998)
      expect(value).toBe(value!.trim())
    }
  })
})
