import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import ts from 'typescript'

const MARKER = 'XEROFLOW_STATIC_SSR_DATA'
const MIN_LITERAL_CHARACTERS = 1024
const compress = value => brotliCompressSync(Buffer.from(value, 'utf8'), {
  params: { [constants.BROTLI_PARAM_QUALITY]: 11 }
}).toString('base64')

/** Only build-generated call arguments and data-property values are replaced. No executable source,
 * tagged template, property key, directive or interpolated template is encoded. */
export function compactSsrMarkupSource(source) {
  const unchanged = { code: source, literals: 0 }
  if (source.includes(MARKER)) return unchanged
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
      || (ts.isPropertyAssignment(node.parent) && node.parent.initializer === node))
    && node.text.length >= MIN_LITERAL_CHARACTERS
    && node.text.includes('<') && node.text.includes('>')
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
  const code = `// ${MARKER}
import { brotliDecompressSync as ${prefix}Inflate } from 'node:zlib';
import { Buffer as ${prefix}Buffer } from 'node:buffer';
const ${prefix}Data = ${JSON.stringify(values)};
const ${prefix}Cache = [];
function ${prefix}(index) {
  return ${prefix}Cache[index] ??= ${prefix}Inflate(${prefix}Buffer.from(${prefix}Data[index], 'base64')).toString('utf8');
}
${body}`
  return Buffer.byteLength(code) < Buffer.byteLength(source)
    ? { code, literals: replacements.length }
    : unchanged
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
  let changedFiles = 0, literals = 0, savedBytes = 0
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.mjs')) continue
    const file = path.join(directory, entry.name)
    const source = await readFile(file, 'utf8')
    const result = compactSsrMarkupSource(source)
    if (result.code === source) continue
    await writeFile(file, result.code)
    changedFiles++
    literals += result.literals
    savedBytes += Buffer.byteLength(source) - Buffer.byteLength(result.code)
  }
  return { changedFiles, literals, savedBytes }
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
