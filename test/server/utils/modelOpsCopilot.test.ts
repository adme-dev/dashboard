import { describe, expect, it } from 'vitest'

import { createModelOpsCopilotResponse } from '~~/server/utils/ai/modelOpsCopilot'
import type { AiModelAssignmentRow } from '~~/server/utils/ai/modelAssignments'
import type { CloudflareModelCatalogResult } from '~~/server/utils/ai/cloudflareModelCatalog'

const baseRow: AiModelAssignmentRow = {
  featureKey: 'banner_copy_suggest',
  label: 'Banner Studio copy suggestion',
  surface: '/agency/banner-studio',
  owner: 'Creative',
  provider: 'workers_ai',
  modelId: '@cf/meta/llama-3.1-8b-instruct',
  fallback: 'llama-3.1-8b-instant',
  modality: 'text',
  riskTier: 'medium',
  sourceFile: 'server/api/agency/banner-studio/ai/copy-suggest.post.ts',
  status: 'production',
  pricing: null,
  warnings: [],
  defaultProvider: 'workers_ai',
  defaultModelId: '@cf/meta/llama-3.1-8b-instruct',
  defaultFallback: 'llama-3.1-8b-instant',
  assignedProvider: 'workers_ai',
  assignedModelId: '@cf/meta/llama-3.1-8b-instruct',
  assignedFallback: 'llama-3.1-8b-instant',
  assignmentSource: 'default',
  assignmentEditable: true,
  assignmentNotes: null,
  assignmentUpdatedBy: null,
  assignmentUpdatedAt: null,
  runtimeRoutingStatus: 'runtime_routed',
  runtimeRoutingLabel: 'Runtime routed',
  runtimeControlEnabled: true,
  runtimeSupportedProviders: ['workers_ai', 'groq'],
  runtimeNotes: null,
}

const catalog: CloudflareModelCatalogResult = {
  available: true,
  configured: true,
  credentialSource: {
    accountId: 'CLOUDFLARE_ACCOUNT_ID',
    token: 'CLOUDFLARE_API_TOKEN',
  },
  source: 'cloudflare_api',
  reason: null,
  fetchedAt: '2026-06-26T00:00:00.000Z',
  models: [
    {
      id: '@cf/meta/llama-3.1-8b-instruct-fast',
      label: 'Llama 3.1 8B Instruct Fast',
      modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
      provider: 'workers_ai',
      providerLabel: 'Cloudflare',
      task: 'text_generation',
      taskLabel: 'Text Generation',
      modality: 'text',
      author: 'Meta',
      capabilities: ['function_calling'],
      source: 'cloudflare_hosted',
      status: 'production',
      description: null,
      raw: {},
    },
  ],
}

describe('Model Ops Copilot', () => {
  it('drafts an assignable recommendation for a runtime-controlled feature', () => {
    const result = createModelOpsCopilotResponse({
      prompt: 'Recommend a model for banner copy',
      featureKey: 'banner_copy_suggest',
      rows: [baseRow],
      catalog,
      telemetry: {
        available: true,
        totalInvocations: 20,
        fallbackRate: 0.15,
        errorRate: 0.05,
        gatewayRate: 0.8,
        missingMappedFeatureCount: 0,
        topFeatureKey: 'banner_copy_suggest',
        topModelKey: '@cf/meta/llama-3.1-8b-instruct',
        agentFailureRate: 0,
        orchestratorReadToolFailures: 0,
      },
    })

    expect(result.mode).toBe('read_only')
    expect(result.answer).toContain('Banner Studio copy suggestion')
    expect(result.answer).toContain('20 calls')
    expect(result.context).toMatchObject({
      runtimeControllableCount: 1,
      overrideCount: 0,
      catalogSource: 'cloudflare_api',
      catalogAvailable: true,
      telemetryAvailable: true,
      fallbackRate: 0.15,
      errorRate: 0.05,
      gatewayRate: 0.8,
    })
    expect(result.proposedAssignment).toMatchObject({
      featureKey: 'banner_copy_suggest',
      provider: 'workers_ai',
      modelId: '@cf/meta/llama-3.1-8b-instruct-fast',
      fallbackModelId: 'llama-3.1-8b-instant',
    })
    expect(result.proposedAssignment?.rationale.join(' ')).toContain('Runtime provider is supported')
  })

  it('does not draft changes for features that are not runtime controllable', () => {
    const result = createModelOpsCopilotResponse({
      prompt: 'Can I change this?',
      featureKey: 'video_generation_completion',
      rows: [{
        ...baseRow,
        featureKey: 'video_generation_completion',
        label: 'Video generation completion',
        assignmentEditable: true,
        runtimeRoutingStatus: 'worker_side',
        runtimeRoutingLabel: 'Worker-side rollout',
        runtimeControlEnabled: false,
        runtimeSupportedProviders: [],
        runtimeNotes: 'Requires worker assignment distribution first.',
      }],
      catalog,
    })

    expect(result.proposedAssignment).toBeNull()
    expect(result.findings[0]).toMatchObject({
      severity: 'warning',
      title: 'Selected feature cannot be changed from the dashboard yet',
    })
  })

  it('prioritizes operational telemetry findings before assignment changes', () => {
    const result = createModelOpsCopilotResponse({
      prompt: 'Review telemetry health',
      rows: [baseRow],
      catalog,
      telemetry: {
        available: true,
        totalInvocations: 10,
        fallbackRate: 0.3,
        errorRate: 0.2,
        gatewayRate: 0.7,
        missingMappedFeatureCount: 4,
        topFeatureKey: 'banner_copy_suggest',
        topModelKey: '@cf/meta/llama-3.1-8b-instruct',
        agentFailureRate: 0.1,
        orchestratorReadToolFailures: 1,
      },
    })

    expect(result.findings[0]).toMatchObject({
      severity: 'critical',
      title: 'AI invocation error rate is 20%',
      featureKey: 'banner_copy_suggest',
    })
    expect(result.findings.map(finding => finding.title)).toContain('Fallback usage is 30%')
    expect(result.findings.map(finding => finding.title)).toContain('Agent run telemetry shows recent failures')
  })
})
