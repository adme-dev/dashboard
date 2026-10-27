import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'

type PagesConfig = { vars: Record<string, string>, env: Record<'production' | 'preview', { vars: Record<string, string> }> }
const read = (file: string) => readFile(new URL(`../../${file}`, import.meta.url), 'utf8')
const config = parse(await read('wrangler.toml')) as unknown as PagesConfig
const omittedFalseFlags = [
  'MCP_FINANCIAL_TOOLS_ENABLED',
  'MCP_REQUIRE_WRITE_SCOPE',
  'AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY',
  'AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED',
  'AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY'
]
// These are all current runtime consumers of the five omitted flags. Evaluate
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

  it('fits the scoped activation in the full reviewed text-binding budget', () => {
    const declaredTextBindings = Object.keys(config.env.production.vars).length
    expect(declaredTextBindings).toBe(43)
    expect(config.env.production.vars).not.toHaveProperty('APP_NAME')
    // NUXT_APP_BASE_URL, NUXT_APP_BUILD_ASSETS_DIR, NUXT_APP_CDN_URL, NITRO_PRESET.
    // Reviewed 2026-10-26 in agency-dashboard production: 100 secret_text
    // bindings, including the scoped Astoria GA4 credential. LinkedIn adds
    // exactly two (LINKEDIN_ORGANIC_CLIENT_SECRET, LINKEDIN_CLIENT_SECRET); its
    // public client IDs are built into server/utils/socialOAuth/env.ts.
    // Secret count is live provider state and must be recounted before release.
    const generatedTextBindings = 4
    const providerTextBindingLimit = 150
    const reviewedSecretBindings = 100
    const linkedInSecretBindings = 2
    const total = declaredTextBindings + reviewedSecretBindings + linkedInSecretBindings + generatedTextBindings
    expect(total).toBe(149)
    expect(total).toBeLessThanOrEqual(providerTextBindingLimit)
    expect(config.env.production.vars).toHaveProperty('PAGE_STUDIO_CUSTOMER_ACTIVATION')
    for (const suffix of ['PREVIEW_ENABLED', 'PREVIEW_APPROVALS', 'CMS_SETUP_ENABLED', 'BROWSER_ENABLED', 'EDITOR_ENABLED']) {
      expect(config.env.production.vars).not.toHaveProperty(`PAGE_STUDIO_CUSTOMER_${suffix}`)
    }
    expect(config.env.production.vars.PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED).toBe('true')
  })
})
