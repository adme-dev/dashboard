import { mkdir, readFile, writeFile, cp, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  dockerCommand,
  runtimeRoot
} from '../../workers/banner-engine/runtime/render-preview.mjs'

// Preparation only: downloads/build may use network; the runtime never does.
const releases = {
  photocraft: {
    version: '0.16.0',
    commit: 'b1794c6e0608ccfc887213dcf58398977c5cb75e',
    archiveSha256:
      '9b998376a4876a620842f0456f79695b147950d6f173930ee4d5da751303e10b'
  },
  vectorcraft: {
    version: '0.17.0',
    commit: '43313f9451de7ab5b909801006b8881458f2bf04',
    archiveSha256:
      '28cbc71ced0b4349b2d4208f0f2f922c13ec099627a323b0eb3d5e1b1372dca3'
  }
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const root = runtimeRoot
await mkdir(resolve(root, 'build/bin'), { recursive: true })
await mkdir(resolve(root, 'build/notices'), { recursive: true })
const provenance = {
  platform: 'linux/arm64',
  base: 'debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8',
  engines: {}
}
for (const [engine, release] of Object.entries(releases)) {
  const name = `${engine}-${release.version}-linux-aarch64.tar.gz`
  const bytes = await readFile(resolve(root, name))
  const published = await readFile(
    resolve(root, `${engine}-SHA256SUMS.txt`),
    'utf8'
  )
  const entry = published
    .split('\n')
    .find(
      line => line.trim().split(/\s+/).at(-1)?.replace(/^\*/, '') === name
    )
  if (
    hash(bytes) !== release.archiveSha256
    || entry?.split(/\s+/)[0] !== release.archiveSha256
  )
    throw new Error(`Release checksum mismatch: ${engine}`)
  const extracted = resolve(
    root,
    engine,
    `${engine}-${release.version}-linux-aarch64`
  )
  const binary = resolve(extracted, 'bin', `${engine}-cli`)
  const executableSha256 = hash(await readFile(binary))
  const archivedBinary = execFileSync(
    'python3',
    [
      '-c',
      'import tarfile,sys; sys.stdout.buffer.write(tarfile.open(sys.argv[1]).extractfile(sys.argv[2]).read())',
      resolve(root, name),
      `${engine}-${release.version}-linux-aarch64/bin/${engine}-cli`
    ],
    { maxBuffer: 256 * 1024 * 1024 }
  )
  if (hash(archivedBinary) !== executableSha256)
    throw new Error(
      `Extracted executable differs from verified release: ${engine}`
    )
  await cp(binary, resolve(root, 'build/bin', `${engine}-cli`))
  await cp(
    resolve(extracted, 'share/doc', engine),
    resolve(root, 'build/notices', engine),
    { recursive: true }
  )
  provenance.engines[engine] = {
    ...release,
    archive: name,
    archiveBytes: (await stat(resolve(root, name))).size,
    executableSha256
  }
}
await cp(
  fileURLToPath(
    new URL('../../workers/banner-engine/runtime/Dockerfile', import.meta.url)
  ),
  resolve(root, 'build/Dockerfile')
)
await writeFile(
  resolve(root, 'release-provenance.json'),
  JSON.stringify(provenance, null, 2) + '\n'
)
const log = await dockerCommand(
  [
    'build',
    '--network=none',
    '--platform=linux/arm64',
    '--tag',
    'xeroflow-banner-engine:linux-proof',
    resolve(root, 'build')
  ],
  { timeoutMs: 90000, maxLogBytes: 1024 * 1024 }
)
await writeFile(resolve(root, 'build.log'), log)
const imageId = (
  await dockerCommand([
    'image',
    'inspect',
    '--format',
    '{{.Id}}',
    'xeroflow-banner-engine:linux-proof'
  ])
).trim()
const engines = {}
for (const [engine, details] of Object.entries(provenance.engines)) {
  const proof = {
    engine,
    ...details,
    imageId,
    base: provenance.base,
    scope: 'checksum-verified pinned CLI image; preview acceptance is separate'
  }
  await writeFile(
    resolve(root, `${engine}-packaging-proof.json`),
    JSON.stringify(proof, null, 2) + '\n'
  )
  engines[engine] = {
    version: details.version,
    executableSha256: details.executableSha256,
    capabilityProofSha256: hash(
      await readFile(resolve(root, `${engine}-packaging-proof.json`))
    )
  }
}
await writeFile(
  resolve(root, 'runtime-prepared.json'),
  JSON.stringify({ status: 'prepared', imageId, engines }, null, 2) + '\n'
)
console.log(JSON.stringify({ imageId, engines }))
