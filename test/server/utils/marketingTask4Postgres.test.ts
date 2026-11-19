import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  vi
} from 'vitest'
import {
  TASK4_DSN,
  task4Pool,
  resetTask4Schema
} from '../../helpers/marketingTask4Postgres'
import { executeGoogleAdsSearchPlanningTool } from '../../../server/utils/ai/mcp/googleAdsSearchTools'
import { resolveGtmAccessToken, reserveGtmApiQuota } from '../../../server/utils/googleTagManagerStore'
import { resolveGoogleAdsAccount } from '../../../server/utils/googleAds/accountResolution'
import { planSearchGoogleAdsControlAction } from '../../../server/utils/googleAds/searchRuntime'
import { executeReviewedGoogleAdsPlan, reviewGoogleAdsPlan } from '../../../server/utils/googleAds/staffReview'
import { assertGoogleAdsConnection } from '../../../server/utils/ai/marketing/googleAdsAccess'
import { createGoogleAdsActionPlan } from '../../../server/utils/googleAds/actionStore'
import {
  createGtmChangeProposal,
  reviewGtmChangeProposal,
  executeApprovedGtmProposal,
  getGtmChangeProposal
} from '../../../server/utils/tracking/gtmProposals'
import * as gtmApi from '../../../server/utils/googleTagManagerClient'
import { recordGtmOwnership } from '../../../server/utils/tracking/gtmOwnership'

const state = vi.hoisted(() => ({
  pool: null as any,
  replayBarrier: null as null | (() => Promise<void>),
  concurrentReplayCount: 0,
  realQuota: false,
  origin: 'https://app.example.test/',
  providerCalls: 0,
  writes: 0,
  publishes: 0,
  live: '3',
  drift: false,
  ambiguous: false,
  entity: null as any,
  typedEntities: [] as any[],
  installTag: null as any,
  installTrigger: null as any,
  adsStatus: 'ENABLED',
  adsMutations: 0,
  adsValidations: 0
}))
vi.mock('h3', async original => ({
  ...(await original<any>()),
  getRequestURL: () => new URL(state.origin)
}))
// Authentication transport is fixture-owned; reviewer and requester authority still use real SQL.
vi.mock('../../../server/utils/auth', () => ({
  requireAuth: async (event: any) => event.context.fixtureUser
}))
vi.mock('../../../server/utils/db', () => ({
  execute: async (s: string, p: any[]) => state.pool.query(s, p),
  queryRowsFresh: async (s: string, p: any[]) =>
    (await state.pool.query(s, p)).rows,
  queryOneFresh: async (s: string, p: any[]) => {
    const row = (await state.pool.query(s, p)).rows[0] ?? null
    if (s.startsWith('SELECT id,desired_state FROM gtm_change_proposals') && state.replayBarrier)
      await state.replayBarrier()
    if (s.startsWith('INSERT INTO gtm_change_proposals') && !row) state.concurrentReplayCount++
    return row
  },
  queryOne: async (s: string, p: any[]) =>
    (await state.pool.query(s, p)).rows[0] ?? null,
  queryRows: async (s: string, p: any[]) => (await state.pool.query(s, p)).rows,
  transaction: async (fn: any) => {
    const c = await state.pool.connect()
    try {
      await c.query('BEGIN')
      const r = await fn(c)
      await c.query('COMMIT')
      return r
    } catch (e) {
      await c.query('ROLLBACK')
      throw e
    } finally {
      c.release()
    }
  }
}))
vi.mock('../../../server/utils/googleTagManagerStore', async (original) => {
  const real = await original<any>()
  return ({
    resolveGtmAccessToken: vi.fn(async () => {
      state.providerCalls++
      return {
        token: 'test',
        scopes: [
          'https://www.googleapis.com/auth/tagmanager.edit.containers',
          'https://www.googleapis.com/auth/tagmanager.edit.containerversions',
          'https://www.googleapis.com/auth/tagmanager.publish'
        ]
      }
    }),
    reserveGtmApiQuota: vi.fn(async (count: number) => { if (state.realQuota) await real.reserveGtmApiQuota(count) })
  })
})
vi.mock(
  '../../../server/utils/googleTagManagerClient',
  async (importOriginal) => {
    const version = (id: string) => ({
      path: `accounts/1/containers/2/versions/${id}`,
      fingerprint: `live${id}`,
      accountId: '1',
      containerId: '2',
      containerVersionId: id,
      tag: id === '4' ? [...state.typedEntities.filter(e => e.kind === 'tags').map(e => e.entity), ...(state.installTag ? [state.installTag] : [])] : [],
      trigger: id === '4' && state.installTrigger ? [state.installTrigger] : [],
      folder: id === '4' ? state.typedEntities.filter(e => e.kind === 'folders').map(e => e.entity) : []
    })
    return {
      ...(await importOriginal<any>()),
      getLiveGtmVersion: vi.fn(async () => ({
        ...version(state.live),
        fingerprint: state.drift ? 'changed' : `live${state.live}`
      })),
      getGtmVersion: vi.fn(async (_t: string, path: string) =>
        version(path.split('/').at(-1)!)
      ),
      getGtmContainer: vi.fn(async () => ({
        path: 'accounts/1/containers/2',
        accountId: '1',
        containerId: '2',
        name: 'Test',
        publicId: 'GTM-TEST',
        domainName: ['example.test'],
        usageContext: ['web']
      })),
      createGtmWorkspace: vi.fn(async () => {
        state.writes++
        return {
          path: 'accounts/1/containers/2/workspaces/8',
          fingerprint: 'workspace8'
        }
      }),
      writeGtmEntity: vi.fn(
        async (_t: string, workspace: string, kind: string, body: any) => {
          state.writes++
          const id = String(9 + state.typedEntities.length)
          state.entity = {
            ...body,
            path: `${workspace}/${kind}/${id}`,
            [`${kind.slice(0, -1)}Id`]: id,
            fingerprint: `entity${id}`
          }
          state.typedEntities.push({ kind, entity: state.entity })
          return state.entity
        }
      ),
      createGtmTrigger: vi.fn(
        async (_t: string, workspace: string, body: any) => {
          state.writes++
          state.installTrigger = {
            ...body,
            path: `${workspace}/triggers/10`,
            triggerId: '10',
            fingerprint: 'trigger10'
          }
          return state.installTrigger
        }
      ),
      createGtmTag: vi.fn(async (_t: string, workspace: string, body: any) => {
        state.writes++
        state.installTag = {
          ...body,
          path: `${workspace}/tags/11`,
          tagId: '11',
          fingerprint: 'tag11'
        }
        return state.installTag
      }),
      getGtmEntity: vi.fn(async (_t: string, path: string) =>
        state.typedEntities.find(e => e.entity.path === path)?.entity
        ?? (path.endsWith('/triggers/10')
          ? state.installTrigger
          : path.endsWith('/tags/11') ? state.installTag : state.entity)
      ),
      getGtmWorkspaceStatus: vi.fn(async () => ({})),
      quickPreviewGtmWorkspace: vi.fn(async () => ({
        containerVersion: version('4')
      })),
      createGtmVersion: vi.fn(async () => {
        state.writes++
        return { containerVersion: version('4') }
      }),
      publishGtmVersion: vi.fn(async (_t: string, path: string) => {
        state.writes++
        state.publishes++
        state.live = path.split('/').at(-1)!
        if (state.ambiguous) throw new Error('transport uncertain')
        return { containerVersion: version(state.live) }
      })
    }
  }
)
vi.mock('../../../server/utils/measurement/reconciliationRepository', () => ({ measurementReconciliationRepository: { list: vi.fn(async () => ({ items: [], summary: {} })) } }))
vi.mock('../../../server/utils/googleAds/controlSession', () => ({
  resolveGoogleAdsControlSession: vi.fn(async (input: any) => ({
    connection: {
      ...input,
      customerId: '123',
      platform: 'google',
      status: 'active'
    },
    auth: { accessToken: 'test', developerToken: 'test' }
  }))
}))
vi.mock('../../../server/utils/googleAds/searchState', async original => ({
  ...(await original<any>()),
  loadSearchGoogleAdsCurrentState: vi.fn(async () => ({
    resourceName: 'customers/123/campaigns/1',
    status: state.adsStatus
  })),
  loadSearchGoogleAdsPlanState: vi.fn(async () => ({
    resourceName: 'customers/123/campaigns/1',
    status: state.adsStatus
  }))
}))
vi.mock('../../../server/utils/googleAds/mutate', async original => ({
  ...(await original<any>()),
  mutateGoogleAds: vi.fn(async (input: any) => {
    if (input.validateOnly) state.adsValidations++
    else {
      state.adsMutations++
      state.adsStatus = 'PAUSED'
    }
    return {
      ok: true,
      results: [{ resourceName: 'customers/123/campaigns/1' }],
      requestId: 'request-test'
    }
  })
}))

const C = '11111111-1111-4111-8111-111111111111',
  D = '22222222-2222-4222-8222-222222222222',
  U = '33333333-3333-4333-8333-333333333333',
  A = '44444444-4444-4444-8444-444444444444',
  CON = '55555555-5555-4555-8555-555555555555',
  SITE = '66666666-6666-4666-8666-666666666666',
  PLAN = '77777777-7777-4777-8777-777777777777',
  GTM = '88888888-8888-4888-8888-888888888888'
const event = {
  context: {
    cloudflare: {
      env: {
        GOOGLE_ADS_MCP_READ_ENABLED: 'true',
        GOOGLE_ADS_MCP_WRITE_ENABLED: 'true',
        MCP_MARKETING_STAFF_GRANTS: JSON.stringify({
          [U]: ['ads_plan', 'tracking_plan'],
          [A]: ['ads_plan', 'tracking_plan']
        })
      }
    }
  }
} as any
const ctx = (id = U) => ({
  event,
  userId: id,
  userRole: id === U ? 'media_buyer' : 'admin',
  mcpScopes: ['mcp:read', 'mcp:write'],
  mcpStaffAuthority: 'fresh' as const
})
const evidence = {
  publicHost: 'example.test',
  formEndpoint: 'https://example.test/enquiry',
  siteKind: 'external',
  dealerId: 'test-dealer',
  conversionOwner: 'external_backend',
  browserRequirement: 'Documented consented browser page views',
  consentPolicy: 'Browser consent managed by site CMP',
  existingProviderHooks: 'Accepted leads use external server hooks',
  nativeServerAssessment: 'External backend inspected at source revision',
  deduplicationAssessment: 'Browser page views do not duplicate accepted leads',
  conversionDeliveryEvidence:
    'No fabricated enquiries; actual delivery unverified',
  sourceRevision: 'a'.repeat(40),
  guideRevision: 'Guide inspected at current source',
  wikiRevision: 'Wiki unavailable; revision unverified',
  graphRevision: 'Graph unavailable; stale claims excluded',
  staleAreas: 'Generated diagrams not refreshed',
  verifiedAgainstCurrentSource: true,
  consentOwner: 'Website operator',
  acceptedLeadRoutingUnchanged: true
}
const plan = () =>
  ({
    id: PLAN,
    clientId: C,
    connectionId: CON,
    customerId: '123',
    actorId: U,
    source: 'mcp',
    toolName: 'google_ads.pause_campaign',
    resourceType: 'campaign',
    resourceName: 'customers/123/campaigns/1',
    operation: 'pause_campaign',
    currentState: { status: 'ENABLED' },
    desiredState: { status: 'PAUSED' },
    currentStateFingerprint: 'a'.repeat(64),
    diff: [{ field: 'status', before: 'ENABLED', after: 'PAUSED' }],
    providerOperations: [
      {
        service: 'campaigns',
        atomicity: 'interdependent',
        partialFailure: false,
        operations: [
          {
            update: {
              resourceName: 'customers/123/campaigns/1',
              status: 'PAUSED'
            },
            updateMask: 'status'
          }
        ]
      }
    ],
    riskTier: 'confirm',
    executionMode: 'proposal',
    policyVersion: 'google-ads-v1',
    policyDecision: {
      allowed: true,
      riskTier: 'confirm',
      executionMode: 'proposal'
    },
    requestHash: 'b'.repeat(64),
    idempotencyKey: 'test',
    status: 'pending_approval',
    reviewPolicy: 'delegated_marketing',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    createdAt: new Date().toISOString()
  }) as any
const suite = TASK4_DSN ? describe : describe.skip
suite('Task4 real SQL review boundaries', () => {
  beforeAll(async () => {
    state.pool = task4Pool(TASK4_DSN)
    await resetTask4Schema(state.pool)
  })
  afterAll(async () => {
    vi.unstubAllGlobals()
    await state.pool?.end()
  })
  beforeEach(async () => {
    state.replayBarrier = null
    state.concurrentReplayCount = 0
    await state.pool.query(
      `TRUNCATE gtm_change_proposals,gtm_tracking_ownership_evidence,gtm_change_sets,gtm_container_bindings,gtm_connections,google_credential_profiles,tracking_sites,google_ads_action_events,google_ads_action_plans,google_ads_automation_policies,google_ads_account_bindings,social_connections,client_team_assignments,team_members,agency_clients,ai_pending_actions CASCADE`
    )
    await state.pool.query(
      `INSERT INTO agency_clients(id,name) VALUES($1,'A'),($2,'B');`,
      [C, D]
    )
    await state.pool.query(
      `INSERT INTO team_members(id,name,email,role,user_role) VALUES($1,'Staff','staff@example.test','media_buyer','media_buyer'),($2,'Admin','admin@example.test','admin','admin')`,
      [U, A]
    )
    await state.pool.query(
      'INSERT INTO client_team_assignments VALUES($1,$2)',
      [U, C]
    )
    await state.pool.query(
      'INSERT INTO social_connections(id,client_id,account_id,platform,status) VALUES($1,$2,\'123\',\'google\',\'active\')',
      [CON, C]
    )
    await state.pool.query(
      'INSERT INTO google_ads_account_bindings(client_id,connection_id,operating_customer_id,account_role) VALUES($1,$2,\'123\',\'dealer\')',
      [C, CON]
    )
    await state.pool.query(
      'INSERT INTO tracking_sites(id,client_id,name,allowed_origins) VALUES($1,$2,\'Test\',ARRAY[\'https://example.test\'])',
      [SITE, C]
    )
    await state.pool.query(
      'INSERT INTO google_credential_profiles VALUES($1)',
      [GTM]
    )
    await state.pool.query(
      'INSERT INTO gtm_connections(id,google_credential_profile_id,google_subject,google_email,connected_by) VALUES($1,$1,\'subject\',\'test@example.test\',$2)',
      [GTM, A]
    )
    await state.pool.query(
      'INSERT INTO gtm_container_bindings(tracking_site_id,connection_id,account_path,account_name,container_path,container_public_id,container_name,bound_by) VALUES($1,$2,\'accounts/1\',\'test\',\'accounts/1/containers/2\',\'GTM-TEST\',\'Test\',$3)',
      [SITE, GTM, A]
    )
    state.realQuota = false
    state.origin = 'https://app.example.test/'
    await state.pool.query('TRUNCATE gtm_api_quota_windows')
    state.providerCalls = 0
    state.writes = 0
    state.publishes = 0
    state.live = '3'
    state.drift = false
    state.ambiguous = false
    state.installTag = null
    state.installTrigger = null
    state.entity = null
    state.typedEntities = []
    state.adsStatus = 'ENABLED'
    state.adsMutations = 0
    state.adsValidations = 0
  })
  const initialMapping = async (key = 'initial-mapping') => {
    await state.pool.query('DELETE FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])
    const ownership = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, key + '-evidence')
    return createGtmChangeProposal(ctx(), {
      action: 'binding', siteId: SITE, ownershipEvidenceId: ownership.id,
      connectionId: GTM, containerPath: 'accounts/1/containers/2', initialMapping: true
    }, key)
  }
  it('requests first mapping locally, then independently verifies and binds without touching GTM', async () => {
    const proposal = await initialMapping()
    expect(proposal.status).toBe('pending_review')
    expect(state.providerCalls).toBe(0)
    expect(proposal.review.base).toBeNull()
    await expect(reviewGtmChangeProposal(ctx(), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })).rejects.toMatchObject({ statusCode: 403 })
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    expect(state.providerCalls).toBe(0)
    const result = await executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })
    expect(result.status).toBe('verified')
    expect(state.writes).toBe(0)
    expect(state.publishes).toBe(0)
    expect((await state.pool.query('SELECT connection_id FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows[0].connection_id).toBe(GTM)
    expect(await getGtmChangeProposal(ctx(), proposal.id)).toMatchObject({ status: 'verified' })
  })
  it('first mapping cannot be used to replace a binding or access a foreign client', async () => {
    const ownership = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'existing-evidence')
    await expect(createGtmChangeProposal(ctx(), {
      action: 'binding', siteId: SITE, ownershipEvidenceId: ownership.id, connectionId: GTM,
      containerPath: 'accounts/1/containers/2', initialMapping: true
    }, 'replace')).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
    await state.pool.query('UPDATE tracking_sites SET client_id=$1 WHERE id=$2', [D, SITE])
    await expect(initialMapping()).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('first mapping rejects another locally bound client container before credentials', async () => {
    await state.pool.query('DELETE FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])
    const otherSite = 'abababab-abab-4bab-8bab-abababababab'
    await state.pool.query('INSERT INTO tracking_sites(id,client_id,name,allowed_origins) VALUES($1,$2,\'Other\',ARRAY[\'https://other.test\'])', [otherSite, D])
    await state.pool.query(`INSERT INTO gtm_container_bindings(tracking_site_id,connection_id,account_path,account_name,container_path,container_public_id,container_name,bound_by)
      VALUES($1,$2,'accounts/1','test','accounts/1/containers/2','GTM-TEST','Other',$3)`, [otherSite, GTM, A])
    await expect(initialMapping()).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('first mapping rechecks requester and original approver revocation before credentials', async () => {
    const proposal = await initialMapping()
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    await state.pool.query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [U])
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
    await state.pool.query('INSERT INTO client_team_assignments VALUES($1,$2)', [U, C])
    await state.pool.query('UPDATE team_members SET is_active=FALSE WHERE id=$1', [A])
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('first mapping rejects a mismatched provider host without creating a binding', async () => {
    const proposal = await initialMapping()
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    vi.mocked(gtmApi.getGtmContainer).mockResolvedValueOnce({ path: 'accounts/1/containers/2', domainName: ['foreign.test'], usageContext: ['web'] } as gtmApi.GtmContainer)
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 409 })
    expect((await state.pool.query('SELECT id FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows).toEqual([])
    expect(state.writes).toBe(0)
  })
  it('first mapping never overwrites a site binding added during provider verification', async () => {
    const proposal = await initialMapping()
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    const target = await gtmApi.getGtmContainer('test', 'accounts/1/containers/2')
    vi.mocked(gtmApi.getGtmContainer).mockImplementationOnce(async () => {
      await state.pool.query(`INSERT INTO gtm_container_bindings(tracking_site_id,connection_id,account_path,account_name,container_path,container_public_id,container_name,bound_by)
        VALUES($1,$2,'accounts/9','Concurrent','accounts/9/containers/9','GTM-OTHER','Concurrent',$3)`, [SITE, GTM, A])
      return target
    })
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 409 })
    expect((await state.pool.query('SELECT container_path FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows[0].container_path).toBe('accounts/9/containers/9')
    expect(await held()).toBeNull()
    expect((await state.pool.query('SELECT status FROM gtm_change_proposals WHERE id=$1', [proposal.id])).rows[0].status).toBe('failed')
  })
  it('first mapping rejects a foreign container claimed while the provider check is in flight', async () => {
    const proposal = await initialMapping()
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    const target = await gtmApi.getGtmContainer('test', 'accounts/1/containers/2')
    vi.mocked(gtmApi.getGtmContainer).mockImplementationOnce(async () => {
      const otherSite = 'adadadad-adad-4dad-8dad-adadadadadad'
      const otherConnection = 'aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae'
      await state.pool.query('INSERT INTO tracking_sites(id,client_id,name,allowed_origins) VALUES($1,$2,\'Other\',ARRAY[\'https://other.test\'])', [otherSite, D])
      await state.pool.query(`INSERT INTO gtm_connections(id,google_credential_profile_id,google_subject,google_email,connected_by) VALUES($1,$2,'other-subject','other@example.test',$3)`, [otherConnection, GTM, A])
      await state.pool.query(`INSERT INTO gtm_container_bindings(tracking_site_id,connection_id,account_path,account_name,container_path,container_public_id,container_name,bound_by)
        VALUES($1,$2,'accounts/1','Other','accounts/1/containers/2','GTM-TEST','Other',$3)`, [otherSite, otherConnection, A])
      return target
    })
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 409 })
    expect((await state.pool.query('SELECT id FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows).toEqual([])
  })
  it('first mapping rechecks site ownership changed during provider verification', async () => {
    const proposal = await initialMapping()
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    const target = await gtmApi.getGtmContainer('test', 'accounts/1/containers/2')
    vi.mocked(gtmApi.getGtmContainer).mockImplementationOnce(async () => {
      await state.pool.query('UPDATE tracking_sites SET client_id=$1 WHERE id=$2', [D, SITE])
      return target
    })
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash })).rejects.toMatchObject({ statusCode: 409 })
    expect((await state.pool.query('SELECT id FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows).toEqual([])
  })
  it('staff MCP onboarding catalog and invocation require the real tracking grant and fresh client assignment', async () => {
    const { resolveMcpStaffContext } = await import('../../../server/utils/ai/mcp/staffAuthority')
    const { projectMcpToolsForStaff } = await import('../../../server/utils/ai/mcp/marketingPolicy')
    const { executeTask4StaffTool } = await import('../../../server/utils/ai/mcp/marketingTask4Tools')
    const staff = await resolveMcpStaffContext(event, U, ['mcp:read', 'mcp:write'])
    const projection = { tools: [], suiteFlags: {}, role: staff.userRole, scopes: staff.mcpScopes }
    expect(projectMcpToolsForStaff({ context: projection as unknown as import('../../../server/utils/ai/mcp/project').McpProjectionContext, staff }).map(tool => tool.name)).toContain('get_client_tracking_onboarding')
    expect(await executeTask4StaffTool('get_client_tracking_onboarding', { clientId: C }, staff, 'guide')).toMatchObject({ ok: true, data: { clientId: C } })
    expect(await executeTask4StaffTool('get_client_tracking_onboarding', { clientId: D }, staff, 'foreign-guide')).toMatchObject({ ok: false, code: 'forbidden' })
    await state.pool.query('DELETE FROM client_team_assignments WHERE team_member_id=$1', [U])
    expect(await executeTask4StaffTool('get_client_tracking_onboarding', { clientId: C }, staff, 'revoked-guide')).toMatchObject({ ok: false, code: 'forbidden' })
    const unenrolled = { ...staff, marketingCapabilities: [] }
    expect(projectMcpToolsForStaff({ context: projection as unknown as import('../../../server/utils/ai/mcp/project').McpProjectionContext, staff: unenrolled }).map(tool => tool.name)).not.toContain('get_client_tracking_onboarding')
    expect(await executeTask4StaffTool('get_client_tracking_onboarding', { clientId: C }, unenrolled, 'no-grant')).toMatchObject({ ok: false, code: 'capability_required' })
    expect(state.providerCalls).toBe(0)
  })
  it('walks a new external client from first mapping through separately reviewed installation and publication', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    const mapping = await initialMapping('full-onboarding')
    await reviewGtmChangeProposal(ctx(A), { proposalId: mapping.id, expectedHash: mapping.request_hash, decision: 'approved' })
    await executeApprovedGtmProposal(ctx(A), { proposalId: mapping.id, expectedHash: mapping.request_hash })
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('ready_to_install')
    await state.pool.query('UPDATE tracking_sites SET write_key=\'onboarding-test-key\' WHERE id=$1', [SITE])
    const installation = await createGtmChangeProposal(ctx(), { action: 'installation', siteId: SITE, ownershipEvidenceId: mapping.ownership_evidence_id }, 'full-install')
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('awaiting_installation_approval')
    await reviewGtmChangeProposal(ctx(A), { proposalId: installation.id, expectedHash: installation.request_hash, decision: 'approved' })
    expect((await executeApprovedGtmProposal(ctx(A), { proposalId: installation.id, expectedHash: installation.request_hash })).status).toBe('versioned')
    expect(state.publishes).toBe(0)
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('awaiting_publication')
    const publication = await createGtmChangeProposal(ctx(), { action: 'publish', siteId: SITE, ownershipEvidenceId: mapping.ownership_evidence_id, sourceProposalId: installation.id }, 'full-publish')
    await expect(executeApprovedGtmProposal(ctx(A), { proposalId: publication.id, expectedHash: publication.request_hash })).rejects.toMatchObject({ statusCode: 409 })
    expect(state.publishes).toBe(0)
    await reviewGtmChangeProposal(ctx(A), { proposalId: publication.id, expectedHash: publication.request_hash, decision: 'approved' })
    expect((await executeApprovedGtmProposal(ctx(A), { proposalId: publication.id, expectedHash: publication.request_hash })).status).toBe('verified')
    const status = await getClientTrackingOnboarding(ctx(), C)
    expect(status.sites[0].stage).toBe('tag_verified_in_gtm')
    expect(status.conversionDelivery).toBe('not_verified')
    expect(state.publishes).toBe(1)
    await state.pool.query(`INSERT INTO gtm_change_sets(binding_id,action_type,status,requested_by) VALUES($1,'rollback','rolled_back',$2)`, [installation.binding_id, A])
    await state.pool.query('UPDATE gtm_container_bindings SET last_verified_at=NOW() WHERE tracking_site_id=$1', [SITE])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('live_verification_needed')
  })
  it('does not describe missing ownership evidence or expired approval as ready to proceed', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('ownership_evidence_needed')
    const mapping = await initialMapping('expired-mapping')
    await state.pool.query(`INSERT INTO gtm_change_proposals(client_id,site_id,connection_id,action_type,requester_id,desired_state,state_diff,request_hash,base_live_path,base_live_fingerprint,ownership_evidence_id,idempotency_key,expires_at)
      SELECT client_id,site_id,connection_id,action_type,requester_id,desired_state,state_diff,request_hash,base_live_path,base_live_fingerprint,ownership_evidence_id,'expired-copy',NOW()-INTERVAL '1 hour' FROM gtm_change_proposals WHERE id=$1`, [mapping.id])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('proposal_expired')
  })
  it('cannot omit initialMapping to use a sibling site connection or read an unproven remap target', async () => {
    const sibling = 'afafafaf-afaf-4faf-8faf-afafafafafaf'
    await state.pool.query('INSERT INTO tracking_sites(id,client_id,name,allowed_origins) VALUES($1,$2,\'Sibling\',ARRAY[\'https://example.test\'])', [sibling, C])
    const own = await recordGtmOwnership(ctx(), { siteId: sibling, evidence }, 'sibling')
    await expect(createGtmChangeProposal(ctx(), { action: 'binding', siteId: sibling, ownershipEvidenceId: own.id, connectionId: GTM, containerPath: 'accounts/1/containers/99' }, 'no-initial-flag')).rejects.toMatchObject({ statusCode: 409 })
    const boundOwn = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'bound-own')
    await expect(createGtmChangeProposal(ctx(), { action: 'binding', siteId: SITE, ownershipEvidenceId: boundOwn.id, connectionId: GTM, containerPath: 'accounts/1/containers/99' }, 'unproven-remap')).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('accepts server-proven native tracking writes but rejects synthetic chat and unsigned MCP writes', async () => {
    const { resolveNativeMarketingContext } = await import('../../../server/utils/ai/marketing/nativeAuthority')
    const fakeChat = { ...ctx(), source: 'chat' as const, mcpScopes: undefined }
    await expect(recordGtmOwnership(fakeChat, { siteId: SITE, evidence }, 'fake-chat')).rejects.toMatchObject({ statusCode: 403 })
    event.context.fixtureUser = { id: U }
    try {
      const native = await resolveNativeMarketingContext(fakeChat)
      expect(native.mcpScopes).toBeUndefined()
      const own = await recordGtmOwnership(native, { siteId: SITE, evidence }, 'native-confirmed')
      await state.pool.query('DELETE FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])
      expect(await createGtmChangeProposal(native, { action: 'binding', siteId: SITE, ownershipEvidenceId: own.id, connectionId: GTM, containerPath: 'accounts/1/containers/2', initialMapping: true }, 'native-mapping')).toMatchObject({ status: 'pending_review' })
    } finally { delete event.context.fixtureUser }
    expect(state.providerCalls).toBe(0)
  })
  it('rejects shared multi-domain containers rather than granting container-wide staff access', async () => {
    const proposal = await initialMapping('shared-container')
    await reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })
    const target = await gtmApi.getGtmContainer('test', 'accounts/1/containers/2')
    vi.mocked(gtmApi.getGtmContainer).mockResolvedValueOnce({ ...target, domainName: ['example.test', 'foreign.test'] })
    await expect(executeProposal(proposal)).rejects.toMatchObject({ statusCode: 409 })
    expect(await held()).toBeNull()
    expect((await state.pool.query('SELECT id FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])).rows).toEqual([])
  })
  it('a newer native ownership assessment invalidates earlier external installation evidence', async () => {
    const { p } = await approvedInstallation()
    await recordGtmOwnership(ctx(), { siteId: SITE, evidence: { ...evidence, siteKind: 'native_driveagent', conversionOwner: 'driveagent' } }, 'new-native-assessment')
    state.providerCalls = 0
    await expect(executeProposal(p)).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
  })
  it('does not label an unrelated folder publication or a binding timestamp as pixel verification', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    const { p, own } = await prepare()
    await executeProposal(p)
    const pub = await createGtmChangeProposal(ctx(), { action: 'publish', siteId: SITE, ownershipEvidenceId: own.id, sourceProposalId: p.id }, 'folder-publish')
    await reviewGtmChangeProposal(ctx(A), { proposalId: pub.id, expectedHash: pub.request_hash, decision: 'approved' })
    await executeProposal(pub)
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('live_verification_needed')
    await state.pool.query('UPDATE gtm_container_bindings SET last_verified_at=NOW() WHERE tracking_site_id=$1', [SITE])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('live_verification_needed')
  })
  it('onboarding detects disconnected identities, changed hosts and nonretryable connection holds', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'readiness-evidence')
    await state.pool.query('UPDATE gtm_connections SET status=\'disconnected\' WHERE id=$1', [GTM])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('connection_reconnect_needed')
    await state.pool.query('UPDATE gtm_connections SET status=\'active\' WHERE id=$1', [GTM])
    await state.pool.query('UPDATE tracking_sites SET allowed_origins=ARRAY[\'https://changed.test\'] WHERE id=$1', [SITE])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('ownership_evidence_needed')
    await state.pool.query(`UPDATE gtm_connections SET metadata=jsonb_set(metadata,'{reviewedExecution}','"foreign-opaque-operation"'::jsonb) WHERE id=$1`, [GTM])
    const result = await getClientTrackingOnboarding(ctx(), C)
    expect(result.sites[0].stage).toBe('inspection_required')
    expect(JSON.stringify(result)).not.toContain('foreign-opaque-operation')
  })
  it('unbound mapping readiness detects a disconnected requested connection', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    await initialMapping('unbound-disconnected')
    await state.pool.query('UPDATE gtm_connections SET status=\'expired\' WHERE id=$1', [GTM])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('connection_reconnect_needed')
  })
  it('cannot publish a previously external installer after a current native ownership assessment', async () => {
    const { p } = await approvedInstallation()
    await executeProposal(p)
    const native = await recordGtmOwnership(ctx(), { siteId: SITE, evidence: { ...evidence, siteKind: 'native_driveagent', conversionOwner: 'driveagent' } }, 'publish-native-assessment')
    state.providerCalls = 0
    await expect(createGtmChangeProposal(ctx(), { action: 'publish', siteId: SITE, ownershipEvidenceId: native.id, sourceProposalId: p.id }, 'native-publish')).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
    expect(state.publishes).toBe(0)
  })
  it('onboarding status omits secrets and never reads providers or foreign clients', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    await state.pool.query('UPDATE tracking_sites SET write_key=\'private-write-key\' WHERE id=$1', [SITE])
    const result = await getClientTrackingOnboarding(ctx(), C)
    expect(result.sites).toMatchObject([{ siteId: SITE, stage: 'ownership_evidence_needed' }])
    expect(result.guide).toContain('initialMapping')
    expect(JSON.stringify(result)).not.toContain('private-write-key')
    expect(result.conversionDelivery).toBe('not_verified')
    await expect(getClientTrackingOnboarding(ctx(), D)).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('onboarding reports site setup, mapping approval and compiled-version publication as separate steps', async () => {
    const { getClientTrackingOnboarding } = await import('../../../server/utils/tracking/marketingOnboarding')
    const proposal = await initialMapping()
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('awaiting_mapping_approval')
    await state.pool.query('UPDATE gtm_change_proposals SET status=\'rejected\' WHERE id=$1', [proposal.id])
    expect((await getClientTrackingOnboarding(ctx(), C)).sites[0].stage).toBe('connection_needed')
    await state.pool.query('UPDATE tracking_sites SET is_active=FALSE WHERE id=$1', [SITE])
    expect((await getClientTrackingOnboarding(ctx(), C)).stage).toBe('site_setup_needed')
  })
  it('initial mapping requires signed write consent and cannot be approved by a marketing manager alone', async () => {
    await state.pool.query('DELETE FROM gtm_container_bindings WHERE tracking_site_id=$1', [SITE])
    const ownership = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'scope-evidence')
    await expect(createGtmChangeProposal({ ...ctx(), mcpScopes: ['mcp:read'] }, {
      action: 'binding', siteId: SITE, ownershipEvidenceId: ownership.id,
      connectionId: GTM, containerPath: 'accounts/1/containers/2', initialMapping: true
    }, 'no-write')).rejects.toMatchObject({ statusCode: 403 })
    const proposal = await initialMapping()
    const role = 'acacacac-acac-4cac-8cac-acacacacacac'
    await state.pool.query('INSERT INTO custom_roles(id,slug) VALUES($1,\'tracking-marketing-reviewer\')', [role])
    await state.pool.query('INSERT INTO role_permission_groups VALUES($1,\'MARKETING_MANAGEMENT\')', [role])
    await state.pool.query('UPDATE team_members SET custom_role_id=$1 WHERE id=$2', [role, A])
    const env = event.context.cloudflare.env
    const previous = env.MCP_MARKETING_STAFF_GRANTS
    env.MCP_MARKETING_STAFF_GRANTS = JSON.stringify({ [U]: ['tracking_plan'], [A]: ['tracking_plan', 'department_management'] })
    try {
      await expect(reviewGtmChangeProposal(ctx(A), { proposalId: proposal.id, expectedHash: proposal.request_hash, decision: 'approved' })).rejects.toMatchObject({ statusCode: 403 })
      expect(state.providerCalls).toBe(0)
      const { listGtmReviewProposals } = await import('../../../server/utils/tracking/gtmProposals')
      expect(await listGtmReviewProposals(ctx(A))).toEqual([])
    } finally { env.MCP_MARKETING_STAFF_GRANTS = previous }
  })
  it('denies revoked assignment and wrong customer before credentials', async () => {
    await expect(
      assertGoogleAdsConnection(ctx(), D, CON)
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      assertGoogleAdsConnection(ctx(), C, CON, '456')
    ).rejects.toMatchObject({ statusCode: 403 })
    await state.pool.query(
      'DELETE FROM client_team_assignments WHERE team_member_id=$1',
      [U]
    )
    await expect(
      assertGoogleAdsConnection(ctx(), C, CON)
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('SQL immutable policy and self-review cannot be bypassed; exact independent review wins once', async () => {
    await createGoogleAdsActionPlan(plan())
    await expect(
      state.pool.query(
        'UPDATE google_ads_action_plans SET review_policy=\'legacy\' WHERE id=$1',
        [PLAN]
      )
    ).rejects.toThrow('immutable')
    await expect(
      state.pool.query(
        'UPDATE google_ads_action_plans SET reviewed_by=$2 WHERE id=$1',
        [PLAN, U]
      )
    ).rejects.toThrow('Independent')
    await expect(
      reviewGoogleAdsPlan(event, U, {
        actionPlanId: PLAN,
        expectedRequestHash: 'b'.repeat(64),
        decision: 'approved'
      })
    ).rejects.toMatchObject({ statusCode: 403 })
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        reviewGoogleAdsPlan(event, A, {
          actionPlanId: PLAN,
          expectedRequestHash: 'b'.repeat(64),
          decision: 'approved'
        })
      )
    )
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(
      (
        await state.pool.query(
          'SELECT reviewed_by FROM google_ads_action_plans WHERE id=$1',
          [PLAN]
        )
      ).rows[0].reviewed_by
    ).toBe(A)
  })
  it('GTM proposals are local, immutable, idempotent and cannot execute with revoked requester', async () => {
    const own = await recordGtmOwnership(
      ctx(),
      { siteId: SITE, evidence },
      'ownership'
    )
    const raw = {
      siteId: SITE,
      ownershipEvidenceId: own.id,
      action: 'workspace',
      changes: [
        {
          action: 'create',
          template: { templateId: 'folder.v1', name: 'Test folder' }
        }
      ]
    }
    const proposal = await createGtmChangeProposal(ctx(), raw, 'proposal')
    expect(proposal.status).toBe('pending_review')
    expect((await createGtmChangeProposal(ctx(), raw, 'proposal')).id).toBe(
      proposal.id
    )
    expect(
      (await state.pool.query('SELECT count(*) FROM gtm_change_sets')).rows[0]
        .count
    ).toBe('0')
    await expect(
      state.pool.query(
        'UPDATE gtm_change_proposals SET desired_state=\'{}\' WHERE id=$1',
        [proposal.id]
      )
    ).rejects.toThrow('immutable')
    await expect(
      reviewGtmChangeProposal(ctx(), {
        proposalId: proposal.id,
        expectedHash: proposal.request_hash,
        decision: 'approved'
      })
    ).rejects.toMatchObject({ statusCode: 403 })
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: proposal.id,
      expectedHash: proposal.request_hash,
      decision: 'approved'
    })
    await state.pool.query(
      'DELETE FROM client_team_assignments WHERE team_member_id=$1',
      [U]
    )
    state.providerCalls = 0
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: proposal.id,
        expectedHash: proposal.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 403 })
    await expect(
      getGtmChangeProposal(ctx(), proposal.id)
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  async function prepare() {
    const own = await recordGtmOwnership(
      ctx(),
      { siteId: SITE, evidence },
      'ownership'
    )
    const p = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'workspace',
        changes: [
          {
            action: 'create',
            template: { templateId: 'folder.v1', name: 'Reviewed folder' }
          }
        ]
      },
      'workspace'
    )
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash,
      decision: 'approved'
    })
    return { p, own }
  }
  it('runs actual typed adapter, versions once, and requires a separate exact publish review', async () => {
    const { p, own } = await prepare()
    const versioned = await executeApprovedGtmProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash
    })
    expect(versioned.status).toBe('versioned')
    expect(state.publishes).toBe(0)
    const publish = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'publish',
        sourceProposalId: p.id
      },
      'publish'
    )
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: publish.id,
        expectedHash: publish.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.publishes).toBe(0)
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: publish.id,
      expectedHash: publish.request_hash,
      decision: 'approved'
    })
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        executeApprovedGtmProposal(ctx(A), {
          proposalId: publish.id,
          expectedHash: publish.request_hash
        })
      )
    )
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect(state.publishes).toBe(1)
    const saved = await getGtmChangeProposal(ctx(), publish.id)
    expect(saved.status).toBe('verified')
    expect(saved.result.liveReadBack).toBe(true)
    expect(saved.result.conversionDelivery).toBe('not_verified')
    const rollback = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'rollback',
        sourceProposalId: publish.id
      },
      'rollback'
    )
    expect(rollback.desired_state.target.path).toBe(
      'accounts/1/containers/2/versions/3'
    )
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: rollback.id,
      expectedHash: rollback.request_hash,
      decision: 'approved'
    })
    expect(
      (
        await executeApprovedGtmProposal(ctx(A), {
          proposalId: rollback.id,
          expectedHash: rollback.request_hash
        })
      ).status
    ).toBe('rolled_back')
    expect(state.live).toBe('3')
  })
  it('holds uncertain publish without repeating it', async () => {
    const { p, own } = await prepare()
    await executeApprovedGtmProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash
    })
    const publish = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'publish',
        sourceProposalId: p.id
      },
      'publish'
    )
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: publish.id,
      expectedHash: publish.request_hash,
      decision: 'approved'
    })
    state.ambiguous = true
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: publish.id,
        expectedHash: publish.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect((await getGtmChangeProposal(ctx(), publish.id)).status).toBe(
      'unknown'
    )
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: publish.id,
        expectedHash: publish.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.publishes).toBe(1)
  })
  it('rejects stale live fingerprint and reviewer revocation before writes', async () => {
    const { p } = await prepare()
    state.drift = true
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: p.id,
        expectedHash: p.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.writes).toBe(0)
    await state.pool.query(
      'UPDATE team_members SET is_active=FALSE WHERE id=$1',
      [A]
    )
    state.providerCalls = 0
    await expect(
      executeApprovedGtmProposal(ctx(A), {
        proposalId: p.id,
        expectedHash: p.request_hash
      })
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(state.providerCalls).toBe(0)
  })
  it('denies native DriveAgent installation and accepted-lead duplicate templates before provider access', async () => {
    const own = await recordGtmOwnership(
      ctx(),
      {
        siteId: SITE,
        evidence: {
          ...evidence,
          siteKind: 'native_driveagent',
          conversionOwner: 'driveagent'
        }
      },
      'native'
    )
    await expect(
      createGtmChangeProposal(
        ctx(),
        { siteId: SITE, ownershipEvidenceId: own.id, action: 'installation' },
        'install'
      )
    ).rejects.toMatchObject({ statusCode: 409 })
    await expect(
      createGtmChangeProposal(
        ctx(),
        {
          siteId: SITE,
          ownershipEvidenceId: own.id,
          action: 'workspace',
          changes: [
            {
              action: 'create',
              template: {
                templateId: 'tag.google_ads_conversion.v1',
                name: 'Lead',
                conversionId: '123',
                conversionLabel: 'label',
                firingTriggerId: ['7']
              }
            }
          ]
        },
        'duplicate'
      )
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
    expect(state.writes).toBe(0)
  })

  it('uses existing Ads runtime and SQL claim for one reviewed mutation plus validate-only/read-back', async () => {
    const p = await planSearchGoogleAdsControlAction(
      {
        clientId: C,
        connectionId: CON,
        actorId: U,
        source: 'mcp',
        requestedMode: 'proposal',
        operation: 'pause_campaign',
        resourceType: 'campaign',
        arguments: { resourceName: 'customers/123/campaigns/1' },
        idempotencyKey: 'runtime'
      },
      {
        actorRole: 'media_buyer',
        permissionGroups: [],
        hasWriteScope: true,
        delegatedPlanning: true
      },
      { read: true, write: true, automation: false, destructive: false }
    )
    expect(p.reviewPolicy).toBe('delegated_marketing')
    expect(state.adsMutations).toBe(0)
    await reviewGoogleAdsPlan(event, A, {
      actionPlanId: p.id,
      expectedRequestHash: p.requestHash,
      decision: 'approved'
    })
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        executeReviewedGoogleAdsPlan(event, A, {
          actionPlanId: p.id,
          expectedRequestHash: p.requestHash
        })
      )
    )
    const completed = results
      .filter(r => r.status === 'fulfilled')
      .map(r => (r as any).value)
    expect(completed.some(r => r.ok === true)).toBe(true)
    expect(state.adsMutations).toBe(1)
    expect(state.adsValidations).toBe(1)
    expect(
      (
        await state.pool.query(
          'SELECT status,executed_by FROM google_ads_action_plans WHERE id=$1',
          [p.id]
        )
      ).rows[0]
    ).toMatchObject({ status: 'verified', executed_by: A })
  })
  it('requires a reviewed binding and rejects a changed site binding before credentials', async () => {
    const own = await recordGtmOwnership(
      ctx(),
      { siteId: SITE, evidence },
      'ownership'
    )
    const p = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'binding',
        connectionId: GTM,
        containerPath: 'accounts/1/containers/2'
      },
      'binding'
    )
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash,
      decision: 'approved'
    })
    const result = await executeApprovedGtmProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash
    })
    expect(result.status).toBe('verified')
    const next = await createGtmChangeProposal(
      ctx(),
      {
        siteId: SITE,
        ownershipEvidenceId: own.id,
        action: 'binding',
        connectionId: GTM,
        containerPath: 'accounts/1/containers/2'
      },
      'binding2'
    )
    await state.pool.query(
      'UPDATE gtm_container_bindings SET container_path=\'accounts/1/containers/99\' WHERE tracking_site_id=$1',
      [SITE]
    )
    state.providerCalls = 0
    await expect(
      reviewGtmChangeProposal(ctx(A), {
        proposalId: next.id,
        expectedHash: next.request_hash,
        decision: 'approved'
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
  })
  it('rejects a changed reviewed installer binding before loading credentials', async () => {
    const installer
      = await import('../../../server/utils/googleTagManagerInstaller')
    await expect(
      installer.installXeroFlowViaGtm(event, {
        siteId: SITE,
        userId: A,
        publish: false,
        reviewed: {
          proposalId: PLAN,
          requesterId: U,
          reviewerId: A,
          basePath: 'accounts/1/containers/2/versions/3',
          baseFingerprint: 'live3',
          bindingId: PLAN,
          connectionId: GTM,
          installationHash: 'not-used-binding-rejected-first'
        }
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.providerCalls).toBe(0)
    expect(state.writes).toBe(0)
  })
  it('reuses the installer with separate requester/reviewer/executor and no implicit publication', async () => {
    const own = await recordGtmOwnership(
      ctx(),
      { siteId: SITE, evidence },
      'ownership'
    )
    const p = await createGtmChangeProposal(
      ctx(),
      { siteId: SITE, ownershipEvidenceId: own.id, action: 'installation' },
      'installation'
    )
    await reviewGtmChangeProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash,
      decision: 'approved'
    })
    const result = await executeApprovedGtmProposal(ctx(A), {
      proposalId: p.id,
      expectedHash: p.request_hash
    })
    expect(result.status).toBe('versioned')
    expect(state.publishes).toBe(0)
    const recorded = (
      await state.pool.query(
        'SELECT requested_by,approved_by,executed_by,source_proposal_id,status FROM gtm_change_sets WHERE source_proposal_id=$1',
        [p.id]
      )
    ).rows[0]
    expect(recorded).toEqual({
      requested_by: U,
      approved_by: A,
      executed_by: A,
      source_proposal_id: p.id,
      status: 'versioned'
    })
    const installer
      = await import('../../../server/utils/googleTagManagerInstaller')
    const change = (
      await state.pool.query(
        'SELECT id FROM gtm_change_sets WHERE source_proposal_id=$1',
        [p.id]
      )
    ).rows[0]
    await expect(
      installer.publishGtmChangeSet(event, {
        siteId: SITE,
        changeSetId: change.id,
        userId: U
      })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(state.publishes).toBe(0)
  })
  async function approvedInstallation() {
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'ownership')
    const p = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'installation' }, 'install')
    await reviewGtmChangeProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash, decision: 'approved' })
    return { p, own }
  }
  async function held() {
    return (await state.pool.query('SELECT metadata->>\'reviewedExecution\' AS hold FROM gtm_connections WHERE id=$1', [GTM])).rows[0].hold
  }
  const executeProposal = (p: any) => executeApprovedGtmProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash })
  it('I1 rejects a publication between compilation and publish proposal creation', async () => {
    const { p, own } = await prepare()
    await executeProposal(p)
    state.live = '5' // unrelated operator publication, after our V4 compilation from V3
    await expect(createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'publish', sourceProposalId: p.id }, 'stale-publish')).rejects.toMatchObject({ statusCode: 409 })
    expect(state.publishes).toBe(0)
  })
  it.each(['publish', 'rollback'])('I2 rejects cross-client %s source before credential or quota', async (action) => {
    const { p } = await prepare()
    // Source is real but now scoped to another client; authorization must finish before token/quota.
    await state.pool.query('UPDATE tracking_sites SET client_id=$1 WHERE id=$2', [D, SITE])
    const otherSite = '99999999-9999-4999-8999-999999999999'
    await state.pool.query('INSERT INTO tracking_sites(id,client_id,name,allowed_origins) VALUES($1,$2,\'Other\',ARRAY[\'https://example.test\'])', [otherSite, C])
    await state.pool.query('INSERT INTO gtm_container_bindings(tracking_site_id,connection_id,account_path,account_name,container_path,container_public_id,container_name,bound_by) VALUES($1,$2,\'accounts/1\',\'test\',\'accounts/1/containers/99\',\'GTM-TEST\',\'Test\',$3)', [otherSite, GTM, A])
    const otherOwn = await recordGtmOwnership(ctx(), { siteId: otherSite, evidence }, 'other-own')
    vi.mocked(resolveGtmAccessToken).mockClear()
    vi.mocked(reserveGtmApiQuota).mockClear()
    await expect(createGtmChangeProposal(ctx(), { siteId: otherSite, ownershipEvidenceId: otherOwn.id, action, sourceProposalId: p.id }, 'wrong-source')).rejects.toThrow()
    expect(resolveGtmAccessToken).not.toHaveBeenCalled()
    expect(reserveGtmApiQuota).not.toHaveBeenCalled()
  })
  it.each([0, 15])('I3 reserves the whole operation with %i existing requests before any write', async (used) => {
    state.realQuota = true
    if (used) await reserveGtmApiQuota(used)
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'ownership')
    const p = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'workspace', changes: Array.from({ length: used ? 1 : 5 }, (_, i) => ({ action: 'create', template: { templateId: 'tag.google.v1', name: `Tag ${i}`, tagId: 'G-TEST', firingTriggerId: ['7'] } })) }, 'quota')
    await reviewGtmChangeProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash, decision: 'approved' })
    await expect(executeProposal(p)).rejects.toThrow(used ? 'capacity is unavailable' : 'needs 21 GTM requests')
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
    expect((await getGtmChangeProposal(ctx(), p.id)).status).toBe('failed')
    expect(Number((await state.pool.query('SELECT request_count FROM gtm_api_quota_windows')).rows[0].request_count)).toBe(used + 1)
  })
  it('I3 reserves read-back calls atomically under competing admission', async () => {
    state.realQuota = true
    const results = await Promise.allSettled([reserveGtmApiQuota(12), reserveGtmApiQuota(12)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    expect((await state.pool.query('SELECT request_count FROM gtm_api_quota_windows')).rows[0].request_count).toBe(12)
  })
  it('I4 treats an already-installed result as a verified no-op without a hold', async () => {
    const { p } = await approvedInstallation()
    const api = await import('../../../server/utils/googleTagManagerClient')
    const marker = `xeroflow:tracking-site:${SITE}:v1`
    vi.mocked(api.getLiveGtmVersion).mockResolvedValueOnce({ path: p.base_live_path, fingerprint: p.base_live_fingerprint } as any)
    vi.mocked(api.getLiveGtmVersion).mockResolvedValueOnce({ path: p.base_live_path, fingerprint: p.base_live_fingerprint, tag: [{ name: marker, notes: marker, parameter: [{ key: 'html', value: marker }] }] } as any)
    const result = await executeProposal(p)
    expect(result.status).toBe('verified')
    expect(result.result.status).toBe('already_installed')
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
  })
  it('I4 releases an installation preflight quota failure without unknown effects', async () => {
    const { p } = await approvedInstallation()
    state.realQuota = true
    await reserveGtmApiQuota(19)
    await expect(executeProposal(p)).rejects.toThrow()
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
    expect((await getGtmChangeProposal(ctx(), p.id)).status).toBe('failed')
  })
  it.each(['spa', 'write_key', 'origin'])('I5 rejects approved installation %s drift before credentials', async (field) => {
    const { p } = await approvedInstallation()
    if (field === 'origin') state.origin = 'https://different.example.test/'
    else await state.pool.query(field === 'spa' ? 'UPDATE tracking_sites SET spa=TRUE WHERE id=$1' : 'UPDATE tracking_sites SET write_key=\'rotated\' WHERE id=$1', [SITE])
    vi.mocked(resolveGtmAccessToken).mockClear()
    await expect(executeProposal(p)).rejects.toThrow()
    expect(resolveGtmAccessToken).not.toHaveBeenCalled()
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
    expect((await getGtmChangeProposal(ctx(), p.id)).request_hash).toBe(p.request_hash)
  })
  it('I5 carries the installation managed manifest into separate publication and read-back', async () => {
    const { p, own } = await approvedInstallation()
    const compiled = await executeProposal(p)
    expect(compiled.result.managed).toHaveLength(2)
    const pub = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'publish', sourceProposalId: p.id }, 'publish-install')
    expect(pub.desired_state.target.managed).toHaveLength(2)
    await reviewGtmChangeProposal(ctx(A), { proposalId: pub.id, expectedHash: pub.request_hash, decision: 'approved' })
    state.installTag.parameter[0].value = 'changed after review'
    await expect(executeProposal(pub)).rejects.toThrow()
    expect(state.publishes).toBe(0)
    expect(await held()).toBeNull()
  })
  it.each(['inactive', 'mismatch'])('I7 staff resolver excludes %s binding in actual SQL while owner can diagnose', async (mode) => {
    await state.pool.query('ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{}\', ADD COLUMN IF NOT EXISTS account_name TEXT')
    await state.pool.query('ALTER TABLE google_ads_account_bindings ADD COLUMN IF NOT EXISTS alias_id UUID')
    await state.pool.query('CREATE TABLE IF NOT EXISTS agency_client_aliases(id UUID,client_id UUID,alias TEXT)')
    await state.pool.query(mode === 'inactive' ? 'UPDATE social_connections SET status=\'inactive\' WHERE id=$1' : 'UPDATE social_connections SET account_id=\'456\' WHERE id=$1', [CON])
    const { buildGoogleAdsMcpToolDependencies } = await import('../../../server/utils/ai/mcp/googleAdsServer')
    const deps = buildGoogleAdsMcpToolDependencies({ read: true, write: true, automation: false, destructive: false })
    expect((await deps.readReconciliation!({ clientId: C, accountQuery: 'A' }, ctx()) as any).accountResolution.status).toBe('missing_mapping')
    for (const aggregate of [false, true]) {
      expect((await deps.resolveAccount!({ clientName: 'A', aggregate }, ctx()) as any).status).toBe('missing_mapping')
      expect((await resolveGoogleAdsAccount({ query: 'A', clientId: C, aggregate })).status).toBe('resolved')
    }
  })

  it.each([
    ['google_ads_plan_pause', { entityType: 'campaign', resourceName: 'customers/456/campaigns/1' }],
    ['google_ads_plan_set_asset_group_assets', { assetGroupResourceName: 'customers/123/assetGroups/1', assets: [{ fieldType: 'HEADLINE', assetResourceName: 'customers/456/assets/1' }] }],
    ['google_ads_plan_set_pmax_audience_signals', { assetGroupResourceName: 'customers/123/assetGroups/1', audienceResourceNames: ['customers/123/audiences/1', 'customers/456/audiences/2'] }]
  ])('I2 %s rejects nested customer references before real session credential/refresh/discovery', async (tool, args) => {
    const session = await vi.importActual<any>('../../../server/utils/googleAds/controlSession')
    const effects = {
      loadConnection: vi.fn(async () => ({ id: CON, client_id: C, account_id: '123', platform: 'google', status: 'active', metadata: {} })),
      resolveCredential: vi.fn(async () => ({ accessToken: 'expired', refreshToken: 'refresh', tokenExpiresAt: '2000-01-01T00:00:00Z', profileId: null, source: 'legacy' })),
      resolveConfig: () => ({ googleClientId: 'test', googleClientSecret: 'test', googleDeveloperToken: 'test' }),
      refreshGoogleToken: vi.fn(async () => ({ access_token: 'fresh', expires_in: 3600 })),
      persistAccessToken: vi.fn(async () => {}),
      listAccessibleCustomers: vi.fn(async () => ['999', '123'])
    }
    const resolveSession = (input: any) => session.resolveGoogleAdsControlSession(input, effects)
    // Positive control: this fixture really refreshes/persists and discovers the manager when reached.
    await resolveSession({ clientId: C, connectionId: CON })
    for (const name of ['loadConnection', 'resolveCredential', 'refreshGoogleToken', 'persistAccessToken', 'listAccessibleCustomers'] as const) {
      expect(effects[name]).toHaveBeenCalledOnce()
      effects[name].mockClear()
    }
    const result = await executeGoogleAdsSearchPlanningTool(tool as string, { clientId: C, connectionId: CON, idempotencyKey: 'denied', ...(args as any) }, { ...ctx(), marketingCapabilities: ['ads_plan'] }, { read: true, write: true, automation: false, destructive: false }, true, {
      plan: (input, authority, flags) => planSearchGoogleAdsControlAction(input, authority, flags, { resolveSession })
    })
    expect(result).toMatchObject({ ok: false, code: 'handler_error' })
    for (const name of ['loadConnection', 'resolveCredential', 'refreshGoogleToken', 'persistAccessToken', 'listAccessibleCustomers'] as const) expect(effects[name]).not.toHaveBeenCalled()
    expect(state.adsMutations).toBe(0)
  })
  it('I3 admits a complete supported operation with actual quota and reserved read-back', async () => {
    state.realQuota = true
    const { p } = await prepare() // one proposal-time read
    const r = await executeProposal(p)
    expect(r.status).toBe('versioned')
    expect((await state.pool.query('SELECT request_count FROM gtm_api_quota_windows')).rows[0].request_count).toBe(9)
    expect(await held()).toBeNull()
  })
  it('I4 releases typed update preflight failure before creating a workspace', async () => {
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'own')
    state.entity = { name: 'Before', path: 'accounts/1/containers/2/workspaces/8/folders/9', fingerprint: 'before' }
    const p = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'workspace', changes: [{ action: 'update', entityPath: state.entity.path, expectedFingerprint: 'before', template: { templateId: 'folder.v1', name: 'After' } }] }, 'update')
    await reviewGtmChangeProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash, decision: 'approved' })
    state.entity.fingerprint = 'changed'
    await expect(executeProposal(p)).rejects.toThrow()
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
    expect((await getGtmChangeProposal(ctx(), p.id)).status).toBe('failed')
  })
  it('I4 reports existing installation explicitly without creating an unknown connection hold', async () => {
    const { p } = await approvedInstallation()
    await state.pool.query('INSERT INTO gtm_change_sets(binding_id,action_type,status,requested_by) VALUES($1,\'install_xeroflow\',\'executing\',$2)', [p.binding_id, A])
    const r = await executeProposal(p)
    expect(r.status).toBe('failed')
    expect(r.result).toMatchObject({ status: 'already_in_progress', effect: 'none' })
    expect(state.writes).toBe(0)
    expect(await held()).toBeNull()
  })
  it('I6 returns exact pending installation, publication and rollback review projections', async () => {
    const { listGtmReviewProposals } = await import('../../../server/utils/tracking/gtmProposals')
    const { p, own } = await approvedInstallation()
    let rows = await listGtmReviewProposals(ctx(A))
    expect(rows[0].review).toMatchObject({ action: 'installation', installation: { siteName: 'Test', spa: false, collectorOrigin: 'https://app.example.test' } })
    expect(rows[0].expires_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(rows[0].review.installationHash).toMatch(/^[a-f0-9]{64}$/)
    expect(JSON.stringify(rows[0].review)).not.toContain('<script')
    await executeProposal(p)
    const pub = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'publish', sourceProposalId: p.id }, 'pub')
    rows = await listGtmReviewProposals(ctx(A))
    const pending = rows.find(r => r.id === pub.id)!
    expect(pending.status).toBe('pending_review')
    expect(pending.review).toMatchObject({ base: { path: p.base_live_path, fingerprint: p.base_live_fingerprint }, target: { path: 'accounts/1/containers/2/versions/4', fingerprint: 'live4' }, sourceProposalId: p.id })
    expect(pending.review.changes).toHaveLength(2)
    expect(JSON.stringify(pending)).not.toContain('<script')
    await reviewGtmChangeProposal(ctx(A), { proposalId: pub.id, expectedHash: pub.request_hash, decision: 'approved' })
    await executeProposal(pub)
    const rollback = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'rollback', sourceProposalId: pub.id }, 'rollback')
    rows = await listGtmReviewProposals(ctx(A))
    const undo = rows.find(r => r.id === rollback.id)!.review
    expect(undo.target).toMatchObject({ path: p.base_live_path, fingerprint: p.base_live_fingerprint })
    expect(undo.changes).toHaveLength(2)
    expect(undo.changes.every((c: any) => c.action === 'remove')).toBe(true)
  })
  it.each(['publish', 'tampered'] as const)('R1 projects every staff/browser response while raw installation evidence survives %s', async (mode) => {
    const writeKey = 'fixture-r1-write-key-DO-NOT-EXPOSE-7e419c'
    const html = `<script src="https://app.example.test/track.js" data-key="${writeKey}" async></script>`
    await state.pool.query('UPDATE tracking_sites SET write_key=$2 WHERE id=$1', [SITE, writeKey])
    const { executeTask4StaffTool } = await import('../../../server/utils/ai/mcp/marketingTask4Tools')
    const { resolveMcpStaffContext } = await import('../../../server/utils/ai/mcp/staffAuthority')
    const staff = await resolveMcpStaffContext(event, U, ['mcp:read', 'mcp:write'])
    const outputs: Array<[string, any]> = []
    const tool = async (name: string, args: any, key: string, label = name) => {
      const outcome = await executeTask4StaffTool(name, args, staff, key)
      expect(outcome.ok, label).toBe(true)
      const wire = JSON.parse(JSON.stringify(outcome))
      outputs.push([label, wire])
      return wire.data as any
    }
    // Execute the real browser adapters with request decoding/session identity supplied by the fixture.
    vi.stubGlobal('defineEventHandler', (handler: any) => handler)
    vi.stubGlobal('getRouterParam', (request: any) => request.context.fixtureProposalId)
    vi.stubGlobal('readBody', async (request: any) => request.context.fixtureBody)
    const adapters = {
      approve: (await import('../../../server/api/agency/marketing/reviews/gtm/[id]/approve.post')).default,
      reject: (await import('../../../server/api/agency/marketing/reviews/gtm/[id]/reject.post')).default,
      execute: (await import('../../../server/api/agency/marketing/reviews/gtm/[id]/execute.post')).default,
      list: (await import('../../../server/api/agency/marketing/reviews/gtm/index.get')).default
    }
    const browser = async (action: keyof typeof adapters, proposal: any, label: string) => {
      const response = await adapters[action]({ context: {
        ...event.context, fixtureUser: { id: A, role: 'admin' },
        fixtureProposalId: proposal.id, fixtureBody: { expectedHash: proposal.request_hash }
      } } as any)
      const wire = JSON.parse(JSON.stringify(response))
      outputs.push([label, wire])
      return wire as any
    }
    const rawProposal = async (id: string) =>
      (await state.pool.query('SELECT * FROM gtm_change_proposals WHERE id=$1', [id])).rows[0]
    const storedManifest = async (id: string) =>
      (await state.pool.query('SELECT observed_after FROM gtm_change_sets WHERE source_proposal_id=$1', [id])).rows[0].observed_after.managed
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'r1-own')
    const installInput = { siteId: SITE, ownershipEvidenceId: own.id }
    const installation = await tool('propose_gtm_xeroflow_installation', installInput, 'r1-install', 'installation create')
    const originalInstall = await rawProposal(installation.id)
    await browser('approve', installation, 'installation approve')
    const compiled = await browser('execute', installation, 'installation execute')
    expect(compiled.status).toBe('versioned')
    const rawCompiled = await rawProposal(installation.id)
    const manifest = rawCompiled.result.managed
    expect(manifest).toHaveLength(2)
    const rawHtml = manifest.find((entry: any) => entry.kind === 'tags').body.parameter.find((p: any) => p.key === 'html').value
    expect(rawHtml).toBe(html)
    expect(state.installTag.parameter.find((p: any) => p.key === 'html').value).toBe(html)
    expect(await storedManifest(installation.id)).toEqual(manifest)
    expect(rawCompiled.desired_state).toEqual(originalInstall.desired_state)
    expect(rawCompiled.request_hash).toBe(installation.request_hash)
    await tool('get_gtm_change_status', { proposalId: installation.id }, 'status', 'installation compiled status')
    await tool('propose_gtm_xeroflow_installation', installInput, 'r1-install', 'installation compiled early replay')
    const publishInput = { ...installInput, sourceProposalId: installation.id }
    // Both calls see no row before either INSERT; the losing real INSERT must take concurrent replay.
    let arrived = 0, release!: () => void
    const bothSelected = new Promise<void>((resolve) => {
      release = resolve
    })
    state.replayBarrier = async () => {
      if (++arrived === 2)
        release()
      await bothSelected
    }
    const [publication, concurrent] = await Promise.all([
      tool('propose_gtm_publish', publishInput, 'r1-publish', 'publication create/concurrent replay A'),
      tool('propose_gtm_publish', publishInput, 'r1-publish', 'publication create/concurrent replay B')
    ])
    state.replayBarrier = null
    expect(state.concurrentReplayCount).toBe(1)
    expect(concurrent.id).toBe(publication.id)
    expect(concurrent.request_hash).toBe(publication.request_hash)
    const originalPublish = await rawProposal(publication.id)
    expect(originalPublish.desired_state.target.managed).toEqual(manifest)
    await tool('get_gtm_change_status', { proposalId: publication.id }, 'status', 'publication pending status')
    await tool('propose_gtm_publish', publishInput, 'r1-publish', 'publication early replay')
    const rejected = await tool('propose_gtm_publish', publishInput, 'r1-reject', 'publication second create')
    await browser('reject', rejected, 'publication reject')
    await tool('get_gtm_change_status', { proposalId: rejected.id }, 'status', 'publication rejected status')
    await browser('list', publication, 'review list before publication')
    const approval = await browser('approve', publication, 'publication approve')
    expect(approval.request_hash).toBe(publication.request_hash)
    await tool('get_gtm_change_status', { proposalId: publication.id }, 'status', 'publication approved status')
    if (mode === 'tampered') {
      state.installTag.parameter.find((p: any) => p.key === 'html').value = '<script>tampered fixture</script>'
      await expect(browser('execute', publication, 'publication execute')).rejects.toThrow('precondition failed')
      expect(state.publishes).toBe(0)
      expect(await held()).toBeNull()
      expect((await rawProposal(publication.id)).status).toBe('failed')
    } else {
      const published = await browser('execute', publication, 'publication execute')
      expect(published).toMatchObject({ status: 'verified', result: { liveReadBack: true, versionPath: 'accounts/1/containers/2/versions/4', versionFingerprint: 'live4' } })
      expect(state.publishes).toBe(1)
      expect(state.live).toBe('4')
      expect(await storedManifest(publication.id)).toEqual(manifest)
      expect((await rawProposal(publication.id)).result.managed).toEqual(manifest)
      expect(state.installTag.parameter.find((p: any) => p.key === 'html').value).toBe(html)
    }
    await tool('get_gtm_change_status', { proposalId: publication.id }, 'status', 'publication final status')
    await tool('get_gtm_change_status', { proposalId: installation.id }, 'status', 'installation final status')
    await tool('propose_gtm_publish', publishInput, 'r1-publish', 'publication final replay')
    await tool('propose_gtm_xeroflow_installation', installInput, 'r1-install', 'installation final replay')
    await browser('list', publication, 'review list after publication')
    const finalPublish = await rawProposal(publication.id), finalInstall = await rawProposal(installation.id)
    expect(finalPublish.request_hash).toBe(originalPublish.request_hash)
    expect(finalPublish.desired_state).toEqual(originalPublish.desired_state)
    expect(finalInstall.request_hash).toBe(originalInstall.request_hash)
    expect(finalInstall.desired_state).toEqual(originalInstall.desired_state)
    expect(finalInstall.result.managed).toEqual(manifest)
    expect(await storedManifest(installation.id)).toEqual(manifest)
    // Soft assertions enumerate every outward leak in the red/guard-removal run, after proving raw execution.
    for (const [label, response] of outputs) {
      const serialized = JSON.stringify(response)
      expect.soft(serialized, label).not.toContain(writeKey)
      expect.soft(serialized, label).not.toContain('<script')
      expect.soft(serialized, label).not.toContain(JSON.stringify(html).slice(1, -1))
    }
    const projectedHtml = compiled.result.managed.find((entry: any) => entry.kind === 'tags').body.parameter.find((p: any) => p.key === 'html').value
    expect.soft(projectedHtml).toMatchObject({ redacted: true, length: html.length })
    expect.soft(projectedHtml.sha256).toBe('668966f78a9116be466ca302fae750da6b5fead978172b0c45fe2796cd5e9d05')
    expect.soft(installation.desired_state.installation.review.writeKeyHash).toBe(originalInstall.desired_state.installation.review.writeKeyHash)
  })

  it('I7 actual staff entry returns only active exact bindings before mixed aggregation', async () => {
    await state.pool.query('ALTER TABLE social_connections ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT \'{}\', ADD COLUMN IF NOT EXISTS account_name TEXT')
    await state.pool.query('ALTER TABLE google_ads_account_bindings ADD COLUMN IF NOT EXISTS alias_id UUID')
    await state.pool.query('CREATE TABLE IF NOT EXISTS agency_client_aliases(id UUID,client_id UUID,alias TEXT)')
    await state.pool.query('UPDATE social_connections SET status=\'inactive\' WHERE id=$1', [CON])
    await state.pool.query('INSERT INTO social_connections(id,client_id,account_id,platform,status) VALUES($1,$2,\'789\',\'google\',\'active\')', [PLAN, C])
    await state.pool.query('INSERT INTO google_ads_account_bindings(client_id,connection_id,operating_customer_id,account_role) VALUES($1,$2,\'789\',\'dealer\')', [C, PLAN])
    const { buildGoogleAdsMcpToolDependencies } = await import('../../../server/utils/ai/mcp/googleAdsServer')
    const result: any = await buildGoogleAdsMcpToolDependencies({ read: true, write: true, automation: false, destructive: false }).resolveAccount!({ clientName: 'A', aggregate: true }, ctx())
    expect(result.status).toBe('resolved')
    expect(result.accounts).toHaveLength(1)
    expect(result.accounts[0]).toMatchObject({ connectionId: PLAN, operatingCustomerId: '789' })
  })

  it('I4 holds an ambiguous first provider attempt without automatic retry', async () => {
    const { p } = await prepare()
    const api = await import('../../../server/utils/googleTagManagerClient')
    vi.mocked(api.createGtmWorkspace).mockRejectedValueOnce(new Error('timeout after sending request'))
    await expect(executeProposal(p)).rejects.toThrow('requires inspection')
    expect(await held()).toBe(p.id)
    expect((await getGtmChangeProposal(ctx(), p.id)).status).toBe('unknown')
  })
  it('I4 releases binding validation failure before its database write', async () => {
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'own')
    const p = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'binding', connectionId: GTM, containerPath: 'accounts/1/containers/2' }, 'bind-invalid')
    await reviewGtmChangeProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash, decision: 'approved' })
    const api = await import('../../../server/utils/googleTagManagerClient')
    vi.mocked(api.getGtmContainer).mockResolvedValueOnce({ path: 'accounts/1/containers/2', domainName: ['example.test'], usageContext: ['web'], publicId: 'invalid' } as any)
    await expect(executeProposal(p)).rejects.toThrow('precondition failed')
    expect(await held()).toBeNull()
    expect((await getGtmChangeProposal(ctx(), p.id)).status).toBe('failed')
  })

  it('I2 inventory resource filters also deny before the credential-capable session', async () => {
    const { buildGoogleAdsMcpToolDependencies } = await import('../../../server/utils/ai/mcp/googleAdsServer')
    const { resolveGoogleAdsControlSession } = await import('../../../server/utils/googleAds/controlSession')
    vi.mocked(resolveGoogleAdsControlSession).mockClear()
    await expect(buildGoogleAdsMcpToolDependencies({ read: true, write: true, automation: false, destructive: false }).listInventory!('campaigns', { clientId: C, connectionId: CON, campaignResourceName: 'customers/456/campaigns/1', maxResults: 10 }, ctx())).rejects.toThrow('Cross-customer')
    expect(resolveGoogleAdsControlSession).not.toHaveBeenCalled()
  })

  it('I3 admits all five tags when the entire batch fits with reserved verification capacity', async () => {
    state.realQuota = true
    const own = await recordGtmOwnership(ctx(), { siteId: SITE, evidence }, 'own')
    const p = await createGtmChangeProposal(ctx(), { siteId: SITE, ownershipEvidenceId: own.id, action: 'workspace', changes: Array.from({ length: 5 }, (_, i) => ({ action: 'create', template: { templateId: 'tag.google.v1', name: `Tag ${i}`, tagId: 'G-TEST', firingTriggerId: ['2147479553'] } })) }, 'five-supported')
    await reviewGtmChangeProposal(ctx(A), { proposalId: p.id, expectedHash: p.request_hash, decision: 'approved' })
    const r = await executeProposal(p)
    expect(r.status).toBe('versioned')
    expect(r.result.managed).toHaveLength(5)
    expect(state.writes).toBe(7) // workspace + five tags + version
    expect((await state.pool.query('SELECT request_count FROM gtm_api_quota_windows')).rows[0].request_count).toBe(17) // proposal read + 16 fully admitted execution calls
    expect(await held()).toBeNull()
  })
})
