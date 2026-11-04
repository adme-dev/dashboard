import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateEmailDesignTarget } from '../../workers/email-design/deploy.mjs'
import { designerGate } from '../../server/utils/email-marketing/designerGate'

interface Config {
  compatibility_flags: string[]
  account_id: string
  name: string
  main: string
  workers_dev: boolean
  preview_urls: boolean
  routes: string[]
  triggers: { crons: string[] }
  vars: Record<string, string>
  services: Array<{ service: string }>
  hyperdrive: Array<{ id: string }>
  r2_buckets: Array<{ bucket_name: string }>
  [key: string]: unknown
}

const config = (environment: string) => JSON.parse(readFileSync(new URL(`../../workers/email-design/wrangler.${environment}.jsonc`, import.meta.url), 'utf8')) as Config

describe('private email design deployment targets', () => {
  it.each(['staging', 'production'])('accepts only the reviewed %s configuration', (environment) => {
    expect(() => validateEmailDesignTarget(config(environment), environment)).not.toThrow()
  })
  it.each([
    ['public auth routing', (value: Config) => { value.compatibility_flags = ['nodejs_compat'] }],
    ['account', (value: Config) => { value.account_id = 'another-account' }],
    ['name', (value: Config) => { value.name = 'agency-dashboard' }],
    ['artifact', (value: Config) => { value.main = '../../dist/_worker.js/index.js' }],
    ['public worker URL', (value: Config) => { value.workers_dev = true }],
    ['public preview URL', (value: Config) => { value.preview_urls = true }],
    ['public route', (value: Config) => { value.routes = ['app.xeroflow.io/*'] }],
    ['cron', (value: Config) => { value.triggers.crons = ['* * * * *'] }],
    ['foreign media bucket', (value: Config) => { value.r2_buckets[0].bucket_name = 'another-project' }],
    ['premature brand activation', (value: Config) => { value.vars.FIGFLOW_EDM_BRAND_ENABLED = 'true' }],
    ['premature template publication', (value: Config) => { value.vars.FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED = 'true' }],
    ['missing template publication gate', (value: Config) => { delete value.vars.FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED }],
    ['premature library activation', (value: Config) => { value.vars.FIGFLOW_EDM_LIBRARY_ENABLED = 'true' }],
    ['disabled production template designer', (value: Config) => { value.vars.FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED = 'false' }],
    ['nonliteral template designer flag', (value: Config) => { value.vars.FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED = 'TRUE' }],
    ['missing draft-save prerequisite', (value: Config) => { value.vars.FIGFLOW_EDM_DRAFT_SAVES_ENABLED = 'false' }],
    ['missing template designer gate', (value: Config) => { delete value.vars.FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED }],
    ['premature designer activation', (value: Config) => { value.vars.FIGFLOW_EDM_DESIGNER_ENABLED = 'true' }],
    ['unreviewed authority', (value: Config) => { value.vars.EMAIL_DESIGN_SESSION_AUTHORITY = 'another' }],
    ['environment', (value: Config) => { value.vars.EMAIL_DESIGN_ENVIRONMENT = 'staging' }],
    ['renderer', (value: Config) => { value.services[0].service = 'xeroflow-email-rendering-staging' }],
    ['fresh database', (value: Config) => { value.hyperdrive[1].id = value.hyperdrive[0].id }],
    ['unreviewed capability', (value: Config) => { value.ai = { binding: 'AI' } }],
    ['embedded secret', (value: Config) => { value.vars.JWT_SECRET = 'synthetic-secret' }]
  ])('rejects changed %s', (_label, change) => {
    const value = config('production')
    change(value)
    expect(() => validateEmailDesignTarget(value, 'production')).toThrow()
  })
  it('admits only production template authoring while staging and campaign authoring stay closed', () => {
    expect(config('production').vars).toMatchObject({
      FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true',
      FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED: 'true',
      FIGFLOW_EDM_DESIGNER_ENABLED: 'false',
      FIGFLOW_EDM_LIBRARY_ENABLED: 'false',
      FIGFLOW_EDM_BRAND_ENABLED: 'false'
    })
    expect(designerGate(config('production').vars)).toEqual({ template: true, campaign: false })
    expect(designerGate(config('staging').vars)).toEqual({ template: false, campaign: false })
  })
  it.each(['staging', 'production'])('rejects every unreviewed release-flag combination in %s', (environment) => {
    const flags = [
      'FIGFLOW_EDM_DRAFT_SAVES_ENABLED', 'FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED',
      'FIGFLOW_EDM_DESIGNER_ENABLED', 'FIGFLOW_EDM_LIBRARY_ENABLED', 'FIGFLOW_EDM_BRAND_ENABLED',
      'FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED'
    ]
    for (let combination = 0; combination < 64; combination++) {
      const value = config(environment)
      flags.forEach((flag, index) => { value.vars[flag] = combination & (1 << index) ? 'true' : 'false' })
      // Production admits exactly draft-save + template; staging admits none.
      const approved = environment === 'production' ? combination === 3 : combination === 0
      const check = () => validateEmailDesignTarget(value, environment)
      if (approved) expect(check).not.toThrow()
      else expect(check, JSON.stringify(value.vars)).toThrow()
    }
  })
  it('does not accept a staging configuration as production', () => {
    expect(() => validateEmailDesignTarget(config('staging'), 'production')).toThrow()
  })
})

describe('Pages private transport release', () => {
  it('excludes heavy design routes while mounting its provisioned private transport', () => {
    const nuxt = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    const pages = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
    const privateRoutes = readFileSync(new URL('../../workers/email-design/nitro.config.ts', import.meta.url), 'utf8')
    expect(privateRoutes).toContain('route: \'/api/email/design/designer\'')
    expect(privateRoutes).toContain('handler: fromRepo(\'server/api/email/design/designer.post.ts\')')
    expect(nuxt).toContain('ignore: [\'**/api/email/design/**\']')
    expect(pages).not.toContain('FIGFLOW_EDM_TEMPLATE_PUBLISH_ENABLED')
    expect(pages).toMatch(/binding\s*=\s*["']EMAIL_DESIGN["']/)
    expect(pages).not.toContain('FIGFLOW_EDM_TEMPLATE_DESIGNER_ENABLED')
  })
})
