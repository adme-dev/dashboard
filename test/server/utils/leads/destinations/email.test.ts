// test/server/utils/leads/destinations/email.test.ts
import { describe, it, expect, vi } from 'vitest'
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
}
const delivery: LeadDelivery = { id: 'D1', idempotency_key: 'idem-1' }

describe('email adapter', () => {
  it('rejects invalid `to`', () => {
    const v = adapter.validateConfig({ to: ['nope'], subject_template: 's', body_template: 'b' })
    expect(v.valid).toBe(false)
  })
  it('renders subject + body templates', async () => {
    process.env.RESEND_API_KEY = 'test'
    const r = await adapter.dispatch(delivery, lead, {
      to: ['ops@adme.net.au'],
      subject_template: 'New lead from {{ field.first_name }}',
      body_template: 'Email: {{ field.email }}'
    })
    expect(r.status).toBe('delivered')
    expect(sendMock).toHaveBeenCalled()
    const [arg] = sendMock.mock.calls[0]
    expect(arg.subject).toBe('New lead from Jane')
    expect(arg.html).toContain('jane@acme.co')
  })
})
