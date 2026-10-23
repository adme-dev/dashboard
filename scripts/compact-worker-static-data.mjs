import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import ts from 'typescript'

// Medium SSR literals share the existing lazy decoder. Per-literal and whole-
// module byte-win checks still include all decoder overhead.
const MIN_LITERAL_CHARACTERS = 256
const compress = value => brotliCompressSync(Buffer.from(value, 'utf8'), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
}).toString('base64')

/** Only build-generated call arguments and data-property values are replaced. No executable source,
 * tagged template, property key, directive or interpolated template is encoded. */
export function compactSsrMarkupSource(source, { decoderSpecifier } = {}) {
  return compactStaticSource(source, 'XEROFLOW_STATIC_SSR_DATA', value => value.includes('<') && value.includes('>'), MIN_LITERAL_CHARACTERS, false, decoderSpecifier)
}

/** SQL text is immutable data, not executed by the build. Preserve all whitespace,
 * parameters and escape sequences. Dynamic/tagged templates are never encoded.
 * Medium static statements also benefit when their combined savings exceed the
 * decoder overhead; the existing whole-module size check remains authoritative. */
export function compactSqlSource(source, { decoderSpecifier } = {}) {
  return compactStaticSource(source, 'XEROFLOW_STATIC_SQL_DATA', value => /^\s*(?:SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)\s/i.test(value), 256, true, decoderSpecifier)
}

function compactStaticSource(source, marker, accepts, minimumCharacters = MIN_LITERAL_CHARACTERS, includeConstants = false, decoderSpecifier) {
  const unchanged = { code: source, literals: 0 }
  if (source.includes(marker)) return unchanged
  const file = ts.createSourceFile('ssr.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if (file.parseDiagnostics.length) throw new Error('[worker-static-data] Invalid generated SSR module')
  let suffix = 0
  while (source.includes(`__xfStatic${suffix}`)) suffix++
  const prefix = `__xfStatic${suffix}`
  const values = [], indexes = new Map(), replacements = []
  const visit = (node) => {
    if (ts.isStringLiteralLike(node)
      && ((ts.isCallExpression(node.parent)
        && node.parent.expression.kind !== ts.SyntaxKind.ImportKeyword
        && node.parent.arguments.includes(node))
      || (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node)
      // SQL constants are immutable string data too. Keep the declaration and
      // initializer in place; only replace the complete literal with its exact
      // decoded value. Never fold expressions, tagged templates or mutable vars.
      || (includeConstants && ts.isVariableDeclaration(node.parent)
        && node.parent.initializer === node
        && ts.isVariableDeclarationList(node.parent.parent)
        && (node.parent.parent.flags & ts.NodeFlags.Const) !== 0))
      && node.text.length >= minimumCharacters
      && accepts(node.text)
    // UTF-8 replaces lone surrogates, so do not encode those JS strings.
      && node.text.isWellFormed()) {
      const start = node.getStart(file), end = node.getEnd()
      const encoded = compress(node.text)
      if (encoded.length + 32 < Buffer.byteLength(source.slice(start, end))) {
        let index = indexes.get(node.text)
        if (index === undefined) {
          index = values.length
          indexes.set(node.text, index)
          values.push(encoded)
        }
        replacements.push({ start, end, value: `${prefix}(${index})` })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!replacements.length) return unchanged
  let body = source
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, replacement.start) + replacement.value + body.slice(replacement.end)
  }
  // Cache only immutable, compile-time strings. No request data enters this cache.
  // Decode lazily once per string so cold routes need no up-front decompression.
  const decoder = decoderSpecifier
    ? `import { createStaticDecoder as ${prefix}Create } from ${JSON.stringify(decoderSpecifier)};
const ${prefix} = ${prefix}Create(${JSON.stringify(values)});`
    : `import { brotliDecompressSync as ${prefix}Inflate } from 'node:zlib';
import { Buffer as ${prefix}Buffer } from 'node:buffer';
const ${prefix}Data = ${JSON.stringify(values)};
const ${prefix}Cache = [];
function ${prefix}(index) {
  return ${prefix}Cache[index] ??= ${prefix}Inflate(${prefix}Buffer.from(${prefix}Data[index], 'base64')).toString('utf8');
}`
  const code = `// ${marker}\n${decoder}\n${body}`
  return Buffer.byteLength(code) < Buffer.byteLength(source)
    ? { code, literals: replacements.length }
    : unchanged
}

// One implementation, with a separate lazy cache per calling module. Only
// immutable build-time strings reach it; query arguments never enter the cache.
const SHARED_STATIC_DECODER = `import { brotliDecompressSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
export function createStaticDecoder(data) {
  const cache = [];
  return index => cache[index] ??= brotliDecompressSync(Buffer.from(data[index], 'base64')).toString('utf8');
}
`

function sharedDecoderSpecifier(workerDirectory, file) {
  const decoderFile = path.join(workerDirectory, 'chunks', 'static-data-decoder.mjs')
  const relative = path.relative(path.dirname(file), decoderFile).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

function staticModuleCandidate(workerDirectory, file, source, compactSource) {
  const compacted = compactSource(source)
  const shared = compactSource(source, { decoderSpecifier: sharedDecoderSpecifier(workerDirectory, file) })
  // A module may only save bytes with a shared decoder. Keep that candidate
  // until the directory-wide comparison includes the helper's complete cost.
  return compacted.code !== source || shared.code !== source
    ? { file, source, compacted, shared }
    : null
}

export async function compactSsrMarkupDirectory(workerDirectory) {
  const directory = path.join(workerDirectory, 'chunks', 'build')
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch (error) {
    if (error.code === 'ENOENT') return { changedFiles: 0, literals: 0, savedBytes: 0 }
    throw error
  }
  const changes = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue
    const file = path.join(directory, entry.name)
    const source = await readFile(file, 'utf8')
    const candidate = staticModuleCandidate(workerDirectory, file, source, compactSsrMarkupSource)
    if (candidate) changes.push(candidate)
  }
  return writeCompactedStaticModules(workerDirectory, changes)
}

/** Nitro 2 emits this virtual module as one JSON default export. Retain all
 * values (including optional encodings) and fail closed on a changed contract. */
export function compactPublicAssetsPlugin() {
  return {
    name: 'xeroflow-compact-public-assets',
    transform(source, id) {
      if (!/^(?:\0)?(?:virtual:)?#nitro-internal-virtual\/public-assets-data$/.test(id)) return null
      const match = source.match(/^\s*export default (\{[\s\S]*\});?\s*$/)
      if (!match) throw new Error('[worker-static-data] Unexpected public assets module')
      const assets = JSON.parse(match[1])
      for (const [name, item] of Object.entries(assets)) {
        if (!name.startsWith('/') || !item || typeof item !== 'object' || Array.isArray(item)
          || Object.keys(item).some(key => !['type', 'etag', 'mtime', 'size', 'path', 'encoding', 'data'].includes(key))
          || !['type', 'etag', 'mtime', 'path'].every(key => typeof item[key] === 'string')
          || !Number.isSafeInteger(item.size) || item.size < 0
          || (item.encoding !== undefined && item.encoding !== null && !['gzip', 'br'].includes(item.encoding))
          || (item.data !== undefined && typeof item.data !== 'string')) {
          throw new Error('[worker-static-data] Unexpected public assets metadata')
        }
      }
      const encoded = compress(JSON.stringify(assets))
      const code = `import { brotliDecompressSync } from 'node:zlib';
import { Buffer } from 'node:buffer';
const XEROFLOW_COMPACT_PUBLIC_ASSETS = '${encoded}';
export default JSON.parse(brotliDecompressSync(Buffer.from(XEROFLOW_COMPACT_PUBLIC_ASSETS, 'base64')).toString('utf8'));
`
      return Buffer.byteLength(code) < Buffer.byteLength(source) ? { code, map: null } : null
    }
  }
}

/** The final Nitro chunk owns server queries. Do not scan client chunks or
 * source maps, and fail closed if Nitro changes this generated boundary. */
export async function compactNitroSqlModule(workerDirectory) {
  const file = path.join(workerDirectory, 'chunks', 'nitro', 'nitro.mjs')
  const source = await readFile(file, 'utf8')
  const result = compactSqlSource(source)
  if (result.code !== source) await writeFile(file, result.code)
  return { literals: result.literals, savedBytes: Buffer.byteLength(source) - Buffer.byteLength(result.code) }
}

/** SQL also lives in split server route modules; the exact partition varies
 * between Nuxt/Vite releases. Reuse the same lossless literal encoder there,
 * before minification, without scanning client chunks or source maps. */
export async function compactRouteSqlDirectory(workerDirectory) {
  const changes = []
  const visit = async (directory) => {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(file)
      if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue
      const source = await readFile(file, 'utf8')
      const candidate = staticModuleCandidate(workerDirectory, file, source, compactSqlSource)
      if (candidate) changes.push(candidate)
    }
  }
  await visit(path.join(workerDirectory, 'chunks', 'routes'))
  return writeCompactedStaticModules(workerDirectory, changes)
}

// SSR and SQL share the same decoder while retaining separate per-module caches.
// Stage and validate every candidate before writing either directory.
async function writeCompactedStaticModules(workerDirectory, changes) {
  const result = { changedFiles: 0, literals: 0, savedBytes: 0 }
  if (!changes.length) return result

  const decoderFile = path.join(workerDirectory, 'chunks', 'static-data-decoder.mjs')
  let decoderExists = false
  try {
    if (await readFile(decoderFile, 'utf8') !== SHARED_STATIC_DECODER) {
      throw new Error('[worker-static-data] Unexpected shared decoder module')
    }
    decoderExists = true
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const shared = changes.map(change => change.shared)
  const decoderBytes = decoderExists ? 0 : Buffer.byteLength(SHARED_STATIC_DECODER)
  const inlineBytes = changes.reduce((sum, { compacted }) => sum + Buffer.byteLength(compacted.code), 0)
  const sharedBytes = shared.reduce((sum, compacted) => sum + Buffer.byteLength(compacted.code), decoderBytes)
  // Include the complete helper cost. Small builds keep the standalone decoder
  // when sharing would increase their deployment size.
  const useShared = sharedBytes < inlineBytes
  if (useShared && !decoderExists) await writeFile(decoderFile, SHARED_STATIC_DECODER, { flag: 'wx' })
  for (const [index, { file, source, compacted }] of changes.entries()) {
    const selected = useShared ? shared[index] : compacted
    if (selected.code === source) continue
    await writeFile(file, selected.code)
    result.changedFiles++
    result.literals += selected.literals
    result.savedBytes += Buffer.byteLength(source) - Buffer.byteLength(selected.code)
  }
  if (useShared) result.savedBytes -= decoderBytes
  return result
}
