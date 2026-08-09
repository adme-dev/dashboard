import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import ts from 'typescript'

export interface CrmSearchCallerViolation {
  filePath: string
  reason: string
}

interface StringResolution {
  values: string[]
  unknown: boolean
  targetEvidence: boolean
}

interface StaticProperty {
  expression: ts.Expression
}

interface ObjectResolution {
  properties: Map<string, StaticProperty>
  unknown: boolean
}

const DYNAMIC = '\u0000'
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|vue|mjs|cjs|mts|cts)$/u
const SEARCH_ENDPOINTS = new Set(['/api/crm/search', '/api/client-portal/crm/search'])
const SEARCH_TARGET = /\/api\/(?:client-portal\/)?crm\/search/u
const TRANSPORT_CALLS = new Set(['$fetch', 'fetch', 'useFetch', 'apiFetch', 'aiInternalFetch'])
const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  '.nuxt',
  '.output',
  'coverage',
  'dist',
  'generated'
])

function scriptSource(source: string, filePath: string): string {
  if (extname(filePath) !== '.vue') return source
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map(match => match[1] ?? '')
    .join('\n')
}

function scriptKind(filePath: string): ts.ScriptKind {
  if (/\.(?:tsx|jsx)$/u.test(filePath)) return ts.ScriptKind.TSX
  if (/\.(?:js|mjs|cjs)$/u.test(filePath)) return ts.ScriptKind.JS
  return ts.ScriptKind.TS
}

function propertyName(property: ts.ObjectLiteralElementLike): string | null {
  if (!('name' in property) || !property.name) return null
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text
  return null
}

function unwrapExpression(expression: ts.Expression): ts.Expression {
  if (ts.isParenthesizedExpression(expression)
    || ts.isAsExpression(expression)
    || ts.isTypeAssertionExpression(expression)
    || ts.isSatisfiesExpression(expression)
    || ts.isNonNullExpression(expression)) {
    return unwrapExpression(expression.expression)
  }
  return expression
}

function variableInStatements(
  statements: ts.NodeArray<ts.Statement>,
  name: string,
  beforePosition: number
): ts.VariableDeclaration | null {
  let found: ts.VariableDeclaration | null = null
  for (const statement of statements) {
    if (statement.getStart() >= beforePosition) break
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.getStart() >= beforePosition) break
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) found = declaration
    }
  }
  return found
}

function findVariableDeclaration(
  name: string,
  location: ts.Node
): ts.VariableDeclaration | ts.ParameterDeclaration | null {
  for (let scope: ts.Node | undefined = location; scope; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope)) {
      const declaration = variableInStatements(scope.statements, name, location.getStart())
      if (declaration) return declaration
    }
    if (ts.isFunctionLike(scope)) {
      const parameter = scope.parameters.find(item => ts.isIdentifier(item.name) && item.name.text === name)
      if (parameter) return parameter
    }
  }
  return null
}

function expressionHasTargetEvidence(expression: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const fragments: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) fragments.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(expression)
  return fragments.some(fragment => SEARCH_TARGET.test(fragment))
    || SEARCH_TARGET.test(fragments.join(''))
    || SEARCH_TARGET.test(expression.getText(sourceFile))
}

function transportName(expression: ts.Expression): string | null {
  const target = unwrapExpression(expression)
  if (ts.isIdentifier(target)) return TRANSPORT_CALLS.has(target.text) ? target.text : null
  if (ts.isPropertyAccessExpression(target)) {
    return TRANSPORT_CALLS.has(target.name.text) ? target.name.text : null
  }
  return null
}

function sourceViolations(source: string, filePath: string): CrmSearchCallerViolation[] {
  const parsed = ts.createSourceFile(
    filePath,
    scriptSource(source, filePath),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )

  const resolveStrings = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): StringResolution => {
    const expression = unwrapExpression(input)
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return {
        values: [expression.text],
        unknown: false,
        targetEvidence: SEARCH_TARGET.test(expression.text)
      }
    }
    if (ts.isIdentifier(expression)) {
      const declaration = findVariableDeclaration(expression.text, location)
      if (!declaration?.initializer || seen.has(declaration.pos)) {
        return {
          values: [],
          unknown: true,
          targetEvidence: expressionHasTargetEvidence(expression, parsed)
        }
      }
      return resolveStrings(declaration.initializer, declaration.initializer, new Set([...seen, declaration.pos]))
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const object = resolveObject(expression.expression, location, new Set(seen))
      const key = ts.isPropertyAccessExpression(expression)
        ? expression.name.text
        : expression.argumentExpression && (ts.isStringLiteral(expression.argumentExpression)
          || ts.isNoSubstitutionTemplateLiteral(expression.argumentExpression))
          ? expression.argumentExpression.text
          : null
      const property = key ? object.properties.get(key) : null
      if (property) {
        const resolved = resolveStrings(property.expression, property.expression, new Set(seen))
        return { ...resolved, unknown: resolved.unknown || object.unknown }
      }
      return {
        values: [],
        unknown: true,
        targetEvidence: expressionHasTargetEvidence(expression, parsed)
      }
    }
    if (ts.isConditionalExpression(expression)) {
      const whenTrue = resolveStrings(expression.whenTrue, expression.whenTrue, new Set(seen))
      const whenFalse = resolveStrings(expression.whenFalse, expression.whenFalse, new Set(seen))
      return {
        values: [...whenTrue.values, ...whenFalse.values],
        unknown: whenTrue.unknown || whenFalse.unknown,
        targetEvidence: whenTrue.targetEvidence || whenFalse.targetEvidence
      }
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveStrings(expression.left, expression.left, new Set(seen))
      const right = resolveStrings(expression.right, expression.right, new Set(seen))
      const leftValues = left.values.length > 0 ? left.values : [DYNAMIC]
      const rightValues = right.values.length > 0 ? right.values : [DYNAMIC]
      const values = leftValues.flatMap(leftValue => rightValues.map(rightValue => `${leftValue}${rightValue}`))
      return {
        values,
        unknown: left.unknown || right.unknown,
        targetEvidence: values.some(value => SEARCH_TARGET.test(value))
          || left.targetEvidence
          || right.targetEvidence
      }
    }
    if (ts.isTemplateExpression(expression)) {
      let values = [expression.head.text]
      let unknown = false
      let targetEvidence = SEARCH_TARGET.test(expression.head.text)
      for (const span of expression.templateSpans) {
        const replacement = resolveStrings(span.expression, span.expression, new Set(seen))
        const replacements = replacement.values.length > 0 ? replacement.values : [DYNAMIC]
        values = values.flatMap(value => replacements.map(item => `${value}${item}${span.literal.text}`))
        unknown ||= replacement.unknown
        targetEvidence ||= replacement.targetEvidence || SEARCH_TARGET.test(span.literal.text)
      }
      return {
        values,
        unknown,
        targetEvidence: targetEvidence || values.some(value => SEARCH_TARGET.test(value))
      }
    }
    return {
      values: [],
      unknown: true,
      targetEvidence: expressionHasTargetEvidence(expression, parsed)
    }
  }

  const resolveObject = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): ObjectResolution => {
    const expression = unwrapExpression(input)
    if (ts.isIdentifier(expression)) {
      const declaration = findVariableDeclaration(expression.text, location)
      if (!declaration?.initializer || seen.has(declaration.pos)) {
        return { properties: new Map(), unknown: true }
      }
      return resolveObject(declaration.initializer, declaration.initializer, new Set([...seen, declaration.pos]))
    }
    if (!ts.isObjectLiteralExpression(expression)) return { properties: new Map(), unknown: true }

    const properties = new Map<string, StaticProperty>()
    let unknown = false
    for (const property of expression.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = resolveObject(property.expression, property.expression, new Set(seen))
        for (const [key, value] of spread.properties) properties.set(key, value)
        unknown ||= spread.unknown
        continue
      }
      const key = propertyName(property)
      if (!key) {
        unknown = true
        continue
      }
      if (ts.isPropertyAssignment(property)) {
        properties.set(key, { expression: property.initializer })
      } else if (ts.isShorthandPropertyAssignment(property)) {
        properties.set(key, { expression: property.name })
      } else {
        unknown = true
      }
    }
    return { properties, unknown }
  }

  const definedStatus = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): 'defined' | 'undefined' | 'unknown' => {
    const expression = unwrapExpression(input)
    if (ts.isIdentifier(expression)) {
      if (expression.text === 'undefined') return 'undefined'
      const declaration = findVariableDeclaration(expression.text, location)
      if (!declaration?.initializer || seen.has(declaration.pos)) return 'unknown'
      return definedStatus(declaration.initializer, declaration.initializer, new Set([...seen, declaration.pos]))
    }
    if (ts.isVoidExpression(expression)) return 'undefined'
    if (ts.isConditionalExpression(expression)) {
      const branches = [
        definedStatus(expression.whenTrue, expression.whenTrue, new Set(seen)),
        definedStatus(expression.whenFalse, expression.whenFalse, new Set(seen))
      ]
      return branches.every(branch => branch === 'defined')
        ? 'defined'
        : branches.every(branch => branch === 'undefined')
          ? 'undefined'
          : 'unknown'
    }
    if (ts.isCallExpression(expression) || ts.isPropertyAccessExpression(expression)) return 'unknown'
    return 'defined'
  }

  const violations: CrmSearchCallerViolation[] = []
  const add = (reason: string) => violations.push({ filePath, reason })
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments[0] && transportName(node.expression)) {
      const endpoint = resolveStrings(node.arguments[0], node.arguments[0])
      const targetValues = endpoint.values.filter(value => SEARCH_TARGET.test(value))
      const hasTarget = targetValues.length > 0 || endpoint.targetEvidence
      if (hasTarget) {
        if (endpoint.unknown && endpoint.targetEvidence) {
          add('CRM search transport endpoint containing the target could not be resolved safely')
        }
        if (targetValues.some(value => !SEARCH_ENDPOINTS.has(value))) {
          add('CRM search callers must use one exact endpoint without proxy, query, or suffix transport')
        }

        const hasExactEndpoint = targetValues.some(value => SEARCH_ENDPOINTS.has(value))
        if (hasExactEndpoint) {
          const options = node.arguments[1]
            ? resolveObject(node.arguments[1], node.arguments[1])
            : { properties: new Map<string, StaticProperty>(), unknown: false }
          if (options.unknown) add('CRM search transport options could not be resolved safely')

          const method = options.properties.get('method')
          const methodResolution = method
            ? resolveStrings(method.expression, method.expression)
            : { values: [], unknown: false, targetEvidence: false }
          if (!method || methodResolution.unknown
            || methodResolution.values.length === 0
            || methodResolution.values.some(value => value.toUpperCase() !== 'POST')) {
            add('CRM search callers must use explicit POST')
          }

          const body = options.properties.get('body')
          if (!body || definedStatus(body.expression, body.expression) !== 'defined') {
            add('CRM search callers must send a definitely defined body')
          }

          for (const forbidden of ['query', 'params', 'searchParams']) {
            if (options.properties.has(forbidden)) {
              add(`CRM search callers must not use options.${forbidden}`)
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  return violations
}

export function inspectCrmSearchCallerSource(
  source: string,
  filePath = 'fixture.ts'
): CrmSearchCallerViolation[] {
  return sourceViolations(source, filePath)
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(root, entry.name)
    if (entry.isDirectory()) {
      return EXCLUDED_DIRECTORIES.has(entry.name) ? [] : sourceFiles(filePath)
    }
    return SOURCE_EXTENSION.test(entry.name) ? [filePath] : []
  })
}

export function collectCrmSearchCallerViolations(
  roots: readonly string[]
): CrmSearchCallerViolation[] {
  return roots
    .flatMap(sourceFiles)
    .flatMap(filePath => inspectCrmSearchCallerSource(readFileSync(filePath, 'utf8'), relative(process.cwd(), filePath)))
    .sort((left, right) => left.filePath.localeCompare(right.filePath) || left.reason.localeCompare(right.reason))
}
