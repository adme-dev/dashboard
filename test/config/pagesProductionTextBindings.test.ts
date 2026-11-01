import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { parse } from 'smol-toml'
import { agencyWorkflowConfigText } from '../../server/utils/agencyWorkflows/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

type PagesConfig = { vars: Record<string, string>, env: Record<'production' | 'preview', { vars: Record<string, string> }> }
const read = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
const config = parse(await read('wrangler.toml')) as unknown as PagesConfig
// Names-only production observation, 2026-10-27T09:30:21.725444Z; no secret values.
// This snapshot is a capacity model, not proof of current provisioning. Refresh before release.
const observedSecretNames = [
  'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET',
  'AI_GATEWAY_AUTH_TOKEN',
  'AI_ORCHESTRATOR_WORKER_URL',
  'ANOMALY_NOTIFY_ALLOWLIST',
  'AUTOGATE_LEAD_API_PASSWORD',
  'AUTOGATE_LEAD_API_USERNAME',
  'CF_ACCOUNT_ID',
  'CF_API_TOKEN',
  'CRM_COMMS_BRIDGE_ENABLED',
  'CRM_EMAIL_REPLY_SECRETS',
  'CRM_EMAIL_WORKER_SECRET',
  'CRM_LEAD_PROMOTION_ENABLED',
  'CRON_SECRET',
  'DATABASE_URL',
  'DEALER_FEEDS_ENABLED',
  'EMAIL_INGEST_HMAC_SECRET',
  'EMAIL_LINK_SECRET',
  'EMAIL_QUARANTINE_ENCRYPTION_SECRET',
  'FINANCIAL_WATCH_AGENT_ENABLED',
  'GOD_MODE_INTERNAL_EXECUTION_SECRET',
  'GOOGLE_BUSINESS_CLIENT_ID',
  'GOOGLE_BUSINESS_CLIENT_SECRET',
  'GOOGLE_BUSINESS_OAUTH_CLIENT_ID',
  'GOOGLE_BUSINESS_OAUTH_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_DEVELOPER_TOKEN',
  'GOOGLE_REDIRECT_URI',
  'GROQ_API_KEY',
  'GTM_GOOGLE_CLIENT_ID',
  'GTM_GOOGLE_CLIENT_SECRET',
  'GTM_GOOGLE_REDIRECT_URI',
  'INTERNAL_API_KEY',
  'INTERNAL_CRON_TOKEN',
  'JWT_SECRET',
  'LEAD_IDENTITY_HMAC_KEY',
  'LINKEDIN_CLIENT_ID',
  'LINKEDIN_ORGANIC_CLIENT_ID',
  'MCP_HANDSHAKE_SECRET',
  'MCP_INTERNAL_SECRET',
  'MCP_REQUEST_SIGNING_SECRET',
  'MEASUREMENT_PROVIDER_ASTORIA_GA4',
  'MEASUREMENT_PROVIDER_META_BIG_GARAGE',
  'MEASUREMENT_PROVIDER_TIKTOK_WERRIBEE',
  'META_APP_ID',
  'META_APP_SECRET',
  'META_LEADGEN_VERIFY_TOKEN',
  'META_REDIRECT_URI',
  'MONDAY_API_TOKEN',
  'MONDAY_OAUTH_APP_VERSION_ID',
  'MONDAY_OAUTH_CLIENT_ID',
  'MONDAY_OAUTH_CLIENT_SECRET',
  'MONDAY_SIGNING_SECRET',
  'NEWSROOM_SOCIAL_ACCOUNT_ID',
  'NEWSROOM_SOCIAL_CLIENT_ID',
  'NEWSROOM_SOCIAL_ENABLED',
  'NEWSROOM_SOCIAL_SECRET',
  'NUXT_GOOGLE_BUSINESS_CLIENT_ID',
  'NUXT_GOOGLE_BUSINESS_CLIENT_SECRET',
  'NUXT_PUBLIC_SOCIAL_PLANNER_AI_ENABLED',
  'NUXT_PUBLIC_SOCIAL_PLANNER_ENABLED',
  'OFFICE_GUEST_REALTIME_MEDIA_ENABLED',
  'OFFICE_GUEST_REALTIME_PILOT_OFFICE_IDS',
  'OFFICE_SYNC_SECRET',
  'PAGE_STUDIO_CONTROL_SECRET',
  'PAGE_STUDIO_SESSION_ISSUER',
  'PAGE_STUDIO_SESSION_PRIVATE_KEY',
  'PAGE_STUDIO_SESSION_PUBLIC_KEY',
  'PLATFORM_AGENT_SCOPE_SIGNING_SECRET',
  'PLATFORM_AGENT_THINK_TURNS_ENABLED',
  'PLATFORM_AGENT_WORKER_URL',
  'PUBLISHING_PLANNER_AGENT_ENABLED',
  'R2_ACCESS_KEY_ID',
  'R2_ACCOUNT_ID',
  'R2_BUCKET_NAME',
  'R2_SECRET_ACCESS_KEY',
  'REALTIME_APP_ID',
  'REALTIME_APP_SECRET',
  'RENDER_LINK_SECRET',
  'REPO_TOKEN_ENCRYPTION_KEY',
  'RESEND_API_KEY',
  'SESSION_SECRET',
  'SOCIAL_DASHBOARD_BASE_URL',
  'SOCIAL_DASHBOARD_SERVICE_SECRET',
  'SOCIAL_PLANNER_AI_ENABLED',
  'SOCIAL_PLANNER_ENABLED',
  'SPEND_CONTROLLER_AGENT_ENABLED',
  'SPEND_CONTROLLER_AGENT_PROPOSALS_ENABLED',
  'TRACKING_IP_SALT',
  'TRAFFIC_CONTROLLER_AGENT_ENABLED',
  'VAPID_PRIVATE_KEY',
  'VAPID_PUBLIC_KEY',
  'VAPID_SUBJECT',
  'VIDEO_GENERATION_ENABLED',
  'VIDEO_GENERATION_TEST_TENANT_ENABLED',
  'VIDEO_GENERATION_TEST_TENANT_ID',
  'VIDEO_STUDIO_ENABLED',
  'WORKFLOW_CALLBACK_SECRET',
  'WORKFLOW_SERVICE_SECRET',
  'XERO_CLIENT_ID',
  'XERO_CLIENT_SECRET',
  'XERO_REDIRECT_URI'
] as const
const generatedTextNames = ['NUXT_APP_BASE_URL', 'NUXT_APP_BUILD_ASSETS_DIR', 'NUXT_APP_CDN_URL', 'NITRO_PRESET']
const conditionalRemovals = ['LINKEDIN_CLIENT_ID', 'LINKEDIN_ORGANIC_CLIENT_ID']
const conditionalAdditions = ['LINKEDIN_CLIENT_SECRET', 'LINKEDIN_ORGANIC_CLIENT_SECRET', 'MCP_MARKETING_STAFF_GRANTS']

const omittedFalseFlags = [
  'MCP_FINANCIAL_TOOLS_ENABLED',
  'MCP_REQUIRE_WRITE_SCOPE',
  'AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED',
  'AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY'
]
// These are all current runtime consumers of the four direct-process omitted flags. Evaluate
// their actual gate expressions so an absent value must retain false semantics.
const consumers = await Promise.all([
  'server/api/internal/mcp/tools.post.ts',
  'server/api/internal/mcp/call.post.ts',
  'server/api/admin/ai/mcp/status.get.ts',
  'server/api/agency/ai/mcp/my-tools.get.ts',
  'server/utils/ai/tools/capabilities.ts',
  'server/api/internal/workflows/crm/followup-review.post.ts',
  'server/api/cron/publish-social-posts.post.ts',
  'server/api/cron/crm-task-reminders.post.ts'
].map(read))

describe('production Pages text binding budget', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('preserves absent scheduled publishing primary through its binding-first runtime helper', () => {
    const key = 'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY'
    expect(config.env.production.vars).not.toHaveProperty(key)
    expect(config.vars[key]).toBe('false')
    const expression = 'agencyWorkflowConfigText(event, \'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY\') === \'true\''
    expect(consumers.join('\n')).toContain(expression)
    const evaluate = (bindings: Record<string, unknown>) => runInNewContext(expression, {
      agencyWorkflowConfigText, event: { context: { cloudflare: { env: bindings } } }
    })
    vi.stubEnv(key, undefined)
    expect(evaluate({})).toBe(false)
    expect(evaluate({ [key]: 'false' })).toBe(false)
    expect(evaluate({ [key]: 'true' })).toBe(true)
    vi.stubEnv(key, 'true')
    expect(evaluate({})).toBe(true)
    expect(evaluate({ [key]: 'false' })).toBe(false)
    expect(evaluate({ [key]: '' })).toBe(false)
  })

  it.each(omittedFalseFlags)('preserves disabled behavior when %s is absent', (key) => {
    expect(config.env.production.vars).not.toHaveProperty(key)
    expect(config.vars[key]).toBe('false')
    const reference = `process\\.env\\.${key}\\b`
    const source = consumers.join('\n')
    const references = source.match(new RegExp(reference, 'g')) ?? []
    const expressions = source.match(new RegExp(`${reference} (?:===|!==) 'true'`, 'g')) ?? []
    expect(references.length).toBeGreaterThan(0)
    expect(expressions).toHaveLength(references.length)
    for (const expression of expressions) {
      const evaluate = (env: Record<string, string>) => runInNewContext(expression, { process: { env } })
      expect(evaluate({})).toBe(evaluate({ [key]: 'false' }))
      expect(evaluate({})).not.toBe(evaluate({ [key]: 'true' }))
    }
  })

  it('keeps Node pinned by the build pipeline without a production runtime binding', async () => {
    expect(config.env.production.vars).not.toHaveProperty('NODE_VERSION')
    expect(config.vars.NODE_VERSION).toBe('24')
    expect(config.env.preview.vars.NODE_VERSION).toBe('24')
    expect(JSON.parse(await read('package.json')).engines.node).toBe('24.18.0')
    expect(await read('.github/workflows/ci.yml')).toContain('node: [24.18.0]')
  })

  it.each([
    ['SITE_INTELLIGENCE_AI_ENABLED', 'false'],
    ['NEARBY_MARKET_DISCOVERY_ENABLED', 'false'],
    ['AI_GOVERNED_CATALOG_MODE', 'legacy']
  ])('omits %s from production because absence equals its value', async (key, value) => {
    expect(config.env.production.vars).not.toHaveProperty(key)
    expect(config.vars[key]).toBe(value)
    if (key === 'AI_GOVERNED_CATALOG_MODE') {
      expect(await read('nuxt.config.ts')).toContain(`aiGovernedCatalogMode: process.env.${key} || 'legacy'`)
      return
    }
    // Every consumer gates on === 'true', so absent and "false" are identical.
    const sources = await Promise.all([
      'server/utils/siteIntelligence/enrich.ts',
      'server/api/agency/site-intelligence/readiness.get.ts',
      'nuxt.config.ts'
    ].map(read))
    const joined = sources.join('\n')
    const direct = joined.match(new RegExp(`process\\.env\\.${key}\\b[^\\n]*`, 'g')) ?? []
    for (const line of direct) expect(line).toMatch(new RegExp(`process\\.env\\.${key} (?:===|!==) 'true'`))
    const viaFlag = joined.match(new RegExp(`flag\\(env, '${key}'\\)`, 'g')) ?? []
    expect(direct.length + viaFlag.length).toBeGreaterThan(0)
    if (viaFlag.length) expect(sources[1]).toMatch(/process\.env\[name\]\) === 'true'/)
  })

  it('distinguishes the historic snapshot from compact source capacity and conditional enrollment', () => {
    const declaredTextBindings = Object.keys(config.env.production.vars).length
    expect(declaredTextBindings).toBe(43)
    expect(config.env.production.vars).not.toHaveProperty('APP_NAME')
    const declaredNames = Object.keys(config.env.production.vars)
    const textCount = (secretNames: readonly string[]) => {
      const all = [...declaredNames, ...secretNames, ...generatedTextNames]
      // Never hide duplicated/overlapping bindings behind count-only arithmetic.
      expect(new Set(all).size).toBe(all.length)
      return all.length
    }
    expect(observedSecretNames).toHaveLength(102)
    // Historic source had 43 vars; compact configuration freed a slot, now used by the design gate.
    expect(43 + observedSecretNames.length + generatedTextNames.length).toBe(149)
    expect(textCount(observedSecretNames)).toBe(149)
    // The 28 October names-only observation adds the staff grant, with no other secret changes.
    expect(textCount([...observedSecretNames, 'MCP_MARKETING_STAFF_GRANTS'])).toBe(150)
    for (const name of conditionalRemovals) expect(observedSecretNames).toContain(name)
    for (const name of conditionalAdditions) expect(observedSecretNames).not.toContain(name)
    expect(textCount([...observedSecretNames, ...conditionalAdditions])).toBe(152)
    // Only after exact public-ID equality/runtime pairing verification may the operator remove these.
    const conditionalSecrets = [...observedSecretNames.filter(name => !conditionalRemovals.includes(name)), ...conditionalAdditions]
    expect(textCount(conditionalSecrets)).toBe(150)
    expect(textCount(conditionalSecrets)).toBeLessThanOrEqual(150)
    expect(textCount([...conditionalSecrets, 'LINKEDIN_ORGANIC_SCOPES'])).toBe(151)
    expect(textCount([...conditionalSecrets, 'TIKTOK_CONTENT_CLIENT_KEY', 'TIKTOK_CONTENT_CLIENT_SECRET'])).toBe(152)
    // Task 5 code completion adds no binding while TikTok stays unavailable.
    expect(config.env.production.vars).not.toHaveProperty('TIKTOK_CONTENT_CLIENT_KEY')
    expect(config.env.production.vars).not.toHaveProperty('TIKTOK_CONTENT_CLIENT_SECRET')
    expect(config.env.production.vars).toHaveProperty('PAGE_STUDIO_CUSTOMER_ACTIVATION')
    for (const suffix of ['PREVIEW_ENABLED', 'PREVIEW_APPROVALS', 'CMS_SETUP_ENABLED', 'BROWSER_ENABLED', 'EDITOR_ENABLED']) {
      expect(config.env.production.vars).not.toHaveProperty(`PAGE_STUDIO_CUSTOMER_${suffix}`)
    }
    expect(config.env.production.vars.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED).toBe('true')
  })
})
