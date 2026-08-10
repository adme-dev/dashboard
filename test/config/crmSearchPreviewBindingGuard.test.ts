import { describe, expect, it } from 'vitest'

import { assertPreviewBindingReadback } from '../../scripts/crm-search/preview-binding-guard.mjs'

import {
  PREVIEW_CRM_SEARCH_RESOURCES,
  PRODUCTION_CRM_SEARCH_RESOURCES,
  assertPreviewIsolation,
  assertPagesEnvironmentIsolation,
  buildPagesEnvironmentInventory,
  inventoryPagesBindings
} from '../../scripts/crm-search/preview-binding-inventory'

describe('CRM search preview binding isolation', () => {
  it('pins every mutable preview identity away from production', () => {
    expect(assertPreviewIsolation({
      preview: PREVIEW_CRM_SEARCH_RESOURCES,
      production: PRODUCTION_CRM_SEARCH_RESOURCES
    })).toEqual({ ok: true })

    expect(PREVIEW_CRM_SEARCH_RESOURCES).toMatchObject({
      environment: 'preview',
      pages: { project: 'agency-dashboard', branch: 'preview' },
      worker: { name: 'agency-crm-search-consumer-preview' },
      vectorize: { crmSearch: 'agency-crm-search-preview' },
      queues: {
        primary: { name: 'agency-crm-search-index-preview', retentionSeconds: 1_209_600 },
        deadLetter: { name: 'agency-crm-search-index-preview-dlq', retentionSeconds: 1_209_600 }
      }
    })
  })

  it('fails closed when even one stateful preview target aliases production', () => {
    expect(() => assertPreviewIsolation({
      preview: {
        ...PREVIEW_CRM_SEARCH_RESOURCES,
        queues: PRODUCTION_CRM_SEARCH_RESOURCES.queues
      },
      production: PRODUCTION_CRM_SEARCH_RESOURCES
    })).toThrow('crm_search_preview_resource_alias')

    expect(() => assertPreviewIsolation({
      preview: {
        ...PREVIEW_CRM_SEARCH_RESOURCES,
        queues: {
          ...PREVIEW_CRM_SEARCH_RESOURCES.queues,
          primary: {
            ...PREVIEW_CRM_SEARCH_RESOURCES.queues.primary,
            name: 'agency-jobs'
          }
        }
      },
      production: PRODUCTION_CRM_SEARCH_RESOURCES
    })).toThrow('crm_search_preview_resource_alias')
  })

  it('inventories the full Pages mutable binding surface without collapsing R2 or Vectorize', () => {
    const inventory = inventoryPagesBindings()
    expect(inventory.mutableBindings).toEqual(expect.arrayContaining([
      'CACHE',
      'CRM_SEARCH_INDEX_QUEUE',
      'R2',
      'AI',
      'VECTORIZE',
      'SITE_INTELLIGENCE_VECTORIZE',
      'CRM_SEARCH_VECTORIZE',
      'BROWSER',
      'HYPERDRIVE'
    ]))
    expect(inventory.categories).toEqual(expect.arrayContaining([
      'kv', 'd1', 'queues', 'r2', 'ai', 'vectorize', 'browser', 'hyperdrive',
      'services', 'durable_objects', 'vars', 'secrets', 'pages'
    ]))
    expect(inventory.productionResourceNames).toEqual(expect.arrayContaining([
      'agency-jobs',
      'agency-files',
      'agency-search',
      '900b4b74ec41462cbbabebd0aa8775aa',
      'agency-workflows'
    ]))
  })

  it('requires exact post-provisioning readback for every preview identity', () => {
    const categories = [
      'ai', 'analytics_engine_datasets', 'browser', 'd1_databases', 'durable_objects', 'hyperdrive',
      'kv_namespaces', 'queues', 'r2_buckets', 'secrets', 'services', 'vars', 'vectorize'
    ]
    const readback = {
      pagesProject: 'agency-dashboard',
      pagesBranch: 'preview',
      worker: 'agency-crm-search-consumer-preview',
      vectorize: 'agency-crm-search-preview',
      queue: 'agency-crm-search-index-preview',
      deadLetterQueue: 'agency-crm-search-index-preview-dlq',
      retentionSeconds: 1_209_600,
      mutableBindings: inventoryPagesBindings().mutableBindings,
      pagesInventory: {
        version: 'crm-search-pages-environment-inventory-v1',
        production: {
          environment: 'production', categories,
          bindings: [{ category: 'r2_buckets', binding: 'FILES', target: 'agency-files' }]
        },
        preview: {
          environment: 'preview', categories,
          bindings: [{ category: 'r2_buckets', binding: 'FILES', target: 'agency-files-preview' }]
        }
      }
    }
    expect(assertPreviewBindingReadback(readback)).toEqual({ ok: true })
    expect(() => assertPreviewBindingReadback({
      ...readback,
      queue: 'agency-crm-search-index'
    })).toThrow('crm_search_preview_binding_readback_mismatch')
  })

  it('parses every explicit non-inheritable Pages category and rejects inherited, unknown, or production-equal state', () => {
    const fixture = {
      name: 'agency-dashboard',
      kv_namespaces: [{ binding: 'CACHE', id: 'prod-kv' }],
      queues: { producers: [{ binding: 'JOBS', queue: 'prod-jobs' }] },
      r2_buckets: [{ binding: 'FILES', bucket_name: 'prod-files' }],
      vectorize: [{ binding: 'SEARCH', index_name: 'prod-search' }],
      hyperdrive: [{ binding: 'DATABASE', id: 'prod-hyperdrive' }],
      services: [{ binding: 'WORKFLOWS', service: 'prod-workflows' }],
      durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room', script_name: 'prod-rooms' }] },
      ai: { binding: 'AI' },
      browser: { binding: 'BROWSER' },
      vars: { RELEASE_ENVIRONMENT: 'local' },
      env: {
        production: {
          kv_namespaces: [{ binding: 'CACHE', id: 'prod-kv' }],
          queues: { producers: [{ binding: 'JOBS', queue: 'prod-jobs' }] },
          r2_buckets: [{ binding: 'FILES', bucket_name: 'prod-files' }],
          vectorize: [{ binding: 'SEARCH', index_name: 'prod-search' }],
          hyperdrive: [{ binding: 'DATABASE', id: 'prod-hyperdrive' }],
          services: [{ binding: 'WORKFLOWS', service: 'prod-workflows' }],
          durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room', script_name: 'prod-rooms' }] },
          ai: { binding: 'AI' },
          browser: { binding: 'BROWSER' },
          vars: { RELEASE_ENVIRONMENT: 'production' }
        },
        preview: {
          kv_namespaces: [{ binding: 'CACHE', id: 'preview-kv' }],
          queues: { producers: [{ binding: 'JOBS', queue: 'preview-jobs' }] },
          r2_buckets: [{ binding: 'FILES', bucket_name: 'preview-files' }],
          vectorize: [{ binding: 'SEARCH', index_name: 'preview-search' }],
          hyperdrive: [{ binding: 'DATABASE', id: 'preview-hyperdrive' }],
          services: [{ binding: 'WORKFLOWS', service: 'preview-workflows' }],
          durable_objects: { bindings: [{ name: 'ROOMS', class_name: 'Room', script_name: 'preview-rooms' }] },
          ai: { binding: 'AI' },
          browser: { binding: 'BROWSER' },
          vars: { RELEASE_ENVIRONMENT: 'preview' }
        }
      }
    }
    const secrets = {
      production: [{ binding: 'DATABASE_URL', digest: 'a'.repeat(64) }],
      preview: [{ binding: 'DATABASE_URL', digest: 'b'.repeat(64) }]
    }
    const inventory = buildPagesEnvironmentInventory(fixture, secrets)
    expect(assertPagesEnvironmentIsolation(inventory)).toEqual({ ok: true })
    expect(inventory.production.categories).toEqual(inventory.preview.categories)
    expect(inventory.preview.bindings).toEqual(expect.arrayContaining([
      { category: 'kv_namespaces', binding: 'CACHE', target: 'preview-kv' },
      { category: 'secrets', binding: 'DATABASE_URL', target: 'b'.repeat(64) }
    ]))

    expect(() => buildPagesEnvironmentInventory({
      ...fixture,
      env: { ...fixture.env, preview: { ...fixture.env.preview, kv_namespaces: undefined } }
    }, secrets)).toThrow('crm_search_pages_environment_inherited')
    expect(() => buildPagesEnvironmentInventory({
      ...fixture,
      env: { ...fixture.env, preview: { ...fixture.env.preview, mystery_store: [] } }
    }, secrets)).toThrow('crm_search_pages_binding_unknown')
    expect(() => assertPagesEnvironmentIsolation(buildPagesEnvironmentInventory({
      ...fixture,
      env: {
        ...fixture.env,
        preview: { ...fixture.env.preview, r2_buckets: fixture.env.production.r2_buckets }
      }
    }, secrets))).toThrow('crm_search_pages_preview_resource_alias')
  })

  it('keeps the checked-in Pages production and preview environments explicit', () => {
    const inventory = inventoryPagesBindings()
    expect(inventory.environments).toEqual(['production', 'preview'])
    expect(inventory.inheritedCategories).toEqual([])
    expect(inventory.unknownCategories).toEqual([])
  })
})
