import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'

const DIGEST = /^[a-f0-9]{64}$/u
const SHA = /^[a-f0-9]{40}$/u
const EXACT_EXECUTE_FLAG = 'EXECUTE ISOLATED CRM SEARCH PREVIEW CLEANUP'

function canonical(value) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  }
  throw new Error('crm_search_cleanup_noncanonical')
}

function digest(value) {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex')
}

function assertAuthorization(authorization, nowMs) {
  if (!authorization || authorization.version !== 'crm-search-preview-execution-authorization-v1'
    || authorization.environment !== 'preview' || !SHA.test(authorization.implementationSha ?? '')
    || !DIGEST.test(authorization.artifactManifestDigest ?? '')
    || !DIGEST.test(authorization.bindingManifestDigest ?? '')
    || !DIGEST.test(authorization.resourceReadbackDigest ?? '')
    || !DIGEST.test(authorization.neonAttestationDigest ?? '')
    || !Number.isFinite(Date.parse(authorization.expiresAt))
    || Date.parse(authorization.expiresAt) <= nowMs) {
    throw new Error('crm_search_preview_execute_authorization_required')
  }
}

function assertResource(resource, productionDenylist) {
  const normalizedIdentity = typeof resource?.identity === 'string'
    ? resource.identity.toLowerCase()
    : ''
  if (productionDenylist.some(identity => normalizedIdentity === identity.toLowerCase())) {
    throw new Error('crm_search_cleanup_production_target_forbidden')
  }
  if (!resource || !/^[a-z][a-z0-9_-]{1,63}$/u.test(resource.kind ?? '')
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,255}$/u.test(resource.identity ?? '')
    || !DIGEST.test(resource.identityDigest ?? '') || !DIGEST.test(resource.baselineDigest ?? '')
    || resource.identityDigest !== createHash('sha256')
      .update(`${resource.kind}:${resource.identity}`, 'utf8').digest('hex')) {
    throw new Error('crm_search_cleanup_inventory_invalid')
  }
}

export async function planPreviewCleanup({
  dryRun = true, executeFlag, authorization, verifyExecutionAuthorization,
  ownedResources, authorizedResources = ownedResources, productionDenylist, execute,
  nowMs = Date.now()
}) {
  if (!Array.isArray(ownedResources) || !Array.isArray(authorizedResources)
    || !Array.isArray(productionDenylist)
    || productionDenylist.length === 0) {
    throw new Error('crm_search_cleanup_inventory_required')
  }
  if (dryRun) {
    return {
      dryRun: true, mutationCount: 0,
      ownedResources: [...ownedResources].sort((left, right) => left.identity.localeCompare(right.identity))
    }
  }
  if (executeFlag !== EXACT_EXECUTE_FLAG
    || typeof verifyExecutionAuthorization !== 'function' || typeof execute !== 'function') {
    throw new Error('crm_search_preview_execute_authorization_required')
  }
  assertAuthorization(authorization, nowMs)
  for (const resource of authorizedResources) assertResource(resource, productionDenylist)
  for (const resource of ownedResources) assertResource(resource, productionDenylist)
  const authorizedByDigest = new Map(
    authorizedResources.map(resource => [resource.identityDigest, canonical(resource)])
  )
  if (authorizedByDigest.size !== authorizedResources.length
    || new Set(ownedResources.map(resource => resource.identityDigest)).size !== ownedResources.length
    || digest(authorizedResources) !== authorization.resourceReadbackDigest
    || ownedResources.some(resource => (
      authorizedByDigest.get(resource.identityDigest) !== canonical(resource)
    ))) {
    throw new Error('crm_search_cleanup_inventory_authorization_drift')
  }
  const verifiedAuthorization = await verifyExecutionAuthorization(authorization)
  if (canonical(verifiedAuthorization) !== canonical(authorization)) {
    throw new Error('crm_search_preview_execute_authorization_required')
  }

  const journal = []
  const mutationJournal = []
  const cleanupErrors = []
  let mutationCount = 0
  for (const resource of ownedResources) {
    try {
      const before = await execute({
        action: 'read-resource', resource,
        authorization: verifiedAuthorization
      })
      if (!DIGEST.test(before?.digest ?? '')) throw new Error('crm_search_cleanup_readback_invalid')
      let status = 'baseline_confirmed'
      let finalReadbackDigest = before.digest
      if (before.digest !== resource.baselineDigest) {
        const restored = await execute({
          action: 'restore-resource', resource,
          expectedCurrentDigest: before.digest,
          expectedBaselineDigest: resource.baselineDigest,
          authorization: verifiedAuthorization
        })
        if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(restored?.mutationId ?? '')
          || restored.resourceIdentityDigest !== resource.identityDigest
          || restored.postMutationDigest !== resource.baselineDigest) {
          throw new Error('crm_search_cleanup_mutation_readback_invalid')
        }
        mutationCount += 1
        mutationJournal.push(Object.freeze({
          action: 'restore',
          resourceType: resource.kind,
          resourceIdentityDigest: resource.identityDigest,
          mutationId: restored.mutationId,
          preMutationDigest: before.digest,
          postMutationDigest: restored.postMutationDigest,
          status: 'baseline_restored',
          confirmedAt: new Date(nowMs).toISOString()
        }))
        const finalReadback = await execute({
          action: 'read-resource', resource,
          authorization: verifiedAuthorization
        })
        finalReadbackDigest = finalReadback?.digest
        if (finalReadbackDigest !== resource.baselineDigest) {
          throw new Error('crm_search_cleanup_baseline_not_restored')
        }
        status = 'baseline_restored'
      }
      journal.push(Object.freeze({
        resourceType: resource.kind,
        resourceIdentityDigest: resource.identityDigest,
        baselineDigest: resource.baselineDigest,
        finalReadbackDigest,
        status,
        confirmedAt: new Date(nowMs).toISOString()
      }))
    } catch (error) {
      cleanupErrors.push(error)
    }
  }
  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, 'crm_search_cleanup_incomplete')
  }
  return Object.freeze({
    dryRun: false,
    mutationCount,
    journalVersion: 'crm-search-cleanup-journal-v1',
    journal: Object.freeze(journal),
    mutationJournal: Object.freeze(mutationJournal),
    journalDigest: digest(journal),
    confirmedAt: new Date(nowMs).toISOString(),
    remainingMutableTargets: 0
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_cleanup_injected_executor_required')
  console.log(JSON.stringify({ status: 'cleanup-plan-only', mutationCount: 0 }))
}
