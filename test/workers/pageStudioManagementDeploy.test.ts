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
  it('requires explicit production provisioning and permits only strict reviewed-policy shape', () => {
    const current = config()
    expect(current.vars.PAGE_STUDIO_PROVISIONING_ENVIRONMENT).toBe('production')
    const configured = JSON.parse(current.vars.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)
    expect(configured).toMatchObject({ version: 1, kind: 'managed-draft-import', accountId: current.account_id,
      namespace: 'xeroflow-page-studio-dispatch-production',
      from: { compatibilityDate: '2026-09-07', digest: '2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83' },
      to: { compatibilityDate: '2026-08-18', digest: '40aa0efe85f87918c569b8388a3403af51ee8c33d741c56eeb956a702ab7105d' } })
    const policy = configured
    const changed = (value: unknown) => ({ ...current, vars: { ...current.vars, MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify(value) } })
    expect(() => validateManagementTarget(changed(policy), 'production')).not.toThrow()
    for (const value of [{ ...policy, accountId: 'b'.repeat(32) }, { ...policy, namespace: 'other' },
      { ...policy, formReceiptDigest: 'a'.repeat(64) }, { ...policy, to: policy.from },
      { ...policy, to: { ...policy.to, digest: '' } }]) expect(() => validateManagementTarget(changed(value), 'production')).toThrow()
    const staging = config('staging')
    expect(() => validateManagementTarget({ ...staging, vars: { ...staging.vars, MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: JSON.stringify(policy) } }, 'staging')).toThrow()
  })
  it('requires a complete preparation policy with one reviewed successor and matching bootstrap', () => {
    const current = config()
    const source = JSON.parse(current.vars.MANAGED_TRANSFER_EXECUTION_POLICY)
    const destination = JSON.parse(current.vars.MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY)
    expect(source).toMatchObject({ kind: 'managed-draft-transfer', namespace: 'xeroflow-page-studio-dispatch-staging', to: destination.to })
    expect(current.vars.PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST).toBe(destination.from.digest)
    for (const change of [
      { MANAGED_TRANSFER_EXECUTION_POLICY: undefined },
      { PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST: undefined },
      { PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST: '0'.repeat(64) },
      { MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify({ ...source, to: { ...source.to, digest: '0'.repeat(64) } }) },
      { MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify({ ...source, namespace: destination.namespace }) },
      { MANAGED_TRANSFER_EXECUTION_POLICY: JSON.stringify({ ...source, accountId: 'b'.repeat(32) }) }
    ]) expect(() => validateManagementTarget({ ...current, vars: { ...current.vars, ...change } }, 'production')).toThrow()
  })
  it('requires reviewed native preview activation and rejects cross-wired resources', () => {
    const current = config()
    for (const value of ['false', '', undefined]) {
      expect(() => validateManagementTarget({ ...current, vars: { ...current.vars, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: value } }, 'production')).toThrow()
    }
    expect(() => validateManagementTarget({ ...current, vars: { ...current.vars, PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio.xeroflow.io' } }, 'production')).toThrow()
    for (const binding of ['PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER', 'PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER']) {
      for (const service of ['xeroflow-provisioning-staging', 'xeroflow-content-router-production']) {
        expect(() => validateManagementTarget({ ...current, services: current.services.map((entry: { binding: string }) => entry.binding === binding ? { ...entry, service } : entry) }, 'production')).toThrow()
      }
    }
    expect(() => validateManagementTarget({ ...current, r2_buckets: current.r2_buckets.map((entry: { binding: string }) => entry.binding === 'PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS' ? { ...entry, bucket_name: 'xeroflow-page-studio-checkpoints-staging' } : entry) }, 'production')).toThrow()
    const staging = config('staging')
    expect(() => validateManagementTarget({ ...staging, vars: { ...staging.vars, PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false' } }, 'staging')).toThrow()
  })
  it('rejects an implicit or invented environment', () => {
    expect(() => validateManagementTarget(config(), undefined)).toThrow()
    expect(() => validateManagementTarget(config(), 'preview')).toThrow()
  })
})
