import { queryRows as realQueryRows } from '~~/server/utils/db'
import { DEPARTMENT_PACK_BLUEPRINTS, normalizeDepartmentLabel } from './departmentPackBlueprints'

export interface CompanyAssistantRolloutReadiness {
  readyForPilot: boolean
  readyForEnforcement: boolean
  activeEmployeeCount: number
  coveredEmployeeCount: number
  uncoveredEmployees: Array<{
    userId: string
    name: string
    role: string
    reasons: Array<'no_department' | 'no_mapped_pack' | 'no_evaluated_release'>
  }>
  departmentCoverage: Array<{
    departmentId: string
    name: string
    ownerReady: boolean
    releaseState: 'missing' | 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
    latestGatePassed: boolean
    activeEmployeeCount: number
  }>
  blockers: string[]
}

export interface CompanyRolloutReadinessDb {
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export class CompanyRolloutReadinessError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'CompanyRolloutReadinessError'
  }
}

type ReleaseState = CompanyAssistantRolloutReadiness['departmentCoverage'][number]['releaseState']

interface DepartmentRow { id: string, name: string, slug: string }
interface EmployeeRow { id: string, name: string, role: string | null }
interface EmployeeDepartmentRow { user_id: string, department_ids: string[] | null }
interface ReleaseRow {
  department_id: string
  pack_id: string
  pack_key: string
  pack_version_id: string
  pack_version: number | string
  release_id: string
  release_state: Exclude<ReleaseState, 'missing'>
  evaluation_gate_passed: boolean | null
  evaluation_run_status: string | null
  owner_user_id: string
  owner_is_active: boolean
  owner_is_department_member: boolean
}
interface PilotRow {
  team_member_id: string
  release_id: string
  department_id: string
  release_department_id: string
  is_current_department_member: boolean
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const RELEASE_STATES = new Set<Exclude<ReleaseState, 'missing'>>(['draft', 'pilot', 'active', 'suspended', 'retired'])

const DEPARTMENTS_SQL = `
SELECT
  department.id,
  department.name,
  department.slug
FROM departments department
WHERE department.department_kind = 'organizational'
  AND department.is_active = TRUE
ORDER BY department.name, department.id
LIMIT 101
`

const EMPLOYEES_SQL = `
SELECT member.id, member.name, member.role
FROM team_members member
WHERE member.is_active = TRUE
ORDER BY member.name, member.id
LIMIT 101
`

const EMPLOYEE_DEPARTMENTS_SQL = `
WITH organizational_assignments AS (
  SELECT member.id AS user_id, member.department_id
  FROM team_members member
  JOIN departments department ON department.id = member.department_id
    AND department.department_kind = 'organizational'
    AND department.is_active = TRUE
  WHERE member.is_active = TRUE
    AND member.department_id IS NOT NULL

  UNION

  SELECT membership.team_member_id AS user_id, membership.department_id
  FROM department_members membership
  JOIN team_members member ON member.id = membership.team_member_id
    AND member.is_active = TRUE
  JOIN departments department ON department.id = membership.department_id
    AND department.department_kind = 'organizational'
    AND department.is_active = TRUE
)
SELECT
  member.id AS user_id,
  COALESCE(
    ARRAY_AGG(DISTINCT assignment.department_id) FILTER (WHERE assignment.department_id IS NOT NULL),
    ARRAY[]::uuid[]
  ) AS department_ids
FROM team_members member
LEFT JOIN organizational_assignments assignment ON assignment.user_id = member.id
WHERE member.is_active = TRUE
GROUP BY member.id
ORDER BY member.id
LIMIT 101
`

const PACK_RELEASES_SQL = `
SELECT
  department.id AS department_id,
  pack.id AS pack_id,
  pack.pack_key,
  version.id AS pack_version_id,
  version.version AS pack_version,
  release.id AS release_id,
  release.release_state,
  release.evaluation_gate_passed,
  release.evaluation_run_status,
  pack.owner_user_id,
  owner.is_active AS owner_is_active,
  EXISTS (
    SELECT 1 FROM department_members owner_membership
     WHERE owner_membership.department_id = department.id
       AND owner_membership.team_member_id = pack.owner_user_id
  ) AS owner_is_department_member
FROM departments department
JOIN ai_capability_packs pack ON pack.department_id = department.id
JOIN team_members owner ON owner.id = pack.owner_user_id
JOIN LATERAL (
  SELECT candidate.id, candidate.version
  FROM ai_capability_pack_versions candidate
  WHERE candidate.pack_id = pack.id
  ORDER BY candidate.version DESC, candidate.id DESC
  LIMIT 1
) version ON TRUE
JOIN ai_pack_releases release ON release.pack_version_id = version.id
WHERE department.department_kind = 'organizational'
  AND department.is_active = TRUE
ORDER BY department.id, pack.pack_key, pack.id
LIMIT 101
`

const ELIGIBLE_PILOTS_SQL = `
SELECT DISTINCT
  pilot.team_member_id,
  pilot.pack_release_id AS release_id,
  pilot.department_id,
  release.department_id AS release_department_id,
  TRUE AS is_current_department_member
FROM ai_release_pilot_members pilot
JOIN team_members member ON member.id = pilot.team_member_id
JOIN ai_pack_releases release ON release.id = pilot.pack_release_id
  AND release.department_id = pilot.department_id
JOIN department_members current_membership
  ON current_membership.department_id = pilot.department_id
  AND current_membership.team_member_id = pilot.team_member_id
WHERE pilot.release_kind = 'pack'
  AND pilot.revoked_at IS NULL
  AND member.is_active = TRUE
  AND release.release_state = 'pilot'
  AND release.evaluation_gate_passed = TRUE
  AND release.evaluation_run_status = 'completed'
ORDER BY pilot.team_member_id, pilot.pack_release_id
LIMIT 101
`

const defaultDb: CompanyRolloutReadinessDb = {
  queryRows: realQueryRows as CompanyRolloutReadinessDb['queryRows']
}

function fail(code: string): never {
  throw new CompanyRolloutReadinessError(code, 'Company rollout readiness data is invalid or exceeds its supported bound')
}

function assertBounded<T>(rows: T[], code: string): T[] {
  if (rows.length > 100) fail(code)
  return rows
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

function latestGatePassed(row: ReleaseRow): boolean {
  return row.evaluation_gate_passed === true && row.evaluation_run_status === 'completed'
}

function canonicalPackKey(department: DepartmentRow): string | null | 'ambiguous' {
  const labels = new Set([normalizeDepartmentLabel(department.name), normalizeDepartmentLabel(department.slug)])
  const matches = DEPARTMENT_PACK_BLUEPRINTS.filter(blueprint =>
    blueprint.departmentAliases.some(alias => labels.has(normalizeDepartmentLabel(alias)))
  )
  if (matches.length === 0) return null
  if (matches.length > 1) return 'ambiguous'
  return matches[0]!.packKey
}

function asPositiveInteger(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

export async function getCompanyAssistantRolloutReadiness(
  db: CompanyRolloutReadinessDb = defaultDb
): Promise<CompanyAssistantRolloutReadiness> {
  let departments: DepartmentRow[]
  let employees: EmployeeRow[]
  let employeeDepartments: EmployeeDepartmentRow[]
  let releases: ReleaseRow[]
  let pilots: PilotRow[]
  try {
    departments = assertBounded(await db.queryRows<DepartmentRow>(DEPARTMENTS_SQL), 'departments_unbounded')
    employees = assertBounded(await db.queryRows<EmployeeRow>(EMPLOYEES_SQL), 'employees_unbounded')
    employeeDepartments = assertBounded(await db.queryRows<EmployeeDepartmentRow>(EMPLOYEE_DEPARTMENTS_SQL), 'employee_departments_unbounded')
    releases = assertBounded(await db.queryRows<ReleaseRow>(PACK_RELEASES_SQL), 'releases_unbounded')
    pilots = assertBounded(await db.queryRows<PilotRow>(ELIGIBLE_PILOTS_SQL), 'pilot_memberships_unbounded')
  } catch (error) {
    if (error instanceof CompanyRolloutReadinessError) throw error
    fail('readiness_query_failed')
  }

  const departmentById = new Map<string, DepartmentRow>()
  for (const department of departments) {
    if (!validUuid(department.id) || typeof department.name !== 'string' || typeof department.slug !== 'string' || departmentById.has(department.id)) fail('invalid_department_row')
    departmentById.set(department.id, department)
  }

  const employeeById = new Map<string, EmployeeRow>()
  for (const employee of employees) {
    if (!validUuid(employee.id) || typeof employee.name !== 'string' || (employee.role !== null && typeof employee.role !== 'string') || employeeById.has(employee.id)) fail('invalid_employee_row')
    employeeById.set(employee.id, employee)
  }

  const departmentIdsByEmployee = new Map<string, string[]>()
  for (const row of employeeDepartments) {
    if (!validUuid(row.user_id) || !employeeById.has(row.user_id) || departmentIdsByEmployee.has(row.user_id) || !Array.isArray(row.department_ids) || row.department_ids.some(id => !validUuid(id) || !departmentById.has(id))) fail('invalid_employee_department_row')
    departmentIdsByEmployee.set(row.user_id, [...new Set(row.department_ids)])
  }
  for (const employeeId of employeeById.keys()) {
    if (!departmentIdsByEmployee.has(employeeId)) fail('missing_employee_department_row')
  }

  const releasesByDepartment = new Map<string, ReleaseRow[]>()
  for (const release of releases) {
    if (!validUuid(release.department_id) || !departmentById.has(release.department_id) || !validUuid(release.pack_id) || typeof release.pack_key !== 'string' || !validUuid(release.pack_version_id) || asPositiveInteger(release.pack_version) === null || !validUuid(release.release_id) || !validUuid(release.owner_user_id) || !RELEASE_STATES.has(release.release_state) || typeof release.evaluation_gate_passed !== 'boolean' && release.evaluation_gate_passed !== null || typeof release.evaluation_run_status !== 'string' && release.evaluation_run_status !== null || typeof release.owner_is_active !== 'boolean' || typeof release.owner_is_department_member !== 'boolean') fail('invalid_release_row')
    releasesByDepartment.set(release.department_id, [...(releasesByDepartment.get(release.department_id) ?? []), release])
  }

  const releaseByDepartment = new Map<string, ReleaseRow>()
  const ambiguousDepartmentIds = new Set<string>()
  for (const department of departmentById.values()) {
    const expectedPackKey = canonicalPackKey(department)
    if (expectedPackKey === 'ambiguous') {
      ambiguousDepartmentIds.add(department.id)
      continue
    }
    if (!expectedPackKey) continue
    const candidates = (releasesByDepartment.get(department.id) ?? []).filter(release => release.pack_key === expectedPackKey)
    if (candidates.length === 0) continue
    const packIds = new Set(candidates.map(candidate => candidate.pack_id))
    if (packIds.size !== 1) {
      ambiguousDepartmentIds.add(department.id)
      continue
    }
    const sorted = [...candidates].sort((left, right) => {
      const versionDifference = asPositiveInteger(right.pack_version)! - asPositiveInteger(left.pack_version)!
      return versionDifference || right.pack_version_id.localeCompare(left.pack_version_id)
    })
    if (sorted.length > 1 && asPositiveInteger(sorted[0]!.pack_version) === asPositiveInteger(sorted[1]!.pack_version)) {
      ambiguousDepartmentIds.add(department.id)
      continue
    }
    releaseByDepartment.set(department.id, sorted[0]!)
  }

  const eligiblePilotReleaseIds = new Set<string>()
  for (const pilot of pilots) {
    if (!validUuid(pilot.team_member_id) || !employeeById.has(pilot.team_member_id) || !validUuid(pilot.release_id) || !validUuid(pilot.department_id) || !validUuid(pilot.release_department_id) || typeof pilot.is_current_department_member !== 'boolean') fail('invalid_pilot_membership_row')
    if (pilot.department_id === pilot.release_department_id && pilot.is_current_department_member) eligiblePilotReleaseIds.add(pilot.release_id)
  }

  const departmentCoverage = [...departmentById.values()].map(department => {
    const release = releaseByDepartment.get(department.id)
    return {
      departmentId: department.id,
      name: department.name,
      ownerReady: release?.owner_is_active === true && release.owner_is_department_member === true,
      releaseState: release?.release_state ?? 'missing',
      latestGatePassed: release ? latestGatePassed(release) : false,
      activeEmployeeCount: 0
    }
  })
  const coverageByDepartment = new Map(departmentCoverage.map(coverage => [coverage.departmentId, coverage]))
  for (const departmentIds of departmentIdsByEmployee.values()) {
    for (const departmentId of departmentIds) coverageByDepartment.get(departmentId)!.activeEmployeeCount++
  }

  const blockers: string[] = []
  for (const coverage of departmentCoverage) {
    if (ambiguousDepartmentIds.has(coverage.departmentId)) {
      blockers.push(`department:${coverage.departmentId}:ambiguous_mapped_pack`)
      continue
    }
    if (coverage.releaseState === 'missing') blockers.push(`department:${coverage.departmentId}:no_mapped_pack`)
    else {
      if (!coverage.ownerReady) blockers.push(`department:${coverage.departmentId}:owner_not_ready`)
      if (coverage.releaseState === 'draft') blockers.push(`department:${coverage.departmentId}:release_draft`)
      if (coverage.releaseState === 'pilot') blockers.push(`department:${coverage.departmentId}:release_pilot`)
      if (releaseByDepartment.get(coverage.departmentId)?.evaluation_gate_passed === false) blockers.push(`department:${coverage.departmentId}:evaluation_gate_failed`)
      if (coverage.releaseState === 'suspended' || coverage.releaseState === 'retired') blockers.push(`department:${coverage.departmentId}:release_${coverage.releaseState}`)
    }
  }

  const uncoveredEmployees: CompanyAssistantRolloutReadiness['uncoveredEmployees'] = []
  let coveredEmployeeCount = 0
  for (const employee of employeeById.values()) {
    const departmentIds = departmentIdsByEmployee.get(employee.id)!
    const reasons: CompanyAssistantRolloutReadiness['uncoveredEmployees'][number]['reasons'] = []
    if (departmentIds.length === 0) {
      reasons.push('no_department')
    } else {
      const releasesForEmployee = departmentIds.map(id => releaseByDepartment.get(id)).filter((release): release is ReleaseRow => Boolean(release))
      if (releasesForEmployee.length === 0) reasons.push('no_mapped_pack')
      else if (!releasesForEmployee.some(latestGatePassed)) reasons.push('no_evaluated_release')
    }
    if (reasons.length === 0) coveredEmployeeCount++
    else uncoveredEmployees.push({ userId: employee.id, name: employee.name, role: employee.role ?? 'unknown', reasons })
  }
  for (const employee of uncoveredEmployees) blockers.push(`employee:${employee.userId}:${employee.reasons.join('+')}`)

  const evaluatedPilotReleaseIds = new Set(
    [...releaseByDepartment.values()]
      .filter(release => release.release_state === 'pilot' && latestGatePassed(release))
      .map(release => release.release_id)
  )
  const hasEligiblePilot = [...eligiblePilotReleaseIds].some(id => evaluatedPilotReleaseIds.has(id))
  if (evaluatedPilotReleaseIds.size === 0) blockers.push('no_evaluated_pilot_release')
  if (!hasEligiblePilot) blockers.push('no_eligible_pilot_membership')

  return {
    readyForPilot: evaluatedPilotReleaseIds.size > 0 && hasEligiblePilot,
    readyForEnforcement: uncoveredEmployees.length === 0 && departmentCoverage.every(coverage => coverage.ownerReady && coverage.releaseState === 'active' && coverage.latestGatePassed),
    activeEmployeeCount: employeeById.size,
    coveredEmployeeCount,
    uncoveredEmployees,
    departmentCoverage,
    blockers
  }
}
