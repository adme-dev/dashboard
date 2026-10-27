import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Lead, LeadDelivery } from '~~/app/types'
import { createFakeLedger } from './fakeLedger'

vi.mock('~~/server/utils/leads/destinations/registry', () => ({ registerAdapter: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ execute: vi.fn(), queryOne: vi.fn(), transaction: vi.fn() }))
vi.mock('resend', () => ({ Resend: class { emails = { send: vi.fn() } } }))

const { default: adapter, dispatchLeadAck } = await import('~~/server/utils/leads/destinations/autoresponderEmail')
const { LEAD_ACK_DEFAULT_COPY, LEAD_ACK_FROM_ENV, leadAckSenderAddress } = await import('~~/server/utils/leads/ack/config')

const CLIENT = '11111111-1111-4111-8111-111111111111'
const VISITOR_SECRET = 'Please call me about my divorce settlement'
const config = {
  subject: 'Thanks for your enquiry',
  body_text: 'We have your enquiry and will reply within one business day.',
  reply_to: 'sales@client.example',
  from_name: 'Client Motors'
}

let seq = 0
function makeLead(overrides: Partial<Lead> = {}): Lead {
  seq += 1
  return {
    id: `lead-${seq}`, client_id: CLIENT, source: 'meta', source_lead_id: `src-${seq}`,
    form_id: 'form-a', form_name: 'Quote', status: 'new', is_test: false, test_run_id: null,
    field_data: { email: 'visitor@example.net', full_name: 'Jane Visitor', message: VISITOR_SECRET },
    attribution: null,
    ...overrides
  } as Lead
}
const deliveryFor = (lead: Lead, dest = 'dest-1') => ({
  id: `delivery-${lead.id}`, lead_id: lead.id, rule_destination_id: dest, idempotency_key: `idem-${lead.id}-${dest}`
}) as LeadDelivery

let clock = Date.parse('2026-10-27T00:00:00Z')
let fake = createFakeLedger(() => clock)
const send = vi.fn()
const deps = () => ({ ledger: fake.ledger, apiKey: () => 'test-key', sender: () => 'ack@sender.placeholder.test', send })
const ack = (lead: Lead, cfg: unknown = config, dest?: string) => dispatchLeadAck(deliveryFor(lead, dest), lead, cfg, deps())

beforeEach(() => {
  clock = Date.parse('2026-10-27T00:00:00Z')
  fake = createFakeLedger(() => clock)
  send.mockReset().mockResolvedValue({ id: 'resend-1', error: null })
})

describe('auto-acknowledgement content', () => {
  it('sends static client copy to the visitor with Reply-To set to the client inbox', async () => {
    const lead = makeLead()
    await expect(ack(lead)).resolves.toEqual({ status: 'delivered', response_meta: { resend_id: 'resend-1' } })
    expect(send).toHaveBeenCalledTimes(1)
    const [apiKey, payload, idempotencyKey] = send.mock.calls[0]!
    expect(apiKey).toBe('test-key')
    expect(payload).toMatchObject({
      from: 'Client Motors <ack@sender.placeholder.test>',
      to: ['visitor@example.net'],
      replyTo: 'sales@client.example',
      subject: config.subject,
      text: config.body_text
    })
    expect(idempotencyKey).toMatch(/^lead-ack\/[a-f0-9]{64}$/)
    expect(fake.rows).toHaveLength(1)
    expect(fake.rows[0]!.status).toBe('sent')
  })

  it('never echoes the visitor’s free text', async () => {
    await ack(makeLead())
    const serialized = JSON.stringify(send.mock.calls[0]![1])
    expect(serialized).not.toContain(VISITOR_SECRET)
    expect(serialized).not.toContain('Jane Visitor')
  })

  it.each([
    ['subject', { ...config, subject: 'Thanks {{ field.full_name }}' }],
    ['body', { ...config, body_text: 'You said: {{field.message}}' }]
  ])('rejects template tokens in the %s', async (_where, cfg) => {
    expect(adapter.validateConfig(cfg).valid).toBe(false)
    await expect(ack(makeLead(), cfg)).resolves.toEqual({ status: 'skipped', reason: 'ack_config_invalid' })
    expect(send).not.toHaveBeenCalled()
  })

  it('cannot send the placeholder default copy', async () => {
    const cfg = { ...LEAD_ACK_DEFAULT_COPY, reply_to: 'sales@client.example' }
    expect(adapter.validateConfig(cfg)).toMatchObject({ valid: false, errors: { subject: expect.any(String), body_text: expect.any(String) } })
    await expect(ack(makeLead(), cfg)).resolves.toEqual({ status: 'skipped', reason: 'ack_config_invalid' })
    expect(send).not.toHaveBeenCalled()
  })

  it('is off without explicit client copy (empty config)', async () => {
    await expect(ack(makeLead(), {})).resolves.toEqual({ status: 'skipped', reason: 'ack_config_invalid' })
    expect(send).not.toHaveBeenCalled()
  })

  it.each([
    ['reply_to list', { reply_to: 'a@client.example, b@client.example' }],
    ['reply_to CRLF', { reply_to: 'a@client.example\r\nBcc: x@evil.test' }],
    ['from_name angle brackets', { from_name: 'Evil <x@evil.test>' }],
    ['daily_cap above ceiling', { daily_cap: 201 }],
    ['daily_cap zero', { daily_cap: 0 }]
  ])('validateConfig rejects %s', (_label, patch) => {
    expect(adapter.validateConfig({ ...config, ...patch }).valid).toBe(false)
  })

  it('strips CR/LF from the subject header', async () => {
    expect(adapter.validateConfig({ ...config, subject: 'Thanks\r\nBcc: x@evil.test' }).valid).toBe(true)
    await ack(makeLead(), { ...config, subject: 'Thanks\r\nBcc: x@evil.test' })
    expect(send.mock.calls[0]![1].subject).toBe('Thanks Bcc: x@evil.test')
  })
})

describe('auto-acknowledgement abuse gates', () => {
  it.each([
    ['is_test', { is_test: true }],
    ['capture test run', { test_run_id: '22222222-2222-4222-8222-222222222222' }],
    ['rule test-fire lead', { source_lead_id: 'test-fire:abc' }]
  ])('never sends for a synthetic lead (%s)', async (_label, patch) => {
    await expect(ack(makeLead(patch))).resolves.toEqual({ status: 'skipped', reason: 'ack_synthetic_lead' })
    expect(send).not.toHaveBeenCalled()
    expect(fake.rows).toHaveLength(0)
  })

  it.each(['page_studio', 'qr', 'webhook', 'email', 'csv', 'manual'] as const)(
    'skips unverified %s submissions even when attribution claims Turnstile passed', async (source) => {
      const lead = makeLead({ source, attribution: { turnstile: 'passed', xf_turnstile: 'passed', bot_check: 'turnstile' } })
      await expect(ack(lead)).resolves.toEqual({ status: 'skipped', reason: 'ack_unverified' })
      expect(send).not.toHaveBeenCalled()
    })

  it.each(['meta', 'google'] as const)('treats %s platform lead forms as verified', async (source) => {
    await expect(ack(makeLead({ source }))).resolves.toMatchObject({ status: 'delivered' })
  })

  it('skips spam-suspected leads', async () => {
    await expect(ack(makeLead({ status: 'spam_suspected' }))).resolves.toEqual({ status: 'skipped', reason: 'ack_spam_suspected' })
  })

  it.each([
    ['missing', undefined],
    ['two addresses', 'a@example.net, b@example.net'],
    ['header injection', 'a@example.net\r\nBcc: victim@evil.test']
  ])('skips when the visitor email is %s', async (_label, email) => {
    const lead = makeLead()
    lead.field_data = { ...lead.field_data, email: email as string }
    await expect(ack(lead)).resolves.toEqual({ status: 'skipped', reason: 'ack_no_recipient' })
    expect(send).not.toHaveBeenCalled()
  })

  it('skips while the XeroFlow sender is not configured', async () => {
    const lead = makeLead()
    await expect(dispatchLeadAck(deliveryFor(lead), lead, config, { ...deps(), sender: () => null }))
      .resolves.toEqual({ status: 'skipped', reason: 'ack_sender_unconfigured' })
    expect(send).not.toHaveBeenCalled()
  })

  it('skips suppressed (bounced or complained) addresses without reserving', async () => {
    fake.suppressed.add('visitor@example.net')
    await expect(ack(makeLead())).resolves.toEqual({ status: 'skipped', reason: 'ack_suppressed' })
    expect(send).not.toHaveBeenCalled()
    expect(fake.rows).toHaveLength(0)
  })

  it('sends at most one ack per form and recipient per 24 h', async () => {
    await ack(makeLead())
    await expect(ack(makeLead())).resolves.toEqual({ status: 'skipped', reason: 'ack_recipient_window' })
    clock += 23 * 3_600_000
    await expect(ack(makeLead())).resolves.toEqual({ status: 'skipped', reason: 'ack_recipient_window' })
    clock += 2 * 3_600_000
    await expect(ack(makeLead())).resolves.toMatchObject({ status: 'delivered' })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('scopes the recipient window to the form', async () => {
    await ack(makeLead({ form_id: 'form-a' }))
    await expect(ack(makeLead({ form_id: 'form-b' }))).resolves.toMatchObject({ status: 'delivered' })
  })

  it('holds the recipient window under concurrent submissions', async () => {
    const results = await Promise.all([ack(makeLead()), ack(makeLead()), ack(makeLead())])
    expect(results.filter(r => r.status === 'delivered')).toHaveLength(1)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('keys the send on the submission: a replay or re-ingest sends once', async () => {
    const lead = makeLead()
    await ack(lead)
    await expect(ack(lead)).resolves.toEqual({ status: 'delivered', response_meta: { ack: 'already_sent' } })
    // Same submission identity re-ingested under a new lead row.
    await expect(ack({ ...lead, id: 'lead-reingested' } as Lead))
      .resolves.toEqual({ status: 'delivered', response_meta: { ack: 'already_sent' } })
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('enforces the per-site daily cap', async () => {
    const capped = { ...config, daily_cap: 2 }
    const at = (email: string) => {
      const lead = makeLead()
      lead.field_data = { ...lead.field_data, email }
      return ack(lead, capped)
    }
    await at('one@example.net')
    await at('two@example.net')
    await expect(at('three@example.net')).resolves.toEqual({ status: 'skipped', reason: 'ack_daily_cap' })
    // Another client has its own cap.
    await expect(ack(makeLead({ client_id: '33333333-3333-4333-8333-333333333333' }), capped)).resolves.toMatchObject({ status: 'delivered' })
    clock += 25 * 3_600_000
    await expect(at('four@example.net')).resolves.toMatchObject({ status: 'delivered' })
  })

  it('does not count failed sends, and a retry reuses the submission key', async () => {
    send.mockResolvedValueOnce({ id: null, error: 'provider down' })
    const lead = makeLead()
    await expect(ack(lead, { ...config, daily_cap: 1 })).resolves.toEqual({ status: 'failed', error: 'resend_error: provider down' })
    expect(fake.rows[0]!.status).toBe('failed')
    await expect(ack(lead, { ...config, daily_cap: 1 })).resolves.toMatchObject({ status: 'delivered' })
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0]![2]).toBe(send.mock.calls[1]![2])
    expect(fake.rows).toHaveLength(1)
  })

  it('resends an ambiguous reservation under the same provider idempotency key', async () => {
    send.mockRejectedValueOnce(new Error('socket hang up'))
    const lead = makeLead()
    await expect(ack(lead)).resolves.toMatchObject({ status: 'failed' })
    expect(fake.rows[0]!.status).toBe('reserved')
    await ack(lead)
    expect(send.mock.calls[0]![2]).toBe(send.mock.calls[1]![2])
    expect(fake.rows[0]!.status).toBe('sent')
  })
})

describe('auto-acknowledgement sender config', () => {
  it('reads one bare address from the env placeholder and rejects anything else', () => {
    vi.stubEnv(LEAD_ACK_FROM_ENV, '')
    try {
      expect(leadAckSenderAddress()).toBeNull()
      vi.stubEnv(LEAD_ACK_FROM_ENV, 'XeroFlow <ack@example.test>')
      expect(leadAckSenderAddress()).toBeNull()
      vi.stubEnv(LEAD_ACK_FROM_ENV, 'ack@example.test')
      expect(leadAckSenderAddress()).toBe('ack@example.test')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
