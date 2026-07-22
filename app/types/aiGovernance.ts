export type AiDepartmentReadinessStatus
  = | 'ready_for_owner_confirmation'
    | 'draft_seeded'
    | 'released'
    | 'missing_department'
    | 'ambiguous_department'
    | 'missing_owner'
    | 'owner_inactive'
    | 'owner_not_member'

export interface AiDepartmentReadinessItem {
  key: string
  packKey: string
  name: string
  description: string
  status: AiDepartmentReadinessStatus
  releaseState: 'not_seeded' | 'draft' | 'pilot' | 'active' | 'suspended' | 'retired'
  blockers: string[]
  department: { id: string, name: string, slug: string } | null
  departmentMatches: Array<{ id: string, name: string, slug: string }>
  ownerCandidate: { id: string, name: string, source: 'department_manager' | 'catalog_owner' } | null
  coverage: { capabilities: number, tools: number, evaluationCases: number }
  knownGaps: string[]
}

export interface AiDepartmentReadinessResponse {
  summary: {
    total: number
    readyForOwnerConfirmation: number
    blocked: number
    missingDepartments: number
    draftSeeded: number
    released: number
  }
  items: AiDepartmentReadinessItem[]
  unmappedDepartments: Array<{ id: string, name: string, slug: string }>
}
