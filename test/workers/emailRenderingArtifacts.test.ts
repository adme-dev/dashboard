import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { checkEmailRenderingArtifacts } from '../../scripts/check-email-rendering-artifacts.mjs'

let directory: string | undefined
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true })
})
async function fixture(pages: string, sources = ['../../src/index.ts']) {
  directory = await mkdtemp(path.join(os.tmpdir(), 'email-render-artifact-'))
  const app = path.join(directory, 'pages'), worker = path.join(directory, 'worker')
  await mkdir(app)
  await mkdir(worker)
  await writeFile(path.join(app, 'opaque-hash.js'), pages)
  await writeFile(path.join(worker, 'index.js'), 'const registry = "__emailWorkerBlockRegistry"')
  await writeFile(path.join(worker, 'index.js.map'), JSON.stringify({ sources }))
  return { app, worker }
}
describe('built renderer isolation guard', () => {
  it('admits isolated emitted graphs', async () => {
    const f = await fixture('export default {}')
    await expect(checkEmailRenderingArtifacts(f.app, f.worker)).resolves.toEqual({ pagesFiles: 1, workerSources: 1 })
  })
  it.each(['__emailWorkerBlockRegistry', '__edmBlockRegistry'])('catches renderer code in hashed Pages modules: %s', async (marker) => {
    const f = await fixture(JSON.stringify(marker))
    await expect(checkEmailRenderingArtifacts(f.app, f.worker)).rejects.toThrow('Renderer implementation retained')
  })
  it('catches an indirect Pages renderer import in its source map', async () => {
    const f = await fixture('export default {}')
    await writeFile(path.join(f.app, 'opaque-hash.js.map'), JSON.stringify({ sources: ['../../../workers/email-rendering/src/render/blocks/text.ts'] }))
    await expect(checkEmailRenderingArtifacts(f.app, f.worker)).rejects.toThrow('Renderer source retained')
  })
  it.each(['../../../server/utils/db.ts', '../../../node_modules/resend/index.js'])('catches a privileged Worker dependency %s', async (source) => {
    const f = await fixture('export default {}', [source])
    await expect(checkEmailRenderingArtifacts(f.app, f.worker)).rejects.toThrow('Privileged dependency')
  })
})

it('allows the caller sendability rule that recognizes unknown-block placeholders', async () => {
  const f = await fixture('const placeholder = /available in upcoming update/i')
  await expect(checkEmailRenderingArtifacts(f.app, f.worker)).resolves.toBeDefined()
})
