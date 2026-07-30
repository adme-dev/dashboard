import { describe, expect, it } from 'vitest'
import {
  classifyCrmInboundEmail
} from '../../workers/email-worker/src/inboundClassification'
import type {
  ParsedInboundAutomationSignals,
  ParsedInboundEmail
} from '../../workers/email-worker/src/contracts'

const humanSignals: ParsedInboundAutomationSignals = {
  autoSubmitted: null,
  contentType: 'text/plain; charset=utf-8',
  listId: null,
  precedence: null,
  xXeroFlowOrigin: null,
  returnPath: '<customer@example.net>'
}

function email(
  signals: Partial<ParsedInboundAutomationSignals> = {},
  overrides: Partial<ParsedInboundEmail> = {}
): ParsedInboundEmail {
  return {
    from: {
      name: 'Customer',
      address: 'customer@example.net'
    },
    subject: 'Automatic reply options',
    text: 'This is an ordinary human enquiry.',
    html: null,
    attachments: [],
    automationSignals: {
      ...humanSignals,
      ...signals
    },
    ...overrides
  }
}

describe('CRM inbound email classification', () => {
  it('prioritises the XeroFlow origin marker over every other signal', () => {
    expect(classifyCrmInboundEmail(email({
      xXeroFlowOrigin: ' CRM-EMAIL-GATEWAY ',
      contentType: 'multipart/report; report-type=delivery-status',
      autoSubmitted: 'auto-replied',
      listId: '<updates.example.net>',
      precedence: 'bulk',
      returnPath: '<>'
    }, {
      from: {
        name: 'Mailer Daemon',
        address: 'mailer-daemon@example.net'
      }
    }))).toEqual({
      kind: 'suppressed',
      reason: 'xeroflow_loop'
    })
  })

  it.each([
    ['RFC delivery report', {
      contentType: 'Multipart/Report; boundary=x; REPORT-TYPE=delivery-status'
    }, {}],
    ['delivery-status body', {
      contentType: 'message/delivery-status'
    }, {}],
    ['null-path mailer daemon', {
      returnPath: '<>',
      contentType: 'text/plain'
    }, {
      from: {
        name: 'Mail Delivery System',
        address: 'mailer-daemon@example.net'
      }
    }],
    ['null-path postmaster', {
      returnPath: '<>',
      contentType: 'text/plain'
    }, {
      from: {
        name: 'Postmaster',
        address: 'postmaster@example.net'
      }
    }]
  ])('detects %s as a delivery status report', (
    _label,
    signals,
    overrides
  ) => {
    expect(classifyCrmInboundEmail(email(signals, overrides))).toEqual({
      kind: 'suppressed',
      reason: 'delivery_status'
    })
  })

  it.each([
    'auto-replied',
    ' AUTO-GENERATED ; owner-email="ops@example.net" ',
    'vendor-extension'
  ])('detects Auto-Submitted: %s', (autoSubmitted) => {
    expect(classifyCrmInboundEmail(email({ autoSubmitted }))).toEqual({
      kind: 'suppressed',
      reason: 'auto_submitted'
    })
  })

  it.each([
    ['List-Id', { listId: 'Updates <updates.example.net>' }],
    ['list precedence', { precedence: ' list ' }],
    ['bulk precedence', { precedence: 'BULK' }],
    ['junk precedence', { precedence: 'junk' }]
  ])('detects a mailing list from %s', (_label, signals) => {
    expect(classifyCrmInboundEmail(email(signals))).toEqual({
      kind: 'suppressed',
      reason: 'mailing_list'
    })
  })

  it.each([
    ['no signals', {}],
    ['explicit human submission', { autoSubmitted: ' NO ; test=true' }],
    ['ordinary precedence', { precedence: 'normal' }],
    ['subject text only', {}]
  ])('allows human mail with %s', (_label, signals) => {
    expect(classifyCrmInboundEmail(email(signals))).toEqual({
      kind: 'human',
      reason: 'human'
    })
  })

  it('does not trust a null return path without a DSN sender', () => {
    expect(classifyCrmInboundEmail(email({
      returnPath: '<>'
    }))).toEqual({
      kind: 'human',
      reason: 'human'
    })
  })
})
