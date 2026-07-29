import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { transform } from 'esbuild'

export const WORKER_MODULE_COMPACTION_MARKER = 'XEROFLOW_COMPACT_WORKER_MODULE'

export async function compactWorkerModule(modulePath) {
  const source = await readFile(modulePath, 'utf8')
  const beforeBytes = Buffer.byteLength(source)
  if (source.includes(WORKER_MODULE_COMPACTION_MARKER)) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  const result = await transform(source, {
    sourcefile: path.basename(modulePath),
    loader: 'js',
    format: 'esm',
    platform: 'neutral',
    target: 'esnext',
    minify: true,
    keepNames: true,
    legalComments: 'none'
  })
  const compacted = `/* ${WORKER_MODULE_COMPACTION_MARKER} */\n${result.code}`
  const afterBytes = Buffer.byteLength(compacted)
  if (afterBytes >= beforeBytes) {
    return { changed: false, beforeBytes, afterBytes: beforeBytes }
  }

  await writeFile(modulePath, compacted, 'utf8')
  return { changed: true, beforeBytes, afterBytes }
}
