import { mkdtemp, readFile, cp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { transform } from 'esbuild'
import { verifyBuilderApplicationTransition, verifyBuilderApplicationCheckpoint, verifyBuilderActionInput, verifyBuilderActionResult } from '../../shared/pageStudio/generated/builderGraphVerifier.mjs'
import { verifyPageStudioBuilderVerifier } from '../../scripts/verify-page-studio-builder-verifier.mjs'

const directory = fileURLToPath(new URL('../../shared/pageStudio/generated/', import.meta.url))
const fixtures = JSON.parse(await readFile(path.join(directory, 'builderGraphFixtures.json'), 'utf8'))
const methods = { transition: verifyBuilderApplicationTransition, checkpoint: verifyBuilderApplicationCheckpoint, actionInput: verifyBuilderActionInput, actionResult: verifyBuilderActionResult }
describe('single-source generated builder graph verifier', () => {
  it('keeps the self-contained verifier within its deployment byte allowance', async () => {
    const source = await readFile(path.join(directory, 'builderGraphVerifier.mjs'), 'utf8')
    const result = await transform(source, {
      loader: 'js', format: 'esm', platform: 'neutral', target: 'esnext',
      minify: true, keepNames: true, legalComments: 'none'
    })
    // Includes the verifier and its validation dependency. Namespace imports in
    // the source let esbuild discard unused Zod APIs before this artifact ships.
    expect(Buffer.byteLength(result.code)).toBeLessThan(190_000)
  })
  for (const fixture of fixtures) {
    it(fixture.name, async () => {
      const run = methods[fixture.operation as keyof typeof methods]
      if (fixture.error) await expect(run(fixture.input)).rejects.toMatchObject({ code: fixture.error })
      else expect(await run(fixture.input)).toEqual(fixture.expected)
    })
  }
  it('validates all local bundle/declaration/fixture/license digests', async () => {
    expect(await verifyPageStudioBuilderVerifier()).toMatchObject({ files: 4 })
  })
  it('rejects a tampered generated module', async () => {
    const temp = await mkdtemp(path.join(tmpdir(), 'studio-verifier-'))
    try {
      await cp(directory, temp, { recursive: true })
      await writeFile(path.join(temp, 'builderGraphVerifier.mjs'), '// tampered\n')
      await expect(verifyPageStudioBuilderVerifier(temp)).rejects.toThrow('digest mismatch')
    } finally {
      await rm(temp, { force: true, recursive: true })
    }
  })
})
