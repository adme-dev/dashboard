import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile, open, lstat, statfs, unlink, copyFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RELEASES, BASE } from '../../workers/banner-engine/runtime/amd64/pins.mjs'
import { FONT_PIN } from '../../workers/banner-engine/fonts/runtime.mjs'

export const root = fileURLToPath(new URL('../../output/editable-artwork-engine-amd64/', import.meta.url))
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export async function hashFile(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}
export function verifyPublishedChecksum(sums, archive, expected) {
  const entries = sums.split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[1]?.replace(/^\*/, '') === archive)
  assert(entries.length === 1 && entries[0][0] === expected, 'Published checksum differs from pinned release')
  return expected
}
export function executionEvidence(os, architecture) {
  assert(os === 'linux', 'Linux Docker daemon required')
  assert(['aarch64', 'arm64', 'x86_64', 'amd64'].includes(architecture), 'Unknown Docker architecture')
  return { executionMode: ['x86_64', 'amd64'].includes(architecture) ? 'native-linux-amd64' : 'emulated-linux-amd64', hostedAcceptance: false }
}

// Streaming tar processing; inspect all selected members before writing any.
// Do not extract desktop applications, plugins, symlinks or arbitrary paths.
export function extractSelected(archive, destination, engine, version, maxBytes = 192 * 1024 * 1024) {
  assert(Object.hasOwn(RELEASES, engine) && RELEASES[engine].version === version, 'Untrusted release')
  return JSON.parse(execFileSync('python3', ['-c', `import tarfile,pathlib,sys,json,hashlib
archive,destination,engine,version,maximum=sys.argv[1:]
prefix=engine+'-'+version+'-linux-x86_64/'
cli=prefix+'bin/'+engine+'-cli'
docs=prefix+'share/doc/'+engine+'/'
selected={}; total=0; count=0
with tarfile.open(archive,'r|gz') as t:
 for m in t:
  count+=1
  assert count<=20000, 'Archive member count exceeds budget'
  if m.name!=cli and not m.name.startswith(docs): continue
  assert not m.name.startswith('/') and '..' not in pathlib.PurePosixPath(m.name).parts, 'Unsafe member path'
  assert m.isfile() or m.isdir(), 'Selected links/devices forbidden'
  if m.isdir(): continue
  assert m.name not in selected, 'Duplicate selected member'
  total+=m.size
  assert total<=int(maximum) and len(selected)<1000, 'Selected extraction exceeds budget'
  selected[m.name]=m.size
assert cli in selected and any(n.startswith(docs) for n in selected), 'CLI or notices missing'
out=pathlib.Path(destination)
out.mkdir(parents=True,exist_ok=True)
assert not out.is_symlink(), 'Symlink destination forbidden'
results=[]
with tarfile.open(archive,'r|gz') as t:
 for m in t:
  if m.name not in selected: continue
  target=out/('bin/'+engine+'-cli' if m.name==cli else 'notices/'+engine+'/'+m.name[len(docs):])
  target.parent.mkdir(parents=True,exist_ok=True)
  assert not any(p.is_symlink() for p in [target,*target.parents]), 'Symlink output forbidden'
  h=hashlib.sha256(); size=0
  with t.extractfile(m) as src, target.open('xb') as dst:
   while True:
    chunk=src.read(1024*1024)
    if not chunk: break
    size+=len(chunk); assert size<=selected[m.name]
    dst.write(chunk); h.update(chunk)
  assert size==selected[m.name]
  target.chmod(0o555 if m.name==cli else 0o444)
  results.append({'path':str(target.relative_to(out)),'bytes':size,'sha256':h.hexdigest()})
print(json.dumps(results))`, archive, destination, engine, version, String(maxBytes)], { timeout: 90000, maxBuffer: 1024 * 1024 }).toString())
}

async function fetchSmall(url, maxBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) })
  assert(response.ok, `Official request failed: ${response.status}`)
  let count = 0
  const chunks = []
  for await (const chunk of response.body) {
    count += chunk.length
    assert(count <= maxBytes, 'Official download exceeds byte budget')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
async function downloadArchive(url, path, release) {
  try {
    const info = await lstat(path)
    assert(info.isFile() && !info.isSymbolicLink() && info.size === release.bytes, 'Invalid cached archive')
    assert.equal(await hashFile(path), release.archiveSha256, 'Cached archive checksum mismatch')
    return
  } catch (error) { if (error.code !== 'ENOENT') throw error }
  const response = await fetch(url, { signal: AbortSignal.timeout(120000) })
  assert(response.ok, `Official archive request failed: ${response.status}`)
  const file = await open(path, 'wx', 0o600)
  let count = 0
  const digest = createHash('sha256')
  try {
    for await (const chunk of response.body) {
      count += chunk.length
      assert(count <= release.bytes, 'Archive exceeds pinned byte budget')
      digest.update(chunk)
      await file.writeFile(chunk)
    }
    assert.equal(count, release.bytes, 'Archive size mismatch')
    assert.equal(digest.digest('hex'), release.archiveSha256, 'Official archive checksum mismatch')
    await file.sync()
  } catch (error) {
    await file.close()
    await unlink(path) // Only the exclusive partial file created by this call.
    throw error
  }
  await file.close()
}

export async function prepare() {
  await mkdir(root, { recursive: true, mode: 0o700 })
  assert(!(await lstat(root)).isSymbolicLink(), 'Evidence root must not be a symlink')
  const disk = await statfs(root)
  assert(disk.bavail * disk.bsize >= 4.5 * 1024 ** 3, 'Require 1.5 GiB artifact budget plus 3 GiB free reserve')
  const build = resolve(root, 'build')
  // Refuse partial or previous contexts; never overwrite evidence on a rerun.
  await mkdir(build)
  const provenance = { schema: 'banner-engine-amd64-preparation-v1', platform: 'linux/amd64', base: BASE, hostedAcceptance: false, engines: {}, font: FONT_PIN, diskFreeBefore: disk.bavail * disk.bsize }
  for (const [engine, release] of Object.entries(RELEASES)) {
    const archive = `${engine}-${release.version}-linux-x86_64.tar.gz`
    const url = `https://github.com/storytold/${engine}/releases/download/v${release.version}`
    const sums = await fetchSmall(`${url}/SHA256SUMS.txt`, 16384)
    verifyPublishedChecksum(sums.toString(), archive, release.archiveSha256)
    await writeFile(resolve(root, `${engine}-SHA256SUMS.txt`), sums, { flag: 'wx' })
    const archivePath = resolve(root, archive)
    await downloadArchive(`${url}/${archive}`, archivePath, release)
    const files = extractSelected(archivePath, build, engine, release.version)
    const binary = files.find(file => file.path === `bin/${engine}-cli`)
    if (release.executableSha256) assert.equal(binary.sha256, release.executableSha256, 'Pinned executable differs from official release')
    const header = await open(resolve(build, binary.path), 'r')
    const elf = Buffer.alloc(20)
    await header.read(elf, 0, 20, 0)
    await header.close()
    assert(elf.subarray(0, 4).toString('hex') === '7f454c46' && elf[4] === 2 && elf[5] === 1 && elf.readUInt16LE(18) === 62, 'Expected ELF64 x86-64 executable')
    provenance.engines[engine] = { ...release, archive, archiveUrl: `${url}/${archive}`, executableSha256: binary.sha256, files }
    console.log(JSON.stringify({ engine, ...binary }))
  }
  await mkdir(resolve(build, 'fonts'))
  await mkdir(resolve(build, 'notices/fonts'))
  for (const [suffix, target, digest] of [
    [`TTF/${FONT_PIN.file}`, `fonts/${FONT_PIN.file}`, FONT_PIN.sha256],
    ['LICENSE.md', 'notices/fonts/LICENSE.md', FONT_PIN.licenseSha256]
  ]) {
    const bytes = await fetchSmall(`https://raw.githubusercontent.com/adobe-fonts/source-sans/${FONT_PIN.commit}/${suffix}`, 2 * 1024 * 1024)
    assert.equal(sha256(bytes), digest, 'Official font/notice checksum mismatch')
    await writeFile(resolve(build, target), bytes, { flag: 'wx', mode: 0o444 })
  }
  await copyFile(fileURLToPath(new URL('../../workers/banner-engine/runtime/amd64/Dockerfile', import.meta.url)), resolve(build, 'Dockerfile'))
  await writeFile(resolve(root, 'preparation.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' })
  return provenance
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  prepare().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}
