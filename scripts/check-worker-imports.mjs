#!/usr/bin/env node
/** Validate the final deployed module graph, after wrapping/compaction. */
import { lstat, readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseProgram } from 'acorn'
import { init, parse } from 'es-module-lexer'

// Reviewed legacy deferred features in the 2026-10-27 artifact. These are NOT
// available modules and must never become static imports. Their feature paths
// are outside this startup proof. Counts prevent silently expanding this scope.
const deferredOptionalLimits = new Map([
  ['@react-email/render', 1],
  ['@cloudflare/puppeteer', 3],
  ['puppeteer', 2]
])
// node-postgres' `pg.native` getter keeps `require("pg-native")` (a reviewed
// Rollup external). Server code never reads `pg.native`; in workerd the call
// would throw. Same bounded-count review as deferred optional imports.
const deferredOptionalRequireLimits = new Map([
  ['pg-native', 1]
])

// Wrangler uploads only these files from a Pages `_worker.js` directory as
// ES modules; any other relative target is absent at runtime.
const uploadedModulePattern = /\.(?:js|mjs)$/
const platformSpecifierPattern = /^(?:node|cloudflare):[^\s]+$/

async function listModules(root) {
  const entries = await readdir(root, { recursive: true, withFileTypes: true })
  return entries.filter(entry => entry.isFile() && uploadedModulePattern.test(entry.name))
    .map(entry => path.join(entry.parentPath, entry.name)).sort()
}

function parseModule(source) {
  return parseProgram(source, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true })
}

function children(node) {
  const result = []
  for (const key in node) {
    if (key === 'type' || key === 'start' || key === 'end') continue
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) if (item && typeof item.type === 'string') result.push(item)
    } else if (value && typeof value.type === 'string') {
      result.push(value)
    }
  }
  return result
}

const isFunction = node => node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'

function containsString(root, needle) {
  const stack = [root]
  while (stack.length) {
    const node = stack.pop()
    if (node.type === 'Literal' && typeof node.value === 'string' && node.value.includes(needle)) return true
    if (node.type === 'TemplateElement' && node.value.cooked?.includes(needle)) return true
    stack.push(...children(node))
  }
  return false
}

function patternNames(pattern, names = []) {
  if (!pattern) return names
  if (pattern.type === 'Identifier') names.push(pattern.name)
  else if (pattern.type === 'AssignmentPattern') patternNames(pattern.left, names)
  else if (pattern.type === 'RestElement') patternNames(pattern.argument, names)
  else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) patternNames(element, names)
  else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) patternNames(property.type === 'RestElement' ? property : property.value, names)
  return names
}

function resolve(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return current.bindings.get(name)
  }
  return undefined
}

// `var` declarations hoist to the enclosing function/module; let/const/class
// and (strict-mode) function declarations bind only in their block.
function varDeclarators(roots) {
  const found = []
  const stack = [...roots]
  while (stack.length) {
    const node = stack.pop()
    if (isFunction(node) || node.type === 'ClassExpression' || node.type === 'ClassDeclaration') continue
    if (node.type === 'VariableDeclaration' && node.kind === 'var') found.push(...node.declarations)
    stack.push(...children(node))
  }
  return found
}

function lexicalDeclarations(statements) {
  const found = []
  for (const statement of statements) {
    const node = statement.type === 'ExportNamedDeclaration' || statement.type === 'ExportDefaultDeclaration' ? statement.declaration : statement
    if (node?.type === 'VariableDeclaration' && node.kind !== 'var') found.push(...node.declarations)
    else if ((node?.type === 'FunctionDeclaration' || node?.type === 'ClassDeclaration') && node.id) found.push(node)
  }
  return found
}

function createScope(parent, declarations, helperMarkers, extraNames = [], imports = []) {
  const scope = { parent, bindings: new Map() }
  for (const name of extraNames) scope.bindings.set(name, { tag: null })
  for (const node of declarations) {
    const names = node.type === 'VariableDeclarator' ? patternNames(node.id) : [node.id.name]
    for (const name of names) scope.bindings.set(name, { tag: null })
  }
  for (const statement of imports) {
    const fromModule = ['node:module', 'module'].includes(statement.source.value)
    for (const specifier of statement.specifiers) {
      let tag = null
      if (fromModule && specifier.type === 'ImportSpecifier' && (specifier.imported.name ?? specifier.imported.value) === 'createRequire') tag = 'createRequire'
      else if (fromModule && specifier.type !== 'ImportSpecifier') tag = 'moduleNamespace'
      scope.bindings.set(specifier.local.name, { tag })
    }
  }
  for (const node of [...declarations].sort((left, right) => left.start - right.start)) {
    let tag = null
    if (node.type === 'FunctionDeclaration') tag = helperMarkers && containsString(node.body, 'Could not dynamically require') ? 'require' : null
    else if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') tag = classifyRequireValue(node.init, scope, helperMarkers)
    if (tag) scope.bindings.get(node.id.name).tag = tag
  }
  return scope
}

function isCreateRequireCallee(callee, scope) {
  if (callee.type === 'Identifier') return resolve(scope, callee.name)?.tag === 'createRequire'
  return callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'createRequire'
    && callee.object.type === 'Identifier' && resolve(scope, callee.object.name)?.tag === 'moduleNamespace'
}

function classifyRequireValue(init, scope, helperMarkers) {
  if (!init) return null
  if (init.type === 'Identifier') {
    const binding = resolve(scope, init.name)
    if (binding) return binding.tag === 'require' ? 'require' : null
    return init.name === 'require' ? 'require' : null
  }
  if (init.type === 'CallExpression' && isCreateRequireCallee(init.callee, scope)) return 'require'
  // Bundler fallbacks that execute an unresolved require at runtime:
  // esbuild `__require` and Rollup `commonjsRequire` (names are minified).
  if (helperMarkers && (containsString(init, 'Dynamic require of "') || containsString(init, 'Could not dynamically require'))) return 'require'
  return null
}

function requireCallKind(node, scope) {
  const callee = node.callee
  if (callee.type === 'Identifier') {
    const binding = resolve(scope, callee.name)
    if (!binding && callee.name === 'require') return 'CommonJS require'
    if (binding?.tag === 'require') return 'CommonJS require helper'
    return null
  }
  if (callee.type === 'CallExpression' && isCreateRequireCallee(callee.callee, scope)) return 'createRequire'
  return null
}

function literalSpecifier(argument) {
  if (argument?.type === 'Literal' && typeof argument.value === 'string') return argument.value
  if (argument?.type === 'TemplateLiteral' && argument.expressions.length === 0) return argument.quasis[0].value.cooked
  return undefined
}

/** CommonJS calls that survived bundling cannot load npm packages in workerd. */
export function findUnbundledRequires(source) {
  if (!/\brequire\b|createRequire|Dynamic require of|dynamically require/.test(source)) return []
  const program = parseModule(source)
  const helperMarkers = /Dynamic require of|Could not dynamically require/.test(source)
  const findings = []
  const imports = program.body.filter(statement => statement.type === 'ImportDeclaration')
  const moduleScope = createScope(null, [...varDeclarators(program.body), ...lexicalDeclarations(program.body)], helperMarkers, [], imports)
  const stack = program.body.map(node => ({ node, scope: moduleScope }))
  const push = (nodes, scope) => {
    for (const node of nodes) if (node) stack.push({ node, scope })
  }
  while (stack.length) {
    const { node, scope } = stack.pop()
    if (isFunction(node)) {
      const params = node.params.flatMap(param => patternNames(param))
      if (node.type === 'FunctionExpression' && node.id) params.push(node.id.name)
      const body = node.body.type === 'BlockStatement' ? node.body.body : [node.body]
      const declarations = node.body.type === 'BlockStatement' ? [...varDeclarators(body), ...lexicalDeclarations(body)] : []
      const functionScope = createScope(scope, declarations, helperMarkers, params)
      push(node.params, functionScope)
      push(body, functionScope)
      continue
    }
    if (node.type === 'BlockStatement' || node.type === 'StaticBlock') {
      push(node.body, createScope(scope, lexicalDeclarations(node.body), helperMarkers))
      continue
    }
    if (node.type === 'SwitchStatement') {
      push([node.discriminant], scope)
      push(node.cases, createScope(scope, lexicalDeclarations(node.cases.flatMap(entry => entry.consequent)), helperMarkers))
      continue
    }
    if (node.type === 'CatchClause') {
      push([node.body], createScope(scope, [], helperMarkers, patternNames(node.param)))
      continue
    }
    const loopDeclaration = node.type === 'ForStatement' ? node.init : (node.type === 'ForInStatement' || node.type === 'ForOfStatement') ? node.left : null
    if (loopDeclaration?.type === 'VariableDeclaration' && loopDeclaration.kind !== 'var') {
      push(children(node), createScope(scope, loopDeclaration.declarations, helperMarkers))
      continue
    }
    if (node.type === 'CallExpression') {
      const kind = requireCallKind(node, scope)
      if (kind) {
        const specifier = literalSpecifier(node.arguments[0])
        if (specifier === undefined) findings.push({ kind, specifier, reason: `non-literal ${kind} call is outside the reviewed closure` })
        else if (!platformSpecifierPattern.test(specifier)) findings.push({ kind, specifier, reason: `unbundled ${kind} call` })
      }
    }
    push(children(node), scope)
  }
  return findings
}

export async function checkWorkerImports(directory) {
  const root = path.resolve(directory)
  if (!(await lstat(path.join(root, 'index.js'))).isFile()) throw new Error('Worker index.js must be a regular file')
  const modules = await listModules(root)
  const errors = []
  const deferredOptionalImports = []
  const optionalCounts = new Map()
  await init
  for (const file of modules) {
    const relativeFile = path.relative(root, file)
    const source = await readFile(file, 'utf8')
    let imports
    try {
      ;[imports] = parse(source, relativeFile)
    } catch {
      errors.push({ file: relativeFile, reason: 'module import syntax could not be parsed' })
      continue
    }
    for (const item of imports) {
      if (item.d === -2) continue // import.meta is not a dependency
      const specifier = item.n
      const problem = reason => errors.push({ file: relativeFile, specifier, reason })
      if (specifier === undefined) {
        problem('non-literal dynamic import is outside the reviewed closure')
        continue
      }
      if (platformSpecifierPattern.test(specifier)) continue
      if (specifier.startsWith('./') || specifier.startsWith('../')) {
        const target = path.resolve(path.dirname(file), specifier)
        const relativeTarget = path.relative(root, target)
        if (relativeTarget === '..' || relativeTarget.startsWith(`..${path.sep}`) || path.isAbsolute(relativeTarget)) {
          problem('relative import escapes deployed artifact')
          continue
        }
        try {
          if (!(await lstat(target)).isFile()) problem('relative import target is not a regular file')
          else if (!uploadedModulePattern.test(target)) problem('relative import target is not an uploaded .js/.mjs module')
        } catch {
          problem('relative import target does not exist')
        }
        continue
      }
      if (item.d >= 0 && deferredOptionalLimits.has(specifier)) {
        const count = (optionalCounts.get(specifier) || 0) + 1
        optionalCounts.set(specifier, count)
        const limit = deferredOptionalLimits.get(specifier)
        if (count > limit) problem(`optional dynamic import count exceeds reviewed bound (${limit})`)
        else deferredOptionalImports.push({ file: relativeFile, specifier })
        continue
      }
      problem('unresolved bare import')
    }
    try {
      for (const finding of findUnbundledRequires(source)) {
        const { specifier } = finding
        if (deferredOptionalRequireLimits.has(specifier)) {
          const key = `require:${specifier}`
          const count = (optionalCounts.get(key) || 0) + 1
          optionalCounts.set(key, count)
          const limit = deferredOptionalRequireLimits.get(specifier)
          if (count > limit) errors.push({ file: relativeFile, specifier, reason: `optional require count exceeds reviewed bound (${limit})` })
          else deferredOptionalImports.push({ file: relativeFile, specifier, kind: finding.kind })
          continue
        }
        errors.push({ file: relativeFile, specifier, reason: finding.reason })
      }
    } catch {
      errors.push({ file: relativeFile, reason: 'module syntax could not be parsed for CommonJS requires' })
    }
  }
  return { modules: modules.length, errors, deferredOptionalImports }
}

function relativeImportTarget(file, specifier) {
  return path.resolve(path.dirname(file), specifier.split(/[?#]/, 1)[0])
}

function thenExport(callback) {
  // `.then(e => e.d)` / `.then(function (e) { return e.d })` picks one export.
  if (!callback || !isFunction(callback) || callback.params.length !== 1 || callback.params[0].type !== 'Identifier') return undefined
  const param = callback.params[0].name
  const body = callback.body.type === 'BlockStatement'
    ? (callback.body.body.length === 1 && callback.body.body[0].type === 'ReturnStatement' ? callback.body.body[0].argument : null)
    : callback.body
  if (body?.type !== 'MemberExpression' || body.object.type !== 'Identifier' || body.object.name !== param) return undefined
  return body.computed ? literalSpecifier(body.property) : body.property.name
}

function importedChunk(node) {
  // Nitro lazy handlers: `() => import("./chunk.js")`, optionally `.then(...)`,
  // possibly wrapped in esbuild's keep-names helper `s(() => import(...), "handler")`.
  if (node?.type === 'CallExpression' && node.arguments.length === 2 && isFunction(node.arguments[0]) && literalSpecifier(node.arguments[1]) !== undefined) node = node.arguments[0]
  let body = node && isFunction(node) && node.params.length === 0 ? node.body : null
  let exportName
  if (body?.type === 'CallExpression' && body.callee.type === 'MemberExpression' && body.callee.property.name === 'then') {
    exportName = thenExport(body.arguments[0])
    if (exportName === undefined) return {}
    body = body.callee.object
  }
  return body?.type === 'ImportExpression' ? { specifier: literalSpecifier(body.source), exportName } : {}
}

const propertyName = property => property.key.type === 'Identifier' ? property.key.name : property.key.value

/**
 * Resolve Nitro handler-table routes under `routePrefix` to the exact emitted
 * lazy route chunks, independent of compacted chunk names.
 */
export async function discoverRouteChunks(directory, routePrefix) {
  const root = path.resolve(directory)
  const routes = []
  for (const file of await listModules(root)) {
    const source = await readFile(file, 'utf8')
    if (!source.includes(routePrefix)) continue
    const program = parseModule(source)
    const topLevel = new Map()
    for (const statement of program.body) {
      const declaration = statement.type === 'ExportNamedDeclaration' ? statement.declaration : statement
      if (declaration?.type !== 'VariableDeclaration') continue
      for (const declarator of declaration.declarations) if (declarator.id.type === 'Identifier') topLevel.set(declarator.id.name, declarator.init)
    }
    const stack = [program]
    while (stack.length) {
      const node = stack.pop()
      stack.push(...children(node))
      if (node.type !== 'ObjectExpression') continue
      const properties = new Map(node.properties.filter(property => property.type === 'Property' && !property.computed).map(property => [propertyName(property), property.value]))
      const route = literalSpecifier(properties.get('route'))
      if (!route?.startsWith(routePrefix) || !properties.has('handler')) continue
      const handler = properties.get('handler')
      const { specifier, exportName } = importedChunk(handler.type === 'Identifier' ? topLevel.get(handler.name) : handler)
      const method = literalSpecifier(properties.get('method'))
      const chunk = specifier?.startsWith('.') ? path.relative(root, relativeImportTarget(file, specifier)) : undefined
      routes.push({ route, method, module: path.relative(root, file), chunk, exportName })
    }
  }
  return routes.sort((left, right) => `${left.route} ${left.method}`.localeCompare(`${right.route} ${right.method}`))
}

/** Relative static-import closure of `entries` (paths relative to directory). */
export async function staticImportClosure(directory, entries) {
  const root = path.resolve(directory)
  await init
  const seen = new Set()
  const queue = [...entries]
  while (queue.length) {
    const relativeFile = queue.pop()
    if (seen.has(relativeFile)) continue
    seen.add(relativeFile)
    const file = path.join(root, relativeFile)
    const [imports] = parse(await readFile(file, 'utf8'), relativeFile)
    for (const item of imports) {
      if (item.d !== -1 || !item.n?.startsWith('.')) continue
      queue.push(path.relative(root, relativeImportTarget(file, item.n)))
    }
  }
  return seen
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const root = process.argv[2] || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/_worker.js')
  try {
    const result = await checkWorkerImports(root)
    if (result.errors.length) {
      for (const error of result.errors.slice(0, 20)) console.error(`[worker-imports] ${error.file}: ${error.specifier || '(expression)'}: ${error.reason}`)
      console.error(`[worker-imports] FAILED: ${result.errors.length} unresolved imports across ${result.modules} modules`)
      process.exitCode = 1
    } else {
      console.log(`[worker-imports] PASS: ${result.modules} modules; ${result.deferredOptionalImports.length} reviewed deferred optional imports (feature execution not verified)`)
    }
  } catch (error) {
    console.error(`[worker-imports] FAILED: ${error.message}`)
    process.exitCode = 1
  }
}
