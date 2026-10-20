import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

describe('private Page Studio management deployment configuration', () => {
  it.each([
    ['staging', '3865ea5568234fc7b0e9e3e595a30286'],
    ['production', '90228af3e2cc461bbc09accc3b47bd9f']
  ])('%s is private and uses its exact fresh Hyperdrive binding', (environment, id) => {
    const config = JSON.parse(readFileSync(fileURLToPath(new URL(`../../workers/page-studio-management/wrangler.${environment}.jsonc`, import.meta.url)), 'utf8'))
    expect(config.name).toBe(`xeroflow-page-studio-management-${environment}`)
    expect(config.account_id).toBe('a5b299b3ad15c1b5b895dc66f9357b17')
    expect(config.main).toBe('src/index.ts')
    expect(config.tsconfig).toBe('tsconfig.json')
    expect(config.compatibility_date).toBe('2026-07-15')
    expect(config.compatibility_flags).toEqual(['nodejs_compat'])
    expect(config.workers_dev).toBe(false)
    expect(config.preview_urls).toBe(false)
    expect(config.routes).toEqual([])
    expect(config.route).toBeUndefined()
    expect(config.triggers).toEqual({ crons: [] })
    const { MANAGED_TRANSFER_DESTINATION_EXECUTION_POLICY: destinationPolicy, MANAGED_TRANSFER_EXECUTION_POLICY: sourcePolicy, ...vars } = config.vars
    expect(environment === 'production' ? JSON.parse(destinationPolicy).kind : destinationPolicy).toBe(environment === 'production' ? 'managed-draft-import' : undefined)
    expect(environment === 'production' ? JSON.parse(sourcePolicy).kind : sourcePolicy).toBe(environment === 'production' ? 'managed-draft-transfer' : undefined)
    expect(vars).toEqual({ PAGE_STUDIO_RELEASE_ENVIRONMENT: environment,
      ...(environment === 'production'
        ? {
            PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'production',
            PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false',
            PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io',
            PAGE_STUDIO_CONTENT_ATTACHMENT_RUNTIME_DIGEST: '2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83',
            PAGE_STUDIO_CONTENT_ATTACHMENT_SCHEMA_DIGEST: '012054889e832d8753033811f9a6306d0b9f90a552c9f0a0af9ec5a6f62d435a',
            PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID: 'a5b299b3ad15c1b5b895dc66f9357b17',
            PAGE_STUDIO_CLOUDFLARE_ZONE_ID: '8e38cbf3910d291dd218710296661073',
            PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET: 'sites.xeroflow.io',
            PAGE_STUDIO_DOMAIN_IDENTITY_MODE: 'standard',
            PAGE_STUDIO_CMS_STAGING_ACTION_RUNTIME_DIGEST: 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e',
            PAGE_STUDIO_CMS_STAGING_OBJECT_TRANSPORT: 'placed-fetch'
          }
        : { PAGE_STUDIO_CMS_OBJECT_TRANSPORT: 'placed-fetch', PAGE_STUDIO_ACTION_RUNTIME_DIGEST: 'c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e' }) })
    expect(config.hyperdrive).toEqual([{ binding: 'HYPERDRIVE_FRESH', id }])
    expect(config.services).toEqual(environment === 'production'
      ? [{ binding: 'PAGE_STUDIO_CLIENT_STAGING', service: 'xeroflow-page-studio-client-staging' },
          { binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-production' },
          { binding: 'PAGE_STUDIO_CMS_STAGING_CONTENT_ROUTER', service: 'xeroflow-content-router-staging' },
          { binding: 'PAGE_STUDIO_PROVISIONER', service: 'xeroflow-provisioning-production' },
          { binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER', service: 'xeroflow-provisioning-native-preview' },
          { binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER', service: 'xeroflow-content-router-native-preview' }]
      : [{ binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: 'xeroflow-content-router-staging' }])
    expect(config.r2_buckets).toEqual([{ binding: 'PAGE_STUDIO_CHECKPOINTS', bucket_name: `xeroflow-page-studio-checkpoints${environment === 'staging' ? '-staging' : ''}` },
      ...(environment === 'production'
        ? [{ binding: 'PAGE_STUDIO_CMS_STAGING_CHECKPOINTS', bucket_name: 'xeroflow-page-studio-checkpoints-staging' },
            { binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS', bucket_name: 'xeroflow-page-studio-checkpoints-native-preview' }]
        : [])])
  })
})
