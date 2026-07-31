import { randomUUID } from 'node:crypto'
import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
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
    const compacted = compactDeployedModuleSource(source)
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
