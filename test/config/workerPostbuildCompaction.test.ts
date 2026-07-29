import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

import {
  WORKER_MODULE_COMPACTION_MARKER,
  compactWorkerModule
} from '../../scripts/compact-worker-module.mjs'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory =>
    rm(directory, { recursive: true, force: true })
  ))
})

describe('Pages Worker postbuild compaction', () => {
  it('minifies a generated module once while preserving exported function names', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'worker-compaction-'))
    temporaryDirectories.push(directory)
    const modulePath = path.join(directory, 'nitro.mjs')
    const repeatedRuntimeSteps = Array.from(
      { length: 30 },
      () => '  deliberatelyVerboseIntermediateValue += 0'
    ).join('\n')
    const source = `
export function stableRuntimeHandler(inputValue) {
  let deliberatelyVerboseIntermediateValue = inputValue
${repeatedRuntimeSteps}
  return deliberatelyVerboseIntermediateValue + 1
}
`
    await writeFile(modulePath, source, 'utf8')

    const first = await compactWorkerModule(modulePath)
    const compacted = await readFile(modulePath, 'utf8')
    const imported = await import(`${pathToFileURL(modulePath).href}?v=1`)

    expect(first).toEqual({
      changed: true,
      beforeBytes: Buffer.byteLength(source),
      afterBytes: Buffer.byteLength(compacted)
    })
    expect(compacted).toContain(WORKER_MODULE_COMPACTION_MARKER)
    expect(compacted.length).toBeLessThan(source.length)
    expect(imported.stableRuntimeHandler.name).toBe('stableRuntimeHandler')
    expect(imported.stableRuntimeHandler(4)).toBe(5)

    await expect(compactWorkerModule(modulePath)).resolves.toEqual({
      changed: false,
      beforeBytes: Buffer.byteLength(compacted),
      afterBytes: Buffer.byteLength(compacted)
    })
    await expect(readFile(modulePath, 'utf8')).resolves.toBe(compacted)
  })
})
