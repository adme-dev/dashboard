import { build } from 'esbuild'
import { describe, expect, it } from 'vitest'

describe('private copy graph build boundary', () => {
  it('keeps generated graph verifier and native database authority outside the Pages facade', async () => {
    const output = await build({ entryPoints: ['server/utils/pageStudio/managedTransferCopyManagement.ts'], bundle: true,
      platform: 'node', format: 'esm', write: false, metafile: true, alias: { '~~': process.cwd() }, logLevel: 'silent' })
    const files = Object.keys(output.metafile!.inputs)
    expect(files.some(file => file.includes('builderGraphVerifier'))).toBe(false)
    expect(files.some(file => file.startsWith('workers/'))).toBe(false)
    expect(files.some(file => file === 'server/utils/db.ts')).toBe(false)
  })
  it('isolates Worker authority with the invocation database adapter and exact generated verifier', async () => {
    const output = await build({ entryPoints: ['workers/page-studio-management/src/index.ts'], bundle: true,
      platform: 'node', format: 'esm', write: false, metafile: true, external: ['cloudflare:workers'],
      tsconfig: 'workers/page-studio-management/tsconfig.json', logLevel: 'silent' })
    const files = Object.keys(output.metafile!.inputs)
    expect(files).toContain('workers/page-studio-management/src/generated/builderGraphVerifier.mjs')
    expect(files).toContain('workers/page-studio-management/src/cmsDatabase.ts')
    expect(files).not.toContain('server/utils/db.ts')
    expect(files).not.toContain('server/utils/auth.ts')
    expect(files.some(file => /nitropack|#imports/.test(file))).toBe(false)
  })
})
