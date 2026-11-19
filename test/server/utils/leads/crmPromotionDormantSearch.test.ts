import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Regression: production incident 2026-08-11 → 2026-11-19. CRM search is
// intentionally dormant (migrations 350–352 unapplied), so every trusted CRM
// context lookup hit `relation "crm_search_organisation_scopes" does not
// exist` (42P01) and every lead CRM promotion failed. Promotion must complete
// with the search scope skipped (and logged once), not fail.

const db = vi.hoisted(() => ({
  queryOneFresh: vi.fn(),
  queryRowsFresh: vi.fn(),
  queryOne: vi.fn(),
  queryRows: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('~~/server/utils/db', () => db)
vi.mock('~~/server/utils/auth', () => ({ requireAuth: vi.fn(), verifyJwt: vi.fn() }))
vi.mock('~~/server/utils/portalSession', () => ({ digestPortalSessionToken: vi.fn() }))

const { createCrmLeadPromotionService } = await import('../../../../server/utils/leads/crmPromotion')
const { resolveTrustedCrmSystemContext } = await import('../../../../server/utils/crm/searchContext')
const { CRM_SEARCH_DORMANT_SCOPE_ID, resetCrmSearchDormancyLogForTests } = await import(
  '../../../../server/utils/crm/searchDormancy'
)

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const LEAD_ID = '22222222-2222-4222-8222-222222222222'

function missingSearchRelation() {
  return Object.assign(
    new Error('relation "crm_search_organisation_scopes" does not exist'),
    { name: 'error', code: '42P01' }
  )
}

function promotionDb() {
  const statements: string[] = []
  const client = {
    query: vi.fn(async (sql: string) => {
      statements.push(sql)
      if (/FROM leads[\s\S]*FOR UPDATE/.test(sql)) {
        return {
          rows: [{
            id: LEAD_ID,
            client_id: CLIENT_ID,
            source: 'webhook',
            source_lead_id: 'dealer-feed:lead-1',
            form_id: 'enquiry',
            form_name: 'Enquiry',
            submitted_at: '2026-11-18T00:00:00.000Z',
            field_data: { full_name: 'Jane Citizen', email: 'jane@example.com', lead_provider: 'dealer_studio' },
            attribution: null,
            assigned_to: null,
            is_test: false,
            deleted_at: null
          }]
        }
      }
      if (/FROM crm_stages/.test(sql)) return { rows: [{ id: 'stage-1', probability: 10 }] }
      if (/INSERT INTO crm_people/.test(sql)) return { rows: [{ id: 'person-1' }] }
      if (/INSERT INTO crm_opportunities/.test(sql)) return { rows: [{ id: 'opportunity-1' }] }
      if (/INSERT INTO lead_crm_links/.test(sql)) return { rows: [{ id: 'link-1' }] }
      return { rows: [] }
    })
  }
  return { client, statements }
}

describe('lead CRM promotion while CRM search is dormant', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetCrmSearchDormancyLogForTests()
    delete process.env.CRM_SEARCH_PROVIDER_APIS_ENABLED
    db.queryOneFresh.mockResolvedValue({ id: CLIENT_ID, name: 'Dealer', record_visibility: null })
    db.queryRowsFresh.mockRejectedValue(missingSearchRelation())
  })

  afterEach(() => {
    delete process.env.CRM_SEARCH_PROVIDER_APIS_ENABLED
  })

  it('completes promotion with the real trusted resolver and skips the search scope, logging once', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const { client, statements } = promotionDb()
    const service = createCrmLeadPromotionService({
      transaction: (async (callback: (c: typeof client) => unknown) => callback(client)) as never
    })

    await expect(service.promote(LEAD_ID)).resolves.toMatchObject({
      status: 'promoted',
      personId: 'person-1',
      opportunityId: 'opportunity-1',
      linkId: 'link-1'
    })
    await service.promote(LEAD_ID)

    // The missing search relation was actually hit (this is the failing query in prod).
    expect(db.queryRowsFresh).toHaveBeenCalledWith(expect.stringContaining('crm_search_organisation_scopes'))
    expect(statements.filter(sql => /INSERT INTO lead_crm_links/.test(sql))).toHaveLength(2)
    expect(statements.filter(sql => /INSERT INTO crm_activities/.test(sql))).toHaveLength(4)
    // Search capture is never attempted against the dormant schema.
    expect(statements.some(sql => /crm_search_/.test(sql))).toBe(false)

    const dormantLogs = info.mock.calls.filter(([entry]) =>
      (entry as { event?: string } | undefined)?.event === 'crm_search_scope_dormant')
    expect(dormantLogs).toHaveLength(1)
    expect(JSON.stringify(dormantLogs)).not.toMatch(/jane|example\.com|11111111|22222222/i)
    info.mockRestore()
  })

  it('marks the trusted context as search-dormant with the sentinel scope', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })).resolves.toMatchObject({
      clientId: CLIENT_ID,
      organisationScopeId: CRM_SEARCH_DORMANT_SCOPE_ID,
      searchScope: 'dormant',
      trustedSystem: { purpose: 'lead_crm_promotion' }
    })
  })

  it('fails closed when search activation is declared but the schema is missing', async () => {
    process.env.CRM_SEARCH_PROVIDER_APIS_ENABLED = 'true'
    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })).rejects.toMatchObject({ code: '42P01' })
  })

  it('still fails closed for unrelated missing relations and other database errors', async () => {
    db.queryRowsFresh.mockRejectedValueOnce(Object.assign(
      new Error('relation "crm_people" does not exist'),
      { code: '42P01' }
    ))
    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })).rejects.toThrow('crm_people')

    db.queryRowsFresh.mockRejectedValueOnce(Object.assign(new Error('connection reset'), { code: '08006' }))
    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })).rejects.toThrow('connection reset')
  })

  it('keeps an active search scope unchanged when the schema exists', async () => {
    db.queryRowsFresh.mockResolvedValueOnce([{ id: 'scope-1' }])
    await expect(resolveTrustedCrmSystemContext({
      clientId: CLIENT_ID,
      purpose: 'lead_crm_promotion'
    })).resolves.toMatchObject({ organisationScopeId: 'scope-1', searchScope: 'active' })
  })
})
