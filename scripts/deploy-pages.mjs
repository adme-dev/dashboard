import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { Client } from 'pg'
import {
  FROZEN_BUILD_COMMAND,
  releaseToolDigest,
  sha256File
} from './crm-search/build-artifact.mjs'
import { runFrozenPagesRelease } from './crm-search/deploy-pages-artifact.mjs'

export const ALLOWED_PAGES_PROJECT = 'agency-dashboard'
const ALLOWED_BRANCHES = new Set(['main', 'preview'])

export function assertPagesDeployTarget({ configuredProject, requestedProject }) {
  if (configuredProject !== ALLOWED_PAGES_PROJECT) {
    throw new Error(
      `wrangler.toml identifies Pages project "${configuredProject || 'unknown'}"; expected "${ALLOWED_PAGES_PROJECT}". Deployment blocked.`
    )
  }

  if (requestedProject !== ALLOWED_PAGES_PROJECT) {
    throw new Error(
      `Refusing Pages deployment to "${requestedProject || 'unknown'}". This repository may deploy only to "${ALLOWED_PAGES_PROJECT}".`
    )
  }
}

export function buildPagesDeployArgs(branch) {
  if (!ALLOWED_BRANCHES.has(branch)) {
    throw new Error(`Unsupported Pages branch "${branch}". Expected main or preview.`)
  }

  return [
    'wrangler',
    '--cwd',
    'dist',
    'pages',
    'deploy',
    '--project-name',
    ALLOWED_PAGES_PROJECT,
    '--branch',
    branch
  ]
}

export function configuredPagesProject(configText) {
  return configText.match(/^name\s*=\s*["']([^"']+)["']/m)?.[1]
}

export function verifyPagesDeployTarget({
  configPath = 'wrangler.toml',
  requestedProject = ALLOWED_PAGES_PROJECT
} = {}) {
  const configuredProject = configuredPagesProject(readFileSync(configPath, 'utf8'))
  assertPagesDeployTarget({ configuredProject, requestedProject })
  return { configuredProject, requestedProject }
}

export function assertDormantCrmSearch(configText, branch) {
  const environment = branch === 'main' ? 'production' : branch
  const marker = `[env.${environment}.vars]`
  const start = configText.indexOf(marker)
  if (start < 0) throw new Error(`Missing ${marker} in wrangler.toml`)

  const remainder = configText.slice(start + marker.length)
  const nextSection = remainder.search(/^\[/mu)
  const vars = nextSection < 0 ? remainder : remainder.slice(0, nextSection)
  if (!/^CRM_SEARCH_PROVIDER_APIS_ENABLED\s*=\s*["']false["']\s*$/mu.test(vars)) {
    throw new Error(
      'CRM search activation requires the signed release command; ordinary Pages deployment is allowed only while CRM_SEARCH_PROVIDER_APIS_ENABLED=false.'
    )
  }
}

function runSourceCommand(command, args, cwd) {
  const result = spawnSync(command, args, { stdio: 'inherit', cwd })
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(`pages_deploy_command_failed:${command}`)
  }
}

export function runSourcePagesDeploy({
  branch,
  checkOnly = false,
  execute = runSourceCommand
} = {}) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
  const configPath = path.join(repositoryRoot, 'wrangler.toml')
  const target = verifyPagesDeployTarget({ configPath })
  const deployArgs = buildPagesDeployArgs(branch)
  assertDormantCrmSearch(readFileSync(configPath, 'utf8'), branch)

  console.log(`Pages deploy guard: ${target.configuredProject} / ${branch} / CRM search dormant`)
  if (checkOnly) return
  if (capture('git', ['status', '--short'], repositoryRoot) !== '') {
    throw new Error('crm_search_dirty_tree')
  }

  execute('pnpm', ['build'], repositoryRoot)
  execute('pnpm', ['exec', ...deployArgs], repositoryRoot)
}

function runPagesReleaseCommand({ args }) {
  const outputDirectory = mkdtempSync(path.join(tmpdir(), 'crm-search-pages-release-'))
  const outputPath = path.join(outputDirectory, 'wrangler-output.ndjson')
  const result = spawnSync('pnpm', ['exec', ...args], {
    stdio: 'inherit',
    env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: outputPath }
  })
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error('crm_search_pages_deploy_failed')
  }
  let output
  try {
    output = readFileSync(outputPath, 'utf8').trim().split('\n')
      .map(line => JSON.parse(line))
      .find(entry => entry?.type === 'pages-deploy')
  } catch {
    throw new Error('crm_search_pages_deployment_readback_required')
  }
  if (!/^[A-Za-z0-9._:-]{1,128}$/u.test(output?.deployment_id ?? '')) {
    throw new Error('crm_search_pages_deployment_readback_required')
  }
  return { deploymentId: output.deployment_id }
}

function capture(command, args, cwd) {
  const result = spawnSync(command, args, { encoding: 'utf8', cwd })
  if (result.error || result.status !== 0) throw result.error ?? new Error(`crm_search_release_command_failed:${command}`)
  return result.stdout.trim()
}

export async function readCurrentProductionApproval({ databaseUrl, approvalId, approvalRevision }) {
  if (approvalRevision !== 0) throw new Error('crm_search_release_approval_revision_mismatch')
  let target
  try {
    target = new URL(databaseUrl)
  } catch {
    throw new Error('crm_search_release_approval_database_invalid')
  }
  if (target.protocol !== 'postgresql:' || !target.hostname.endsWith('.neon.tech')
    || target.hostname.split('.')[0]?.endsWith('-pooler')
    || target.searchParams.get('sslmode') !== 'require') {
    throw new Error('crm_search_release_approval_database_invalid')
  }
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query(`
      SELECT approval.id::TEXT AS "approvalId", approval.approval_type AS type,
             approval.environment, approval.issued_at AS "originalTimestamp",
             approval.expires_at AS "expiresAt",
             approval.implementation_git_sha AS "implementationGitSha",
             approval.artifact_manifest_digest AS "artifactManifestDigest",
             approval.pages_bundle_digest AS "pagesBundleDigest",
             approval.worker_bundle_digest AS "workerBundleDigest",
             approval.binding_manifest_digest AS "bindingManifestDigest",
             approval.evidence_bundle_hash AS "evidenceBundleHash",
             approval.rate_card_id::TEXT AS "rateCardId",
             approval.expected_control_revision::BIGINT AS "expectedControlRevision",
             approval.organisation_scope_id::TEXT AS "organisationScopeId",
             approval.requested_by::TEXT AS "requestedByActorId",
             approval.approved_by::TEXT AS "approvedBy",
             approval.maximum_cost_usd_micros::BIGINT AS "maximumCostUsdMicros",
             approval.reason,
             revocation.revoked_at AS "approvalRevokedAt",
             rate_revocation.revoked_at AS "rateCardRevokedAt",
             (rate_card.valid_from <= clock_timestamp()
               AND rate_card.valid_until > clock_timestamp()) AS "rateCardCurrent",
             (consumption.id IS NULL) AS "unconsumed",
             (control.state = 'halted' AND control.maximum_mode = 'off'
               AND control.indexing_ready = FALSE
               AND control.revision = approval.expected_control_revision) AS "controlReady",
             clock_timestamp() AS "readbackAt"
        FROM crm_search_change_approvals approval
        JOIN crm_search_rate_cards rate_card ON rate_card.id = approval.rate_card_id
        LEFT JOIN crm_search_change_approval_consumptions consumption
          ON consumption.approval_id = approval.id
        LEFT JOIN crm_search_global_control control
          ON control.organisation_scope_id = approval.organisation_scope_id
        LEFT JOIN crm_search_change_approval_revocations revocation
          ON revocation.approval_id = approval.id
        LEFT JOIN crm_search_rate_card_revocations rate_revocation
          ON rate_revocation.rate_card_id = approval.rate_card_id
       WHERE approval.id = $1::UUID
         AND approval.approval_type = 'production_deploy'
       LIMIT 1
    `, [approvalId])
    const row = result.rows[0]
    if (!row) throw new Error('crm_search_release_approval_readback_missing')
    const revokedAt = row.approvalRevokedAt ?? row.rateCardRevokedAt ?? null
    const current = revokedAt === null && row.rateCardCurrent === true
      && row.unconsumed === true && row.controlReady === true
    const maximumCostUsdMicros = Number(row.maximumCostUsdMicros)
    const expectedControlRevision = Number(row.expectedControlRevision)
    if (!Number.isSafeInteger(maximumCostUsdMicros)
      || !Number.isSafeInteger(expectedControlRevision)) {
      throw new Error('crm_search_release_approval_readback_invalid')
    }
    return {
      approvalId: row.approvalId,
      approvalRevision: revokedAt ? 1 : 0,
      type: row.type,
      environment: row.environment,
      originalTimestamp: new Date(row.originalTimestamp).toISOString(),
      expiresAt: new Date(row.expiresAt).toISOString(),
      implementationGitSha: row.implementationGitSha,
      artifactManifestDigest: row.artifactManifestDigest,
      pagesBundleDigest: row.pagesBundleDigest,
      workerBundleDigest: row.workerBundleDigest,
      bindingManifestDigest: row.bindingManifestDigest,
      evidenceBundleHash: row.evidenceBundleHash,
      rateCardId: row.rateCardId,
      expectedControlRevision,
      organisationScopeId: row.organisationScopeId,
      requestedByActorId: row.requestedByActorId,
      approvedBy: row.approvedBy,
      maximumCostUsdMicros,
      clientIds: [],
      reason: row.reason,
      status: current ? 'active' : 'revoked',
      revokedAt: revokedAt ? new Date(revokedAt).toISOString() : null,
      readbackAt: new Date(row.readbackAt).toISOString()
    }
  } finally {
    await client.end()
  }
}

function assertReleaseDatabaseUrl(databaseUrl) {
  let target
  try {
    target = new URL(databaseUrl)
  } catch {
    throw new Error('crm_search_release_approval_database_invalid')
  }
  if (target.protocol !== 'postgresql:' || !target.hostname.endsWith('.neon.tech')
    || target.hostname.split('.')[0]?.endsWith('-pooler')
    || target.searchParams.get('sslmode') !== 'require') {
    throw new Error('crm_search_release_approval_database_invalid')
  }
}

export async function recordProductionDeploymentPhase({ databaseUrl, approval, event }) {
  assertReleaseDatabaseUrl(databaseUrl)
  const optionalIdentifiers = [event?.deploymentId, event?.versionId]
  if (!['pages', 'worker_upload', 'worker_activate'].includes(event?.phase)
    || !['started', 'succeeded', 'failed'].includes(event?.status)
    || event.approvalId !== approval.approvalId
    || event.approvalRevision !== approval.approvalRevision
    || event.artifactManifestDigest !== approval.artifactManifestDigest
    || optionalIdentifiers.some(value => value !== undefined
      && !/^[A-Za-z0-9._:-]{1,128}$/u.test(value))
    || (event.failureCode !== undefined && event.failureCode !== 'external_spawn_failed')) {
    throw new Error('crm_search_release_phase_event_invalid')
  }
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query(`
      INSERT INTO crm_search_audit_log (
        organisation_scope_id, event_type, actor_id, correlation_id,
        reason, evidence_hash, details
      )
      SELECT approval.organisation_scope_id, 'deployment.phase_' || $2,
             approval.requested_by, gen_random_uuid(),
             'Record exact CRM search deployment phase evidence',
             approval.evidence_bundle_hash,
             jsonb_strip_nulls(jsonb_build_object(
               'approvalId', approval.id, 'phase', $1, 'status', $2,
               'artifactManifestDigest', $3, 'approvalRevision', $4,
               'deploymentId', $5, 'versionId', $6, 'failureCode', $7
             ))
        FROM crm_search_change_approvals approval
       WHERE approval.id = $8::UUID
         AND approval.approval_type = 'production_deploy'
         AND approval.artifact_manifest_digest = $3
         AND approval.organisation_scope_id = $9::UUID
      RETURNING id::TEXT AS id
    `, [event.phase, event.status, event.artifactManifestDigest,
      event.approvalRevision, event.deploymentId ?? null, event.versionId ?? null,
      event.failureCode ?? null, approval.approvalId, approval.organisationScopeId])
    if (!result.rows[0]?.id) throw new Error('crm_search_release_phase_record_failed')
    return { journalId: result.rows[0].id }
  } finally {
    await client.end()
  }
}

export async function finalizeProductionDeploymentApproval({ databaseUrl, approval }) {
  assertReleaseDatabaseUrl(databaseUrl)
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    const result = await client.query(`
      SELECT crm_search_record_dormant_deployment(
        $1::UUID, $2::BIGINT, $3::UUID, $4, $5::UUID
      )::BIGINT AS revision
    `, [approval.organisationScopeId, approval.expectedControlRevision,
      approval.requestedByActorId,
      'Finalize exact Pages and Worker dormant deployment after durable phase evidence',
      approval.approvalId])
    const revision = Number(result.rows[0]?.revision)
    if (!Number.isSafeInteger(revision)) throw new Error('crm_search_release_finalize_failed')
    return { consumptionId: approval.approvalId, revision }
  } finally {
    await client.end()
  }
}

export async function runCrmSearchPagesRelease({
  branch,
  checkOnly = false,
  artifactManifestPath,
  artifactRoot,
  approvalEnvelope,
  approvalVerification,
  evidenceBundle,
  evidenceKeyring,
  artifactVerificationKeyring,
  approvalDatabaseUrl,
  execute = runPagesReleaseCommand
} = {}) {
  if (process.versions.node !== '24.18.0') throw new Error('crm_search_node_version_mismatch')
  const target = verifyPagesDeployTarget()
  buildPagesDeployArgs(branch)
  const repositoryRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

  console.log(`Pages deploy guard: ${target.configuredProject} / ${branch}`)
  if (checkOnly) return
  if (capture('git', ['status', '--short'], repositoryRoot) !== '') {
    throw new Error('crm_search_dirty_tree')
  }
  if (!artifactManifestPath) throw new Error('crm_search_release_manifest_required')
  if (!artifactRoot || !path.isAbsolute(artifactRoot)) throw new Error('crm_search_artifact_output_invalid')
  const manifestEnvelope = JSON.parse(readFileSync(artifactManifestPath, 'utf8'))
  if (!artifactVerificationKeyring) throw new Error('crm_search_artifact_key_unavailable')
  if (!approvalDatabaseUrl) {
    throw new Error('crm_search_release_approval_readback_required')
  }
  const expectedPins = {
    implementationSha: capture('git', ['rev-parse', 'HEAD'], repositoryRoot),
    nodeVersion: process.versions.node,
    lockfileDigest: sha256File(path.join(repositoryRoot, 'pnpm-lock.yaml')),
    buildCommandDigest: createHash('sha256').update(FROZEN_BUILD_COMMAND).digest('hex'),
    toolDigest: releaseToolDigest(repositoryRoot),
    pagesConfigDigest: sha256File(path.join(repositoryRoot, 'wrangler.toml')),
    workerConfigDigest: sha256File(path.join(repositoryRoot, 'workers/crm-search-consumer/wrangler.toml')),
    bindingManifestDigest: approvalEnvelope?.payload?.bindingManifestDigest
  }
  return await runFrozenPagesRelease({
    mode: branch === 'main' ? 'production' : 'preview',
    manifestEnvelope,
    artifactVerification: {
      artifactRoot,
      expectedPins,
      keyring: artifactVerificationKeyring
    },
    approvalEnvelope,
    approvalVerification,
    evidenceBundle,
    evidenceKeyring,
    readCurrentApproval: ({ approvalId, approvalRevision }) => readCurrentProductionApproval({
      databaseUrl: approvalDatabaseUrl, approvalId, approvalRevision
    }),
    recordDeploymentPhase: event => recordProductionDeploymentPhase({
      databaseUrl: approvalDatabaseUrl, approval: approvalEnvelope.payload, event
    }),
    execute
  })
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const args = process.argv.slice(2)
  const checkOnly = args.includes('--check-only')
  const crmSearchRelease = args.includes('--crm-search-release')
  const branch = args.find(arg => !arg.startsWith('--')) || 'main'
  if (!crmSearchRelease) {
    runSourcePagesDeploy({ branch, checkOnly })
  } else {
    const artifactManifestPath = process.env.CRM_SEARCH_FROZEN_ARTIFACT_MANIFEST
    const artifactRoot = process.env.CRM_SEARCH_FROZEN_ARTIFACT_ROOT
    const approvalEnvelope = process.env.CRM_SEARCH_DEPLOYMENT_APPROVAL
      ? JSON.parse(readFileSync(process.env.CRM_SEARCH_DEPLOYMENT_APPROVAL, 'utf8'))
      : null
    const evidenceBundle = process.env.CRM_SEARCH_RELEASE_EVIDENCE
      ? JSON.parse(readFileSync(process.env.CRM_SEARCH_RELEASE_EVIDENCE, 'utf8'))
      : null
    const evidenceKeyring = process.env.CRM_SEARCH_EVIDENCE_VERIFICATION_KEYRING
      ? JSON.parse(process.env.CRM_SEARCH_EVIDENCE_VERIFICATION_KEYRING)
      : null
    const approvalVerification = process.env.CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING
      ? {
          nowMs: Date.now(),
          keyring: JSON.parse(process.env.CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING)
        }
      : null
    const artifactVerificationKeyring = process.env.CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING
      ? JSON.parse(process.env.CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING)
      : null
    await runCrmSearchPagesRelease({
      branch,
      checkOnly,
      artifactManifestPath,
      artifactRoot,
      approvalEnvelope,
      approvalVerification,
      evidenceBundle,
      evidenceKeyring,
      artifactVerificationKeyring,
      approvalDatabaseUrl: process.env.CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL
    })
  }
}
