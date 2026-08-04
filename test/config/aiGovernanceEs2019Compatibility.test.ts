import { readFile } from 'node:fs/promises'
import { transform } from 'esbuild'
import { describe, expect, it } from 'vitest'

const GOVERNANCE_MODULES = [
  'server/utils/ai/governance/evaluationModelExecutor.ts',
  'server/utils/ai/governance/pilotMetrics.ts'
]

describe('AI governance ES2019 compatibility', () => {
  it.each(GOVERNANCE_MODULES)('transforms %s without unsupported runtime syntax', async (modulePath) => {
    const source = await readFile(modulePath, 'utf8')
    const result = await transform(source, {
      loader: 'ts',
      target: 'es2019',
      logLevel: 'silent'
    })

    expect(result.warnings).toEqual([])
  })
})
