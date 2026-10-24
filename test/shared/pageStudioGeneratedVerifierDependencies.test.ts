import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const manifests = [
  'shared/pageStudio/generated/builderGraphVerifier.manifest.json',
  'workers/page-studio-management/src/generated/builderGraphVerifier.manifest.json',
  'workers/page-studio-management/src/generated/managed-transfer-copy/managedTransferCopyVerifier.manifest.json'
]

describe('vendored Page Studio validation dependency', () => {
  it.each(manifests)('retains the reviewed security-patched Zod in %s', async (file) => {
    const manifest = JSON.parse(await readFile(file, 'utf8'))
    // Package-manager audits cannot inspect dependencies embedded in generated
    // modules. Update this reviewed pin with the paired Studio export, never by
    // editing the generated module or its provenance manifest by hand.
    expect(manifest.tools.zod).toBe('4.6.7')
    const dependencyInputs = manifest.sources.filter((source: { path: string }) => source.path.includes('/zod/'))
    expect(dependencyInputs.length).toBeGreaterThan(0)
    expect(dependencyInputs.every((source: { path: string }) => source.path.includes('/zod@4.6.7/'))).toBe(true)
    // Cover the transfer-copy export as well as the two builder exports. Local
    // hashes complement, but do not replace, Studio's deterministic --check.
    const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex')
    expect(digest(JSON.stringify(manifest.sources))).toBe(manifest.sourceDigest)
    for (const [name, expected] of Object.entries(manifest.files)) {
      expect(digest(await readFile(path.join(path.dirname(file), name)))).toBe(expected)
    }
  })
})
