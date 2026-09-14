import type { InsertLeadInput } from '~~/server/utils/leads/db'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'
import { acceptPageStudioPublicLead } from '~~/server/utils/pageStudio/publicBoundary'

const mocks = vi.hoisted(() => ({ queryOne: vi.fn(), queryOneFresh: vi.fn(), execute: vi.fn(), acceptLead: vi.fn(), mode: vi.fn(), assign: vi.fn(), metadata: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({ ...mocks, transaction: vi.fn() }))
vi.mock('~~/server/utils/leads/acceptance', () => ({ acceptLead: mocks.acceptLead, resolveLeadCaptureMode: mocks.mode }))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: mocks.assign }))
vi.mock('~~/server/utils/leads/db', () => ({ upsertFormMetadata: mocks.metadata }))
vi.mock('~~/server/utils/measurement/outbox', () => ({ appendCanonicalConversionEvent: vi.fn() }))
vi.mock('~~/server/utils/measurement/publisher', () => ({ conversionOutboxPublisher: { publishEvent: vi.fn() } }))
const input = {
  attribution: { utm_source: 'search' }, fields: { field_full_name: 'Synthetic Customer', field_email: 'fixture@example.invalid', vehicle_count: '2', referral: 'Friend' },
  formId: 'quote', idempotencyKey: 'request-public-1', occurredAt: '2026-09-14T00:00:00.000Z', pageId: 'quote-page', pageRoute: '/quote', releaseId: 'release-one',
  scope: { tenantId: 'tenant-one', clientId: 'client-one', siteId: 'site-one' }, versionDigest: 'a'.repeat(64)
}
const event = {} as H3Event
let authority: boolean
let synthetic: boolean
let receipts: Map<string, { metadata: { payloadDigest: string }, occurred_at: string }>
let leads: Map<string, InsertLeadInput & { id: string, client_id: string, deleted_at: string | null }>
const leadKey = (client: string, source: string) => `${client}:${source}`
async function query(sql: string, params: unknown[]) {
  if (sql.includes('JOIN page_studio_entitlements')) return authority ? { tenant_id: params[0], client_id: params[1], site_id: params[2], release_id: params[3], is_synthetic: synthetic } : null
  if (sql.includes('FROM leads')) return leads.get(leadKey(String(params[0]), String(params[1]))) ?? null
  if (sql.includes('FROM page_studio_audit_events')) return receipts.get(String(params.at(-1))) ?? null
  throw new Error(`Unexpected query: ${sql}`)
}
beforeEach(() => {
  vi.resetAllMocks()
  authority = true
  synthetic = true
  receipts = new Map()
  leads = new Map()
  mocks.queryOne.mockImplementation(query)
  mocks.queryOneFresh.mockImplementation(query)
  mocks.mode.mockResolvedValue('capture_only')
  mocks.assign.mockResolvedValue(null)
  mocks.execute.mockImplementation(async (sql: string, params: unknown[]) => {
    if (sql.includes('\'lead.submission_reserved\'')) {
      const key = String(params[4])
      if (!receipts.has(key)) receipts.set(key, { metadata: JSON.parse(String(params[5])), occurred_at: String(params[6]) })
    }
    return 1
  })
  mocks.acceptLead.mockImplementation(async (_event: unknown, { lead }: { lead: InsertLeadInput & { client_id: string } }) => {
    const key = leadKey(lead.client_id, lead.source_lead_id)
    if (leads.has(key)) return { status: 'duplicate' }
    const row = { ...lead, id: `lead-${leads.size + 1}`, deleted_at: null }
    leads.set(key, row)
    return { status: 'created', leadId: row.id }
  })
})
describe('public generated-form request reliability', () => {
  it('rejects changed dynamic fields under the same request key', async () => {
    await acceptPageStudioPublicLead(event, input)
    await expect(acceptPageStudioPublicLead(event, { ...input, fields: { ...input.fields, vehicle_count: '3' } })).rejects.toMatchObject({ statusCode: 409 })
    expect(leads.size).toBe(1)
    expect([...leads.values()][0].field_data.vehicle_count).toBe('2')
  })
  it('retains exact retries, reordered fields and original server occurrence time', async () => {
    const first = await acceptPageStudioPublicLead(event, input)
    const retry = await acceptPageStudioPublicLead(event, { ...input, fields: Object.fromEntries(Object.entries(input.fields).reverse()), occurredAt: '2026-09-14T00:10:00.000Z' })
    expect(retry).toEqual({ ...first, duplicate: true })
    expect(mocks.acceptLead).toHaveBeenCalledTimes(1)
    expect([...leads.values()][0]).toMatchObject({ submitted_at: input.occurredAt, field_data: { ...input.fields, full_name: 'Synthetic Customer', email: 'fixture@example.invalid' } })
  })
  it.each(['pageId', 'pageRoute', 'releaseId', 'versionDigest'] as const)('rejects changed %s under the same request key', async (key) => {
    await acceptPageStudioPublicLead(event, input)
    await expect(acceptPageStudioPublicLead(event, { ...input, [key]: key === 'versionDigest' ? 'b'.repeat(64) : 'different' })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('rejects changed attribution and consent under the same request key', async () => {
    await acceptPageStudioPublicLead(event, input)
    await expect(acceptPageStudioPublicLead(event, { ...input, attribution: { utm_source: 'changed' } })).rejects.toMatchObject({ statusCode: 409 })
    await expect(acceptPageStudioPublicLead(event, { ...input, consent: { accepted: true, label: 'Changed consent' } })).rejects.toMatchObject({ statusCode: 409 })
  })
  it('separates identical client keys by website and form', async () => {
    await acceptPageStudioPublicLead(event, input)
    await acceptPageStudioPublicLead(event, { ...input, scope: { ...input.scope, siteId: 'site-two' } })
    await acceptPageStudioPublicLead(event, { ...input, formId: 'contact' })
    expect(leads.size).toBe(3)
    expect(receipts.size).toBe(3)
  })
  it('reads fresh authority even when the cached connection would allow access', async () => {
    mocks.queryOneFresh.mockResolvedValue(null)
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
  })
  it('rechecks authority after a receipt is reserved before accepting the lead', async () => {
    const write = mocks.execute.getMockImplementation()!
    mocks.execute.mockImplementation(async (...args: [string, unknown[]]) => {
      const result = await write(...args)
      authority = false
      return result
    })
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(leads.size).toBe(0)
  })
  it('deduplicates concurrent matching requests and rejects a conflicting racer', async () => {
    const results = await Promise.allSettled([
      acceptPageStudioPublicLead(event, input), acceptPageStudioPublicLead(event, input),
      acceptPageStudioPublicLead(event, { ...input, fields: { ...input.fields, referral: 'Changed' } })
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(2)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { statusCode: 409 } })
    expect(leads.size).toBe(1)
  })
  it('recovers a lost acceptance response only when the matching lead is persisted', async () => {
    const create = mocks.acceptLead.getMockImplementation()!
    mocks.acceptLead.mockImplementationOnce(async (...args: [unknown, { lead: InsertLeadInput & { client_id: string } }]) => {
      await create(...args)
      throw new Error('response lost')
    })
    await expect(acceptPageStudioPublicLead(event, input)).resolves.toMatchObject({ duplicate: true, leadId: 'lead-1' })
    expect(leads.size).toBe(1)
  })
  it('does not acknowledge an acceptance failure with no persisted lead', async () => {
    mocks.acceptLead.mockRejectedValueOnce(new Error('write rejected'))
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toThrow('write rejected')
    expect(leads.size).toBe(0)
    await expect(acceptPageStudioPublicLead(event, input)).resolves.toMatchObject({ leadId: 'lead-1' })
  })
  it('rejects an unverifiable historical or deleted lead instead of creating another', async () => {
    await acceptPageStudioPublicLead(event, input)
    const row = [...leads.values()][0]
    row.attribution = {}
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 409 })
    row.deleted_at = '2026-09-14T01:00:00Z'
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 409 })
    expect(mocks.acceptLead).toHaveBeenCalledTimes(1)
  })
  it('recovers a lost receipt response without allocating a new intent', async () => {
    const write = mocks.execute.getMockImplementation()!
    mocks.execute.mockImplementationOnce(async (...args: [string, unknown[]]) => {
      await write(...args)
      throw new Error('receipt acknowledgement lost')
    })
    await expect(acceptPageStudioPublicLead(event, input)).resolves.toMatchObject({ leadId: 'lead-1' })
    expect(receipts.size).toBe(1)
  })
  it('retains the reserved timestamp when a failed attempt is retried later', async () => {
    mocks.acceptLead.mockRejectedValueOnce(new Error('no commit'))
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toThrow('no commit')
    await acceptPageStudioPublicLead(event, { ...input, occurredAt: '2026-09-14T01:00:00.000Z' })
    expect([...leads.values()][0].submitted_at).toBe(input.occurredAt)
  })
  it('does not accept an unpersisted success response', async () => {
    mocks.acceptLead.mockResolvedValueOnce({ status: 'created', leadId: 'not-stored' })
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 503 })
    expect(leads.size).toBe(0)
  })
  it('allows an original retry after staff edit displayed fields, without overwriting their edits', async () => {
    await acceptPageStudioPublicLead(event, input)
    const row = [...leads.values()][0]
    row.field_data.referral = 'Staff correction'
    await expect(acceptPageStudioPublicLead(event, input)).resolves.toMatchObject({ duplicate: true })
    expect(row.field_data.referral).toBe('Staff correction')
    expect(mocks.acceptLead).toHaveBeenCalledTimes(1)
  })
  it('rejects a persisted retry after fresh release revocation', async () => {
    await acceptPageStudioPublicLead(event, input)
    authority = false
    await expect(acceptPageStudioPublicLead(event, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.acceptLead).toHaveBeenCalledTimes(1)
  })
  it('keeps general contact intake without requiring a bookings module', async () => {
    synthetic = false
    await expect(acceptPageStudioPublicLead(event, { ...input, formId: 'general-contact' })).resolves.toMatchObject({ leadId: 'lead-1' })
    expect([...leads.values()][0].is_test).toBe(false)
  })
})
