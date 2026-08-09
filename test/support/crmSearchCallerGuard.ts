import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { basename, extname, join, relative } from 'node:path'
import ts from 'typescript'

export interface CrmSearchCallerViolation {
  filePath: string
  reason: string
}

const DYNAMIC = '\u0000'
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|vue|mjs|cjs|mts|cts)$/u
const SEARCH_ENDPOINT = /\/api\/(?:client-portal\/)?crm\/search/u

function scriptSource(source: string, filePath: string): string {
  if (extname(filePath) !== '.vue') return source
  return [...source.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/giu)]
    .map(match => match[1] ?? '')
    .join('\n')
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

function sourceViolations(source: string, filePath: string): CrmSearchCallerViolation[] {
  const parsed = ts.createSourceFile(
    filePath,
    scriptSource(source, filePath),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  )
  const initializers = new Map<string, ts.Expression>()
  const indexInitializers = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      initializers.set(node.name.text, node.initializer)
    }
    ts.forEachChild(node, indexInitializers)
  }
  indexInitializers(parsed)

  const resolveStrings = (input: ts.Expression, seen = new Set<string>()): string[] => {
    const expression = unwrapExpression(input)
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      return [expression.text]
    }
    if (ts.isIdentifier(expression)) {
      if (seen.has(expression.text)) return [DYNAMIC]
      const initializer = initializers.get(expression.text)
      if (!initializer) return [DYNAMIC]
      return resolveStrings(initializer, new Set([...seen, expression.text]))
    }
    if (ts.isConditionalExpression(expression)) {
      return [
        ...resolveStrings(expression.whenTrue, new Set(seen)),
        ...resolveStrings(expression.whenFalse, new Set(seen))
      ]
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return resolveStrings(expression.left, new Set(seen)).flatMap(left =>
        resolveStrings(expression.right, new Set(seen)).map(right => `${left}${right}`))
    }
    if (ts.isTemplateExpression(expression)) {
      let values = [expression.head.text]
      for (const span of expression.templateSpans) {
        const replacements = resolveStrings(span.expression, new Set(seen))
        values = values.flatMap(value => replacements.map(replacement =>
          `${value}${replacement}${span.literal.text}`))
      }
      return values
    }
    return [DYNAMIC]
  }

  const resolveObject = (input: ts.Expression | undefined): ts.ObjectLiteralExpression | null => {
    if (!input) return null
    const expression = unwrapExpression(input)
    if (ts.isObjectLiteralExpression(expression)) return expression
    if (ts.isIdentifier(expression)) {
      const initializer = initializers.get(expression.text)
      return initializer ? resolveObject(initializer) : null
    }
    return null
  }

  const violations: CrmSearchCallerViolation[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const routes = resolveStrings(node.arguments[0])
      const searchRoutes = routes.filter(route => SEARCH_ENDPOINT.test(route))
      if (searchRoutes.length > 0) {
        const options = resolveObject(node.arguments[1])
        const properties = options?.properties ?? []
        const method = properties.find(property => propertyName(property) === 'method')
        const body = properties.find(property => propertyName(property) === 'body')
        const query = properties.find(property => propertyName(property) === 'query')
        const methodValues = method && ts.isPropertyAssignment(method)
          ? resolveStrings(method.initializer).map(value => value.toUpperCase())
          : []

        if (searchRoutes.some((route) => {
          const endpoint = route.match(SEARCH_ENDPOINT)?.[0] ?? ''
          return route.slice(route.indexOf(endpoint) + endpoint.length).length > 0
        })) {
          violations.push({ filePath, reason: 'CRM search callers must use the exact endpoint without a URL suffix' })
        }
        if (methodValues.length === 0 || methodValues.some(value => value !== 'POST')) {
          violations.push({ filePath, reason: 'CRM search callers must use explicit POST' })
        }
        if (!body
          || (ts.isPropertyAssignment(body)
            && ts.isIdentifier(body.initializer)
            && body.initializer.text === 'undefined')
          || (!ts.isPropertyAssignment(body) && !ts.isShorthandPropertyAssignment(body))) {
          violations.push({ filePath, reason: 'CRM search callers must send an explicit body' })
        }
        if (query) {
          violations.push({ filePath, reason: 'CRM search callers must not use options.query' })
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

function excludedSourcePath(filePath: string): boolean {
  const segments = filePath.split(/[\\/]/u)
  const excludedDirectories = new Set(['node_modules', '.nuxt', 'test', 'tests', '__tests__', 'fixture', 'fixtures'])
  return segments.some(segment => excludedDirectories.has(segment))
    || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(basename(filePath))
}

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return []
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = join(root, entry.name)
    if (excludedSourcePath(filePath)) return []
    if (entry.isDirectory()) return sourceFiles(filePath)
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
