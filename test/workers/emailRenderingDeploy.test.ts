import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateEmailRenderingTarget, main } from '../../workers/email-rendering/deploy.mjs'

const config = (environment = 'staging') => JSON.parse(readFileSync(`workers/email-rendering/wrangler.${environment}.jsonc`, 'utf8'))
describe('private renderer deployment guard', () => {
  it.each(['staging', 'production'])('admits the reviewed %s target', (env) => {
    expect(() => validateEmailRenderingTarget(config(env), env)).not.toThrow()
  })
  it.each([
    { name: 'agency-dashboard' }, { account_id: 'wrong' }, { main: 'other.ts' }, { compatibility_date: '2026-09-01' },
    { compatibility_flags: ['nodejs_compat'] }, { workers_dev: true }, { preview_urls: true }, { routes: ['*'] },
    { triggers: { crons: ['* * * * *'] } }, { observability: { enabled: true } },
    { vars: { EMAIL_RENDER_ENVIRONMENT: 'production' } }, { vars: { EMAIL_RENDER_ENVIRONMENT: 'staging', TOKEN: 'hidden' } },
    { services: [] }, { r2_buckets: [] }, { hyperdrive: [] }, { unsafe: {} }, { durable_objects: {} }, { ai: {} }, { queues: {} }, { send_email: [] }
  ])('denies target and capability drift %j', (change) => {
    expect(() => validateEmailRenderingTarget({ ...config(), ...change }, 'staging')).toThrow()
  })
  it.each([[], ['preview'], ['staging', '--unexpected'], ['staging', '--dry-run', '--name', 'wrong']])('denies invalid deployment arguments %j', (args) => {
    expect(() => main(args)).toThrow()
  })
})
