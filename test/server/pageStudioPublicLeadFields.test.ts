import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { H3Event } from 'h3'

import { acceptPageStudioPublicLead } from '../../server/utils/pageStudio/publicBoundary'

const mocks = vi.hoisted(() => ({
  queryOne: vi.fn(),
  execute: vi.fn(),
  acceptLead: vi.fn(),
  resolveLeadCaptureMode: vi.fn(),
  resolveAssignedAm: vi.fn(),
  upsertFormMetadata: vi.fn()
}))

vi.mock('~~/server/utils/db', () => ({ ...mocks, transaction: vi.fn() }))
vi.mock('~~/server/utils/leads/acceptance', () => ({
  acceptLead: mocks.acceptLead,
  resolveLeadCaptureMode: mocks.resolveLeadCaptureMode
}))
vi.mock('~~/server/utils/leads/autoAssign', () => ({ resolveAssignedAm: mocks.resolveAssignedAm }))
vi.mock('~~/server/utils/leads/db', () => ({ upsertFormMetadata: mocks.upsertFormMetadata }))
vi.mock('~~/server/utils/measurement/outbox', () => ({ appendCanonicalConversionEvent: vi.fn() }))
vi.mock('~~/server/utils/measurement/publisher', () => ({ conversionOutboxPublisher: { publishEvent: vi.fn() } }))

const input = {
  attribution: {},
  fields: { field_full_name: 'Synthetic Form Test', field_email: 'form-test@example.invalid', field_message: 'Fictional staging enquiry' },
  formId: 'form_staging_ai_contact_test',
  idempotencyKey: 'synthetic-form-submission-1',
  occurredAt: '2026-09-12T12:00:00.000Z',
  pageId: 'page_home',
  pageRoute: '/',
  releaseId: 'release_test',
  scope: { tenantId: 'tenant_test', clientId: 'client_test', siteId: 'site_test' },
  versionDigest: 'a'.repeat(64)
}

describe('Page Studio generated form lead fields', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.queryOne.mockResolvedValue({
      tenant_id: input.scope.tenantId,
      client_id: input.scope.clientId,
      site_id: input.scope.siteId,
      release_id: input.releaseId,
      is_synthetic: true
    })
    mocks.acceptLead.mockResolvedValue({ status: 'created', leadId: 'lead_test' })
  })

  it('maps the actual AI-generated contact fields without discarding submitted keys', async () => {
    await acceptPageStudioPublicLead({} as H3Event, input)
    expect(mocks.acceptLead.mock.calls[0][1].lead.field_data).toEqual({
      ...input.fields,
      full_name: 'Synthetic Form Test',
      email: 'form-test@example.invalid',
      message: 'Fictional staging enquiry'
    })
    expect(input.fields).not.toHaveProperty('full_name')
  })

  it('keeps explicit canonical values and the existing alias precedence', async () => {
    const fields = { ...input.fields, full_name: 'Canonical Name', message: 'Canonical Message', email: 'canonical@example.invalid' }
    await acceptPageStudioPublicLead({} as H3Event, { ...input, fields })
    expect(mocks.acceptLead.mock.calls[0][1].lead.field_data).toEqual(fields)
    await acceptPageStudioPublicLead({} as H3Event, {
      ...input, fields: { ...input.fields, field_name: 'Legacy Name', field_goal: 'Legacy Message' }
    })
    expect(mocks.acceptLead.mock.calls[1][1].lead.field_data).toMatchObject({ full_name: 'Legacy Name', message: 'Legacy Message' })
  })

  it('keeps synthetic submissions out of assignment and notification routing', async () => {
    await acceptPageStudioPublicLead({} as H3Event, input)
    expect(mocks.acceptLead.mock.calls[0][1]).toMatchObject({
      lead: { is_test: true, assigned_to: null }, leadCaptureMode: 'capture_only', runRules: false
    })
    expect(mocks.resolveLeadCaptureMode).not.toHaveBeenCalled()
    expect(mocks.resolveAssignedAm).not.toHaveBeenCalled()
  })

  it('rejects an inactive release before any lead or metadata write', async () => {
    mocks.queryOne.mockResolvedValue(null)
    await expect(acceptPageStudioPublicLead({} as H3Event, input)).rejects.toMatchObject({ statusCode: 403 })
    expect(mocks.acceptLead).not.toHaveBeenCalled()
    expect(mocks.upsertFormMetadata).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
  })
})
