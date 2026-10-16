import { build } from 'esbuild'
import { expect, it } from 'vitest'

it('keeps full authoring protocol and native SQL outside the Pages facade dependency graph', async () => {
  const output = await build({ entryPoints: ['server/utils/pageStudio/managedTransferDestinationAuthoring.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, alias: { '~~': process.cwd() }, logLevel: 'silent' })
  const files = Object.keys(output.metafile!.inputs)
  expect(files).not.toContain('server/utils/db.ts')
  expect(files).not.toContain('shared/pageStudio/managed-transfer-destination-authoring.ts')
  expect(files.some(f => f.startsWith('workers/'))).toBe(false)
  expect(files.some(f => /managed-transfer-destination-execution|managed-transfer-forms-history/.test(f))).toBe(false)
})
it('keeps Worker full authority in the fresh invocation adapter without Nitro DB/auth', async () => {
  const output = await build({ entryPoints: ['workers/page-studio-management/src/index.ts'], bundle: true, platform: 'node', format: 'esm', write: false, metafile: true, external: ['cloudflare:workers'], tsconfig: 'workers/page-studio-management/tsconfig.json', logLevel: 'silent' })
  const files = Object.keys(output.metafile!.inputs)
  expect(files).toContain('workers/page-studio-management/src/managedTransferDestinationAuthoring.ts')
  expect(files).toContain('workers/page-studio-management/src/cmsDatabase.ts')
  expect(files).not.toContain('server/utils/db.ts')
  expect(files).not.toContain('server/utils/auth.ts')
  expect(files.some(f => /nitropack|#imports/.test(f))).toBe(false)
})
