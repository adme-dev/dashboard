import { describe, expect, it, vi } from 'vitest'

vi.mock('~~/server/utils/creativeCompliance', async (importOriginal) => {
  const mod = await importOriginal() as Record<string, unknown>
  return {
    ...mod,
    runCreativeComplianceCheck: vi.fn(async (input: { beforeDispatch?: () => Promise<void> }) => {
      await input.beforeDispatch?.()
      return { checkId: 'chk', passed: true }
    })
  }
})

import { resolveGenerationMcpExecutions } from '~~/server/utils/ai/mcp/generationTools'

describe('verify dispatch chain', () => {
  it('threads services.markDispatched from executeSupplemental into the compliance runner', async () => {
    const execution = resolveGenerationMcpExecutions().find(e => e.name === 'verify_creative_compliance')!
    expect(execution.executeSupplemental).toBeTypeOf('function')
    const markDispatched = vi.fn(async () => {})
    const captureResult = vi.fn(async () => {})
    const result = await execution.executeSupplemental!(
      { assetId: '00000000-0000-4000-8000-000000000001', subjectType: 'vehicle', referenceSourceAssetIds: [] },
      { userId: 'u1', userRole: 'owner', event: {} as never },
      { markDispatched, captureResult } as never
    )
    expect(result.ok).toBe(true)
    expect(markDispatched).toHaveBeenCalledTimes(1)
    expect(captureResult).toHaveBeenCalledTimes(1)
  })
})
