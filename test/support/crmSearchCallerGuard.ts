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
  evidence: Set<ts.Node>
}

interface StaticProperty {
  expression: ts.Expression
}

interface ObjectResolution {
  properties: Map<string, StaticProperty>
  unknown: boolean
}

type ScopedDeclaration = ts.VariableDeclaration | ts.ParameterDeclaration | ts.BindingElement
type BindingOwner = ts.VariableDeclaration | ts.ParameterDeclaration

const DYNAMIC = '\u0000'
const SOURCE_EXTENSION = /\.(?:ts|tsx|js|jsx|vue|mjs|cjs|mts|cts)$/u
const SEARCH_ENDPOINTS = new Set(['/api/crm/search', '/api/client-portal/crm/search'])
const SEARCH_TARGET = /\/api\/(?:client-portal\/)?crm\/search/u
const SEARCH_ROUTE_INVENTORY_VALUE = /^route:server\/api\/(?:client-portal\/)?crm\/search\.post\.ts$/u
const TRANSPORT_CALLS = new Set(['$fetch', 'fetch', 'useFetch', 'apiFetch', 'aiInternalFetch'])
const APPROVED_FETCH_RECEIVERS = new Set(['globalThis', 'window', 'self'])
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

function findBindingElement(bindingName: ts.BindingName, name: string): ts.BindingElement | null {
  if (ts.isIdentifier(bindingName)) return null
  for (const element of bindingName.elements) {
    if (ts.isOmittedExpression(element)) continue
    if (ts.isIdentifier(element.name) && element.name.text === name) return element
    const nested = findBindingElement(element.name, name)
    if (nested) return nested
  }
  return null
}

function variableInStatements(
  statements: ts.NodeArray<ts.Statement>,
  name: string,
  beforePosition: number
): ScopedDeclaration | null {
  let found: ScopedDeclaration | null = null
  for (const statement of statements) {
    if (statement.getStart() >= beforePosition) break
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.getStart() >= beforePosition) break
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) found = declaration
      else {
        const binding = findBindingElement(declaration.name, name)
        if (binding) found = binding
      }
    }
  }
  return found
}

function findScopedDeclaration(
  name: string,
  location: ts.Node
): ScopedDeclaration | null {
  for (let scope: ts.Node | undefined = location; scope; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope) || ts.isModuleBlock(scope)) {
      const declaration = variableInStatements(scope.statements, name, location.getStart())
      if (declaration) return declaration
    }
    if (ts.isFunctionLike(scope)) {
      for (const parameter of scope.parameters) {
        if (ts.isIdentifier(parameter.name) && parameter.name.text === name) return parameter
        const binding = findBindingElement(parameter.name, name)
        if (binding) return binding
      }
    }
  }
  return null
}

function hasSearchTargetEvidence(value: string): boolean {
  return SEARCH_TARGET.test(value) && !SEARCH_ROUTE_INVENTORY_VALUE.test(value)
}

function expressionHasTargetEvidence(expression: ts.Expression, sourceFile: ts.SourceFile): boolean {
  const fragments: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) fragments.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(expression)
  return fragments.some(fragment => hasSearchTargetEvidence(fragment))
    || hasSearchTargetEvidence(fragments.join(''))
    || hasSearchTargetEvidence(expression.getText(sourceFile))
}

function accessKey(expression: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | null {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  const argument = expression.argumentExpression
  return argument && (ts.isStringLiteral(argument)
    || ts.isNoSubstitutionTemplateLiteral(argument)
    || ts.isNumericLiteral(argument))
    ? argument.text
    : null
}

function bindingElementKey(binding: ts.BindingElement): string | null {
  const pattern = binding.parent
  if (ts.isArrayBindingPattern(pattern)) {
    const index = pattern.elements.indexOf(binding)
    return index >= 0 ? String(index) : null
  }
  const keyNode = binding.propertyName ?? binding.name
  return ts.isIdentifier(keyNode)
    || ts.isStringLiteral(keyNode)
    || ts.isNumericLiteral(keyNode)
    ? keyNode.text
    : null
}

function bindingOwnerAndPath(binding: ts.BindingElement): {
  owner: BindingOwner
  path: string[]
} | null {
  const path: string[] = []
  let current = binding
  while (true) {
    const key = bindingElementKey(current)
    if (key === null) return null
    path.unshift(key)

    const pattern = current.parent
    const parent = pattern.parent
    if (ts.isVariableDeclaration(parent) || ts.isParameter(parent)) {
      return { owner: parent, path }
    }
    if (!ts.isBindingElement(parent)) return null
    current = parent
  }
}

function sourceViolations(source: string, filePath: string): CrmSearchCallerViolation[] {
  const sourceScript = scriptSource(source, filePath)
  const mayContainTarget = (sourceScript.includes('api') && sourceScript.includes('crm'))
    || sourceScript.includes('\\')
  if (!mayContainTarget) return []

  const parsed = ts.createSourceFile(
    filePath,
    sourceScript,
    ts.ScriptTarget.Latest,
    true,
    scriptKind(filePath)
  )

  const targetEvidence = new Set<ts.Node>()
  const consumedTargetEvidence = new Set<ts.Node>()
  const reportedTargetEvidence = new Set<ts.Node>()
  const exemptTargetEvidence = new Set<ts.Node>()
  const evidenceFor = (node: ts.Node): Set<ts.Node> => {
    targetEvidence.add(node)
    return new Set([node])
  }
  const mergeEvidence = (...groups: Iterable<ts.Node>[]): Set<ts.Node> => new Set(
    groups.flatMap(group => [...group])
  )
  const withEvidence = (resolution: StringResolution, node: ts.Node): StringResolution => ({
    ...resolution,
    evidence: mergeEvidence(resolution.evidence, evidenceFor(node))
  })
  const markEvidence = (destination: Set<ts.Node>, evidence: Iterable<ts.Node>) => {
    for (const node of evidence) destination.add(node)
  }

  const resolveDeclaredValue = (
    declaration: ScopedDeclaration,
    seen: Set<number>
  ): { expression?: ts.Expression, unknown: boolean } => {
    if (!ts.isBindingElement(declaration)) {
      return { expression: declaration.initializer, unknown: !declaration.initializer }
    }
    const source = bindingOwnerAndPath(declaration)
    if (!source?.owner.initializer) return { unknown: true }

    let expression: ts.Expression = source.owner.initializer
    let unknown = false
    for (const key of source.path) {
      const sourceObject = resolveObject(expression, expression, new Set(seen))
      const property = sourceObject.properties.get(key)
      unknown ||= sourceObject.unknown || !property
      if (!property) return { unknown: true }
      expression = property.expression
    }
    return { expression, unknown }
  }

  const resolveStrings = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): StringResolution => {
    const expression = unwrapExpression(input)
    if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) {
      const hasTargetEvidence = hasSearchTargetEvidence(expression.text)
      return {
        values: [expression.text],
        unknown: false,
        targetEvidence: hasTargetEvidence,
        evidence: hasTargetEvidence ? evidenceFor(expression) : new Set()
      }
    }
    if (ts.isSpreadElement(expression)) {
      const resolved = resolveStrings(expression.expression, expression.expression, new Set(seen))
      return resolved.targetEvidence ? withEvidence(resolved, expression) : resolved
    }
    if (ts.isIdentifier(expression)) {
      const declaration = findScopedDeclaration(expression.text, location)
      if (!declaration || seen.has(declaration.pos)) {
        const hasTargetEvidence = expressionHasTargetEvidence(expression, parsed)
        return {
          values: [],
          unknown: true,
          targetEvidence: hasTargetEvidence,
          evidence: hasTargetEvidence ? evidenceFor(expression) : new Set()
        }
      }
      const declared = resolveDeclaredValue(declaration, new Set([...seen, declaration.pos]))
      if (!declared.expression) {
        return { values: [], unknown: true, targetEvidence: false, evidence: new Set() }
      }
      const resolved = resolveStrings(declared.expression, declared.expression, new Set([...seen, declaration.pos]))
      const result = { ...resolved, unknown: resolved.unknown || declared.unknown }
      return result.targetEvidence ? withEvidence(result, declaration) : result
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const object = resolveObject(expression.expression, location, new Set(seen))
      const key = accessKey(expression)
      const property = key ? object.properties.get(key) : null
      if (property) {
        const resolved = resolveStrings(property.expression, property.expression, new Set(seen))
        return { ...resolved, unknown: resolved.unknown || object.unknown }
      }
      const hasTargetEvidence = expressionHasTargetEvidence(expression, parsed)
      return {
        values: [],
        unknown: true,
        targetEvidence: hasTargetEvidence,
        evidence: hasTargetEvidence ? evidenceFor(expression) : new Set()
      }
    }
    if (ts.isConditionalExpression(expression)) {
      const whenTrue = resolveStrings(expression.whenTrue, expression.whenTrue, new Set(seen))
      const whenFalse = resolveStrings(expression.whenFalse, expression.whenFalse, new Set(seen))
      const result: StringResolution = {
        values: [...whenTrue.values, ...whenFalse.values],
        unknown: whenTrue.unknown || whenFalse.unknown,
        targetEvidence: whenTrue.targetEvidence || whenFalse.targetEvidence,
        evidence: mergeEvidence(whenTrue.evidence, whenFalse.evidence)
      }
      return result.targetEvidence ? withEvidence(result, expression) : result
    }
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const left = resolveStrings(expression.left, expression.left, new Set(seen))
      const right = resolveStrings(expression.right, expression.right, new Set(seen))
      const leftValues = left.values.length > 0 ? left.values : [DYNAMIC]
      const rightValues = right.values.length > 0 ? right.values : [DYNAMIC]
      const values = leftValues.flatMap(leftValue => rightValues.map(rightValue => `${leftValue}${rightValue}`))
      const result: StringResolution = {
        values,
        unknown: left.unknown || right.unknown,
        targetEvidence: values.some(value => hasSearchTargetEvidence(value))
          || left.targetEvidence
          || right.targetEvidence,
        evidence: mergeEvidence(left.evidence, right.evidence)
      }
      return result.targetEvidence ? withEvidence(result, expression) : result
    }
    if (ts.isTemplateExpression(expression)) {
      let values = [expression.head.text]
      let unknown = false
      let targetEvidence = hasSearchTargetEvidence(expression.head.text)
      let evidence = new Set<ts.Node>()
      for (const span of expression.templateSpans) {
        const replacement = resolveStrings(span.expression, span.expression, new Set(seen))
        const replacements = replacement.values.length > 0 ? replacement.values : [DYNAMIC]
        values = values.flatMap(value => replacements.map(item => `${value}${item}${span.literal.text}`))
        unknown ||= replacement.unknown
        targetEvidence ||= replacement.targetEvidence || hasSearchTargetEvidence(span.literal.text)
        evidence = mergeEvidence(evidence, replacement.evidence)
      }
      const result: StringResolution = {
        values,
        unknown,
        targetEvidence: targetEvidence || values.some(value => hasSearchTargetEvidence(value)),
        evidence
      }
      return result.targetEvidence ? withEvidence(result, expression) : result
    }
    const nestedExpressions: ts.Expression[] = []
    if (ts.isCallExpression(expression) || ts.isNewExpression(expression)) {
      nestedExpressions.push(...(expression.arguments ?? []))
    } else if (ts.isArrayLiteralExpression(expression)) {
      nestedExpressions.push(...expression.elements.filter(ts.isExpression))
    } else if (ts.isObjectLiteralExpression(expression)) {
      for (const property of expression.properties) {
        if (ts.isPropertyAssignment(property)) {
          nestedExpressions.push(property.initializer)
        } else if (ts.isSpreadAssignment(property)) {
          nestedExpressions.push(property.expression)
        } else if (ts.isShorthandPropertyAssignment(property)) {
          nestedExpressions.push(property.name)
        }
      }
    }
    const nestedResolutions = nestedExpressions.map(nested => resolveStrings(nested, nested, new Set(seen)))
    const nestedTargetEvidence = nestedResolutions.some(resolution => resolution.targetEvidence)
    const hasTargetEvidence = nestedTargetEvidence || expressionHasTargetEvidence(expression, parsed)
    const result: StringResolution = {
      values: [],
      unknown: true,
      targetEvidence: hasTargetEvidence,
      evidence: mergeEvidence(...nestedResolutions.map(resolution => resolution.evidence))
    }
    return result.targetEvidence ? withEvidence(result, expression) : result
  }

  const resolveObject = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): ObjectResolution => {
    const expression = unwrapExpression(input)
    if (ts.isIdentifier(expression)) {
      const declaration = findScopedDeclaration(expression.text, location)
      if (!declaration || seen.has(declaration.pos)) {
        return { properties: new Map(), unknown: true }
      }
      const declared = resolveDeclaredValue(declaration, new Set([...seen, declaration.pos]))
      if (!declared.expression) return { properties: new Map(), unknown: true }
      const resolved = resolveObject(declared.expression, declared.expression, new Set([...seen, declaration.pos]))
      return { ...resolved, unknown: resolved.unknown || declared.unknown }
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const sourceObject = resolveObject(expression.expression, location, new Set(seen))
      const key = accessKey(expression)
      const property = key ? sourceObject.properties.get(key) : null
      if (!property) return { properties: new Map(), unknown: true }
      const resolved = resolveObject(property.expression, property.expression, new Set(seen))
      return { ...resolved, unknown: resolved.unknown || sourceObject.unknown }
    }
    if (ts.isArrayLiteralExpression(expression)) {
      const properties = new Map<string, StaticProperty>()
      let unknown = false
      expression.elements.forEach((element, index) => {
        if (ts.isOmittedExpression(element) || ts.isSpreadElement(element)) {
          unknown = true
          return
        }
        properties.set(String(index), { expression: element })
      })
      return { properties, unknown }
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
      const declaration = findScopedDeclaration(expression.text, location)
      if (!declaration || seen.has(declaration.pos)) return 'unknown'
      const declared = resolveDeclaredValue(declaration, new Set([...seen, declaration.pos]))
      if (!declared.expression || declared.unknown) return 'unknown'
      return definedStatus(declared.expression, declared.expression, new Set([...seen, declaration.pos]))
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

  const isTransportExpression = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): boolean => {
    const expression = unwrapExpression(input)
    if (ts.isIdentifier(expression)) {
      const declaration = findScopedDeclaration(expression.text, location)
      if (!declaration) return TRANSPORT_CALLS.has(expression.text)
      if (seen.has(declaration.pos)) return false
      const declared = resolveDeclaredValue(declaration, new Set([...seen, declaration.pos]))
      if (!declared.expression) return false
      return isTransportExpression(declared.expression, declared.expression, new Set([...seen, declaration.pos]))
    }
    if (ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression)) {
      const key = accessKey(expression)
      const sourceObject = resolveObject(expression.expression, location, new Set(seen))
      const property = key ? sourceObject.properties.get(key) : null
      if (property) return isTransportExpression(property.expression, property.expression, new Set(seen))
      return key === 'fetch'
        && ts.isIdentifier(expression.expression)
        && APPROVED_FETCH_RECEIVERS.has(expression.expression.text)
        && !findScopedDeclaration(expression.expression.text, location)
    }
    return false
  }

  const isKnownNonTransportCall = (
    input: ts.Expression,
    location: ts.Node = input,
    seen = new Set<number>()
  ): boolean => {
    const expression = unwrapExpression(input)
    if (ts.isIdentifier(expression)) {
      const declaration = findScopedDeclaration(expression.text, location)
      if (!declaration || seen.has(declaration.pos)) return false
      const declared = resolveDeclaredValue(declaration, new Set([...seen, declaration.pos]))
      if (!declared.expression) return false
      return isKnownNonTransportCall(declared.expression, declared.expression, new Set([...seen, declaration.pos]))
    }
    if (!ts.isPropertyAccessExpression(expression) && !ts.isElementAccessExpression(expression)) return false
    const receiver = unwrapExpression(expression.expression)
    if (ts.isIdentifier(receiver) && (receiver.text === 'console' || receiver.text === 'logger')) return true

    const sourceObject = resolveObject(expression.expression, location, new Set(seen))
    const key = accessKey(expression)
    const property = key ? sourceObject.properties.get(key) : null
    return property
      ? isKnownNonTransportCall(property.expression, property.expression, new Set(seen))
      : false
  }

  const collectNodeTargetEvidence = (node: ts.Node) => {
    const isComposedExpression = ts.isTemplateExpression(node)
      || (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken)
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
      && hasSearchTargetEvidence(node.text)) {
      evidenceFor(node)
    } else if (isComposedExpression && expressionHasTargetEvidence(node, parsed)) {
      resolveStrings(node, node)
    } else if (ts.isBinaryExpression(node)
      && node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const assigned = resolveStrings(node.right, node.right)
      if (assigned.targetEvidence) evidenceFor(node)
    }
  }

  const violations: CrmSearchCallerViolation[] = []
  const add = (reason: string) => violations.push({ filePath, reason })
  const visit = (node: ts.Node) => {
    collectNodeTargetEvidence(node)
    if (ts.isCallExpression(node)) {
      const isTransportCall = isTransportExpression(node.expression, node.expression)
      const argumentResolutions = node.arguments.map(argument => resolveStrings(argument, argument))
      const targetArgumentResolutions = argumentResolutions.filter(resolution => resolution.targetEvidence)
      const hasArgumentTargetEvidence = targetArgumentResolutions.length > 0
      if (hasArgumentTargetEvidence && !isTransportCall && !isKnownNonTransportCall(node.expression)) {
        add('CRM search target must be passed directly to an approved transport call')
        markEvidence(
          reportedTargetEvidence,
          mergeEvidence(...targetArgumentResolutions.map(resolution => resolution.evidence))
        )
      } else if (hasArgumentTargetEvidence && !isTransportCall) {
        markEvidence(
          exemptTargetEvidence,
          mergeEvidence(...targetArgumentResolutions.map(resolution => resolution.evidence))
        )
      }

      if (!node.arguments[0] || !isTransportCall) {
        ts.forEachChild(node, visit)
        return
      }

      const endpoint = resolveStrings(node.arguments[0], node.arguments[0])
      const targetValues = endpoint.values.filter(value => hasSearchTargetEvidence(value))
      const hasTarget = targetValues.length > 0 || endpoint.targetEvidence
      if (hasTarget) {
        let approvedDirectCall = !endpoint.unknown
          && endpoint.values.length > 0
          && endpoint.values.every(value => SEARCH_ENDPOINTS.has(value))
        if (endpoint.unknown && endpoint.targetEvidence) {
          add('CRM search transport endpoint containing the target could not be resolved safely')
        }
        if (endpoint.values.some(value => hasSearchTargetEvidence(value) && !SEARCH_ENDPOINTS.has(value))
          || (endpoint.values.length > 0 && !endpoint.values.every(value => SEARCH_ENDPOINTS.has(value)))) {
          add('CRM search callers must use one exact endpoint without proxy, query, or suffix transport')
        }

        const hasExactEndpoint = targetValues.some(value => SEARCH_ENDPOINTS.has(value))
        if (hasExactEndpoint) {
          const options = node.arguments[1]
            ? resolveObject(node.arguments[1], node.arguments[1])
            : { properties: new Map<string, StaticProperty>(), unknown: false }
          if (options.unknown) {
            approvedDirectCall = false
            add('CRM search transport options could not be resolved safely')
          }

          const method = options.properties.get('method')
          const methodResolution = method
            ? resolveStrings(method.expression, method.expression)
            : { values: [], unknown: false, targetEvidence: false, evidence: new Set<ts.Node>() }
          if (!method || methodResolution.unknown
            || methodResolution.values.length === 0
            || methodResolution.values.some(value => value.toUpperCase() !== 'POST')) {
            approvedDirectCall = false
            add('CRM search callers must use explicit POST')
          }

          const body = options.properties.get('body')
          if (!body || definedStatus(body.expression, body.expression) !== 'defined') {
            approvedDirectCall = false
            add('CRM search callers must send a definitely defined body')
          }

          for (const forbidden of ['query', 'params', 'searchParams']) {
            if (options.properties.has(forbidden)) {
              approvedDirectCall = false
              add(`CRM search callers must not use options.${forbidden}`)
            }
          }
        } else {
          approvedDirectCall = false
        }
        markEvidence(
          approvedDirectCall ? consumedTargetEvidence : reportedTargetEvidence,
          endpoint.evidence
        )
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(parsed)
  for (const _node of targetEvidence) {
    if (!consumedTargetEvidence.has(_node)
      && !reportedTargetEvidence.has(_node)
      && !exemptTargetEvidence.has(_node)) {
      add('CRM search target evidence was not consumed by an approved direct POST body call')
    }
  }
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
