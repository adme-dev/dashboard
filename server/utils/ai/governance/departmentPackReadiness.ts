import { queryRows as realQueryRows } from '~~/server/utils/db'
import { registry } from '~~/server/utils/ai/tools'
import {
  DEPARTMENT_PACK_BLUEPRINTS,
  normalizeDepartmentLabel,
  validateDepartmentPackBlueprints,
  type DepartmentPackBlueprint
} from './departmentPackBlueprints'

export type DepartmentPackReadinessStatus
  = 'ready_for_owner_confirmation'
    | 'draft_seeded'
    | 'released'
    | 'missing_department'
    | 'ambiguous_department'
    | 'missing_owner'
    | 'owner_inactive'
    | 'owner_not_member'

export interface DepartmentPackReadinessDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

interface DepartmentReadinessRow {
  id: string
  name: string
  slug: string
  manager_id: string | null
  manager_name: string | null
  manager_is_active: boolean | null
  manager_is_member: boolean
}

interface CatalogPackReadinessRow {
  department_id: string
  pack_key: string
  pack_id: string
  pack_version_id: string
  pack_release_id: string
  owner_user_id: string
  owner_name: string
  owner_is_active: boolean
  owner_is_department_member: boolean
  version: number | string
  release_state: 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
}

export interface DepartmentPackReadinessItem {
  key: DepartmentPackBlueprint['key']
  packKey: string
  name: string
  description: string
  status: DepartmentPackReadinessStatus
  releaseState: 'not_seeded' | CatalogPackReadinessRow['release_state']
  blockers: string[]
  department: { id: string, name: string, slug: string } | null
  departmentMatches: Array<{ id: string, name: string, slug: string }>
  ownerCandidate: { id: string, name: string, source: 'department_manager' | 'catalog_owner' } | null
  coverage: { capabilities: number, tools: number, evaluationCases: number }
  knownGaps: string[]
}

export interface DepartmentPackReadinessResult {
  summary: {
    total: number
    readyForOwnerConfirmation: number
    blocked: number
    missingDepartments: number
    draftSeeded: number
    released: number
  }
  items: DepartmentPackReadinessItem[]
  unmappedDepartments: Array<{ id: string, name: string, slug: string }>
}

export class DepartmentPackReadinessError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number, message: string) {
    super(message)
    this.name = 'DepartmentPackReadinessError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RELEASE_STATES = new Set<CatalogPackReadinessRow['release_state']>(['draft', 'pilot', 'active', 'suspended', 'retired'])

const READINESS_SQL = `
SELECT
  department.id,
  department.name,
  department.slug,
  department.manager_id,
  manager.name AS manager_name,
  manager.is_active AS manager_is_active,
  EXISTS (
    SELECT 1
      FROM department_members membership
     WHERE membership.department_id = department.id
       AND membership.team_member_id = department.manager_id
  ) AS manager_is_member
FROM departments department
LEFT JOIN team_members manager ON manager.id = department.manager_id
WHERE department.department_kind = 'organizational'
  AND department.is_active = TRUE
ORDER BY department.name, department.id
LIMIT 101
`

const CATALOG_PACK_READINESS_SQL = `
SELECT
  pack.department_id,
  pack.pack_key,
  pack.id AS pack_id,
  version.id AS pack_version_id,
  release.id AS pack_release_id,
  pack.owner_user_id,
  owner.name AS owner_name,
  owner.is_active AS owner_is_active,
  EXISTS (
    SELECT 1
      FROM department_members membership
     WHERE membership.department_id = pack.department_id
       AND membership.team_member_id = pack.owner_user_id
  ) AS owner_is_department_member,
  version.version,
  release.release_state
FROM ai_capability_packs pack
JOIN departments department ON department.id = pack.department_id
JOIN team_members owner ON owner.id = pack.owner_user_id
JOIN LATERAL (
  SELECT candidate.id, candidate.version
    FROM ai_capability_pack_versions candidate
   WHERE candidate.pack_id = pack.id
   ORDER BY candidate.version DESC
   LIMIT 1
) version ON TRUE
JOIN ai_pack_releases release ON release.pack_version_id = version.id
WHERE pack.pack_key = ANY($1::text[])
  AND department.department_kind = 'organizational'
  AND department.is_active = TRUE
ORDER BY pack.pack_key, pack.department_id
LIMIT 101
`

function matchesBlueprint(row: DepartmentReadinessRow, blueprint: DepartmentPackBlueprint): boolean {
  const labels = new Set([normalizeDepartmentLabel(row.name), normalizeDepartmentLabel(row.slug)])
  return blueprint.departmentAliases.some(alias => labels.has(normalizeDepartmentLabel(alias)))
}

function statusFor(matches: DepartmentReadinessRow[]): {
  status: DepartmentPackReadinessStatus
  blockers: string[]
  ownerCandidate: DepartmentPackReadinessItem['ownerCandidate']
} {
  if (matches.length === 0) {
    return {
      status: 'missing_department',
      blockers: ['Create or map the organizational department before seeding this pack.'],
      ownerCandidate: null
    }
  }
  if (matches.length > 1) {
    return {
      status: 'ambiguous_department',
      blockers: ['More than one organizational department matches this pack; choose one explicitly.'],
      ownerCandidate: null
    }
  }

  const department = matches[0]!
  if (!department.manager_id) {
    return {
      status: 'missing_owner',
      blockers: ['Assign a department manager or nominate another active department member as AI capability owner.'],
      ownerCandidate: null
    }
  }
  if (department.manager_is_active !== true || !department.manager_name) {
    return {
      status: 'owner_inactive',
      blockers: ['The department manager is inactive or missing and cannot own a governed capability pack.'],
      ownerCandidate: null
    }
  }
  if (!department.manager_is_member) {
    return {
      status: 'owner_not_member',
      blockers: ['The department manager must be an explicit member of the same department before becoming pack owner.'],
      ownerCandidate: null
    }
  }
  return {
    status: 'ready_for_owner_confirmation',
    blockers: ['Confirm this department manager as the governed AI pack owner before seeding.'],
    ownerCandidate: {
      id: department.manager_id,
      name: department.manager_name,
      source: 'department_manager'
    }
  }
}

function seededStatus(row: CatalogPackReadinessRow): {
  status: DepartmentPackReadinessStatus
  blockers: string[]
  ownerCandidate: DepartmentPackReadinessItem['ownerCandidate']
} {
  if (!row.owner_is_active) {
    return { status: 'owner_inactive', blockers: ['The governed pack owner is inactive and must be replaced before promotion.'], ownerCandidate: null }
  }
  if (!row.owner_is_department_member) {
    return { status: 'owner_not_member', blockers: ['The governed pack owner is no longer a member of this department.'], ownerCandidate: null }
  }
  const ownerCandidate = { id: row.owner_user_id, name: row.owner_name, source: 'catalog_owner' as const }
  if (row.release_state === 'draft') {
    return {
      status: 'draft_seeded',
      blockers: ['Run and approve the exact version-bound evaluation suite before assigning pilots.'],
      ownerCandidate
    }
  }
  return {
    status: 'released',
    blockers: row.release_state === 'suspended' || row.release_state === 'retired'
      ? [`This governed release is ${row.release_state}.`]
      : [],
    ownerCandidate
  }
}

const defaultDb: DepartmentPackReadinessDb = {
  queryRows: realQueryRows as DepartmentPackReadinessDb['queryRows']
}
const defaultToolMetadata = registry.map(tool => ({ name: tool.name, mutates: tool.mutates === true }))

export async function getDepartmentPackReadiness(
  db: DepartmentPackReadinessDb = defaultDb,
  blueprints: DepartmentPackBlueprint[] = DEPARTMENT_PACK_BLUEPRINTS,
  tools: Array<{ name: string, mutates: boolean }> = defaultToolMetadata
): Promise<DepartmentPackReadinessResult> {
  const validation = validateDepartmentPackBlueprints(blueprints, tools)
  if (!validation.valid) {
    throw new DepartmentPackReadinessError(
      'blueprint_integrity_error',
      500,
      `Department pack blueprint validation failed (${validation.issues[0]?.code ?? 'unknown'}).`
    )
  }

  const rows = await db.queryRows<DepartmentReadinessRow>(READINESS_SQL, [])
  if (rows.length > 100) {
    throw new DepartmentPackReadinessError('department_limit_exceeded', 500, 'Department readiness supports at most 100 organizational departments.')
  }
  const seenIds = new Set<string>()
  for (const row of rows) {
    if (!UUID_PATTERN.test(row.id) || (row.manager_id != null && !UUID_PATTERN.test(row.manager_id)) || seenIds.has(row.id)) {
      throw new DepartmentPackReadinessError('invalid_department_record', 500, 'Invalid organizational department identity record.')
    }
    seenIds.add(row.id)
  }
  const catalogRows = await db.queryRows<CatalogPackReadinessRow>(CATALOG_PACK_READINESS_SQL, [
    blueprints.map(blueprint => blueprint.packKey)
  ])
  if (catalogRows.length > 100) {
    throw new DepartmentPackReadinessError('catalog_limit_exceeded', 500, 'Department readiness supports at most 100 governed packs.')
  }
  for (const row of catalogRows) {
    const version = Number(row.version)
    if (
      !UUID_PATTERN.test(row.department_id)
      || !UUID_PATTERN.test(row.pack_id)
      || !UUID_PATTERN.test(row.pack_version_id)
      || !UUID_PATTERN.test(row.pack_release_id)
      || !UUID_PATTERN.test(row.owner_user_id)
      || !row.owner_name?.trim()
      || typeof row.owner_is_active !== 'boolean'
      || typeof row.owner_is_department_member !== 'boolean'
      || !Number.isInteger(version)
      || version < 1
      || !RELEASE_STATES.has(row.release_state)
    ) {
      throw new DepartmentPackReadinessError('invalid_catalog_record', 500, 'Invalid governed pack readiness record.')
    }
  }

  const matchedDepartmentIds = new Set<string>()
  const items = blueprints.map((blueprint): DepartmentPackReadinessItem => {
    const matches = rows.filter(row => matchesBlueprint(row, blueprint))
    matches.forEach(row => matchedDepartmentIds.add(row.id))
    const seededMatches = catalogRows.filter(row => row.pack_key === blueprint.packKey)
    if (seededMatches.length > 1) {
      throw new DepartmentPackReadinessError('catalog_pack_ambiguous', 500, 'A governed pack key is assigned to more than one department.')
    }
    const seeded = seededMatches[0] ?? null
    if (seeded && !matches.some(match => match.id === seeded.department_id)) {
      throw new DepartmentPackReadinessError('catalog_department_mismatch', 500, 'A governed pack is assigned to a mismatched department.')
    }
    const readiness = seeded ? seededStatus(seeded) : statusFor(matches)
    const departmentMatches = matches.map(row => ({ id: row.id, name: row.name, slug: row.slug }))
    const boundTools = new Set(blueprint.capabilities.flatMap(item => item.toolBindings.map(binding => binding.toolName)))
    return {
      key: blueprint.key,
      packKey: blueprint.packKey,
      name: blueprint.name,
      description: blueprint.description,
      status: readiness.status,
      releaseState: seeded?.release_state ?? 'not_seeded',
      blockers: readiness.blockers,
      department: matches.length === 1 ? departmentMatches[0]! : null,
      departmentMatches,
      ownerCandidate: readiness.ownerCandidate,
      coverage: {
        capabilities: blueprint.capabilities.length,
        tools: boundTools.size,
        evaluationCases: blueprint.evaluationCases.length
      },
      knownGaps: [...blueprint.knownGaps]
    }
  })

  const readyForOwnerConfirmation = items.filter(item => item.status === 'ready_for_owner_confirmation').length
  const missingDepartments = items.filter(item => item.status === 'missing_department').length
  const draftSeeded = items.filter(item => item.status === 'draft_seeded').length
  const released = items.filter(item => item.status === 'released').length
  return {
    summary: {
      total: items.length,
      readyForOwnerConfirmation,
      blocked: items.filter(item => !['ready_for_owner_confirmation', 'draft_seeded', 'released'].includes(item.status)).length,
      missingDepartments,
      draftSeeded,
      released
    },
    items,
    unmappedDepartments: rows
      .filter(row => !matchedDepartmentIds.has(row.id))
      .map(row => ({ id: row.id, name: row.name, slug: row.slug }))
  }
}
