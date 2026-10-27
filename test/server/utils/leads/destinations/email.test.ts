// test/server/utils/leads/destinations/email.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Lead, LeadDelivery } from '~~/app/types'

// email.ts calls registerAdapter(adapter) at module load; mock the leaf registry.
vi.mock('../../../../../server/utils/leads/destinations/registry', () => ({
  registerAdapter: vi.fn(),
  getAdapter: vi.fn(),
  listAdapterTypes: vi.fn()
}))

const sendMock = vi.fn().mockResolvedValue({ data: { id: 'r1' }, error: null })
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: sendMock }
  }
}))

const { default: adapter } = await import('../../../../../server/utils/leads/destinations/email')

const lead: Lead = {
  id: 'L1', source: 'google', form_name: 'Quote',
  field_data: { first_name: 'Jane', email: 'jane@acme.co' }, attribution: null
} as Lead
const delivery = { id: 'D1', idempotency_key: 'idem-1' } as LeadDelivery
const config = {
  to: ['ops@adme.net.au'],
  subject_template: 'New lead from {{ field.first_name }} — {{ form_name }}',
  body_template: 'Email: {{ field.email }}'
}

async function sent(l: Lead = lead, c: Record<string, unknown> = config) {
  process.env.RESEND_API_KEY = 'test'
  sendMock.mockClear()
  const r = await adapter.dispatch(delivery, l, c as never)
  expect(r.status).toBe('delivered')
  return sendMock.mock.calls[0]![0]
}

const withEmail = (email: unknown) => ({ ...lead, field_data: { ...lead.field_data, email } }) as Lead

describe('email adapter', () => {
  beforeEach(() => sendMock.mockClear())

  it('rejects invalid `to`', () => {
    const v = adapter.validateConfig({ to: ['nope'], subject_template: 's', body_template: 'b' })
    expect(v.valid).toBe(false)
  })

  it('keeps field values in the body but out of the subject', async () => {
    const arg = await sent()
    expect(arg.subject).toBe('New lead from — Quote')
    expect(arg.subject).not.toContain('Jane')
    expect(arg.html).toContain('jane@acme.co')
  })

  it('falls back to a fixed subject when only field tokens were configured', async () => {
    const arg = await sent(lead, { ...config, subject_template: '{{ field.first_name }} {{ attribution.utm_source }}' })
    expect(arg.subject).toBe('New lead')
  })

  it('strips CR/LF from the subject so no header can be injected', async () => {
    const arg = await sent({ ...lead, form_name: 'Quote\r\nBcc: victim@evil.test' } as Lead,
      { ...config, subject_template: 'Lead {{ form_name }}\nX-Injected: 1' })
    expect(arg.subject).toBe('Lead Quote Bcc: victim@evil.test X-Injected: 1')
    expect(arg.subject).not.toMatch(/[\r\n]/)
  })

  it('strips CR/LF from a configured from', async () => {
    const arg = await sent(lead, { ...config, from: 'leads@adme.net.au\r\nBcc: victim@evil.test' })
    expect(arg.from).not.toMatch(/[\r\n]/)
  })

  it('sets replyTo to the visitor email when it is one valid address', async () => {
    expect((await sent(withEmail('  jane@acme.co '))).replyTo).toBe('jane@acme.co')
  })

  it.each([
    ['missing', undefined],
    ['not an address', 'jane at acme'],
    ['two addresses', 'jane@acme.co, boss@acme.co'],
    ['semicolon list', 'jane@acme.co;boss@acme.co'],
    ['display name', 'Jane <jane@acme.co>'],
    ['CRLF injection', 'jane@acme.co\r\nBcc: victim@evil.test'],
    ['LF injection', 'jane@acme.co\nBcc:victim@evil.test'],
    ['non-string', ['jane@acme.co']]
  ])('omits replyTo when the visitor email is %s', async (_label, email) => {
    const arg = await sent(withEmail(email))
    expect(arg).not.toHaveProperty('replyTo')
  })
})
