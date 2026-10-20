import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { flattenRedirectedPagesConfig } from '../../scripts/deploy-pages.mjs'

type Environment = {
  vars: Record<string, string>
  services: { binding: string, service: string }[]
  r2_buckets: { binding: string, bucket_name: string }[]
}
type PagesConfig = Environment & { env: Record<'production' | 'preview', Environment> }
const config = parse(await readFile(new URL('../../wrangler.toml', import.meta.url), 'utf8')) as unknown as PagesConfig
const nativeServices = [
  { binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_PROVISIONER', service: 'xeroflow-provisioning-native-preview' },
  { binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_CONTENT_ROUTER', service: 'xeroflow-content-router-native-preview' },
  { binding: 'PAGE_STUDIO_CUSTOMER_EMAIL', service: 'xeroflow-page-studio-customer-email-production' }
]
const nativeBucket = {
  binding: 'PAGE_STUDIO_CUSTOMER_PREVIEW_CHECKPOINTS',
  bucket_name: 'xeroflow-page-studio-checkpoints-native-preview'
}

function assertProductionPreparation(environment: Environment) {
  expect(environment.services).toEqual(expect.arrayContaining(nativeServices))
  expect(environment.r2_buckets).toContainEqual(nativeBucket)
  expect(environment.vars).toMatchObject({
    PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'false',
    PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'false',
    PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io',
    PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://app.xeroflow.io',
    PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'notification@xeroflow.io',
    PAGE_STUDIO_CUSTOMER_TERMS_VERSION: config.env.preview.vars.PAGE_STUDIO_CUSTOMER_TERMS_VERSION
  })
  for (const key of ['PAGE_STUDIO_CUSTOMER_SIGNUP_EMAIL_HASHES', 'PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT', 'PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS', 'PAGE_STUDIO_STAGING_TENANT_ID']) {
    expect(environment.vars).not.toHaveProperty(key)
  }
}

describe('production Pages native customer preparation', () => {
  it('prepares dormant production resources without copying staging account scopes', () => {
    assertProductionPreparation(config.env.production)
    expect(config.env.production.vars.PAGE_STUDIO_CUSTOMER_TERMS_VERSION).toBe('2026-08-02')
    for (const environment of [config, config.env.preview]) {
      for (const service of nativeServices) expect(environment.services ?? []).not.toContainEqual(service)
      expect(environment.r2_buckets ?? []).not.toContainEqual(nativeBucket)
    }
  })

  it.each(['production', 'preview'] as const)('preserves established %s content and provisioning resources', (name) => {
    const environment = config.env[name]
    const suffix = name === 'preview' ? 'staging' : 'production'
    expect(environment.services).toEqual(expect.arrayContaining([
      { binding: 'PAGE_STUDIO_PROVISIONER', service: `xeroflow-provisioning-${suffix}` },
      { binding: 'PAGE_STUDIO_CONTENT_ROUTER', service: `xeroflow-content-router-${suffix}` }
    ]))
    expect(environment.vars.PAGE_STUDIO_CONTENT_ENVIRONMENT).toBe(suffix)
    expect(environment.r2_buckets).toContainEqual({
      binding: 'PAGE_STUDIO_CHECKPOINTS',
      bucket_name: name === 'preview' ? 'xeroflow-page-studio-checkpoints-staging' : 'xeroflow-page-studio-checkpoints'
    })
    if (name === 'preview') expect(environment.services).toContainEqual({
      binding: 'PAGE_STUDIO_CUSTOMER_EMAIL', service: 'xeroflow-page-studio-customer-email-staging'
    })
  })

  it.each(['main', 'preview'])('retains the selected source environment when flattening %s', async (branch) => {
    const repositoryRoot = await mkdtemp(path.join(tmpdir(), 'customer-pages-preparation-'))
    try {
      await mkdir(path.join(repositoryRoot, '.wrangler/deploy'), { recursive: true })
      await mkdir(path.join(repositoryRoot, 'dist'), { recursive: true })
      await writeFile(path.join(repositoryRoot, '.wrangler/deploy/config.json'), JSON.stringify({ configPath: '../../dist/wrangler.json' }))
      await writeFile(path.join(repositoryRoot, 'dist/wrangler.json'), JSON.stringify(config))
      const generatedPath = flattenRedirectedPagesConfig({ repositoryRoot, branch })
      const flattened = JSON.parse(await readFile(generatedPath, 'utf8')) as Environment
      const source = config.env[branch === 'main' ? 'production' : 'preview']
      expect(flattened.vars).toEqual(source.vars)
      expect(flattened.services).toEqual(source.services.filter(service => !service.binding.startsWith('CRM_SEARCH_')))
      expect(flattened.r2_buckets).toEqual(source.r2_buckets.filter(bucket => !bucket.binding.startsWith('CRM_SEARCH_')))
      expect(flattened).not.toHaveProperty('env')
      if (branch === 'main') assertProductionPreparation(flattened)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })
})
