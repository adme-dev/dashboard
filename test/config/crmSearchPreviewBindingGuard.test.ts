import { describe, expect, it } from 'vitest'

import { assertPreviewBindingReadback } from '../../scripts/crm-search/preview-binding-guard.mjs'

import {
  PREVIEW_CRM_SEARCH_RESOURCES,
  PRODUCTION_CRM_SEARCH_RESOURCES,
  assertPreviewIsolation,
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
    const readback = {
      pagesProject: 'agency-dashboard',
      pagesBranch: 'preview',
      worker: 'agency-crm-search-consumer-preview',
      vectorize: 'agency-crm-search-preview',
      queue: 'agency-crm-search-index-preview',
      deadLetterQueue: 'agency-crm-search-index-preview-dlq',
      retentionSeconds: 1_209_600,
      mutableBindings: inventoryPagesBindings().mutableBindings
    }
    expect(assertPreviewBindingReadback(readback)).toEqual({ ok: true })
    expect(() => assertPreviewBindingReadback({
      ...readback,
      queue: 'agency-crm-search-index'
    })).toThrow('crm_search_preview_binding_readback_mismatch')
  })
})
