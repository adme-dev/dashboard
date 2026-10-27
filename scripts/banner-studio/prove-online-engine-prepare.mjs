import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { runtimeRoot } from '../../workers/banner-engine/runtime/render-preview.mjs'

// Explicit preparation step only. Never called by the runtime or from a job.
const releases = {
  photocraft: {
    version: '0.16.0',
    sha256: '9b998376a4876a620842f0456f79695b147950d6f173930ee4d5da751303e10b',
    bytes: 83104781
  },
  vectorcraft: {
    version: '0.17.0',
    sha256: '28cbc71ced0b4349b2d4208f0f2f922c13ec099627a323b0eb3d5e1b1372dca3',
    bytes: 123813544
  }
}
await mkdir(runtimeRoot, { recursive: true })
async function fetchBounded(url, maxBytes) {
  const response = await fetch(url, { signal: AbortSignal.timeout(90000) })
  if (!response.ok)
    throw new Error(`Official release request failed: ${response.status}`)
  const chunks = []
  let count = 0
  for await (const chunk of response.body) {
    count += chunk.length
    if (count > maxBytes)
      throw new Error('Official artifact exceeded pinned size')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
for (const [engine, release] of Object.entries(releases)) {
  const archive = `${engine}-${release.version}-linux-aarch64.tar.gz`
  const url = `https://github.com/storytold/${engine}/releases/download/v${release.version}`
  const sums = await fetchBounded(`${url}/SHA256SUMS.txt`, 16384)
  const published = sums
    .toString()
    .split('\n')
    .find(
      line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === archive
    )
    ?.split(/\s+/)[0]
  if (published !== release.sha256)
    throw new Error('Published checksum differs from pinned release')
  await writeFile(resolve(runtimeRoot, `${engine}-SHA256SUMS.txt`), sums)
  const archivePath = resolve(runtimeRoot, archive)
  let bytes
  try {
    bytes = await readFile(archivePath)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    bytes = await fetchBounded(`${url}/${archive}`, release.bytes)
  }
  if (
    bytes.length !== release.bytes
    || createHash('sha256').update(bytes).digest('hex') !== release.sha256
  )
    throw new Error('Archive differs from pinned official checksum')
  await writeFile(archivePath, bytes)
  const extracted = resolve(runtimeRoot, engine)
  try {
    await stat(extracted)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    // Python's data filter rejects unsafe links and traversal. Only the CLI and
    // bundled notices are needed; desktop executables and integrations stay out.
    execFileSync(
      'python3',
      [
        '-c',
        [
          'import pathlib,tarfile,sys',
          'archive,target,prefix,engine=sys.argv[1:]',
          'with tarfile.open(archive) as t:',
          ' members=[m for m in t.getmembers() if m.name==prefix+"/bin/"+engine+"-cli" or m.name.startswith(prefix+"/share/doc/")]',
          ' assert all(m.isfile() or m.isdir() for m in members)',
          ' assert sum(m.size for m in members)<512*1024*1024',
          ' t.extractall(target,members=members,filter="data")'
        ].join('\n'),
        archivePath,
        extracted,
        `${engine}-${release.version}-linux-aarch64`,
        engine
      ],
      { timeout: 90000 }
    )
  }
  console.log(
    JSON.stringify({
      engine,
      archive,
      sha256: release.sha256,
      bytes: bytes.length
    })
  )
}
