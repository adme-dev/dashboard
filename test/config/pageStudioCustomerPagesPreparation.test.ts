import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import { describe, expect, it } from 'vitest'
import { readCustomerActivation } from '../../server/utils/pageStudio/customerActivation'
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

function assertProductionSignupScope(environment: Environment) {
  expect(environment.services).toEqual(expect.arrayContaining(nativeServices))
  expect(environment.r2_buckets).toContainEqual(nativeBucket)
  expect(environment.vars).toMatchObject({
    PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED: 'true',
    PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT: '2026-10-22T12:00:00Z',
    PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED: 'true',
    PAGE_STUDIO_CUSTOMER_PREVIEW_EDITOR_ORIGIN: 'https://studio-customer-preview.xeroflow.io',
    PAGE_STUDIO_CUSTOMER_ORIGIN: 'https://app.xeroflow.io',
    PAGE_STUDIO_CUSTOMER_EMAIL_FROM: 'notification@xeroflow.io',
    PAGE_STUDIO_CUSTOMER_TERMS_VERSION: config.env.preview.vars.PAGE_STUDIO_CUSTOMER_TERMS_VERSION
  })
  expect(JSON.parse(environment.vars.PAGE_STUDIO_CUSTOMER_SIGNUP_EMAIL_HASHES)).toEqual(
    ['pgiurin@gmail.com', 'developer@adme.net.au'].map(email =>
      createHash('sha256').update(email.trim().toLowerCase(), 'utf8').digest('hex'))
  )
  for (const key of ['PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS', 'PAGE_STUDIO_STAGING_TENANT_ID']) {
    expect(environment.vars).not.toHaveProperty(key)
  }
}

describe('production Pages bounded native customer activation', () => {
  it('admits exactly two reviewed mailboxes until the fixed expiry without staging account scopes', () => {
    assertProductionSignupScope(config.env.production)
    expect(config.env.production.vars.PAGE_STUDIO_CUSTOMER_TERMS_VERSION).toBe('2026-08-02')
    for (const environment of [config, config.env.preview]) {
      for (const service of nativeServices) expect(environment.services ?? []).not.toContainEqual(service)
      expect(environment.r2_buckets ?? []).not.toContainEqual(nativeBucket)
    }
  })

  it('admits only the two genuine workspaces with the exact reviewed operator, expiry and caps', () => {
    const activation = readCustomerActivation(config.env.production.vars)
    expect(activation).toEqual({
      previewEnabled: true, cmsSetupEnabled: true, browserEnabled: true, editorEnabled: true,
      previewApprovals: [
        '64326ad7-7354-42e6-871d-8dea401a7798',
        'a8ca805f-751f-484a-b074-688f8a82fe41'
      ].map(workspaceId => ({ workspaceId, starterVersion: 'limousine-v1', policy: {
        approvalId: expect.stringMatching(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/),
        approvedBy: '6a5d2e15-315c-4790-b64e-5e3e17001c8e',
        expiresAt: '2026-10-22T12:00:00Z', pagesPerSiteLimit: 10, storageBytesLimit: 104857600,
        monthlyBuildLimit: 10, monthlyTrafficBytesLimit: 104857600
      } }))
    })
    expect(new Set(activation.previewApprovals.map(row => row.policy.approvalId)).size).toBe(2)
    for (const row of activation.previewApprovals) {
      expect(row.policy.expiresAt).toBe(config.env.production.vars.PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT)
    }
    for (const environment of [config, config.env.preview]) {
      expect(environment.vars).not.toHaveProperty('PAGE_STUDIO_CUSTOMER_ACTIVATION')
    }
  })

  it('keeps legacy scalar keys absent and production editor and Forms admission closed', () => {
    for (const key of [
      'PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED', 'PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED',
      'PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED', 'PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED',
      'PAGE_STUDIO_CUSTOMER_FORMS_ENABLED', 'PAGE_STUDIO_CUSTOMER_WORKSPACE_ENABLED',
      'PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED'
    ]) {
      expect(config.env.production.vars).not.toHaveProperty(key)
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
      if (branch === 'main') assertProductionSignupScope(flattened)
    } finally {
      await rm(repositoryRoot, { recursive: true, force: true })
    }
  })
})
