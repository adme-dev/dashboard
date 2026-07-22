import { z } from 'zod'
import {
  DEPARTMENT_PACK_BLUEPRINTS,
  REQUIRED_DEPARTMENT_PACK_KEYS,
  normalizeDepartmentLabel,
  type DepartmentCapabilityBlueprint,
  type DepartmentPackBlueprint,
  type RequiredDepartmentPackKey
} from './departmentPackBlueprints'
import type { EvaluationCase } from './contracts'

const UUID = z.string().uuid()
const SeedRequestSchema = z.object({
  blueprintKey: z.enum(REQUIRED_DEPARTMENT_PACK_KEYS),
  departmentId: UUID,
  ownerUserId: UUID,
  actorUserId: UUID,
  reason: z.string().trim().min(10).max(2_000)
}).strict()

export interface DepartmentDraftPackSeedRequest {
  blueprintKey: RequiredDepartmentPackKey
  departmentId: string
  ownerUserId: string
  actorUserId: string
  reason: string
}

export interface ExistingDepartmentDraftPack {
  packId: string
  packVersionId: string
  packReleaseId: string
  ownerUserId: string
  version: number
  materialDigest: string
  releaseState: 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
}

export interface DepartmentDraftPackOwnerContext {
  department: { id: string, name: string, slug: string, isOrganizational: boolean, isActive: boolean }
  owner: { id: string, name: string, isActive: boolean, isDepartmentMember: boolean }
}

interface SeedBase {
  departmentId: string
  ownerUserId: string
  actorUserId: string
}

export interface SeedEvaluationSuiteInput extends SeedBase {
  suiteKey: string
  name: string
  description: string
}

export interface SeedEvaluationSuiteVersionInput {
  evaluationSuiteId: string
  departmentId: string
  name: string
  caseManifestDigest: string
  actorUserId: string
}

export interface SeedEvaluationCaseInput {
  evaluationSuiteVersionId: string
  departmentId: string
  value: EvaluationCase
  actorUserId: string
}

export interface SeedPackInput extends SeedBase {
  packKey: string
  name: string
  description: string
}

export interface SeedPackVersionInput {
  packId: string
  departmentId: string
  label: string
  description: string
  instructionsPreamble: string
  modelFeatureKey: string
  evaluationSuiteId: string
  budget: DepartmentPackBlueprint['budget']
  materialDigest: string
  actorUserId: string
}

export interface SeedCapabilityInput extends SeedBase {
  capabilityKey: string
  name: string
  description: string
}

export interface SeedCapabilityVersionInput {
  capabilityId: string
  departmentId: string
  capability: DepartmentCapabilityBlueprint
  evaluationSuiteId: string
  materialDigest: string
  actorUserId: string
}

export interface SeedToolBindingInput {
  capabilityVersionId: string
  toolName: string
  accessMode: 'read' | 'draft'
  sortOrder: number
}

export interface SeedPackCapabilityInput {
  packVersionId: string
  capabilityVersionId: string
  departmentId: string
  sortOrder: number
}

export interface SeedDraftReleaseInput {
  entityId: string
  versionId: string
  departmentId: string
  releaseState: 'draft'
  reason: string
  actorUserId: string
}

export interface SeedCatalogAuditInput {
  departmentId: string
  entityType: 'pack' | 'capability' | 'eval_suite'
  entityId: string
  nextVersionId: string
  actorUserId: string
  reason: string
  details: Record<string, unknown>
}

export interface DepartmentDraftPackSeedTransaction {
  lockSeed(departmentId: string, packKey: string): Promise<void>
  getOwnerContext(departmentId: string, ownerUserId: string): Promise<DepartmentDraftPackOwnerContext | null>
  findExistingPack(departmentId: string, packKey: string): Promise<ExistingDepartmentDraftPack | null>
  insertEvaluationSuite(input: SeedEvaluationSuiteInput): Promise<string>
  insertEvaluationSuiteVersion(input: SeedEvaluationSuiteVersionInput): Promise<string>
  insertEvaluationCase(input: SeedEvaluationCaseInput): Promise<string>
  insertPack(input: SeedPackInput): Promise<string>
  insertPackVersion(input: SeedPackVersionInput): Promise<string>
  insertCapability(input: SeedCapabilityInput): Promise<string>
  insertCapabilityVersion(input: SeedCapabilityVersionInput): Promise<string>
  insertToolBinding(input: SeedToolBindingInput): Promise<void>
  linkPackCapability(input: SeedPackCapabilityInput): Promise<void>
  insertCapabilityRelease(input: SeedDraftReleaseInput): Promise<string>
  insertPackRelease(input: SeedDraftReleaseInput): Promise<string>
  appendAudit(input: SeedCatalogAuditInput): Promise<void>
}

export interface DepartmentDraftPackSeedRepository {
  transaction<T>(callback: (transaction: DepartmentDraftPackSeedTransaction) => Promise<T>): Promise<T>
}

export interface DepartmentDraftPackSeedResult {
  outcome: 'created' | 'already_exists'
  blueprintKey: RequiredDepartmentPackKey
  departmentId: string
  ownerUserId: string
  packId: string
  packVersionId: string
  packReleaseId: string
  releaseState: 'draft'
  version: 1
  materialDigest: string
  capabilityCount: number
  evaluationCaseCount: number
}

export class DepartmentDraftPackSeedError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'DepartmentDraftPackSeedError'
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableJson(value))
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function blueprintMatchesDepartment(blueprint: DepartmentPackBlueprint, context: DepartmentDraftPackOwnerContext) {
  const labels = new Set([
    normalizeDepartmentLabel(context.department.name),
    normalizeDepartmentLabel(context.department.slug)
  ])
  return blueprint.departmentAliases.some(alias => labels.has(normalizeDepartmentLabel(alias)))
}

function validateOwnerContext(
  context: DepartmentDraftPackOwnerContext | null,
  blueprint: DepartmentPackBlueprint
): DepartmentDraftPackOwnerContext {
  if (!context || !context.department.isActive || !context.department.isOrganizational) {
    throw new DepartmentDraftPackSeedError('department_not_eligible', 422, 'The selected organizational department is not active.')
  }
  if (!blueprintMatchesDepartment(blueprint, context)) {
    throw new DepartmentDraftPackSeedError('department_blueprint_mismatch', 422, 'The selected department does not match this pack blueprint.')
  }
  if (!context.owner.isActive) {
    throw new DepartmentDraftPackSeedError('owner_inactive', 422, 'The selected pack owner is not active.')
  }
  if (!context.owner.isDepartmentMember) {
    throw new DepartmentDraftPackSeedError('owner_not_member', 422, 'The selected pack owner is not a member of this department.')
  }
  return context
}

async function buildMaterial(blueprint: DepartmentPackBlueprint) {
  const caseManifestDigest = await digest(blueprint.evaluationCases)
  const capabilityDigests = await Promise.all(blueprint.capabilities.map(item => digest({
    schemaVersion: 1,
    capability: item,
    evaluationSuiteKey: blueprint.evaluationSuiteKey,
    caseManifestDigest
  })))
  const materialDigest = await digest({
    schemaVersion: 1,
    pack: {
      key: blueprint.packKey,
      name: blueprint.name,
      description: blueprint.description,
      instructionsPreamble: blueprint.instructionsPreamble,
      modelFeatureKey: blueprint.modelFeatureKey,
      budget: blueprint.budget
    },
    capabilities: blueprint.capabilities,
    evaluationSuiteKey: blueprint.evaluationSuiteKey,
    caseManifestDigest
  })
  return { caseManifestDigest, capabilityDigests, materialDigest }
}

export async function seedDepartmentDraftPack(
  input: DepartmentDraftPackSeedRequest,
  repository: DepartmentDraftPackSeedRepository
): Promise<DepartmentDraftPackSeedResult> {
  const parsed = SeedRequestSchema.safeParse(input)
  if (!parsed.success) {
    throw new DepartmentDraftPackSeedError('invalid_seed_request', 422, 'Invalid department draft-pack seed request.')
  }
  const request = parsed.data
  const blueprint = DEPARTMENT_PACK_BLUEPRINTS.find(item => item.key === request.blueprintKey)
  if (!blueprint) {
    throw new DepartmentDraftPackSeedError('blueprint_not_found', 404, 'Department pack blueprint not found.')
  }
  const material = await buildMaterial(blueprint)

  return repository.transaction(async (transaction) => {
    await transaction.lockSeed(request.departmentId, blueprint.packKey)
    validateOwnerContext(
      await transaction.getOwnerContext(request.departmentId, request.ownerUserId),
      blueprint
    )

    const existing = await transaction.findExistingPack(request.departmentId, blueprint.packKey)
    if (existing) {
      if (
        existing.ownerUserId === request.ownerUserId
        && existing.version === 1
        && existing.materialDigest === material.materialDigest
        && existing.releaseState === 'draft'
      ) {
        return {
          outcome: 'already_exists',
          blueprintKey: blueprint.key,
          departmentId: request.departmentId,
          ownerUserId: request.ownerUserId,
          packId: existing.packId,
          packVersionId: existing.packVersionId,
          packReleaseId: existing.packReleaseId,
          releaseState: 'draft',
          version: 1,
          materialDigest: material.materialDigest,
          capabilityCount: blueprint.capabilities.length,
          evaluationCaseCount: blueprint.evaluationCases.length
        }
      }
      throw new DepartmentDraftPackSeedError('draft_pack_conflict', 409, 'A different governed pack already exists for this department and key.')
    }

    const base = {
      departmentId: request.departmentId,
      ownerUserId: request.ownerUserId,
      actorUserId: request.actorUserId
    }
    const evaluationSuiteId = await transaction.insertEvaluationSuite({
      ...base,
      suiteKey: blueprint.evaluationSuiteKey,
      name: `${blueprint.name} Evaluation`,
      description: `Deterministic safety and representative-task suite for ${blueprint.name}.`
    })
    const evaluationSuiteVersionId = await transaction.insertEvaluationSuiteVersion({
      evaluationSuiteId,
      departmentId: request.departmentId,
      name: `${blueprint.name} Evaluation v1`,
      caseManifestDigest: material.caseManifestDigest,
      actorUserId: request.actorUserId
    })
    for (const value of blueprint.evaluationCases) {
      await transaction.insertEvaluationCase({
        evaluationSuiteVersionId,
        departmentId: request.departmentId,
        value,
        actorUserId: request.actorUserId
      })
    }
    await transaction.appendAudit({
      departmentId: request.departmentId,
      entityType: 'eval_suite',
      entityId: evaluationSuiteId,
      nextVersionId: evaluationSuiteVersionId,
      actorUserId: request.actorUserId,
      reason: request.reason,
      details: { suiteKey: blueprint.evaluationSuiteKey, version: 1, caseCount: blueprint.evaluationCases.length }
    })

    const packId = await transaction.insertPack({
      ...base,
      packKey: blueprint.packKey,
      name: blueprint.name,
      description: blueprint.description
    })
    const packVersionId = await transaction.insertPackVersion({
      packId,
      departmentId: request.departmentId,
      label: `${blueprint.name} v1`,
      description: blueprint.description,
      instructionsPreamble: blueprint.instructionsPreamble,
      modelFeatureKey: blueprint.modelFeatureKey,
      evaluationSuiteId,
      budget: blueprint.budget,
      materialDigest: material.materialDigest,
      actorUserId: request.actorUserId
    })

    for (const [capabilityIndex, capability] of blueprint.capabilities.entries()) {
      const capabilityId = await transaction.insertCapability({
        ...base,
        capabilityKey: capability.key,
        name: capability.name,
        description: capability.description
      })
      const capabilityVersionId = await transaction.insertCapabilityVersion({
        capabilityId,
        departmentId: request.departmentId,
        capability,
        evaluationSuiteId,
        materialDigest: material.capabilityDigests[capabilityIndex]!,
        actorUserId: request.actorUserId
      })
      for (const [bindingIndex, binding] of capability.toolBindings.entries()) {
        await transaction.insertToolBinding({
          capabilityVersionId,
          toolName: binding.toolName,
          accessMode: binding.accessMode,
          sortOrder: bindingIndex
        })
      }
      await transaction.linkPackCapability({
        packVersionId,
        capabilityVersionId,
        departmentId: request.departmentId,
        sortOrder: capabilityIndex
      })
      await transaction.insertCapabilityRelease({
        entityId: capabilityId,
        versionId: capabilityVersionId,
        departmentId: request.departmentId,
        releaseState: 'draft',
        reason: request.reason,
        actorUserId: request.actorUserId
      })
      await transaction.appendAudit({
        departmentId: request.departmentId,
        entityType: 'capability',
        entityId: capabilityId,
        nextVersionId: capabilityVersionId,
        actorUserId: request.actorUserId,
        reason: request.reason,
        details: { capabilityKey: capability.key, version: 1, releaseState: 'draft' }
      })
    }

    const packReleaseId = await transaction.insertPackRelease({
      entityId: packId,
      versionId: packVersionId,
      departmentId: request.departmentId,
      releaseState: 'draft',
      reason: request.reason,
      actorUserId: request.actorUserId
    })
    await transaction.appendAudit({
      departmentId: request.departmentId,
      entityType: 'pack',
      entityId: packId,
      nextVersionId: packVersionId,
      actorUserId: request.actorUserId,
      reason: request.reason,
      details: {
        blueprintKey: blueprint.key,
        packKey: blueprint.packKey,
        version: 1,
        releaseState: 'draft',
        capabilityCount: blueprint.capabilities.length
      }
    })

    return {
      outcome: 'created',
      blueprintKey: blueprint.key,
      departmentId: request.departmentId,
      ownerUserId: request.ownerUserId,
      packId,
      packVersionId,
      packReleaseId,
      releaseState: 'draft',
      version: 1,
      materialDigest: material.materialDigest,
      capabilityCount: blueprint.capabilities.length,
      evaluationCaseCount: blueprint.evaluationCases.length
    }
  })
}
