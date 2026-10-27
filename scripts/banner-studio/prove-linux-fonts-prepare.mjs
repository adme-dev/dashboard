import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir, cp, stat } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dockerCommand, loadLinuxRuntime } from '../../workers/banner-engine/runtime/render-preview.mjs'
import { FONT_PIN, fontRuntimeRoot as root, inspectPinnedFont, sha256 } from '../../workers/banner-engine/fonts/runtime.mjs'

const baseId = 'sha256:1fbdad626b0f743bfcd4fd308342b7feeb877473579da2ca52d0e97cda9597f8'
await mkdir(resolve(root, 'downloads'), { recursive: true })
async function officialDownload(file, expectedHash, suffix) {
  const path = resolve(root, 'downloads', file)
  let bytes
  try {
    bytes = await readFile(path)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const url = `https://raw.githubusercontent.com/adobe-fonts/source-sans/${FONT_PIN.commit}/${suffix}`
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(30000), redirect: 'error' })
    assert(response.ok, `Official font download failed: ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    assert(bytes.length < 2 * 1024 * 1024, 'Font download exceeds size budget')
    assert.equal(sha256(bytes), expectedHash, 'Official font download checksum mismatch')
    await writeFile(path, bytes, { flag: 'wx' })
  }
  assert.equal(sha256(bytes), expectedHash, 'Cached font download checksum mismatch')
  return { file, url, sha256: expectedHash, bytes: bytes.length }
}
const sources = [await officialDownload(FONT_PIN.file, FONT_PIN.sha256, `TTF/${FONT_PIN.file}`), await officialDownload('LICENSE.md', FONT_PIN.licenseSha256, 'LICENSE.md')]
const font = inspectPinnedFont(await readFile(resolve(root, 'downloads', FONT_PIN.file)))
const base = await loadLinuxRuntime('photocraft')
assert.equal(base.imageId, baseId, 'Previous accepted image changed; review before rebuilding')
assert.equal((await dockerCommand(['image', 'inspect', '--format', '{{.Id}}', baseId])).trim(), baseId)
// BuildKit does not accept a config digest as FROM. This dedicated local alias
// points at the inspected immutable base and never changes its accepted tag.
await dockerCommand(['tag', baseId, 'xeroflow-banner-engine:font-base-1fbdad626b0f'])
await mkdir(resolve(root, 'build'), { recursive: true })
for (const file of [FONT_PIN.file, 'LICENSE.md']) await cp(resolve(root, 'downloads', file), resolve(root, 'build', file))
await cp(fileURLToPath(new URL('../../workers/banner-engine/fonts/Dockerfile', import.meta.url)), resolve(root, 'build/Dockerfile'))
// Immutable acceptance files are never overwritten, including by an accidental rerun.
for (const file of ['runtime.json', 'runtime-prepared.json']) {
  await stat(resolve(root, file)).then(() => {
    throw new Error(`${file} already exists; use a new versioned preparation root`)
  }, (error) => {
    if (error.code !== 'ENOENT') throw error
  })
}
const log = await dockerCommand(['build', '--network=none', '--platform=linux/arm64', '--tag', 'xeroflow-banner-engine:linux-fonts-v1', resolve(root, 'build')], { timeoutMs: 90000, maxLogBytes: 1048576 })
await writeFile(resolve(root, 'build.log'), log, { flag: 'wx' })
const imageId = (await dockerCommand(['image', 'inspect', '--format', '{{.Id}}', 'xeroflow-banner-engine:linux-fonts-v1'])).trim()
const engines = {}
for (const engine of ['photocraft', 'vectorcraft']) {
  const runtime = await loadLinuxRuntime(engine)
  const proof = { engine, version: runtime.definition.version, executableSha256: runtime.capability.executableSha256, imageId, baseId, font: FONT_PIN, scope: 'Pinned font image preparation; actual native font acceptance is separate' }
  const bytes = JSON.stringify(proof, null, 2) + '\n'
  await writeFile(resolve(root, `${engine}-packaging-proof.json`), bytes, { flag: 'wx' })
  engines[engine] = { version: proof.version, executableSha256: proof.executableSha256, capabilityProofSha256: sha256(bytes) }
}
await writeFile(resolve(root, 'font-metadata.json'), JSON.stringify(font, null, 2) + '\n', { flag: 'wx' })
await writeFile(resolve(root, 'sources.json'), JSON.stringify({ sources, baseId, imageId }, null, 2) + '\n', { flag: 'wx' })
await writeFile(resolve(root, 'runtime-prepared.json'), JSON.stringify({ status: 'prepared', fontVersion: 'banner-linux-fonts-v1', font: FONT_PIN, imageId, engines }, null, 2) + '\n', { flag: 'wx' })
console.log(JSON.stringify({ imageId, face: FONT_PIN, preparedOnly: true }))
