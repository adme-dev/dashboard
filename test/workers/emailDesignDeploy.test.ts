import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateEmailDesignTarget } from '../../workers/email-design/deploy.mjs'

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
  it('does not accept a staging configuration as production', () => {
    expect(() => validateEmailDesignTarget(config('staging'), 'production')).toThrow()
  })
})


describe('Pages private transport release', () => {
  it('excludes heavy design routes while mounting its provisioned private transport', () => {
    const nuxt = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    const pages = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
    expect(nuxt).toContain("ignore: ['**/api/email/design/**']")
    expect(pages).toMatch(/binding\s*=\s*["']EMAIL_DESIGN["']/)
  })
})
