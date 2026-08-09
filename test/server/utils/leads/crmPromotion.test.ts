import { describe, expect, it, vi } from 'vitest'
import {
  createCrmLeadPromotionService,
  crmSourceCopy
} from '../../../../server/utils/leads/crmPromotion'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'
const PERSON_ID = '33333333-3333-4333-8333-333333333333'
const OPPORTUNITY_ID = '44444444-4444-4444-8444-444444444444'
const STAGE_ID = '55555555-5555-4555-8555-555555555555'
const LINK_ID = '66666666-6666-4666-8666-666666666666'

function trustedDeps(transaction: unknown, overrides: Record<string, unknown> = {}) {
  return {
    transaction,
    resolveContext: vi.fn(async () => ({
      organisationScopeId: '77777777-7777-4777-8777-777777777777',
      clientId: CLIENT_ID,
      correlationId: '88888888-8888-4888-8888-888888888888',
      actorType: 'system',
      actorId: 'trusted-system:lead_crm_promotion',
      surface: 'trusted_system',
      permissionSet: [],
      visibility: { ownerScoped: false },
      trustedSystem: { purpose: 'lead_crm_promotion' }
    })),
    authorizeAll: vi.fn(async (_context, refs) => refs.map((ref: { type: string, id: string }) => ({
      ...ref,
      clientId: CLIENT_ID,
      row: { id: ref.id }
    }))),
    ...overrides
  } as never
}

function lead(overrides: Record<string, unknown> = {}) {
  return {
    id: LEAD_ID,
    client_id: CLIENT_ID,
    source: 'webhook',
    source_lead_id: 'dealer-studio:lead-123',
    form_id: 'vehicle-enquiry',
    form_name: 'Vehicle enquiry',
    submitted_at: '2026-07-23T03:30:00.000Z',
    field_data: {
      first_name: 'Jane',
      last_name: 'Citizen',
      full_name: 'Jane Citizen',
      email: ' JANE@example.com ',
      phone_number: '0400 123 456',
      lead_provider: 'dealer_studio',
      vehicle_stock_number: 'S20619',
      vehicle_year: '2023',
      vehicle_make: 'Toyota',
      vehicle_model: 'RAV4',
      vehicle_price: '44,990'
    },
    attribution: { utm_source: 'meta', utm_campaign: 'rav4-launch' },
    assigned_to: null,
    is_test: false,
    deleted_at: null,
    ...overrides
  }
}

function createDb(options: {
  existingLink?: boolean
  people?: Array<Record<string, unknown>>
  stage?: boolean
  lead?: Record<string, unknown>
} = {}) {
  const statements: Array<{ sql: string, params: unknown[] }> = []
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params })
      if (/FROM leads[\s\S]*FOR UPDATE/.test(sql)) return { rows: [lead(options.lead)] }
      if (/FROM lead_crm_links/.test(sql)) {
        return { rows: options.existingLink ? [{ id: LINK_ID, person_id: PERSON_ID, opportunity_id: OPPORTUNITY_ID }] : [] }
      }
      if (/FROM crm_people/.test(sql)) return { rows: options.people ?? [] }
      if (/INSERT INTO crm_people/.test(sql)) return { rows: [{ id: PERSON_ID }] }
      if (/UPDATE crm_people/.test(sql)) return { rows: [{ id: PERSON_ID }] }
      if (/FROM crm_stages/.test(sql)) return { rows: options.stage === false ? [] : [{ id: STAGE_ID, probability: 10 }] }
      if (/INSERT INTO crm_opportunities/.test(sql)) return { rows: [{ id: OPPORTUNITY_ID }] }
      if (/INSERT INTO lead_crm_links/.test(sql)) return { rows: [{ id: LINK_ID }] }
      if (/INSERT INTO crm_activities/.test(sql)) return { rows: [] }
      return { rows: [] }
    })
  }
  return { db, statements }
}

describe('CRM lead promotion', () => {
  it('reloads the trusted active-client scope before identity matching or CRM writes', async () => {
    const { db, statements } = createDb()
    const resolveContext = vi.fn(async () => {
      throw Object.assign(new Error('Client not found'), {
        statusCode: 404,
        statusMessage: 'Client not found'
      })
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never,
      { resolveContext }
    ))

    await expect(service.promote(LEAD_ID)).rejects.toMatchObject({
      statusCode: 404,
      statusMessage: 'Client not found'
    })
    expect(resolveContext).toHaveBeenCalledWith({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })
    expect(statements.some(statement =>
      /FROM crm_stages|FROM crm_people|INSERT INTO crm_/.test(statement.sql)
    )).toBe(false)
  })

  it.each([
    ['google', 'ignored', 'Google lead received', 'Google enquiry'],
    ['meta', 'ignored', 'Meta lead received', 'Meta enquiry'],
    ['webhook', 'podium', 'Podium lead received', 'Podium enquiry'],
    ['webhook', '<unsafe-provider>', 'Website lead received', 'Website enquiry']
  ])('uses source-aware bounded copy for %s / %s', (source, provider, activity, fallback) => {
    expect(crmSourceCopy({
      source,
      field_data: { lead_provider: provider }
    })).toMatchObject({
      personActivityTitle: activity,
      opportunityFallback: fallback
    })
    expect(JSON.stringify(crmSourceCopy({
      source,
      field_data: { lead_provider: provider }
    }))).not.toContain('<unsafe-provider>')
  })

  it('atomically creates a CRM person, vehicle opportunity and durable lead link', async () => {
    const { db, statements } = createDb()
    const transaction = vi.fn(async callback => callback(db))
    const service = createCrmLeadPromotionService(trustedDeps(transaction as never))

    const result = await service.promote(LEAD_ID)

    expect(result).toEqual({
      status: 'promoted',
      personId: PERSON_ID,
      opportunityId: OPPORTUNITY_ID,
      linkId: LINK_ID,
      personCreated: true
    })
    expect(transaction).toHaveBeenCalledOnce()
    expect(statements.map(s => s.sql)).toEqual([
      expect.stringMatching(/FROM leads[\s\S]*FOR UPDATE/),
      expect.stringMatching(/FROM lead_crm_links/),
      expect.stringMatching(/FROM crm_stages/),
      expect.stringMatching(/FROM crm_people/),
      expect.stringMatching(/INSERT INTO crm_people/),
      expect.stringMatching(/INSERT INTO crm_opportunities/),
      expect.stringMatching(/INSERT INTO lead_crm_links/),
      expect.stringMatching(/INSERT INTO crm_activities/),
      expect.stringMatching(/INSERT INTO crm_activities/)
    ])

    const personInsert = statements.find(s => /INSERT INTO crm_people/.test(s.sql))
    expect(personInsert?.params).toEqual(expect.arrayContaining([
      CLIENT_ID,
      'Jane',
      'Citizen',
      'jane@example.com',
      '+61400123456'
    ]))

    const opportunityInsert = statements.find(s => /INSERT INTO crm_opportunities/.test(s.sql))
    expect(opportunityInsert?.params).toEqual(expect.arrayContaining([
      CLIENT_ID,
      '2023 Toyota RAV4 — Jane Citizen',
      PERSON_ID,
      STAGE_ID,
      44990,
      'dealer_studio'
    ]))
  })

  it('labels email-originated opportunities as email enquiries', async () => {
    const { db, statements } = createDb()
    db.query.mockImplementation(async (sql: string, params: unknown[] = []) => {
      statements.push({ sql, params })
      if (/FROM leads[\s\S]*FOR UPDATE/.test(sql)) {
        return {
          rows: [lead({
            source: 'email',
            field_data: {
              full_name: 'Jane Citizen',
              email: 'jane@example.com',
              lead_provider: 'email'
            }
          })]
        }
      }
      if (/FROM lead_crm_links/.test(sql)) return { rows: [] }
      if (/FROM crm_people/.test(sql)) return { rows: [] }
      if (/INSERT INTO crm_people/.test(sql)) return { rows: [{ id: PERSON_ID }] }
      if (/FROM crm_stages/.test(sql)) return { rows: [{ id: STAGE_ID, probability: 10 }] }
      if (/INSERT INTO crm_opportunities/.test(sql)) return { rows: [{ id: OPPORTUNITY_ID }] }
      if (/INSERT INTO lead_crm_links/.test(sql)) return { rows: [{ id: LINK_ID }] }
      return { rows: [] }
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await service.promote(LEAD_ID)

    const opportunityInsert = statements.find(statement =>
      /INSERT INTO crm_opportunities/.test(statement.sql)
    )
    expect(opportunityInsert?.params[1]).toBe('Email enquiry — Jane Citizen')
    const activityInserts = statements.filter(statement =>
      /INSERT INTO crm_activities/.test(statement.sql)
    )
    expect(activityInserts.map(statement => statement.params[2])).toEqual([
      'Email lead received',
      'Created from email lead'
    ])
  })

  it('reuses one tenant-scoped identity match without overwriting populated CRM fields', async () => {
    const { db, statements } = createDb({
      people: [{
        id: PERSON_ID,
        first_name: 'Jane',
        last_name: null,
        email: 'jane@example.com',
        phone: null,
        mobile: null
      }]
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    const result = await service.promote(LEAD_ID)

    expect(result).toMatchObject({ status: 'promoted', personId: PERSON_ID, personCreated: false })
    expect(statements.some(s => /UPDATE crm_people/.test(s.sql))).toBe(true)
    expect(statements.some(s => /INSERT INTO crm_people/.test(s.sql))).toBe(false)
    const personUpdate = statements.find(s => /UPDATE crm_people/.test(s.sql))
    expect(personUpdate?.params).toEqual([
      CLIENT_ID,
      PERSON_ID,
      'Jane',
      'Citizen',
      'jane@example.com',
      '+61400123456',
      null
    ])
    expect(personUpdate?.sql).toMatch(/NULLIF\(BTRIM\(mobile\), ''\)/)
  })

  it('does not create duplicate CRM records when the lead is already linked', async () => {
    const { db, statements } = createDb({ existingLink: true })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await expect(service.promote(LEAD_ID)).resolves.toEqual({
      status: 'already_promoted',
      personId: PERSON_ID,
      opportunityId: OPPORTUNITY_ID,
      linkId: LINK_ID
    })
    expect(statements).toHaveLength(2)
  })

  it('does not create a partial CRM person when the client has no usable new stage', async () => {
    const { db, statements } = createDb({ stage: false })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await expect(service.promote(LEAD_ID)).resolves.toEqual({ status: 'stage_not_found' })
    expect(statements.some(s => /INSERT INTO crm_people|INSERT INTO crm_opportunities/.test(s.sql))).toBe(false)
  })

  it('returns an identity conflict when email and phone resolve to different people', async () => {
    const { db, statements } = createDb({
      people: [
        { id: PERSON_ID, email: 'jane@example.com', mobile: null, phone: null },
        { id: '77777777-7777-4777-8777-777777777777', email: null, mobile: '+61400123456', phone: null }
      ]
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await expect(service.promote(LEAD_ID)).resolves.toEqual({
      status: 'identity_conflict',
      candidateCount: 2
    })
    expect(statements.some(s => /INSERT INTO crm_people|INSERT INTO crm_opportunities/.test(s.sql))).toBe(false)
  })

  it('does not promote test leads or leads missing the required customer identity', async () => {
    const testDb = {
      query: vi.fn(async (sql: string) => ({ rows: /FROM leads/.test(sql) ? [lead({ is_test: true })] : [] }))
    }
    const testService = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(testDb)) as never
    ))
    await expect(testService.promote(LEAD_ID)).resolves.toEqual({ status: 'skipped_test' })

    const incompleteDb = {
      query: vi.fn(async (sql: string) => ({
        rows: /FROM leads/.test(sql)
          ? [lead({ field_data: { full_name: 'Jane Citizen', lead_provider: 'generic' } })]
          : []
      }))
    }
    const incompleteService = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(incompleteDb)) as never
    ))
    await expect(incompleteService.promote(LEAD_ID)).resolves.toEqual({
      status: 'insufficient_identity',
      missing: ['email_or_phone']
    })
  })

  it.each([
    {
      provider: 'carsales',
      expectedPersonTitle: 'Carsales email lead received',
      expectedOpportunityTitle: 'Created from Carsales email lead',
      expectedFallback: 'Carsales email enquiry — Jane Citizen'
    },
    {
      provider: '<unsafe-provider>',
      expectedPersonTitle: 'Email lead received',
      expectedOpportunityTitle: 'Created from email lead',
      expectedFallback: 'Email enquiry — Jane Citizen'
    }
  ])('uses bounded provider-aware CRM copy for $provider email leads', async ({
    provider,
    expectedPersonTitle,
    expectedOpportunityTitle,
    expectedFallback
  }) => {
    const { db, statements } = createDb({
      lead: {
        source: 'email',
        field_data: {
          ...lead().field_data,
          lead_provider: provider,
          vehicle_year: '',
          vehicle_make: '',
          vehicle_model: ''
        }
      }
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await expect(service.promote(LEAD_ID)).resolves.toMatchObject({ status: 'promoted' })

    const opportunity = statements.find(s => /INSERT INTO crm_opportunities/.test(s.sql))
    const activities = statements.filter(s => /INSERT INTO crm_activities/.test(s.sql))
    expect(opportunity?.params).toContain(expectedFallback)
    expect(activities[0]?.params).toContain(expectedPersonTitle)
    expect(activities[1]?.params).toContain(expectedOpportunityTitle)
    expect(JSON.stringify({ opportunity, activities })).not.toContain('<unsafe-provider>')
    expect(JSON.stringify({ opportunity, activities })).not.toContain('Website')
    expect(JSON.stringify({ opportunity, activities })).not.toContain('website')
  })

  it('preserves the existing website CRM wording for webhook leads', async () => {
    const { db, statements } = createDb({
      lead: {
        field_data: {
          ...lead().field_data,
          vehicle_year: '',
          vehicle_make: '',
          vehicle_model: ''
        }
      }
    })
    const service = createCrmLeadPromotionService(trustedDeps(
      (async callback => callback(db)) as never
    ))

    await service.promote(LEAD_ID)

    const opportunity = statements.find(s => /INSERT INTO crm_opportunities/.test(s.sql))
    const activities = statements.filter(s => /INSERT INTO crm_activities/.test(s.sql))
    expect(opportunity?.params).toContain('Website enquiry — Jane Citizen')
    expect(activities[0]?.params).toContain('Website lead received')
    expect(activities[1]?.params).toContain('Created from website lead')
  })
})
