import { transaction as runTransaction } from '~~/server/utils/db'
import type {
  DepartmentDraftPackOwnerContext,
  DepartmentDraftPackSeedRepository,
  DepartmentDraftPackSeedTransaction,
  ExistingDepartmentDraftPack,
  SeedCapabilityInput,
  SeedCapabilityVersionInput,
  SeedCatalogAuditInput,
  SeedDraftReleaseInput,
  SeedEvaluationCaseInput,
  SeedEvaluationSuiteInput,
  SeedEvaluationSuiteVersionInput,
  SeedPackCapabilityInput,
  SeedPackInput,
  SeedPackVersionInput,
  SeedToolBindingInput
} from './departmentDraftPackSeeder'

export interface DepartmentDraftPackSeedSqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>
}

async function insertedId(client: DepartmentDraftPackSeedSqlClient, sql: string, params: unknown[]) {
  const result = await client.query(sql, params)
  const id = (result.rows[0] as { id?: unknown } | undefined)?.id
  if (typeof id !== 'string') throw new Error('Governed AI seed insert did not return an identity.')
  return id
}

export function createPostgresDepartmentDraftPackSeedTransaction(
  client: DepartmentDraftPackSeedSqlClient
): DepartmentDraftPackSeedTransaction {
  return {
    async lockSeed(departmentId, packKey) {
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`ai_draft_pack:${departmentId}:${packKey}`]
      )
    },

    async getOwnerContext(departmentId, ownerUserId) {
      const result = await client.query(
        `SELECT
           department.id AS department_id,
           department.name AS department_name,
           department.slug AS department_slug,
           department.department_kind,
           department.is_active AS department_is_active,
           owner.id AS owner_id,
           owner.name AS owner_name,
           owner.is_active AS owner_is_active,
           EXISTS (
             SELECT 1
               FROM department_members membership
              WHERE membership.department_id = department.id
                AND membership.team_member_id = owner.id
           ) AS owner_is_department_member
         FROM departments department
         JOIN team_members owner ON owner.id = $2
         WHERE department.id = $1`,
        [departmentId, ownerUserId]
      )
      const row = result.rows[0] as {
        department_id: string
        department_name: string
        department_slug: string
        department_kind: string
        department_is_active: boolean
        owner_id: string
        owner_name: string
        owner_is_active: boolean
        owner_is_department_member: boolean
      } | undefined
      if (!row) return null
      return {
        department: {
          id: row.department_id,
          name: row.department_name,
          slug: row.department_slug,
          isOrganizational: row.department_kind === 'organizational',
          isActive: row.department_is_active === true
        },
        owner: {
          id: row.owner_id,
          name: row.owner_name,
          isActive: row.owner_is_active === true,
          isDepartmentMember: row.owner_is_department_member === true
        }
      } satisfies DepartmentDraftPackOwnerContext
    },

    async findExistingPack(departmentId, packKey) {
      const result = await client.query(
        `SELECT
           pack.id AS pack_id,
           version.id AS pack_version_id,
           release.id AS pack_release_id,
           pack.owner_user_id,
           version.version,
           version.material_version_digest,
           release.release_state
         FROM ai_capability_packs pack
         JOIN ai_capability_pack_versions version ON version.pack_id = pack.id
         JOIN ai_pack_releases release ON release.pack_version_id = version.id
         WHERE pack.department_id = $1
           AND pack.pack_key = $2
         ORDER BY version.version DESC
         LIMIT 1`,
        [departmentId, packKey]
      )
      const row = result.rows[0] as {
        pack_id: string
        pack_version_id: string
        pack_release_id: string
        owner_user_id: string
        version: number | string
        material_version_digest: string
        release_state: ExistingDepartmentDraftPack['releaseState']
      } | undefined
      if (!row) return null
      return {
        packId: row.pack_id,
        packVersionId: row.pack_version_id,
        packReleaseId: row.pack_release_id,
        ownerUserId: row.owner_user_id,
        version: Number(row.version),
        materialDigest: row.material_version_digest,
        releaseState: row.release_state
      }
    },

    insertEvaluationSuite(input: SeedEvaluationSuiteInput) {
      return insertedId(client,
        `INSERT INTO ai_eval_suites (
           department_id, owner_user_id, suite_key, name, description, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.departmentId, input.ownerUserId, input.suiteKey, input.name, input.description, input.actorUserId]
      )
    },

    insertEvaluationSuiteVersion(input: SeedEvaluationSuiteVersionInput) {
      return insertedId(client,
        `INSERT INTO ai_eval_suite_versions (
           eval_suite_id, department_id, version, name, case_manifest_digest, created_by
         ) VALUES ($1, $2, 1, $3, $4, $5)
         RETURNING id`,
        [input.evaluationSuiteId, input.departmentId, input.name, input.caseManifestDigest, input.actorUserId]
      )
    },

    insertEvaluationCase(input: SeedEvaluationCaseInput) {
      const value = input.value
      return insertedId(client,
        `INSERT INTO ai_eval_cases (
           eval_suite_version_id, department_id, case_key, case_version, input, scope_fixture,
           expected_tools, expected_no_tool, required_sources, prohibited_effects, zero_tolerance,
           scoring_rubric, created_by
         ) VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::text[], $8, $9::text[],
                   $10::text[], $11::text[], $12::jsonb, $13)
         RETURNING id`,
        [
          input.evaluationSuiteVersionId,
          input.departmentId,
          value.caseKey,
          value.caseVersion,
          JSON.stringify(value.input),
          JSON.stringify(value.scopeFixture),
          value.expectedTools,
          value.expectedNoTool,
          value.requiredSources,
          value.prohibitedEffects,
          value.zeroTolerance,
          JSON.stringify(value.scoringRubric),
          input.actorUserId
        ]
      )
    },

    insertPack(input: SeedPackInput) {
      return insertedId(client,
        `INSERT INTO ai_capability_packs (
           department_id, owner_user_id, pack_key, name, description, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.departmentId, input.ownerUserId, input.packKey, input.name, input.description, input.actorUserId]
      )
    },

    insertPackVersion(input: SeedPackVersionInput) {
      return insertedId(client,
        `INSERT INTO ai_capability_pack_versions (
           pack_id, department_id, version, label, description, instructions_preamble,
           model_feature_key, evaluation_suite_id, max_input_tokens, max_output_tokens,
           max_cost_usd_micros, max_latency_ms, material_version_digest, created_by
         ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING id`,
        [
          input.packId,
          input.departmentId,
          input.label,
          input.description,
          input.instructionsPreamble,
          input.modelFeatureKey,
          input.evaluationSuiteId,
          input.budget.maxInputTokens,
          input.budget.maxOutputTokens,
          input.budget.maxCostUsdMicros,
          input.budget.maxLatencyMs,
          input.materialDigest,
          input.actorUserId
        ]
      )
    },

    insertCapability(input: SeedCapabilityInput) {
      return insertedId(client,
        `INSERT INTO ai_capabilities (
           department_id, owner_user_id, capability_key, name, description, created_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.departmentId, input.ownerUserId, input.capabilityKey, input.name, input.description, input.actorUserId]
      )
    },

    insertCapabilityVersion(input: SeedCapabilityVersionInput) {
      const capability = input.capability
      return insertedId(client,
        `INSERT INTO ai_capability_versions (
           capability_id, department_id, version, description, required_permission_group,
           risk_class, data_class, approval_mode, model_feature_key, evaluation_suite_id,
           max_input_tokens, max_output_tokens, max_cost_usd_micros, max_latency_ms,
           material_version_digest, created_by
         ) VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         RETURNING id`,
        [
          input.capabilityId,
          input.departmentId,
          capability.description,
          capability.requiredPermissionGroup,
          capability.riskClass,
          capability.dataClass,
          capability.approvalMode,
          capability.modelFeatureKey,
          input.evaluationSuiteId,
          capability.budget.maxInputTokens,
          capability.budget.maxOutputTokens,
          capability.budget.maxCostUsdMicros,
          capability.budget.maxLatencyMs,
          input.materialDigest,
          input.actorUserId
        ]
      )
    },

    async insertToolBinding(input: SeedToolBindingInput) {
      await client.query(
        `INSERT INTO ai_capability_tool_bindings (
           capability_version_id, tool_name, access_mode, sort_order
         ) VALUES ($1, $2, $3, $4)`,
        [input.capabilityVersionId, input.toolName, input.accessMode, input.sortOrder]
      )
    },

    async linkPackCapability(input: SeedPackCapabilityInput) {
      await client.query(
        `INSERT INTO ai_pack_version_capabilities (
           pack_version_id, capability_version_id, department_id, sort_order
         ) VALUES ($1, $2, $3, $4)`,
        [input.packVersionId, input.capabilityVersionId, input.departmentId, input.sortOrder]
      )
    },

    insertCapabilityRelease(input: SeedDraftReleaseInput) {
      return insertedId(client,
        `INSERT INTO ai_capability_releases (
           capability_id, capability_version_id, department_id, release_state, change_reason, changed_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.entityId, input.versionId, input.departmentId, input.releaseState, input.reason, input.actorUserId]
      )
    },

    insertPackRelease(input: SeedDraftReleaseInput) {
      return insertedId(client,
        `INSERT INTO ai_pack_releases (
           pack_id, pack_version_id, department_id, release_state, change_reason, changed_by
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [input.entityId, input.versionId, input.departmentId, input.releaseState, input.reason, input.actorUserId]
      )
    },

    async appendAudit(input: SeedCatalogAuditInput) {
      await client.query(
        `INSERT INTO ai_catalog_audit_events (
           department_id, entity_type, entity_id, action, next_version_id,
           actor_user_id, reason, details
         ) VALUES ($1, $2, $3, 'created', $4, $5, $6, $7::jsonb)`,
        [
          input.departmentId,
          input.entityType,
          input.entityId,
          input.nextVersionId,
          input.actorUserId,
          input.reason,
          JSON.stringify(input.details)
        ]
      )
    }
  }
}

export const postgresDepartmentDraftPackSeedRepository: DepartmentDraftPackSeedRepository = {
  transaction(callback) {
    return runTransaction(database => callback(
      createPostgresDepartmentDraftPackSeedTransaction(database as unknown as DepartmentDraftPackSeedSqlClient)
    ))
  }
}
