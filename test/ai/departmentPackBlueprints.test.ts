import { describe, expect, it } from 'vitest'
import {
  DEPARTMENT_PACK_BLUEPRINTS,
  REQUIRED_DEPARTMENT_PACK_KEYS,
  validateDepartmentPackBlueprints
} from '~~/server/utils/ai/governance/departmentPackBlueprints'
import { registry } from '~~/server/utils/ai/tools'

const toolMetadata = registry.map(tool => ({ name: tool.name, mutates: tool.mutates === true }))

describe('department assistant pack blueprints', () => {
  it('covers every required department with a safe read/draft pack and evaluation suite', () => {
    const result = validateDepartmentPackBlueprints(DEPARTMENT_PACK_BLUEPRINTS, toolMetadata)

    expect(result).toEqual({ valid: true, issues: [] })
    expect(DEPARTMENT_PACK_BLUEPRINTS.map(pack => pack.key).sort())
      .toEqual([...REQUIRED_DEPARTMENT_PACK_KEYS].sort())
    expect(DEPARTMENT_PACK_BLUEPRINTS.every(pack =>
      pack.capabilities.some(capability =>
        capability.requiredPermissionGroup === 'AUTHENTICATED'
        && capability.toolBindings.some(binding => binding.toolName === 'search_knowledge')
      )
    )).toBe(true)
    expect(DEPARTMENT_PACK_BLUEPRINTS.every(pack => pack.evaluationCases.length >= 21)).toBe(true)
    expect(DEPARTMENT_PACK_BLUEPRINTS.find(pack => pack.key === 'hr')?.evaluationCases).toHaveLength(22)
    expect(DEPARTMENT_PACK_BLUEPRINTS.find(pack => pack.key === 'engineering')?.evaluationCases).toHaveLength(22)
    expect(DEPARTMENT_PACK_BLUEPRINTS.filter(pack => [
      'account_management', 'production', 'paid_media', 'finance', 'bookkeeping'
    ].includes(pack.key)).every(pack => pack.evaluationCases.length >= 25)).toBe(true)
    expect(DEPARTMENT_PACK_BLUEPRINTS.flatMap(pack => pack.capabilities)
      .flatMap(capability => capability.toolBindings)
      .some(binding => binding.accessMode === 'propose')).toBe(false)
  })

  it('fails closed for unknown tools and mutating tools in the read/draft release', () => {
    const unknownTool = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    unknownTool[0]!.capabilities[0]!.toolBindings[0]!.toolName = 'unknown_tool'
    expect(validateDepartmentPackBlueprints(unknownTool, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'unknown_tool' }))

    const mutatingTool = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    mutatingTool[0]!.capabilities[0]!.toolBindings[0]!.toolName = 'create_task'
    expect(validateDepartmentPackBlueprints(mutatingTool, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'mutation_not_allowed' }))

    const unboundExpectedTool = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    unboundExpectedTool[0]!.evaluationCases[0]!.expectedTools = ['create_task']
    unboundExpectedTool[0]!.knownGaps.push('The requested mutation remains intentionally unavailable.')
    expect(validateDepartmentPackBlueprints(unboundExpectedTool, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'unbound_expected_tool' }))
  })

  it('fails closed when a suite repeats a versioned evaluation case key', () => {
    const duplicateCase = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    duplicateCase[0]!.evaluationCases.push(structuredClone(duplicateCase[0]!.evaluationCases[0]!))

    expect(validateDepartmentPackBlueprints(duplicateCase, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'duplicate_evaluation_case_key' }))
  })

  it('fails closed when required coverage or machine keys are duplicated', () => {
    const missing = structuredClone(DEPARTMENT_PACK_BLUEPRINTS).slice(1)
    expect(validateDepartmentPackBlueprints(missing, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'missing_department_pack' }))

    const duplicate = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    duplicate[1]!.packKey = duplicate[0]!.packKey
    expect(validateDepartmentPackBlueprints(duplicate, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'duplicate_pack_key' }))

    const duplicateAlias = structuredClone(DEPARTMENT_PACK_BLUEPRINTS)
    duplicateAlias[1]!.departmentAliases.push(duplicateAlias[0]!.departmentAliases[0]!)
    expect(validateDepartmentPackBlueprints(duplicateAlias, toolMetadata).issues)
      .toContainEqual(expect.objectContaining({ code: 'duplicate_department_alias' }))
  })
})
