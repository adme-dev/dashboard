import { readFileSync } from 'node:fs'

import { parse } from 'smol-toml'

import {
  CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  CRM_SEARCH_QUEUE_RETENTION_SECONDS,
  type CrmSearchEnvironmentResources
} from './resource-manifest'

const ISSUED_AT = '2026-08-11T00:00:00.000Z'
const EXPIRES_AT = '2026-09-10T00:00:00.000Z'

export const PREVIEW_CRM_SEARCH_RESOURCES: CrmSearchEnvironmentResources = Object.freeze({
  version: CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  environment: 'preview',
  issuedAt: ISSUED_AT,
  expiresAt: EXPIRES_AT,
  readbackSource: 'cloudflare_api',
  plan: 'workers_paid',
  pages: {
    project: 'agency-dashboard',
    branch: 'preview',
    origin: 'https://preview.agency-dashboard.pages.dev'
  },
  worker: { name: 'agency-crm-search-consumer-preview' },
  vectorize: { crmSearch: 'agency-crm-search-preview' },
  queues: {
    primary: {
      name: 'agency-crm-search-index-preview',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    },
    deadLetter: {
      name: 'agency-crm-search-index-preview-dlq',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    }
  }
} satisfies CrmSearchEnvironmentResources)

export const PRODUCTION_CRM_SEARCH_RESOURCES: CrmSearchEnvironmentResources = Object.freeze({
  version: CRM_SEARCH_ENVIRONMENT_RESOURCE_MANIFEST_VERSION,
  environment: 'production',
  issuedAt: ISSUED_AT,
  expiresAt: EXPIRES_AT,
  readbackSource: 'cloudflare_api',
  plan: 'workers_paid',
  pages: {
    project: 'agency-dashboard',
    branch: 'main',
    origin: 'https://agency-dashboard-6cm.pages.dev'
  },
  worker: { name: 'agency-crm-search-consumer' },
  vectorize: { crmSearch: 'agency-crm-search' },
  queues: {
    primary: {
      name: 'agency-crm-search-index',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    },
    deadLetter: {
      name: 'agency-crm-search-index-dlq',
      retentionSeconds: CRM_SEARCH_QUEUE_RETENTION_SECONDS
    }
  }
} satisfies CrmSearchEnvironmentResources)

interface BindingRecord extends Record<string, unknown> {
  binding?: string
}

interface PagesWranglerConfig extends Record<string, unknown> {
  name?: string
  kv_namespaces?: BindingRecord[]
  queues?: { producers?: BindingRecord[] }
  r2_buckets?: BindingRecord[]
  ai?: BindingRecord
  vectorize?: BindingRecord[]
  browser?: BindingRecord
  hyperdrive?: BindingRecord[]
  services?: BindingRecord[]
  vars?: Record<string, unknown>
}

const pagesConfig = parse(
  readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
) as PagesWranglerConfig

function values(records: BindingRecord[] | undefined, field: string): string[] {
  return (records ?? []).map(record => record[field]).filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  )
}

export const PAGES_BINDING_INVENTORY = Object.freeze({
  categories: [
    'kv', 'd1', 'queues', 'r2', 'ai', 'vectorize', 'browser', 'hyperdrive',
    'services', 'durable_objects', 'vars', 'secrets', 'pages'
  ],
  mutableBindings: [...new Set([
    'R2',
    ...values(pagesConfig.kv_namespaces, 'binding'),
    ...values(pagesConfig.queues?.producers, 'binding'),
    ...values(pagesConfig.r2_buckets, 'binding'),
    ...(pagesConfig.ai?.binding ? [pagesConfig.ai.binding] : []),
    ...values(pagesConfig.vectorize, 'binding'),
    ...(pagesConfig.browser?.binding ? [pagesConfig.browser.binding] : []),
    ...values(pagesConfig.hyperdrive, 'binding'),
    ...values(pagesConfig.services, 'binding'),
    ...Object.keys(pagesConfig.vars ?? {})
  ])].sort(),
  productionResourceNames: [...new Set([
    ...values(pagesConfig.kv_namespaces, 'id'),
    ...values(pagesConfig.queues?.producers, 'queue'),
    ...values(pagesConfig.r2_buckets, 'bucket_name'),
    ...values(pagesConfig.vectorize, 'index_name'),
    ...values(pagesConfig.hyperdrive, 'id'),
    ...values(pagesConfig.services, 'service')
  ])].sort()
})

export function inventoryPagesBindings() {
  return {
    categories: [...PAGES_BINDING_INVENTORY.categories],
    mutableBindings: [...PAGES_BINDING_INVENTORY.mutableBindings],
    productionResourceNames: [...PAGES_BINDING_INVENTORY.productionResourceNames]
  }
}

export function assertPreviewIsolation(input: {
  preview: CrmSearchEnvironmentResources
  production: CrmSearchEnvironmentResources
}): { ok: true } {
  const { preview, production } = input
  const previewMutable = [
    preview.pages.origin,
    preview.worker.name,
    preview.vectorize.crmSearch,
    preview.queues.primary.name,
    preview.queues.deadLetter.name
  ]
  const productionMutable = new Set([
    ...PAGES_BINDING_INVENTORY.productionResourceNames,
    production.pages.origin,
    production.worker.name,
    production.vectorize.crmSearch,
    production.queues.primary.name,
    production.queues.deadLetter.name
  ])
  if (previewMutable.some(value => productionMutable.has(value))) {
    throw new Error('crm_search_preview_resource_alias')
  }
  if (
    preview.environment !== 'preview'
    || production.environment !== 'production'
    || preview.pages.project !== 'agency-dashboard'
    || preview.pages.branch !== 'preview'
    || production.pages.branch !== 'main'
    || preview.worker.name !== 'agency-crm-search-consumer-preview'
    || preview.vectorize.crmSearch !== 'agency-crm-search-preview'
    || preview.queues.primary.name !== 'agency-crm-search-index-preview'
    || preview.queues.deadLetter.name !== 'agency-crm-search-index-preview-dlq'
  ) throw new Error('crm_search_preview_manifest_invalid')

  if (
    preview.queues.primary.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
    || preview.queues.deadLetter.retentionSeconds !== CRM_SEARCH_QUEUE_RETENTION_SECONDS
  ) throw new Error('crm_search_preview_retention_invalid')
  return { ok: true }
}
