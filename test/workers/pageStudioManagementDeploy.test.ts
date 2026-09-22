import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateManagementTarget } from '../../workers/page-studio-management/deploy.mjs'

const config = (environment = 'production') => JSON.parse(readFileSync(`workers/page-studio-management/wrangler.${environment}.jsonc`, 'utf8'))
describe('private management immutable deployment target', () => {
  it.each(['staging', 'production'])('accepts only the reviewed %s resource mapping', (environment) => {
    expect(() => validateManagementTarget(config(environment), environment)).not.toThrow()
  })
  it.each([
    { vars: { ...config().vars, PAGE_STUDIO_CLOUDFLARE_ZONE_ID: 'different-zone' } },
    { vars: { ...config().vars, PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID: 'different-account' } },
    { services: [] },
    { services: [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-staging' }] },
    { r2_buckets: [] }, { r2_buckets: [{ binding: 'PAGE_STUDIO_CHECKPOINTS', bucket_name: 'xeroflow-page-studio-checkpoints-staging' }] },
    { name: 'agency-dashboard' }, { account_id: 'other' }, { main: '../../other.ts' },
    { workers_dev: true }, { preview_urls: true }, { routes: [{ pattern: '*example.com/*' }] },
    { triggers: { crons: ['* * * * *'] } }, { services: [{ binding: 'OTHER', service: 'other' }] },
    { durable_objects: { bindings: [] } }, { unsafe: { bindings: [] } },
    { hyperdrive: [{ binding: 'HYPERDRIVE_FRESH', id: '3865ea5568234fc7b0e9e3e595a30286' }] },
    { vars: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' } },
    { vars: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', CLOUDFLARE_API_TOKEN: 'never-a-secret' } },
    { vars: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', UNREVIEWED_SETTING: 'enabled' } },
    { vars: { PAGE_STUDIO_RELEASE_ENVIRONMENT: 'production', PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: ' example.com' } },
    { observability: { enabled: true, head_sampling_rate: 0.1, logs: { invocation_logs: true } } },
    { observability: { enabled: true, head_sampling_rate: 1 } },
    { compatibility_date: '2026-09-14' }, { compatibility_flags: [] }, { observability: { enabled: false } }
  ])('rejects target or capability drift %j', (change) => {
    expect(() => validateManagementTarget({ ...config(), ...change }, 'production')).toThrow()
  })
  it('never binds infrastructure staging to customer staging resources', () => {
    expect(() => validateManagementTarget({ ...config('staging'), services: [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-client-staging' }] }, 'staging')).toThrow()
  })
  it('rejects an implicit or invented environment', () => {
    expect(() => validateManagementTarget(config(), undefined)).toThrow()
    expect(() => validateManagementTarget(config(), 'preview')).toThrow()
  })
})
