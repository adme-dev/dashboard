import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
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
    expect(JSON.parse(write.mock.calls[0]?.[0])).toMatchObject({ gate: 'pilot', passed: true, blockers: [] })

    write.mockClear()
    await expect(runAiAssistantReadiness(['--gate', 'pilot'], { getReadiness, write })).resolves.toBe(0)
    expect(write).toHaveBeenCalledWith('AI assistant pilot readiness: PASS')

    write.mockClear()
    await expect(runAiAssistantReadiness(['--gate', 'enforced'], {
      getReadiness: vi.fn().mockResolvedValue({ ...readiness, readyForEnforcement: true }),
      write
    })).resolves.toBe(0)
    expect(write).toHaveBeenCalledWith('AI assistant enforced readiness: PASS')

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

  it('prints only pilot gate blockers when pilot is blocked', async () => {
    const write = vi.fn()
    await expect(runAiAssistantReadiness(['--gate', 'pilot'], {
      getReadiness: vi.fn().mockResolvedValue({
        readyForPilot: false,
        readyForEnforcement: false,
        activeEmployeeCount: 1,
        coveredEmployeeCount: 0,
        uncoveredEmployees: [],
        departmentCoverage: [],
        blockers: [
          'employee:20000000-0000-4000-8000-000000000001:no_department',
          'no_evaluated_pilot_release',
          'no_eligible_pilot_membership'
        ]
      }),
      write
    })).resolves.toBe(1)

    expect(write).toHaveBeenCalledWith([
      'AI assistant pilot readiness: BLOCKED',
      'no_evaluated_pilot_release',
      'no_eligible_pilot_membership'
    ].join('\n'))
  })

  it('writes a coded structured failure at the runner boundary for invalid arguments', async () => {
    const write = vi.fn()
    const getReadiness = vi.fn()

    await expect(runAiAssistantReadiness(['--json', '--gate', 'unknown'], { getReadiness, write })).resolves.toBe(1)
    expect(getReadiness).not.toHaveBeenCalled()
    expect(JSON.parse(write.mock.calls[0]?.[0])).toEqual({
      gate: null,
      passed: false,
      error: { code: 'invalid_arguments' }
    })
  })

  it('exits one and emits JSON from the CLI process for invalid arguments', () => {
    const result = spawnSync(process.execPath, [
      '--import', 'tsx',
      'scripts/ai-assistant-readiness.ts',
      '--json', '--gate', 'unknown'
    ], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env, TSX_TSCONFIG_PATH: '.nuxt/tsconfig.server.json' }
    })

    expect(result.status).toBe(1)
    expect(JSON.parse(result.stdout)).toEqual({
      gate: null,
      passed: false,
      error: { code: 'invalid_arguments' }
    })
    expect(result.stderr).toBe('')
  })
})
