import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('keeps completed status Pages wire free of retained proofs, finalizer and SQL', async () => {
  const output = await build({ entryPoints: ['server/utils/pageStudio/completedManagedTransfer.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, alias: { '~~': process.cwd() }, logLevel: 'silent' })
  const files = Object.keys(output.metafile!.inputs)
  expect(files.some(file => file.startsWith('workers/'))).toBe(false)
  expect(files).not.toContain('server/utils/db.ts')
  expect(files.some(file => /managed-transfer-(completion|destination-authoring|destination-execution|forms-history)\.ts$/.test(file))).toBe(false)
})
it('retains finalizer and current-owner SQL only behind the Worker invocation adapter', async () => {
  const output = await build({ entryPoints: ['workers/page-studio-management/src/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, external: ['cloudflare:workers'], tsconfig: 'workers/page-studio-management/tsconfig.json', logLevel: 'silent' })
  const files = Object.keys(output.metafile!.inputs)
  expect(files).toContain('workers/page-studio-management/src/completedManagedTransfer.ts')
  expect(files).toContain('workers/page-studio-management/src/managedTransferCompletion.ts')
  expect(files).toContain('workers/page-studio-management/src/cmsDatabase.ts')
  expect(files).not.toContain('server/utils/db.ts')
  expect(files).not.toContain('server/utils/auth.ts')
  expect(files.some(file => /nitropack|#imports/.test(file))).toBe(false)
})
