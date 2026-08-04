import { randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { initSync, parse } from 'es-module-lexer'
import { transform } from 'esbuild'

export const WORKER_MODULE_COMPACTION_MARKER = 'XEROFLOW_COMPACT_WORKER_MODULE'

initSync()

const PRECOMPUTED_RESOURCE_KEYS = [
  'file',
  'resourceType',
  'module',
  'mimeType',
  'preload',
  'prefetch'
]
const PRECOMPUTED_TOP_LEVEL_KEYS = ['dependencies', 'entrypoints', 'modules']
const PRECOMPUTED_DEPENDENCY_KEYS = ['scripts', 'styles', 'preload', 'prefetch']
const PRECOMPUTED_KNOWN_RESOURCE_KEYS = [
  ...PRECOMPUTED_RESOURCE_KEYS,
  'name',
  'src',
  'isEntry',
  'isDynamicEntry',
  'imports',
  'dynamicImports',
  'css',
  'assets'
]
const PRECOMPUTED_BUCKET_KEYS = ['scripts', 'styles', 'preload', 'prefetch']

function assertKnownKeys(value, supported, label) {
  const unknown = Object.keys(value || {}).filter(key => !supported.includes(key))
  if (unknown.length) {
    throw new Error(
      `[worker-manifest] Unsupported ${label} field(s): ${unknown.join(', ')}`
    )
  }
}

function compactPrecomputedResource(resource) {
  assertKnownKeys(resource, PRECOMPUTED_KNOWN_RESOURCE_KEYS, 'resource')
  return Object.fromEntries(PRECOMPUTED_RESOURCE_KEYS
    .filter(key => resource[key] !== undefined && resource[key] !== false)
    .map(key => [key, resource[key]]))
}

export function compactPrecomputedManifest(manifest) {
  assertKnownKeys(manifest, PRECOMPUTED_TOP_LEVEL_KEYS, 'top-level')
  const dependencies = Object.fromEntries(
    Object.entries(manifest.dependencies || {}).map(([moduleId, dependency]) => {
      assertKnownKeys(dependency, PRECOMPUTED_DEPENDENCY_KEYS, 'dependency')
      return [
        moduleId,
        Object.fromEntries(
          PRECOMPUTED_DEPENDENCY_KEYS.map(bucket => [
            bucket,
            Object.fromEntries(
              Object.entries(dependency[bucket] || {}).map(([id, resource]) => [
                id,
                compactPrecomputedResource(resource)
              ])
            )
          ])
        )
      ]
    })
  )
  return {
    dependencies,
    entrypoints: manifest.entrypoints || []
  }
}

function encodePrecomputedResource(resource) {
  const values = PRECOMPUTED_RESOURCE_KEYS.map(key => (
    resource[key] === undefined ? null : resource[key]
  ))
  while (values.at(-1) === null) values.pop()
  return values
}

function encodePrecomputedBucket(bucket) {
  return Object.fromEntries(
    Object.entries(bucket || {}).map(([id, resource]) => [
      id,
      encodePrecomputedResource(resource)
    ])
  )
}

export function buildCompressedPrecomputedManifestModule(manifest) {
  const packed = {
    d: Object.fromEntries(
      Object.entries(manifest.dependencies || {}).map(([moduleId, dependency]) => [
        moduleId,
        PRECOMPUTED_BUCKET_KEYS.map(key => encodePrecomputedBucket(dependency[key]))
      ])
    ),
    e: manifest.entrypoints || []
  }
  const compressed = gzipSync(Buffer.from(JSON.stringify(packed)), { level: 9 })

  return `const XEROFLOW_COMPACT_PRECOMPUTED='${compressed.toString('base64')}'
let cache
const resourceKeys=['file','resourceType','module','mimeType','preload','prefetch']
const bucketKeys=['scripts','styles','preload','prefetch']
function decodeBucket(bucket) {
  return Object.fromEntries(Object.entries(bucket).map(([id, values]) => [id,
    Object.fromEntries(values
      .map((value, index) => [resourceKeys[index], value])
      .filter(([, value]) => value !== null))
  ]))
}
export default async function loadPrecomputedManifest() {
  if (cache) return cache
  const bytes = Uint8Array.from(atob(XEROFLOW_COMPACT_PRECOMPUTED), char => char.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  const packed = JSON.parse(await new Response(stream).text())
  cache = {
    dependencies: Object.fromEntries(Object.entries(packed.d).map(([moduleId, buckets]) => [
      moduleId,
      Object.fromEntries(buckets.map((bucket, index) => [bucketKeys[index], decodeBucket(bucket)]))
    ])),
    entrypoints: packed.e
  }
  return cache
}
`
}

export function buildWorkerDispatcherModule() {
  return `import nitro from './_nitro.js'
import { handleBoardConnect, handleChatConnect, handleBannerConnect } from './_ws.js'

const BOARD_RE = /^\\/api\\/agency\\/boards\\/([^/]+)\\/connect$/
const CHAT_RE = /^\\/api\\/chat\\/([^/]+)\\/connect$/
const BANNER_RE = /^\\/api\\/agency\\/banner-studio\\/([^/]+)\\/connect$/

export default {
  async fetch(request, env, ctx) {
    if (request.headers.get('Upgrade') === 'websocket') {
      try {
        const { pathname } = new URL(request.url)
        const m1 = pathname.match(BOARD_RE)
        if (m1) return await handleBoardConnect(request, env, decodeURIComponent(m1[1]))
        const m2 = pathname.match(CHAT_RE)
        if (m2) return await handleChatConnect(request, env, decodeURIComponent(m2[1]))
        const m3 = pathname.match(BANNER_RE)
        if (m3) return await handleBannerConnect(request, env, decodeURIComponent(m3[1]))
      } catch (err) {
        console.error('[ws-wrap]', err && err.stack || err)
        return new Response('WebSocket handler error', { status: 500 })
      }
    }
    return nitro.fetch(request, env, ctx)
  },
  scheduled(event, env, ctx) {
    if (typeof nitro.scheduled === 'function') {
      return nitro.scheduled(event, env, ctx)
    }
  },
}
`
}

export function compactPlatformImports(source) {
  const removableImports = parse(source)[0]
    .filter(entry => (
      entry.d === -1
      && (entry.n?.startsWith('node:') || entry.n === 'cloudflare:workers')
      && /^import\s*(['"])[^'"]+\1$/.test(source.slice(entry.ss, entry.se))
    ))
    .map(entry => ({
      start: entry.ss,
      end: source[entry.se] === ';' ? entry.se + 1 : entry.se
    }))
    .sort((left, right) => right.start - left.start)

  let compacted = source
  for (const removableImport of removableImports) {
    compacted = compacted.slice(0, removableImport.start)
      + compacted.slice(removableImport.end)
  }
  return compacted
}

function compactDeployedModuleSource(source) {
  return compactPlatformImports(source).replace(
    /\/\/[#@]\s*sourceMappingURL=[^\s]+\s*$/gm,
    ''
  )
}

async function minifyDeployedModuleToFixedPoint(source, sourcefile) {
  let compacted = source

  for (let pass = 0; pass < 8; pass += 1) {
    const transformed = await transform(compacted, {
      sourcefile,
      loader: 'js',
      format: 'esm',
      platform: 'neutral',
      target: 'esnext',
      minify: true,
      keepNames: true,
      legalComments: 'none'
    })
    if (Buffer.byteLength(transformed.code) >= Buffer.byteLength(compacted)) {
      return compacted
    }
    compacted = transformed.code
  }

  throw new Error(
    `[worker-compaction] ${sourcefile} did not converge after 8 shrinking passes`
  )
}

export async function compactDeployedWorkerModules(directory) {
  let changedFiles = 0
  let savedBytes = 0

  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      const nested = await compactDeployedWorkerModules(entryPath)
      changedFiles += nested.changedFiles
      savedBytes += nested.savedBytes
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue

    const source = await readFile(entryPath, 'utf8')
    const stripped = compactDeployedModuleSource(source)
    const preservesCompactionMarker = (
      source.includes('XEROFLOW_COMPACT_PRECOMPUTED')
      || source.includes(WORKER_MODULE_COMPACTION_MARKER)
    )
    const compacted = preservesCompactionMarker
      ? stripped
      : await minifyDeployedModuleToFixedPoint(stripped, entry.name)
    if (compacted === source) continue

    await atomicWriteFile(entryPath, compacted)
    changedFiles += 1
    savedBytes += Buffer.byteLength(source) - Buffer.byteLength(compacted)
  }

  return { changedFiles, savedBytes }
}

async function readOriginalSourceMap(modulePath, source) {
  const match = source.match(/\/\/[#@]\s*sourceMappingURL=([^\s]+)\s*$/m)
  if (match?.[1].startsWith('data:')) return null

  try {
    const sourceMapPath = match
      ? path.resolve(path.dirname(modulePath), decodeURIComponent(match[1]))
      : `${modulePath}.map`
    const sourceMap = await readFile(sourceMapPath, 'utf8')
    JSON.parse(sourceMap)
    return sourceMap
  } catch {
    return null
  }
}

async function atomicWriteFile(filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`
  try {
    await writeFile(temporaryPath, contents, 'utf8')
    await rename(temporaryPath, filePath)
  } finally {
    await rm(temporaryPath, { force: true })
  }
}

export async function compactWorkerModule(modulePath) {
  const source = await readFile(modulePath, 'utf8')
  const beforeBytes = Buffer.byteLength(source)
  if (source.includes(WORKER_MODULE_COMPACTION_MARKER)) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  const originalSourceMap = await readOriginalSourceMap(modulePath, source)
  const sourceWithoutMapReference = source.replace(
    /\/\/[#@]\s*sourceMappingURL=[^\s]+\s*$/m,
    ''
  )
  const transformSource = originalSourceMap
    ? `${sourceWithoutMapReference}\n//# source${'MappingURL'}=data:application/json;base64,${
      Buffer.from(originalSourceMap).toString('base64')
    }`
    : sourceWithoutMapReference
  const sourceMapName = `${path.basename(modulePath)}.map`
  const result = await transform(transformSource, {
    sourcefile: path.basename(modulePath),
    loader: 'js',
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    minify: true,
    keepNames: true,
    legalComments: 'none',
    banner: `/* ${WORKER_MODULE_COMPACTION_MARKER} */`,
    sourcemap: 'external',
    sourcesContent: true
  })
  const compacted = `${result.code}//# source${'MappingURL'}=${sourceMapName}\n`
  const afterBytes = Buffer.byteLength(compacted)
  if (afterBytes >= beforeBytes) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  await atomicWriteFile(`${modulePath}.map`, result.map)
  await atomicWriteFile(modulePath, compacted)
  return { changed: true, beforeBytes, afterBytes }
}
