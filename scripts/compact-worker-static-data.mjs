import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, constants } from 'node:zlib'
import ts from 'typescript'

// Medium SSR fragments can share the existing decoder. Per-literal and whole-module
// byte comparisons still reject any encoding that grows the deployed artifact.
const MIN_LITERAL_CHARACTERS = 128
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

/** Encode only cooked static segments of untagged SQL templates. Keep every
 * original expression in its template position: concatenation would change
 * coercion hints, Symbol errors and expression evaluation order. */
export function compactSqlTemplateSource(source, { decoderSpecifier } = {}) {
  return compactStaticSource(source, 'XEROFLOW_SQL_TEMPLATE_DATA', () => false, 256, false, decoderSpecifier, true)
}

// Descriptive copy is consumed only as exact string data: MCP tool and feature
// description/content values, schema describe() text, and JSON.parse() input
// (the Nuxt Icon server bundle). Keys, callees and every other argument stay.
const STATIC_TEXT_KEYS = new Set(['description', 'content'])
function selectsStaticText(node) {
  const parent = node.parent
  if (ts.isPropertyAssignment(parent)) {
    return parent.initializer === node
      && (ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name))
      && STATIC_TEXT_KEYS.has(parent.name.text)
  }
  if (!ts.isCallExpression(parent) || parent.arguments[0] !== node
    || !ts.isPropertyAccessExpression(parent.expression)) return false
  const { expression, name } = parent.expression
  return name.text === 'describe'
    || (name.text === 'parse' && ts.isIdentifier(expression) && expression.text === 'JSON')
}

/** Text in function bodies may be read through an import cycle before the
 * module body runs, so this pass uses a hoisted lookup instead of a const. */
export function compactStaticTextDataSource(source, { decoderSpecifier } = {}) {
  if (source.includes('XEROFLOW_COMPACT_PRECOMPUTED')) return { code: source, literals: 0 }
  return compactStaticSource(source, 'XEROFLOW_STATIC_TEXT_DATA', () => true, 64, false, decoderSpecifier, false, { selects: selectsStaticText, hoisted: true })
}

function compactStaticSource(source, marker, accepts, minimumCharacters = MIN_LITERAL_CHARACTERS, includeConstants = false, decoderSpecifier, sqlTemplates = false, { selects, hoisted = false } = {}) {
  const unchanged = { code: source, literals: 0 }
  if (source.includes(marker)) return unchanged
  const file = ts.createSourceFile('ssr.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS)
  if (file.parseDiagnostics.length) throw new Error('[worker-static-data] Invalid generated SSR module')
  let suffix = 0
  while (source.includes(`__xfStatic${suffix}`)) suffix++
  const prefix = `__xfStatic${suffix}`
  const values = [], indexes = new Map(), replacements = []
  const encode = (value, start, end, template = false) => {
    if (value.length < minimumCharacters || !value.isWellFormed()) return
    const encoded = compress(value)
    if (encoded.length + 32 >= Buffer.byteLength(source.slice(start, end))) return
    let index = indexes.get(value)
    if (index === undefined) {
      index = values.length
      indexes.set(value, index)
      values.push(value)
    }
    const call = `${prefix}(${index})`
    replacements.push({ start, end, value: template ? '${' + call + '}' : call })
  }
  // A pass may narrow these data positions (call arguments and property
  // values) but never widen them.
  const selected = selects || (node => (ts.isCallExpression(node.parent)
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
  const visit = (node) => {
    if (sqlTemplates && ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent)
      && /^\s*(?:\/\*[\s\S]*?\*\/\s*)*(?:SELECT|INSERT|UPDATE|DELETE|WITH|CREATE|ALTER)\s/i.test(node.head.text)) {
      for (const part of [node.head, ...node.templateSpans.map(span => span.literal)]) {
        // Preserve the surrounding ` / } and ${ / ` delimiters. Replacing
        // only a quasi cannot overlap a nested expression's source range.
        encode(part.text, part.getStart(file) + 1, part.getEnd() - (part.kind === ts.SyntaxKind.TemplateTail ? 1 : 2), true)
      }
    }
    if (ts.isStringLiteralLike(node)
      && selected(node)
      && node.text.length >= minimumCharacters
      && accepts(node.text)
    // UTF-8 replaces lone surrogates, so do not encode those JS strings.
      && node.text.isWellFormed()) {
      encode(node.text, node.getStart(file), node.getEnd())
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  if (!replacements.length) return unchanged
  let body = source
  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, replacement.start) + replacement.value + body.slice(replacement.end)
  }
  // Share compression within bounded groups of immutable build-time strings.
  // The original AST selection and individual profitability checks stay intact.
  const data = JSON.stringify(packStaticStrings(values))
  const create = decoderSpecifier
    ? `import { createStaticDecoder as ${prefix}Create } from ${JSON.stringify(decoderSpecifier)};`
    : staticDecoderSource(prefix + 'Create', prefix)
  // Function declarations and var bindings are initialized before any module
  // body runs; the data array is still materialized once, on first lookup.
  const lookup = hoisted
    ? `var ${prefix}Lookup;
function ${prefix}(index) {
  return (${prefix}Lookup ??= ${prefix}Create(${data}))(index);
}`
    : `const ${prefix} = ${prefix}Create(${data});`
  const decoder = `${create}\n${lookup}`
  const code = `// ${marker}\n${decoder}\n${body}`
  return Buffer.byteLength(code) < Buffer.byteLength(source)
    ? { code, literals: replacements.length }
    : unchanged
}

// Bound new grouped decompression to 128 KiB and 16 strings. An already-large
// individual string retains its original plain-string encoding and expansion.
function packStaticStrings(values) {
  const blocks = []
  let group = [], bytes = 2, end = 0
  const flush = () => {
    if (!group.length) return
    blocks.push(group.length === 1
      ? [end, compress(group[0]), 1]
      : [end, compress(JSON.stringify(group))])
    group = []
    bytes = 2
  }
  for (const value of values) {
    const length = Buffer.byteLength(JSON.stringify(value))
    if (group.length && (group.length === 16 || bytes + 1 + length > 128 * 1024)) flush()
    group.push(value)
    bytes += length + (group.length > 1 ? 1 : 0)
    end++
    if (bytes > 128 * 1024) flush()
  }
  flush()
  return blocks
}

// Each tuple contains the exclusive end index, encoded payload, and an optional
// plain-singleton flag. Only exact immutable strings escape the lazy block cache.
function staticDecoderSource(name, prefix) {
  return `import { brotliDecompressSync as ${prefix}Inflate } from 'node:zlib';
import { Buffer as ${prefix}Buffer } from 'node:buffer';
function ${name}(data) {
  const cache = [];
  return index => {
    const block = data.findIndex(value => index < value[0]);
    const entry = data[block];
    if (!cache[block]) {
      const text = ${prefix}Inflate(${prefix}Buffer.from(entry[1], 'base64')).toString('utf8');
      cache[block] = entry[2] ? [text] : JSON.parse(text);
    }
    return cache[block][index - (block ? data[block - 1][0] : 0)];
  };
}`
}
const SHARED_STATIC_DECODER = `${staticDecoderSource('createStaticDecoder', 'd')}
export { createStaticDecoder };
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
  return compactSqlDirectories(workerDirectory, ['routes'], compactSqlSource)
}

/** Generated server boundaries only. The same lazy decoder serves fixed SQL
 * fragments; request expressions and parameters never enter its data or cache. */
export async function compactSqlTemplateDirectory(workerDirectory) {
  return compactSqlDirectories(workerDirectory, ['nitro', 'routes'], compactSqlTemplateSource)
}

/** Descriptive copy lives in the Nitro runtime, API routes, Vue page chunks and
 * the generated Vue server entry. Shared `_` library chunks are not scanned. */
export async function compactStaticTextDataDirectory(workerDirectory) {
  return compactSqlDirectories(workerDirectory, ['nitro', 'routes', 'build', 'virtual'], compactStaticTextDataSource)
}

async function compactSqlDirectories(workerDirectory, directories, compactSource) {
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
      const candidate = staticModuleCandidate(workerDirectory, file, source, compactSource)
      if (candidate) changes.push(candidate)
    }
  }
  for (const directory of directories) await visit(path.join(workerDirectory, 'chunks', directory))
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
