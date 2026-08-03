import { describe, expect, it, vi } from 'vitest'
import {
  parseAiAssistantReadinessArgs,
  runAiAssistantReadiness
} from '../../scripts/ai-assistant-readiness'

describe('AI assistant readiness CLI arguments', () => {
  it('accepts only pilot or enforced gates and an optional JSON output flag', () => {
    expect(parseAiAssistantReadinessArgs(['--gate', 'pilot', '--json'])).toEqual({ gate: 'pilot', json: true })
    expect(parseAiAssistantReadinessArgs(['--gate', 'enforced'])).toEqual({ gate: 'enforced', json: false })
    expect(() => parseAiAssistantReadinessArgs(['--gate', 'active'])).toThrow('Usage:')
  })

  it('uses the shared readiness service and emits structured JSON for pass, block, and coded errors', async () => {
    const write = vi.fn()
    const readiness = {
      readyForPilot: true,
      readyForEnforcement: false,
      activeEmployeeCount: 1,
      coveredEmployeeCount: 1,
      uncoveredEmployees: [],
      departmentCoverage: [],
      blockers: ['department:10000000-0000-4000-8000-000000000001:release_pilot']
    }
    const getReadiness = vi.fn().mockResolvedValue(readiness)

    await expect(runAiAssistantReadiness(['--gate', 'pilot', '--json'], { getReadiness, write })).resolves.toBe(0)
    expect(getReadiness).toHaveBeenCalledOnce()
    expect(JSON.parse(write.mock.calls[0]?.[0])).toMatchObject({ gate: 'pilot', passed: true })

    write.mockClear()
    await expect(runAiAssistantReadiness(['--gate', 'enforced', '--json'], { getReadiness, write })).resolves.toBe(1)
    expect(JSON.parse(write.mock.calls[0]?.[0])).toMatchObject({ gate: 'enforced', passed: false, blockers: readiness.blockers })

    write.mockClear()
    await expect(runAiAssistantReadiness(['--gate', 'pilot', '--json'], {
      getReadiness: vi.fn().mockRejectedValue(Object.assign(new Error('secret'), { code: 'readiness_query_failed' })),
      write
    })).resolves.toBe(1)
    expect(JSON.parse(write.mock.calls[0]?.[0])).toEqual({
      gate: 'pilot',
      passed: false,
      error: { code: 'readiness_query_failed' }
    })
  })
})
