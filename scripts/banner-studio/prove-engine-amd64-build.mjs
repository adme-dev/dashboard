import assert from 'node:assert/strict'
import { readFile, writeFile, statfs } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { root, hashFile, sha256, verifyPublishedChecksum, executionEvidence } from './prove-engine-amd64-prepare.mjs'
import { RELEASES, BASE } from '../../workers/banner-engine/runtime/amd64/pins.mjs'
import { FONT_PIN } from '../../workers/banner-engine/fonts/runtime.mjs'
import { dockerCommand } from '../../workers/banner-engine/runtime/render-preview.mjs'

export async function build() {
  const provenance = JSON.parse(await readFile(resolve(root, 'preparation.json'), 'utf8'))
  assert.equal(provenance.platform, 'linux/amd64')
  assert.equal(provenance.base, BASE)
  for (const [engine, release] of Object.entries(RELEASES)) {
    const archive = `${engine}-${release.version}-linux-x86_64.tar.gz`
    verifyPublishedChecksum(await readFile(resolve(root, `${engine}-SHA256SUMS.txt`), 'utf8'), archive, release.archiveSha256)
    assert.equal(await hashFile(resolve(root, archive)), release.archiveSha256)
    assert.equal(await hashFile(resolve(root, `build/bin/${engine}-cli`)), release.executableSha256)
    assert.equal(provenance.engines[engine].executableSha256, release.executableSha256)
    for (const file of provenance.engines[engine].files) {
      assert(file.path === `bin/${engine}-cli` || file.path.startsWith(`notices/${engine}/`))
      assert(!file.path.split('/').includes('..'))
      assert.equal(await hashFile(resolve(root, 'build', file.path)), file.sha256, 'Notice or executable changed after preparation')
    }
  }
  assert.equal(await hashFile(resolve(root, `build/fonts/${FONT_PIN.file}`)), FONT_PIN.sha256)
  assert.equal(await hashFile(resolve(root, 'build/notices/fonts/LICENSE.md')), FONT_PIN.licenseSha256)
  const dockerfile = fileURLToPath(new URL('../../workers/banner-engine/runtime/amd64/Dockerfile', import.meta.url))
  assert.equal(await hashFile(resolve(root, 'build/Dockerfile')), await hashFile(dockerfile))
  const disk = await statfs(root)
  assert(disk.bavail * disk.bsize >= 3.5 * 1024 ** 3, 'Require image budget plus 3 GiB free reserve')
  const daemon = JSON.parse(await dockerCommand(['info', '--format', '{{json .}}']))
  const evidence = executionEvidence(daemon.OSType, daemon.Architecture)
  const buildStamp = Date.now()
  const tag = `xeroflow-banner-engine:amd64-qualification-${buildStamp}`
  const log = await dockerCommand(['build', '--network=none', '--platform=linux/amd64', '--tag', tag, resolve(root, 'build')], { timeoutMs: 120000, maxLogBytes: 1024 * 1024 })
  await writeFile(resolve(root, `build-${buildStamp}.log`), log, { flag: 'wx' })
  const inspected = JSON.parse(await dockerCommand(['image', 'inspect', tag]))[0]
  assert.equal(inspected.Architecture, 'amd64')
  assert.equal(inspected.Os, 'linux')
  const prepared = {
    schema: 'banner-engine-amd64-build-v1', qualificationStatus: 'prepared',
    ...evidence, platform: 'linux/amd64', imageId: inspected.Id, imageSize: inspected.Size,
    tag, daemon: { os: daemon.OSType, architecture: daemon.Architecture, version: daemon.ServerVersion },
    preparationSha256: sha256(await readFile(resolve(root, 'preparation.json'))),
    engines: RELEASES, font: FONT_PIN
  }
  await writeFile(resolve(root, `build-${buildStamp}.json`), JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx' })
  await writeFile(resolve(root, 'build.json'), JSON.stringify(prepared, null, 2) + '\n')
  console.log(JSON.stringify(prepared))
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  build().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
