import { pathToFileURL } from 'node:url'

const SHA = /^[a-f0-9]{40}$/u

export function buildNeonLifecyclePlan(input) {
  if (!input.projectId || input.projectId !== input.expectedProjectId) {
    throw new Error('crm_search_neon_project_mismatch')
  }
  if (!input.parentBranchId?.startsWith('br-') || !SHA.test(input.implementationSha)) {
    throw new Error('crm_search_neon_plan_invalid')
  }
  const expiresAt = new Date(input.nowMs + 6 * 60 * 60 * 1_000).toISOString()
  return Object.freeze({
    projectId: input.projectId,
    create: {
      branch: {
        name: `crm-search-e2e-${input.implementationSha.slice(0, 12)}`,
        parent_id: input.parentBranchId,
        init_source: 'schema-only',
        expires_at: expiresAt
      }
    },
    pollOperations: true,
    assertEmptyTables: ['crm_people', 'crm_companies', 'crm_opportunities'],
    migrations: [350, 351, 352]
  })
}

export async function runNeonLifecycle({ dryRun, allowMutationForTest = false, plan, execute }) {
  if (!plan || typeof execute !== 'function') throw new Error('crm_search_neon_runtime_invalid')
  if (dryRun === true) return { dryRun: true, mutationCount: 0, plan }
  if (allowMutationForTest !== true) throw new Error('crm_search_neon_external_mutation_forbidden')
  let branchId = null
  try {
    const created = await execute({ action: 'create', projectId: plan.projectId, body: plan.create })
    branchId = created?.branchId
    if (!branchId?.startsWith('br-')) throw new Error('crm_search_neon_create_invalid')
    await execute({ action: 'poll', projectId: plan.projectId, branchId, operationIds: created.operationIds })
    await execute({ action: 'assert-empty', projectId: plan.projectId, branchId, tables: plan.assertEmptyTables })
    await execute({ action: 'migrate', projectId: plan.projectId, branchId, migrations: plan.migrations })
    return { dryRun: false, branchId }
  } finally {
    if (branchId) {
      const deleted = await execute({ action: 'delete', projectId: plan.projectId, branchId })
      await execute({ action: 'poll', projectId: plan.projectId, branchId, operationIds: deleted?.operationIds })
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  if (!process.argv.includes('--dry-run')) throw new Error('crm_search_neon_dry_run_required')
  console.log(JSON.stringify({
    status: 'schema-only-ttl-plan',
    mutationCount: 0,
    requires: ['expected-project', 'parent-branch', 'expires_at', 'operation-polling', 'outer-finally']
  }))
}
