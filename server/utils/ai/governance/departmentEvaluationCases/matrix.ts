import type { DepartmentPackBlueprint } from '../departmentPackBlueprints'

const DETERMINISTIC_RUBRIC_KEYS = new Set([
  'correct_tool',
  'tool_selection',
  'required_sources',
  'grounded_sources',
  'scope',
  'prohibited_effect',
  'approval_bypass',
  'no_side_effects'
])

export interface DepartmentEvaluationMatrixRow {
  departmentKey: string
  owner: string
  caseKey: string
  caseVersion: number
  requiredSources: string[]
  expectedTools: string[]
  expectedNoTool: boolean
  zeroTolerance: string[]
  humanReviewRequired: boolean
}

export function buildDepartmentEvaluationMatrix(blueprints: readonly DepartmentPackBlueprint[]): DepartmentEvaluationMatrixRow[] {
  return blueprints.flatMap(blueprint => blueprint.evaluationCases.map(definition => ({
    departmentKey: blueprint.key,
    owner: blueprint.name,
    caseKey: definition.caseKey,
    caseVersion: definition.caseVersion,
    requiredSources: [...definition.requiredSources],
    expectedTools: [...definition.expectedTools],
    expectedNoTool: definition.expectedNoTool,
    zeroTolerance: [...definition.zeroTolerance],
    humanReviewRequired: definition.scoringRubric.some(dimension => !DETERMINISTIC_RUBRIC_KEYS.has(dimension.key))
  })))
}

export function serializeDepartmentEvaluationMatrix(rows: readonly DepartmentEvaluationMatrixRow[]): string {
  return JSON.stringify(rows)
}

function cell(values: readonly string[]): string {
  return values.length === 0 ? 'None' : values.map(value => `\`${value}\``).join(', ')
}

/** Deterministic checked-in Markdown section; keep the documentation byte-for-byte in sync via its test. */
export function renderDepartmentEvaluationMatrix(rows: readonly DepartmentEvaluationMatrixRow[]): string {
  return [
    '| Department | Case key | Version | Required sources | Expected tools | No tool | Zero tolerance | Human review |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map(row => [
      `\`${row.departmentKey}\``,
      `\`${row.caseKey}\``,
      String(row.caseVersion),
      cell(row.requiredSources),
      row.expectedNoTool ? 'None' : cell(row.expectedTools),
      row.expectedNoTool ? 'Yes' : 'No',
      cell(row.zeroTolerance),
      row.humanReviewRequired ? 'Yes' : 'No'
    ].join(' | ').replace(/^/, '| ').concat(' |'))
  ].join('\n')
}
