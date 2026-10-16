import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { verifyPageStudioBuilderVerifier } from '../../scripts/verify-page-studio-builder-verifier.mjs'
import { verifyBuilderApplicationTransition, verifyBuilderApplicationCheckpoint, verifyBuilderActionInput, verifyBuilderActionResult } from '../../workers/page-studio-management/src/generated/builderGraphVerifier.mjs'

const directory = 'workers/page-studio-management/src/generated'
const fixtures = JSON.parse(readFileSync(`${directory}/builderGraphFixtures.json`, 'utf8'))
const methods = { transition: verifyBuilderApplicationTransition, checkpoint: verifyBuilderApplicationCheckpoint,
  actionInput: verifyBuilderActionInput, actionResult: verifyBuilderActionResult }
describe('Worker-only single-source transfer verifier', () => {
  it('retains exact generator module/declaration/fixture/license hashes', async () => {
    expect(await verifyPageStudioBuilderVerifier(directory)).toMatchObject({ files: 5 })
  })
  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const run = methods[fixture.operation as keyof typeof methods]
      if (fixture.error) await expect(run(fixture.input)).rejects.toMatchObject({ code: fixture.error })
      else expect(await run(fixture.input)).toEqual(fixture.expected)
    })
  }
})
