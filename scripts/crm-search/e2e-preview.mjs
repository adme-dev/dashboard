import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import { planPreviewCleanup } from './e2e-cleanup.mjs'
import { verifyPreviewExecutionAuthorizationEnvelope } from './preview-execution-authorization.mjs'

const DIGEST = /^[a-f0-9]{64}$/u
const SHA = /^[a-f0-9]{40}$/u
const EXACT_EXECUTE_FLAG = 'EXECUTE ISOLATED CRM SEARCH PREVIEW'
const EXACT_EXERCISES = Object.freeze(['portal_keyword', 'agency_shadow', 'agency_assist'])

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  throw new Error('crm_search_preview_noncanonical')
}

function assertPlanAndAuthorization(plan, authorization, nowMs) {
  const fields = [
    authorization?.artifactManifestDigest, authorization?.bindingManifestDigest,
    authorization?.resourceReadbackDigest, authorization?.neonAttestationDigest
  ]
  const planResourceReadbackDigest = plan?.resources
    ? createHash('sha256').update(canonical(plan.resources), 'utf8').digest('hex')
    : null
  if (!plan || plan.version !== 'crm-search-preview-e2e-plan-v1'
    || plan.environment !== 'preview' || !SHA.test(plan.implementationSha ?? '')
    || !Array.isArray(plan.resources) || plan.resources.length === 0
    || !Array.isArray(plan.productionDenylist) || plan.productionDenylist.length === 0
    || canonical(plan.exercises) !== canonical(EXACT_EXERCISES)
    || authorization?.version !== 'crm-search-preview-execution-authorization-v1'
    || authorization?.environment !== 'preview'
    || authorization?.implementationSha !== plan.implementationSha
    || authorization?.artifactManifestDigest !== plan.artifactManifestDigest
    || authorization?.bindingManifestDigest !== plan.bindingManifestDigest
    || authorization?.resourceReadbackDigest !== plan.resourceReadbackDigest
    || authorization?.neonAttestationDigest !== plan.neonAttestationDigest
    || planResourceReadbackDigest !== plan.resourceReadbackDigest
    || fields.some(value => !DIGEST.test(value ?? ''))
    || !Number.isFinite(Date.parse(authorization?.expiresAt))
    || Date.parse(authorization.expiresAt) <= nowMs) {
    throw new Error('crm_search_preview_execute_authorization_required')
  }
  for (const resource of plan.resources) {
    if (!resource || !/^[a-z][a-z0-9_-]{1,63}$/u.test(resource.kind ?? '')
      || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/u.test(resource.identity ?? '')
      || !DIGEST.test(resource.identityDigest ?? '') || !DIGEST.test(resource.baselineDigest ?? '')
      || resource.identityDigest !== createHash('sha256')
        .update(`${resource.kind}:${resource.identity}`, 'utf8').digest('hex')
        || plan.productionDenylist.some(identity => identity.toLowerCase() === resource.identity.toLowerCase())) {
      throw new Error('crm_search_preview_production_target_forbidden')
    }
  }
  if (new Set(plan.resources.map(resource => resource.identityDigest)).size !== plan.resources.length
    || plan.resources.filter(resource => resource.kind === 'pages').length !== 1
    || plan.resources.filter(resource => resource.kind === 'worker').length !== 1) {
    throw new Error('crm_search_preview_deployment_inventory_required')
  }
}

function assertMutation(result, resource) {
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(result?.mutationId ?? '')
    || result.resourceIdentityDigest !== resource.identityDigest
    || !DIGEST.test(result.postMutationDigest ?? '')) {
    throw new Error('crm_search_preview_mutation_readback_invalid')
  }
}

export async function runPreviewE2E({
  dryRun = true, executeFlag, authorizationEnvelope, authorizationVerification,
  plan, execute, nowMs = Date.now()
}) {
  if (!plan || typeof execute !== 'function') throw new Error('crm_search_preview_plan_invalid')
  if (dryRun) return { dryRun: true, mutationCount: 0, plan }
  if (executeFlag !== EXACT_EXECUTE_FLAG || !authorizationEnvelope || !authorizationVerification) {
    throw new Error('crm_search_preview_execute_authorization_required')
  }
  const authorization = verifyPreviewExecutionAuthorizationEnvelope(authorizationEnvelope, {
    ...authorizationVerification,
    nowMs
  })
  assertPlanAndAuthorization(plan, authorization, nowMs)
  const verifiedAuthorization = authorization

  const journal = []
  const capturedResources = []
  let cleanup
  let lifecycleError
  let cleanupError
  try {
    for (const resource of plan.resources) {
      const baseline = await execute({
        action: 'capture-baseline', resource,
        expectedBaselineDigest: resource.baselineDigest,
        authorization: verifiedAuthorization
      })
      if (baseline?.digest !== resource.baselineDigest) {
        throw new Error('crm_search_preview_baseline_drift')
      }
      capturedResources.push(resource)
    }
    for (const resource of plan.resources.filter(value => !['pages', 'worker'].includes(value.kind))) {
      const provisioned = await execute({
        action: 'provision', resource,
        productionDenylist: plan.productionDenylist,
        authorization: verifiedAuthorization
      })
      assertMutation(provisioned, resource)
      journal.push(Object.freeze({
        action: 'provision',
        resourceType: resource.kind,
        resourceIdentityDigest: resource.identityDigest,
        mutationId: provisioned.mutationId,
        preMutationDigest: resource.baselineDigest,
        postMutationDigest: provisioned.postMutationDigest,
        status: 'applied'
      }))
    }
    for (const [target, kind] of [['pages-preview', 'pages'], ['worker-preview', 'worker']]) {
      const resource = plan.resources.find(value => value.kind === kind)
      const deployed = await execute({
        action: 'deploy', target, resource,
        artifactManifestDigest: authorization.artifactManifestDigest,
        authorization: verifiedAuthorization
      })
      if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(deployed?.deploymentId ?? '')
        || !/^[A-Za-z0-9._:-]{1,128}$/u.test(deployed?.mutationId ?? '')
        || (kind === 'worker' && !/^[A-Za-z0-9._-]{1,128}$/u.test(deployed?.versionId ?? ''))
        || !DIGEST.test(deployed.postMutationDigest ?? '')
        || resource.identityDigest !== deployed.resourceIdentityDigest) {
        throw new Error('crm_search_preview_deployment_readback_invalid')
      }
      journal.push(Object.freeze({
        action: 'deploy',
        resourceType: resource.kind,
        resourceIdentityDigest: resource.identityDigest,
        mutationId: deployed.mutationId,
        deploymentId: deployed.deploymentId,
        ...(kind === 'worker' ? { versionId: deployed.versionId } : {}),
        preMutationDigest: resource.baselineDigest,
        postMutationDigest: deployed.postMutationDigest,
        status: 'applied'
      }))
    }
    for (const scenario of EXACT_EXERCISES) {
      const exercised = await execute({
        action: 'exercise', scenario,
        authorization: verifiedAuthorization
      })
      if (!DIGEST.test(exercised?.evidenceDigest ?? '')) {
        throw new Error('crm_search_preview_exercise_evidence_invalid')
      }
    }
  } catch (error) {
    lifecycleError = error
  } finally {
    try {
      cleanup = await planPreviewCleanup({
        dryRun: false,
        executeFlag: 'EXECUTE ISOLATED CRM SEARCH PREVIEW CLEANUP',
        authorizationEnvelope,
        authorizationVerification,
        ownedResources: capturedResources,
        authorizedResources: plan.resources,
        productionDenylist: plan.productionDenylist,
        execute,
        nowMs
      })
      journal.push(...cleanup.mutationJournal, ...cleanup.journal)
    } catch (error) {
      cleanupError = error
    }
  }
  if (lifecycleError && cleanupError) {
    throw new AggregateError(
      [lifecycleError, cleanupError], 'crm_search_preview_lifecycle_and_cleanup_failed'
    )
  }
  if (lifecycleError) throw lifecycleError
  if (cleanupError) throw cleanupError
  return Object.freeze({ dryRun: false, journal: Object.freeze(journal), cleanup })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_preview_injected_executor_required')
  console.log(JSON.stringify({ status: 'preview-plan-only', mutationCount: 0 }))
}
