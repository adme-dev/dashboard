import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'

import { planPreviewCleanup } from '../../scripts/crm-search/e2e-cleanup.mjs'
import { runPreviewE2E } from '../../scripts/crm-search/e2e-preview.mjs'

const sha = 'a'.repeat(40)
const digest = (value: string) => createHash('sha256').update(value).digest('hex')
const canonical = (value: unknown): string => {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => (
    `${JSON.stringify(key)}:${canonical(record[key])}`
  )).join(',')}}`
}

const resource = {
  kind: 'vectorize',
  identity: 'agency-crm-search-preview',
  identityDigest: digest('vectorize:agency-crm-search-preview'),
  baselineDigest: digest('absent')
}
const pagesResource = {
  kind: 'pages', identity: 'agency-dashboard:preview',
  identityDigest: digest('pages:agency-dashboard:preview'), baselineDigest: digest('pages-baseline')
}
const workerResource = {
  kind: 'worker', identity: 'agency-crm-search-consumer-preview',
  identityDigest: digest('worker:agency-crm-search-consumer-preview'),
  baselineDigest: digest('worker-baseline')
}
const resources = [resource, pagesResource, workerResource]
const authorization = {
  version: 'crm-search-preview-execution-authorization-v1',
  environment: 'preview',
  implementationSha: sha,
  artifactManifestDigest: digest('artifact'),
  bindingManifestDigest: digest('bindings'),
  resourceReadbackDigest: digest(canonical(resources)),
  neonAttestationDigest: digest('neon'),
  expiresAt: '2026-08-12T00:00:00.000Z'
}
const planBindings = {
  artifactManifestDigest: authorization.artifactManifestDigest,
  bindingManifestDigest: authorization.bindingManifestDigest,
  resourceReadbackDigest: authorization.resourceReadbackDigest,
  neonAttestationDigest: authorization.neonAttestationDigest
}

describe('CRM search guarded preview execution', () => {
  it('requires the exact execute flag and signed-attestation bindings before any adapter call', async () => {
    const execute = vi.fn()
    await expect(runPreviewE2E({
      dryRun: false,
      executeFlag: 'wrong',
      authorization,
      plan: {
        version: 'crm-search-preview-e2e-plan-v1', environment: 'preview',
        implementationSha: sha, productionDenylist: ['agency-crm-search'],
        resources, exercises: ['portal_keyword', 'agency_shadow', 'agency_assist'],
        ...planBindings
      },
      verifyExecutionAuthorization: vi.fn(async () => authorization),
      execute
    })).rejects.toThrow('crm_search_preview_execute_authorization_required')
    expect(execute).not.toHaveBeenCalled()

    await expect(runPreviewE2E({
      dryRun: false,
      executeFlag: 'EXECUTE ISOLATED CRM SEARCH PREVIEW',
      authorization,
      plan: {
        version: 'crm-search-preview-e2e-plan-v1', environment: 'preview',
        implementationSha: sha, productionDenylist: ['agency-crm-search'],
        resources, exercises: ['portal_keyword', 'agency_shadow', 'agency_assist'],
        ...planBindings, resourceReadbackDigest: digest('drifted-resource-readback')
      },
      verifyExecutionAuthorization: vi.fn(async () => authorization),
      execute
    })).rejects.toThrow('crm_search_preview_execute_authorization_required')
    expect(execute).not.toHaveBeenCalled()
  })

  it('journals every mutation and always restores exact preview resources to baseline', async () => {
    const actions: string[] = []
    const restored = new Set<string>()
    const execute = vi.fn(async (step: Record<string, unknown>) => {
      actions.push(String(step.action))
      const targetResource = step.resource as typeof resource | undefined
      if (step.action === 'capture-baseline') return { digest: targetResource?.baselineDigest }
      if (step.action === 'provision') return {
        mutationId: 'mutation-provision-1', resourceIdentityDigest: targetResource?.identityDigest,
        postMutationDigest: digest('provisioned')
      }
      if (step.action === 'deploy') return {
        mutationId: `mutation-${String(step.target)}`,
        deploymentId: `deployment-${String(step.target)}`,
        ...(step.target === 'worker-preview' ? { versionId: 'worker-version-preview-1' } : {}),
        resourceIdentityDigest: targetResource?.identityDigest,
        postMutationDigest: digest(`deployed:${String(step.target)}`)
      }
      if (step.action === 'exercise') return { evidenceDigest: digest(String(step.scenario)) }
      if (step.action === 'read-resource') return !restored.has(String(targetResource?.kind))
        ? { digest: digest(`mutated:${targetResource?.kind}`) }
        : { digest: targetResource?.baselineDigest }
      if (step.action === 'restore-resource') {
        restored.add(String(targetResource?.kind))
        return {
          mutationId: `mutation-cleanup-${targetResource?.kind}`,
          resourceIdentityDigest: targetResource?.identityDigest,
          postMutationDigest: targetResource?.baselineDigest
        }
      }
      return { ok: true }
    })

    const result = await runPreviewE2E({
      dryRun: false,
      executeFlag: 'EXECUTE ISOLATED CRM SEARCH PREVIEW',
      authorization,
      nowMs: Date.parse('2026-08-11T00:01:00.000Z'),
      plan: {
        version: 'crm-search-preview-e2e-plan-v1', environment: 'preview',
        implementationSha: sha, productionDenylist: ['agency-crm-search'],
        resources, exercises: ['portal_keyword', 'agency_shadow', 'agency_assist'],
        ...planBindings
      },
      verifyExecutionAuthorization: vi.fn(async () => authorization),
      execute
    })

    expect(actions).toEqual([
      'capture-baseline', 'capture-baseline', 'capture-baseline',
      'provision', 'deploy', 'deploy',
      'exercise', 'exercise', 'exercise',
      'read-resource', 'restore-resource', 'read-resource',
      'read-resource', 'restore-resource', 'read-resource',
      'read-resource', 'restore-resource', 'read-resource'
    ])
    expect(result.cleanup).toMatchObject({ remainingMutableTargets: 0 })
    expect(result.journal).toEqual(expect.arrayContaining([
      expect.objectContaining({ mutationId: 'mutation-provision-1', status: 'applied' }),
      expect.objectContaining({
        mutationId: 'mutation-worker-preview', versionId: 'worker-version-preview-1',
        status: 'applied'
      }),
      expect.objectContaining({ mutationId: 'mutation-cleanup-vectorize', status: 'baseline_restored' }),
      expect.objectContaining({ mutationId: 'mutation-cleanup-pages', status: 'baseline_restored' }),
      expect.objectContaining({ mutationId: 'mutation-cleanup-worker', status: 'baseline_restored' })
    ]))
  })

  it('cleanup is idempotent and refuses every production-denylisted identity before mutation', async () => {
    const execute = vi.fn().mockResolvedValue({ digest: resource.baselineDigest })
    await expect(planPreviewCleanup({
      dryRun: false,
      executeFlag: 'EXECUTE ISOLATED CRM SEARCH PREVIEW CLEANUP',
      ownedResources: [{ ...resource, identity: 'agency-crm-search' }],
      productionDenylist: ['agency-crm-search'],
      authorization,
      verifyExecutionAuthorization: vi.fn(async () => authorization),
      execute
    })).rejects.toThrow('crm_search_cleanup_production_target_forbidden')
    expect(execute).not.toHaveBeenCalled()

    const cleaned = await planPreviewCleanup({
      dryRun: false,
      executeFlag: 'EXECUTE ISOLATED CRM SEARCH PREVIEW CLEANUP',
      ownedResources: [resource],
      authorizedResources: resources,
      productionDenylist: ['agency-crm-search'],
      authorization,
      verifyExecutionAuthorization: vi.fn(async () => authorization),
      execute
    })
    expect(execute).toHaveBeenCalledTimes(1)
    expect(cleaned).toMatchObject({ remainingMutableTargets: 0 })
    expect(cleaned.journal).toEqual([
      expect.objectContaining({ resourceIdentityDigest: resource.identityDigest, status: 'baseline_confirmed' })
    ])
  })
})
