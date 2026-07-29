import { randomUUID } from 'node:crypto'
import { readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transform } from 'esbuild'

export const WORKER_MODULE_COMPACTION_MARKER = 'XEROFLOW_COMPACT_WORKER_MODULE'

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
