import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  listRegisteredGodModeMutationFamilies,
  listReviewedGodModeReadRoutes
} from '../../server/utils/godMode/featureGate'

const API_INVENTORY = {
  // Page Studio publication now delegates its selected-tenant permission check
  // to requireAgencyPageStudioAccess; this lexical inventory counts inline gates.
  // Delegated permission gates do not register a God mode mutation bypass.
  // Draft history adds agency/portal GET and POST through scoped permission and
  // membership checks; no God mode bypass or mutation-family registration.
  // CMS connection adds four delegated scoped routes (two POSTs), without a bypass.
  // Version comparison GET adds a scoped PAGE_STUDIO_APPROVE read; no bypass.
  // Generated collection CRUD and explicit setup add 20 scoped routes (8 mutations).
  // Native helpers enforce scope and roles; none registers a God mode bypass.
  // CMS adoption, isolated CMS setup, and website staging add twelve routes
  // (six mutations), through native scoped helpers without a God mode bypass.
  // Agency and portal initial-staging ensure POSTs add two scoped mutations.
  // Both delegate current actor/site checks to handlePageStudioStaging;
  // neither registers a God mode bypass.
  // Checkpoint staging cron uses a machine secret and retained job authority;
  // it adds one POST without any God mode bypass or user-role gate.
  // Astro candidate POST delegates native publish permission, scoped site and
  // fresh login authority; it adds one mutation without a God mode bypass.
  // Native launch-status GET derives account/workspace scope and rechecks the original login; no bypass.
  // QR client picker adds one GET. Logo upload delegates to requireQrAccess,
  // which is outside this lexical inline-role pattern, so the inline count
  // falls by one. It retains authentication and the QR mutation audit wrapper.
  // Image generation and credits add 18 routes (six POSTs). Native helpers
  // enforce current scoped actor/billing authority; the payment webhook uses
  // verified Stripe signatures. None registers a God mode bypass.
  // Customer signup adds eight routes (five mutations), guarded by its own
  // feature flag, exact origin, verified customer session and workspace authority.
  // None accepts agency God mode or registers a mutation bypass.
  // Customer dashboard adds a native-session GET and origin-guarded preview POST.
  // Neither accepts God mode or customer-selected scope.
  // Customer recovery adds one native-cookie, exact-origin POST without a bypass.
  // Customer editor adds one native-cookie, origin-guarded handoff POST; no bypass.
  // Native/portal workspaces, media, forms and template history add 33 routes
  // (10 mutations). Separate audience adapters and fresh scope checks remain;
  // no new route registers a God mode bypass.
  // Invited CMS membership adds GET and PUT. Both require selected-tenant
  // PAGE_STUDIO_EDIT plus a fresh active agency-admin check; no God mode bypass.
  // Email templates add four portal AI routes (two POSTs), two portal field
  // GETs and two native-customer field GETs. Delegated current login, site,
  // role and model/allowance checks remain independent of God mode. Native
  // field reads retain the customer Forms feature flag and session adapter;
  // this inventory does not authorize or activate that runtime.
  // Restricted native CMS setup adds GET/POST through genuine native cookies,
  // immutable setup purpose, staging approval and exact-origin mutation gates.
  // Neither registers a God mode bypass or accepts caller scope.
  // News auto-posting adds three client-scoped agency routes (POST/GET/PUT)
  // and one machine-secret POST. POST/PUT use native role gates; PUT retains
  // account/client validation and a transaction. No mutation bypass is registered.
  // Newsroom handoff adds one fixed-target machine-secret POST, without a God mode bypass.
  // Invited portal publishing adds two production-only POSTs with original-login,
  // exact-site membership, domain and approval checks; no God mode bypass.
  // Customer launch status adds one read-only GET with current client/site membership.
  // It exposes no God mode bypass and performs no publication or domain mutation.
  // Invited customer candidate POST uses original-login publishing authority,
  // scoped approval and configured compiler bindings; no God mode bypass.
  // Native customer publication adds two POSTs using the native host-only cookie,
  // current owner/manager entitlement and verified-domain checks; no God mode bypass.
  // Native candidate POST retains its original native login and approved production
  // build, with an exact-release review grant. No God mode bypass.
  // Native plan GET/POST authenticate staff and recheck built-in platform authority
  // in the transaction. No customer self-grant or God mode bypass is registered.
  // Native transfer recovery adds one origin/session-guarded POST. Current owner,
  // exact site and retained transfer authority remain required; no God mode bypass.
  // Seven transfer routes add three mutations. Public verification bootstrap
  // adds one read; all retain genuine login and native authority with no bypass.
  // Native CMS runtime recovery adds one genuine operator-cookie POST; no God mode bypass.
  // Recovery adds GET status and two explicit operator POSTs (review and inspection).
  // Each delegates genuine cookie/role/origin checks; no God mode bypass.
  // Existing-source adoption adds four native-authenticated routes, two mutations; no bypass.
  // Immutable recovery review adds two explicit role/session-guarded POSTs; no bypass.
  // Recovery admission adds one explicit operator-cookie POST; no bypass.
  // Banner recovery adds six routes (five mutations) and eight explicit write
  // gates. Preset creation, design/reference generation, export retry and social
  // handoff retain client/project authority; none registers a mutation bypass.
  // Editable artwork adds eleven routes (nine mutations); delegated artwork/QR
  // gates and machine credentials remain required. Twelve additional mutations
  // now have inline write gates; dissection import adds a guarded transaction.
  // These lexical counts do not register any God mode mutation bypass.
  // Private raster downloads add GET/HEAD; two existing export mutations gain
  // native write gates while fresh project/client access remains independent.
  totalRouteFiles: 2296,
  mutationRouteFiles: 1254,
  explicitlyGuardedMutationFiles: 424,
  guardedMutationFilesWithTransactionCall: 50
} as const

const EMAIL_TEMPLATE_ROUTE_ADDITIONS = {
  'server/api/portal/page-studio/customer/sites/[siteId]/email-templates/[audience]/fields.get.ts': 'customerFormsHandler(event, \'template-fields\', \'GET\')',
  'server/api/portal/page-studio/customer/sites/[siteId]/forms/[definitionId]/email-templates/[audience]/fields.get.ts': 'customerFormsHandler(event, \'template-fields\', \'GET\')',
  'server/api/portal/page-studio/sites/[siteId]/email-templates/[audience]/ai.get.ts': 'defineEventHandler(handleEmailTemplateAi)',
  'server/api/portal/page-studio/sites/[siteId]/email-templates/[audience]/ai.post.ts': 'defineEventHandler(handleEmailTemplateAi)',
  'server/api/portal/page-studio/sites/[siteId]/email-templates/[audience]/fields.get.ts': 'handleEmailTemplate(event, \'FIELDS\')',
  'server/api/portal/page-studio/sites/[siteId]/forms/[definitionId]/email-templates/[audience]/ai.get.ts': 'defineEventHandler(handleEmailTemplateAi)',
  'server/api/portal/page-studio/sites/[siteId]/forms/[definitionId]/email-templates/[audience]/ai.post.ts': 'defineEventHandler(handleEmailTemplateAi)',
  'server/api/portal/page-studio/sites/[siteId]/forms/[definitionId]/email-templates/[audience]/fields.get.ts': 'handleEmailTemplate(event, \'FIELDS\')'
} as const

const DEFERRED_MUTATION_FAMILIES = [{
  route: '/api/agency/briefs/templates/:id/mapping',
  file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
  normalGate: 'requireRole(event, [\'admin\', \'project_manager\'])',
  independentScope: 'template lookup by route id; no tenant-bound predicate',
  auditStrategy: 'uncoordinated: no transaction-bound audit dependency or Task 5 ledger/outbox',
  decision: 'deny God-mode-only mutation bypass'
}] as const

function listApiFiles(root = 'server/api'): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return listApiFiles(path)
    return path.endsWith('.ts') ? [path] : []
  })
}

function mechanicalInventory() {
  const files = listApiFiles()
  const mutations = files.filter(file => /\.(post|put|patch|delete)\.ts$/.test(file))
  const guarded = mutations.filter(file => /(requireRole|requirePermission|requireWriteAccess|requireFreshCrmSearchAdmin|isReadOnlyRole|user\.role|roleHasPermission)/.test(readFileSync(file, 'utf8')))
  const transactional = guarded.filter(file => /\btransaction\s*\(/.test(readFileSync(file, 'utf8')))
  return {
    totalRouteFiles: files.length,
    mutationRouteFiles: mutations.length,
    explicitlyGuardedMutationFiles: guarded.length,
    guardedMutationFilesWithTransactionCall: transactional.length
  }
}

describe('God mode route isolation inventory', () => {
  it('records the full mechanical API and mutation inventory reviewed before implementation', () => {
    expect(mechanicalInventory()).toEqual(API_INVENTORY)
    expect(API_INVENTORY).toEqual({
      totalRouteFiles: 2296,
      mutationRouteFiles: 1254,
      explicitlyGuardedMutationFiles: 424,
      guardedMutationFilesWithTransactionCall: 50
    })
  })

  it('pins transfer and verification bootstrap routes to native authority without a bypass', () => {
    const routes = {
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/admission.post.ts': "handleTransferOperatorHttp(event, 'POST', 'recovery-admission')",
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/review.post.ts': "handleTransferOperatorHttp(event, 'POST', 'recovery-review')",
      'server/api/portal/page-studio/customer/sites/[siteId]/transfer-requests/[requestId]/recovery/review.post.ts': 'handleTransferReviewOwnerHttp(event)',
      'server/api/agency/page-studio/sites/[siteId]/adoption-grant.get.ts': 'handleTransferOperatorHttp(event, \'GET\', \'adoption-grant\')',
      'server/api/agency/page-studio/sites/[siteId]/adoption-grant.post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'adoption-grant\')',
      'server/api/portal/page-studio/customer/cms-adoption/[grantId].get.ts': 'handleCustomerAdoptionHttp(event, \'GET\')',
      'server/api/portal/page-studio/customer/cms-adoption/[grantId].post.ts': 'handleCustomerAdoptionHttp(event, \'POST\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery.get.ts': 'handleTransferOperatorHttp(event, \'GET\', \'recovery\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery.post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'recovery\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/recovery/inspect.post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'recovery-inspect\')',
      'server/api/agency/page-studio/sites/[siteId]/cms-runtime-recovery/[requestId].post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'runtime-recovery\')',
      'server/api/agency/page-studio/transfer-requests.get.ts': 'handleTransferOperatorHttp(event, \'GET\', \'list\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId].get.ts': 'handleTransferOperatorHttp(event, \'GET\', \'request\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId].post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'request\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/workflow.get.ts': 'handleTransferOperatorHttp(event, \'GET\', \'workflow\')',
      'server/api/agency/page-studio/sites/[siteId]/transfer-requests/[requestId]/workflow.post.ts': 'handleTransferOperatorHttp(event, \'POST\', \'workflow\')',
      'server/api/portal/page-studio/customer/sites/[siteId]/transfer-request.get.ts': 'handleTransferOwnerHttp(event, \'GET\')',
      'server/api/portal/page-studio/customer/sites/[siteId]/transfer-request.post.ts': 'handleTransferOwnerHttp(event, \'POST\')',
      'server/api/agency/page-studio/session-verification-key.get.ts': 'eventHandler(handleSessionVerificationKey)'
    }
    for (const [file, handler] of Object.entries(routes)) {
      const source = readFileSync(file, 'utf8')
      expect(source).toContain(handler)
      expect(source).not.toMatch(/isApplicationCapabilityEnabled|registerGodModeMutationFamily/)
    }
    const transfer = readFileSync('server/utils/pageStudio/transferControlsHttp.ts', 'utf8')
    expect(transfer).toContain('await requireCustomerPlanOperator(db, user.id)')
    expect(transfer).toContain('resolvePageStudioLoginSession(db, event, \'agency\', user.id)')
    expect(transfer).toContain('await readCustomerSession(token, transactionWithoutRetry)')
    const bootstrap = readFileSync('server/utils/pageStudio/sessionVerificationKeyHttp.ts', 'utf8')
    expect(bootstrap).toContain('await requireCustomerPlanOperator(db, user.id)')
    expect(bootstrap).toContain('resolvePageStudioLoginSession(db, event, \'agency\', user.id)')
    expect(bootstrap).toContain('return await transactionWithoutRetry(async (db) =>')
    expect(bootstrap).not.toMatch(/resolvePageStudioSessionEnvironment|PAGE_STUDIO_SESSION_PRIVATE_KEY|bindPageStudioLoginSession|isApplicationCapabilityEnabled/)
    expect(listReviewedGodModeReadRoutes().some(route => route.path === '/api/agency/page-studio/session-verification-key')).toBe(false)
  })

  it('pins news auto-posting to independent client scope and machine-secret authority', () => {
    const directory = 'server/api/agency/social/publishing/news-autopost/'
    const sources = ['index.get.ts', 'index.put.ts', 'check.post.ts']
      .map(file => readFileSync(directory + file, 'utf8'))
    for (const source of sources) expect(source).toContain('await requireSocialClientAccess(event,')
    expect(sources[1]).toContain('await requireRole(event, PERMISSIONS.MANAGEMENT)')
    expect(sources[1]).toContain('return transaction(async (db) =>')
    expect(sources[1]).toContain('WHERE id=$1 AND client_id=$2')
    expect(sources[2]).toContain('await requireRole(event, PERMISSIONS.CREATIVE)')
    expect(readFileSync('server/api/cron/replenish-social-news.post.ts', 'utf8'))
      .toContain('requireSocialCronAuth(event)')
  })

  it('pins the added email-template routes to their separate native authority adapters', () => {
    const routes = listApiFiles().filter(file => /\/email-templates\/\[audience\]\/(?:ai|fields)\.(?:get|post)\.ts$/.test(file)).sort()
    expect(routes).toEqual(Object.keys(EMAIL_TEMPLATE_ROUTE_ADDITIONS).sort())
    for (const [file, handler] of Object.entries(EMAIL_TEMPLATE_ROUTE_ADDITIONS)) {
      expect(readFileSync(file, 'utf8')).toContain(handler)
    }
  })

  it('classifies each reviewed read route by exact method, gate, scope, and terminal strategy', () => {
    expect(listReviewedGodModeReadRoutes()).toEqual([
      {
        method: 'GET',
        path: '/api/agency/operations/queue-health',
        file: 'server/api/agency/operations/queue-health.get.ts',
        bypassedGate: 'permission',
        independentScope: 'agency-global authenticated staff operations telemetry',
        mutationClass: 'read-only',
        terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
      },
      {
        method: 'GET',
        path: '/api/crm/ai/status',
        file: 'server/api/crm/ai/status.get.ts',
        bypassedGate: 'feature_flag',
        independentScope: 'agency-global authenticated staff status',
        mutationClass: 'read-only',
        terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
      }
    ])

    const [permissionRoute, featureRoute] = listReviewedGodModeReadRoutes()
    expect(readFileSync(permissionRoute!.file, 'utf8')).toContain('requirePermission(event, \'ADMIN\')')
    expect(readFileSync(featureRoute!.file, 'utf8')).toContain('isApplicationCapabilityEnabled(event, isCrmAiEnabled)')
  })

  it('keeps every mutation lacking independent scope and durable terminal coordination unreachable', () => {
    expect(listRegisteredGodModeMutationFamilies()).toEqual([])
    expect(DEFERRED_MUTATION_FAMILIES).toEqual([
      expect.objectContaining({
        file: 'server/api/agency/briefs/templates/[id]/mapping.put.ts',
        decision: 'deny God-mode-only mutation bypass'
      })
    ])
  })

  it('has no production mutation registration and exactly one reviewed feature-gate consumer', () => {
    const files = listApiFiles()
    const mutationRegistrations = files.filter(file => readFileSync(file, 'utf8').includes('registerGodModeMutationFamily('))
    const featureConsumers = files.filter(file => readFileSync(file, 'utf8').includes('isApplicationCapabilityEnabled('))

    expect(mutationRegistrations).toEqual([])
    expect(featureConsumers).toEqual(['server/api/crm/ai/status.get.ts'])
  })

  it('pins the concrete uncoordinated mutation evidence', () => {
    const source = readFileSync(DEFERRED_MUTATION_FAMILIES[0].file, 'utf8')
    expect(source).toContain('requireRole(event, [\'admin\', \'project_manager\'])')
    expect(source).not.toMatch(/\btransaction\s*\(/)
    expect(source).not.toMatch(/godModeMutation|executionLedger|outbox/i)
  })
})
