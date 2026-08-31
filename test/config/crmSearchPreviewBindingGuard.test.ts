import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import { assertPreviewBindingReadback } from '../../scripts/crm-search/preview-binding-guard.mjs'

import {
  assertPreviewIsolation,
  assertPagesEnvironmentIsolation,
  buildCrmSearchEnvironmentResources,
  buildPagesEnvironmentInventory,
  inventoryPagesBindings
} from '../../scripts/crm-search/preview-binding-inventory'

const externalIntegrationNames = [
  'database', 'provider_apis', 'ai_gateway', 'mcp', 'meta', 'google', 'meta_audiences',
  'google_audiences', 'xero', 'email_delivery', 'monday', 'slack',
  'outbound_webhooks', 'google_sheets', 'social_dashboard'
] as const
const targetDigest = (value: string) => createHash('sha256').update(value).digest('hex')
const disabledIntegrations = () => externalIntegrationNames.map(name => ({
  name, state: 'disabled' as const, targetIdentityDigest: null,
  verifiedAt: '2026-08-11T00:00:00.000Z'
}))
const enabledIntegrations = (environment: string) => externalIntegrationNames.map(name => ({
  name, state: 'enabled' as const,
  targetIdentityDigest: targetDigest(`${environment}:${name}`),
  verifiedAt: '2026-08-11T00:00:00.000Z'
}))
const previewIntegrationReadbacks = () => externalIntegrationNames.map(name => ({
  name, enabled: name === 'database', targetIdentity: name === 'database' ? 'preview:database' : null,
  verifiedAt: '2026-08-11T00:00:00.000Z', source: 'cloudflare_api' as const
}))
const previewIntegrations = () => externalIntegrationNames.map(name => ({
  name,
  state: name === 'database' ? 'enabled' as const : 'disabled' as const,
  targetIdentityDigest: name === 'database' ? targetDigest('preview:database') : null,
  verifiedAt: '2026-08-11T00:00:00.000Z'
}))
const enabledIntegrationReadbacks = (environment: string) => externalIntegrationNames.map(name => ({
  name,
  enabled: true,
  targetIdentity: name === 'ai_gateway'
    ? `https://gateway.example.com/${environment}`
    : name === 'mcp' ? 'https://mcp.example.com' : `${environment}:${name}`,
  verifiedAt: '2026-08-11T00:00:00.000Z', source: 'cloudflare_api' as const
}))
const productionIntegrationReadbacks = () => externalIntegrationNames.map((name) => {
  const disabled = name === 'provider_apis'
  return {
    name, enabled: !disabled,
    targetIdentity: disabled
      ? null
      : name === 'ai_gateway'
        ? 'https://gateway.ai.cloudflare.com/v1/a5b299b3ad15c1b5b895dc66f9357b17/default'
        : name === 'mcp' ? 'https://mcp-server.adme-dev.workers.dev' : `production:${name}`,
    verifiedAt: '2026-08-11T00:00:00.000Z', source: 'cloudflare_api' as const
  }
})
const previewResources = buildCrmSearchEnvironmentResources(
  'preview', previewIntegrationReadbacks()
)
const productionResources = buildCrmSearchEnvironmentResources(
  'production', productionIntegrationReadbacks()
)

describe('CRM search preview binding isolation', () => {
  it('pins every mutable preview identity away from production', () => {
    expect(assertPreviewIsolation({
      preview: previewResources,
      production: productionResources
    })).toEqual({ ok: true })

    expect(previewResources).toMatchObject({
      environment: 'preview',
      pages: { project: 'agency-dashboard', branch: 'preview' },
      worker: { name: 'agency-crm-search-consumer-preview' },
      vectorize: { crmSearch: 'agency-crm-search-preview' },
      queues: {
        primary: { name: 'agency-crm-search-index-preview', retentionSeconds: 1_209_600 },
        deadLetter: { name: 'agency-crm-search-index-preview-dlq', retentionSeconds: 1_209_600 }
      }
    })
    expect(previewResources.externalIntegrations).toEqual(previewIntegrations())
  })

  it('fails closed when even one stateful preview target aliases production', () => {
    expect(() => assertPreviewIsolation({
      preview: {
        ...previewResources,
        queues: productionResources.queues
      },
      production: productionResources
    })).toThrow('crm_search_preview_resource_alias')

    expect(() => assertPreviewIsolation({
      preview: {
        ...previewResources,
        queues: {
          ...previewResources.queues,
          primary: {
            ...previewResources.queues.primary,
            name: 'agency-jobs'
          }
        }
      },
      production: productionResources
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
          integrations: enabledIntegrations('production'),
          bindings: [{ category: 'r2_buckets', binding: 'FILES', target: 'agency-files' }]
        },
        preview: {
          environment: 'preview', categories,
          integrations: disabledIntegrations(),
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

  it('allows production bindings to be absent from preview while rejecting aliases under other names', () => {
    const categories = [
      'ai', 'analytics_engine_datasets', 'browser', 'd1_databases', 'durable_objects',
      'hyperdrive', 'kv_namespaces', 'queues', 'r2_buckets', 'secrets', 'services',
      'vars', 'vectorize'
    ]
    const base = {
      pagesProject: 'agency-dashboard', pagesBranch: 'preview',
      worker: 'agency-crm-search-consumer-preview', vectorize: 'agency-crm-search-preview',
      queue: 'agency-crm-search-index-preview',
      deadLetterQueue: 'agency-crm-search-index-preview-dlq', retentionSeconds: 1_209_600,
      mutableBindings: ['CRM_SEARCH_INDEX_QUEUE', 'CRM_SEARCH_VECTORIZE', 'DATABASE_URL'],
      pagesInventory: {
        version: 'crm-search-pages-environment-inventory-v1',
        production: {
          environment: 'production', categories, integrations: enabledIntegrations('production'),
          bindings: [
            { category: 'r2_buckets', binding: 'FILES', target: 'agency-files' },
            { category: 'queues', binding: 'JOBS', target: 'agency-jobs' },
            { category: 'secrets', binding: 'DATABASE_URL', target: 'a'.repeat(64) }
          ]
        },
        preview: {
          environment: 'preview', categories, integrations: disabledIntegrations(),
          bindings: [
            { category: 'queues', binding: 'CRM_SEARCH_INDEX_QUEUE', target: 'agency-crm-search-index-preview' },
            { category: 'vectorize', binding: 'CRM_SEARCH_VECTORIZE', target: 'agency-crm-search-preview' },
            { category: 'secrets', binding: 'DATABASE_URL', target: 'b'.repeat(64) }
          ]
        }
      }
    }
    expect(assertPreviewBindingReadback(base)).toEqual({ ok: true })
    expect(() => assertPreviewBindingReadback({
      ...base,
      pagesInventory: {
        ...base.pagesInventory,
        preview: {
          ...base.pagesInventory.preview,
          bindings: [
            ...base.pagesInventory.preview.bindings,
            { category: 'r2_buckets', binding: 'OTHER_FILES', target: 'agency-files' }
          ]
        }
      }
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
          vars: {
            RELEASE_ENVIRONMENT: 'production', CRM_SEARCH_PROVIDER_APIS_ENABLED: 'true',
            AI_GATEWAY_URL: 'https://gateway.example.com/production', MCP_SERVER_ENABLED: 'true',
            MCP_WORKER_ORIGIN: 'https://mcp.example.com',
            PERSONA_META_AUDIENCE_WRITES_ENABLED: 'true',
            PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: 'true'
          }
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
          vars: {
            RELEASE_ENVIRONMENT: 'preview', CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false',
            AI_GATEWAY_URL: '', MCP_SERVER_ENABLED: 'false', MCP_WORKER_ORIGIN: '',
            PERSONA_META_AUDIENCE_WRITES_ENABLED: 'false',
            PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: 'false'
          }
        }
      }
    }
    const secrets = {
      production: [{ binding: 'DATABASE_URL', digest: 'a'.repeat(64) }],
      preview: [{ binding: 'DATABASE_URL', digest: 'b'.repeat(64) }]
    }
    const integrations = {
      production: enabledIntegrationReadbacks('production'),
      preview: previewIntegrationReadbacks()
    }
    const inventory = buildPagesEnvironmentInventory(fixture, secrets, integrations)
    expect(assertPagesEnvironmentIsolation(inventory)).toEqual({ ok: true })
    expect(inventory.production.categories).toEqual(inventory.preview.categories)
    expect(inventory.preview.bindings).toEqual(expect.arrayContaining([
      { category: 'kv_namespaces', binding: 'CACHE', target: 'preview-kv' },
      { category: 'secrets', binding: 'DATABASE_URL', target: 'b'.repeat(64) }
    ]))

    expect(() => buildPagesEnvironmentInventory({
      ...fixture,
      env: { ...fixture.env, preview: { ...fixture.env.preview, kv_namespaces: undefined } }
    }, secrets, integrations)).toThrow('crm_search_pages_environment_inherited')
    expect(() => buildPagesEnvironmentInventory({
      ...fixture,
      env: { ...fixture.env, preview: { ...fixture.env.preview, mystery_store: [] } }
    }, secrets, integrations)).toThrow('crm_search_pages_binding_unknown')
    expect(() => assertPagesEnvironmentIsolation(buildPagesEnvironmentInventory({
      ...fixture,
      env: {
        ...fixture.env,
        preview: { ...fixture.env.preview, r2_buckets: fixture.env.production.r2_buckets }
      }
    }, secrets, integrations))).toThrow('crm_search_pages_preview_resource_alias')

    const aliasedIntegrations = buildPagesEnvironmentInventory(fixture, secrets, integrations)
    expect(() => assertPagesEnvironmentIsolation({
      ...aliasedIntegrations,
      preview: {
        ...aliasedIntegrations.preview,
        integrations: aliasedIntegrations.preview.integrations.map(target => target.name === 'database'
          ? { ...aliasedIntegrations.production.integrations[0] }
          : target)
      }
    })).toThrow('crm_search_pages_preview_integration_alias')
    expect(() => buildPagesEnvironmentInventory(fixture, secrets, {
      production: enabledIntegrationReadbacks('production'),
      preview: enabledIntegrationReadbacks('preview').map((target, index) => index === 0
        ? { ...target, targetIdentity: null }
        : target)
    })).toThrow('crm_search_pages_integration_inventory_invalid')
  })

  it('derives signed integration state and target digests from normalized config readback', () => {
    const fixture = {
      name: 'agency-dashboard',
      env: {
        production: {
          vars: {
            CRM_SEARCH_PROVIDER_APIS_ENABLED: 'true',
            AI_GATEWAY_URL: 'https://gateway.ai.cloudflare.com/v1/account/production',
            MCP_SERVER_ENABLED: 'true',
            MCP_WORKER_ORIGIN: 'https://mcp-production.example.com',
            PERSONA_META_AUDIENCE_WRITES_ENABLED: 'true',
            PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: 'true'
          }
        },
        preview: {
          vars: {
            CRM_SEARCH_PROVIDER_APIS_ENABLED: 'false',
            AI_GATEWAY_URL: '',
            MCP_SERVER_ENABLED: 'false',
            MCP_WORKER_ORIGIN: '',
            PERSONA_META_AUDIENCE_WRITES_ENABLED: 'false',
            PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: 'false'
          }
        }
      }
    }
    const secrets = {
      production: [{ binding: 'DATABASE_URL', digest: 'a'.repeat(64) }],
      preview: [{ binding: 'SESSION_SECRET', digest: 'b'.repeat(64) }]
    }
    const readbacks = {
      production: externalIntegrationNames.map(name => ({
        name,
        enabled: ['database', 'provider_apis', 'ai_gateway', 'mcp', 'meta', 'google', 'meta_audiences', 'google_audiences'].includes(name),
        targetIdentity: ['database', 'provider_apis', 'ai_gateway', 'mcp', 'meta', 'google', 'meta_audiences', 'google_audiences'].includes(name)
          ? name === 'ai_gateway'
            ? 'https://gateway.ai.cloudflare.com/v1/account/production'
            : name === 'mcp' ? 'https://mcp-production.example.com' : `production:${name}`
          : null,
        verifiedAt: '2026-08-11T00:00:00.000Z',
        source: 'cloudflare_api'
      })),
      preview: externalIntegrationNames.map(name => ({
        name, enabled: false, targetIdentity: null,
        verifiedAt: '2026-08-11T00:00:00.000Z', source: 'cloudflare_api'
      }))
    }

    const inventory = buildPagesEnvironmentInventory(fixture, secrets, readbacks)
    expect(inventory.production.integrations.find(value => value.name === 'mcp')).toEqual({
      name: 'mcp', state: 'enabled',
      targetIdentityDigest: targetDigest('https://mcp-production.example.com/'),
      verifiedAt: '2026-08-11T00:00:00.000Z'
    })
    expect(inventory.preview.integrations.find(value => value.name === 'mcp')).toEqual({
      name: 'mcp', state: 'disabled', targetIdentityDigest: null,
      verifiedAt: '2026-08-11T00:00:00.000Z'
    })
    expect(assertPagesEnvironmentIsolation(inventory)).toEqual({ ok: true })

    expect(() => buildPagesEnvironmentInventory(fixture, secrets, {
      ...readbacks,
      preview: readbacks.preview.map(value => value.name === 'mcp'
        ? { ...value, enabled: true, targetIdentity: 'production:mcp' }
        : value)
    })).toThrow('crm_search_pages_integration_config_mismatch')
  })

  it('keeps the checked-in Pages production and preview environments explicit', () => {
    const inventory = inventoryPagesBindings()
    expect(inventory.environments).toEqual(['production', 'preview'])
    expect(inventory.inheritedCategories).toEqual([])
    expect(inventory.unknownCategories).toEqual([])
    const config = readFileSync(new URL('../../wrangler.toml', import.meta.url), 'utf8')
    const previewVars = config.slice(config.indexOf('[env.preview.vars]'))
    for (const flag of [
      'SEARCH_AUTHORITY_ENABLED', 'NUXT_SEARCH_AUTHORITY_ENABLED',
      'NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED', 'PERSONA_AUDIENCE_PROVIDER_WRITES_ENABLED',
      'PERSONA_META_AUDIENCE_WRITES_ENABLED', 'PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED',
      'CRM_SEARCH_PROVIDER_APIS_ENABLED', 'MCP_SERVER_ENABLED', 'AGENCY_WORKFLOWS_ENABLED',
      'SITE_INTELLIGENCE_ENABLED', 'SEND_ENABLED', 'SEND_PUBLIC_ENABLED'
    ]) expect(previewVars).toContain(`${flag} = "false"`)
    expect(previewVars).toContain('AI_GATEWAY_URL = ""')
    expect(previewVars).toContain('MCP_WORKER_ORIGIN = ""')
    const previewBindings = config.slice(
      config.indexOf('[env.preview]'), config.indexOf('[env.preview.vars]')
    )
    expect(previewBindings).toContain('queue = "agency-crm-search-index-preview"')
    expect(previewBindings).toContain('index_name = "agency-crm-search-preview"')
    expect(previewBindings).toContain('binding = "HYPERDRIVE"')
    expect(previewBindings).toContain('binding = "HYPERDRIVE_FRESH"')
    expect(previewBindings).toContain('id = "3865ea5568234fc7b0e9e3e595a30286"')
    expect(previewBindings).not.toContain('900b4b74ec41462cbbabebd0aa8775aa')
    expect(previewBindings).not.toContain('90228af3e2cc461bbc09accc3b47bd9f')
    expect(previewBindings).toContain('binding = "PAGE_STUDIO_BUILD"')
    expect(previewBindings).toContain('service = "xeroflow-page-studio-build-staging"')
    expect(previewBindings).toContain('binding = "PAGE_STUDIO_DELIVERY"')
    expect(previewBindings).toContain('service = "xeroflow-page-studio-delivery-staging"')
    expect(previewBindings.match(/\[\[env\.preview\.services\]\]/gu)).toHaveLength(2)
    expect(previewBindings.match(/^service = /gmu)).toHaveLength(2)
    expect(previewBindings).not.toMatch(/agency-files|durable_objects/u)
  })
})
