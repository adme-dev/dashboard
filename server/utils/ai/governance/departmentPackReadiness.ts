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

export interface DepartmentPackReadinessItem {
  key: DepartmentPackBlueprint['key']
  packKey: string
  name: string
  description: string
  status: DepartmentPackReadinessStatus
  releaseState: 'not_seeded'
  blockers: string[]
  department: { id: string, name: string, slug: string } | null
  departmentMatches: Array<{ id: string, name: string, slug: string }>
  ownerCandidate: { id: string, name: string, source: 'department_manager' } | null
  coverage: { capabilities: number, tools: number, evaluationCases: number }
  knownGaps: string[]
}

export interface DepartmentPackReadinessResult {
  summary: {
    total: number
    readyForOwnerConfirmation: number
    blocked: number
    missingDepartments: number
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

  const matchedDepartmentIds = new Set<string>()
  const items = blueprints.map((blueprint): DepartmentPackReadinessItem => {
    const matches = rows.filter(row => matchesBlueprint(row, blueprint))
    matches.forEach(row => matchedDepartmentIds.add(row.id))
    const readiness = statusFor(matches)
    const departmentMatches = matches.map(row => ({ id: row.id, name: row.name, slug: row.slug }))
    const boundTools = new Set(blueprint.capabilities.flatMap(item => item.toolBindings.map(binding => binding.toolName)))
    return {
      key: blueprint.key,
      packKey: blueprint.packKey,
      name: blueprint.name,
      description: blueprint.description,
      status: readiness.status,
      releaseState: 'not_seeded',
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
  return {
    summary: {
      total: items.length,
      readyForOwnerConfirmation,
      blocked: items.length - readyForOwnerConfirmation,
      missingDepartments
    },
    items,
    unmappedDepartments: rows
      .filter(row => !matchedDepartmentIds.has(row.id))
      .map(row => ({ id: row.id, name: row.name, slug: row.slug }))
  }
}
