import { describe, expect, it, vi } from 'vitest'

import {
  applyPagesPreviewIsolation,
  buildPagesPreviewIsolationPatch,
  previewDeploymentDigest
} from '../../scripts/crm-search/pages-preview-isolation-adapter.mjs'

const accountId = 'a5b299b3ad15c1b5b895dc66f9357b17'
const projectName = 'agency-dashboard'

function project() {
  return {
    name: projectName,
    production_branch: 'main',
    deployment_configs: {
      production: {
        env_vars: {
          DATABASE_URL: { type: 'secret_text', value: '' },
          MCP_SERVER_ENABLED: { type: 'plain_text', value: 'true' }
        },
        kv_namespaces: { CACHE: { namespace_id: 'production-kv' } },
        r2_buckets: { MEDIA_BUCKET: { name: 'agency-files' } },
        queue_producers: { JOBS_QUEUE: { name: 'agency-jobs' } },
        durable_object_namespaces: {
          CHAT_ROOMS: { namespace_id: 'production-do', class_name: 'ChatRoom', service: 'chat' }
        },
        service_bindings: { AGENCY_WORKFLOWS: { service: 'agency-workflows' } }
      },
      preview: {
        env_vars: {
          DATABASE_URL: { type: 'secret_text', value: '' },
          MCP_SERVER_ENABLED: { type: 'plain_text', value: 'true' },
          SEND_ENABLED: { type: 'plain_text', value: 'true' },
          APP_NAME: { type: 'plain_text', value: 'XeroFlow Agency' }
        },
        kv_namespaces: { CACHE: { namespace_id: 'production-kv' } },
        r2_buckets: { MEDIA_BUCKET: { name: 'agency-files' } },
        queue_producers: { JOBS_QUEUE: { name: 'agency-jobs' } },
        durable_object_namespaces: {
          CHAT_ROOMS: { namespace_id: 'production-do', class_name: 'ChatRoom', service: 'chat' }
        },
        service_bindings: { AGENCY_WORKFLOWS: { service: 'agency-workflows' } },
        vectorize_bindings: { VECTORIZE: { index_name: 'agency-search' } },
        hyperdrive_bindings: { HYPERDRIVE: { id: 'production-hyperdrive' } },
        ai_bindings: { AI: {} },
        browsers: { BROWSER: {} }
      }
    }
  }
}

function isolatedProject() {
  const value = project()
  value.deployment_configs.preview = {
    env_vars: {
      APP_NAME: { type: 'plain_text', value: 'XeroFlow Agency' },
      CRM_SEARCH_RELEASE_ENVIRONMENT: { type: 'plain_text', value: 'preview' },
      CRM_SEARCH_PROVIDER_APIS_ENABLED: { type: 'plain_text', value: 'false' },
      MCP_SERVER_ENABLED: { type: 'plain_text', value: 'false' },
      MCP_WORKER_ORIGIN: { type: 'plain_text', value: '' },
      PERSONA_AUDIENCE_PROVIDER_WRITES_ENABLED: { type: 'plain_text', value: 'false' },
      PERSONA_META_AUDIENCE_WRITES_ENABLED: { type: 'plain_text', value: 'false' },
      PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED: { type: 'plain_text', value: 'false' },
      AGENCY_WORKFLOWS_ENABLED: { type: 'plain_text', value: 'false' },
      AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED: { type: 'plain_text', value: 'false' },
      AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY: { type: 'plain_text', value: 'false' },
      SEARCH_AUTHORITY_ENABLED: { type: 'plain_text', value: 'false' },
      NUXT_SEARCH_AUTHORITY_ENABLED: { type: 'plain_text', value: 'false' },
      NUXT_PUBLIC_SEARCH_AUTHORITY_ENABLED: { type: 'plain_text', value: 'false' },
      SEND_ENABLED: { type: 'plain_text', value: 'false' },
      SEND_PUBLIC_ENABLED: { type: 'plain_text', value: 'false' },
      NUXT_SEND_ENABLED: { type: 'plain_text', value: 'false' },
      NUXT_PUBLIC_SEND_ENABLED: { type: 'plain_text', value: 'false' },
      NUXT_PUBLIC_SEND_PUBLIC_ENABLED: { type: 'plain_text', value: 'false' },
      SITE_INTELLIGENCE_ENABLED: { type: 'plain_text', value: 'false' },
      SITE_INTELLIGENCE_AI_ENABLED: { type: 'plain_text', value: 'false' }
    },
    kv_namespaces: {},
    r2_buckets: {},
    queue_producers: {},
    durable_object_namespaces: {},
    service_bindings: {},
    vectorize_bindings: {},
    hyperdrive_bindings: {},
    ai_bindings: {},
    browsers: {}
  }
  return value
}

describe('CRM search Pages preview isolation adapter', () => {
  it('builds a deletion patch for every inherited mutable binding and secret', () => {
    const patch = buildPagesPreviewIsolationPatch(project())

    expect(patch.deployment_configs.preview).toMatchObject({
      kv_namespaces: { CACHE: null },
      r2_buckets: { MEDIA_BUCKET: null },
      queue_producers: { JOBS_QUEUE: null },
      durable_object_namespaces: { CHAT_ROOMS: null },
      service_bindings: { AGENCY_WORKFLOWS: null },
      vectorize_bindings: { VECTORIZE: null },
      hyperdrive_bindings: { HYPERDRIVE: null },
      ai_bindings: { AI: null },
      browsers: { BROWSER: null },
      env_vars: {
        DATABASE_URL: null,
        MCP_SERVER_ENABLED: { type: 'plain_text', value: 'false' },
        SEND_ENABLED: { type: 'plain_text', value: 'false' },
        CRM_SEARCH_RELEASE_ENVIRONMENT: { type: 'plain_text', value: 'preview' }
      }
    })
    expect(JSON.stringify(patch)).not.toContain('production-kv')
  })

  it('hashes normalized configuration without encrypted values', () => {
    const first = previewDeploymentDigest(project().deployment_configs.preview)
    const changedSecret = project()
    changedSecret.deployment_configs.preview.env_vars.DATABASE_URL.value = 'not-readable-anyway'
    expect(previewDeploymentDigest(changedSecret.deployment_configs.preview)).toBe(first)
  })

  it('patches only the preview config and proves production stayed byte-equivalent', async () => {
    const before = project()
    const after = isolatedProject()
    const request = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after)
      .mockResolvedValueOnce(after)

    const result = await applyPagesPreviewIsolation({
      accountId,
      projectName,
      apiToken: 'oauth-token-not-logged',
      executeFlag: 'EXECUTE CRM SEARCH PREVIEW ISOLATION',
      request
    })

    expect(result).toMatchObject({
      accountId,
      projectName,
      environment: 'preview',
      status: 'isolated',
      productionUnchanged: true
    })
    expect(result.beforeDigest).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.afterDigest).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.afterDigest).not.toBe(result.beforeDigest)
    expect(request).toHaveBeenNthCalledWith(1, {
      method: 'GET', accountId, projectName, apiToken: 'oauth-token-not-logged'
    })
    expect(request).toHaveBeenNthCalledWith(2, expect.objectContaining({
      method: 'PATCH', accountId, projectName, apiToken: 'oauth-token-not-logged'
    }))
    expect(request.mock.calls[1]?.[0].body).not.toHaveProperty('deployment_configs.production')
  })

  it('fails closed without the exact flag or when production changes during the write', async () => {
    await expect(applyPagesPreviewIsolation({
      accountId,
      projectName,
      apiToken: 'oauth-token-not-logged',
      executeFlag: 'yes',
      request: vi.fn()
    })).rejects.toThrow('crm_search_preview_isolation_authorization_required')

    const before = project()
    const after = isolatedProject()
    after.deployment_configs.production.env_vars.MCP_SERVER_ENABLED.value = 'false'
    const request = vi.fn()
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(after)
      .mockResolvedValueOnce(after)
    await expect(applyPagesPreviewIsolation({
      accountId,
      projectName,
      apiToken: 'oauth-token-not-logged',
      executeFlag: 'EXECUTE CRM SEARCH PREVIEW ISOLATION',
      request
    })).rejects.toThrow('crm_search_preview_isolation_production_drift')
  })
})
