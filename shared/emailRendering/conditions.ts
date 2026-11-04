import { z } from 'zod'
import { snapshotRenderInput } from './bounds'

export const CONDITION_LIMITS = {
  depth: 4,
  terms: 24,
  operand: 200,
  bytes: 8192,
  markers: 600,
  htmlBytes: 16 * 1024 * 1024
} as const
export const CONDITION_FIELDS = ['email', 'name', 'first_name'] as const
export type ConditionField = (typeof CONDITION_FIELDS)[number]
export type ConditionPredicate
  = | { field: ConditionField, op: 'exists' }
    | {
      field: ConditionField
      op: 'equals' | 'not-equals' | 'contains'
      value: string
    }
    | { op: 'all' | 'any', terms: ConditionPredicate[] }
export interface ContentCondition {
  version: 1
  name: string
  predicate: ConditionPredicate
}
export class EmailConditionError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_CONDITION'
      | 'PROTECTED_CONDITION_TARGET'
      | 'INVALID_CONDITION_MARKER'
  ) {
    super(code)
  }
}
const fail = (): never => {
  throw new EmailConditionError('INVALID_CONDITION')
}
const plain = z
  .string()
  .min(1)
  .max(CONDITION_LIMITS.operand)
  .regex(/^[^{}<>\x00-\x1f\x7f]+$/) // eslint-disable-line no-control-regex
const leaf = z.discriminatedUnion('op', [
  z
    .object({ field: z.enum(CONDITION_FIELDS), op: z.literal('exists') })
    .strict(),
  ...(['equals', 'not-equals', 'contains'] as const).map(op =>
    z
      .object({
        field: z.enum(CONDITION_FIELDS),
        op: z.literal(op),
        value: plain
      })
      .strict()
  )
])
/** Iterative admission precedes recursion; callers never evaluate arbitrary keys/code. */
export function parseConditionPredicate(input: unknown): ConditionPredicate {
  try {
    const copy = snapshotRenderInput(input, CONDITION_LIMITS.bytes)
    const stack = [{ value: copy, depth: 1 }]
    let terms = 0
    while (stack.length) {
      const { value, depth } = stack.pop()!
      if (
        ++terms > CONDITION_LIMITS.terms
        || depth > CONDITION_LIMITS.depth
        || !value
        || typeof value !== 'object'
        || Array.isArray(value)
      )
        fail()
      const rule = value as Record<string, unknown>
      if (rule.op === 'all' || rule.op === 'any') {
        if (
          Object.keys(rule).sort().join(',') !== 'op,terms'
          || !Array.isArray(rule.terms)
          || !rule.terms.length
          || rule.terms.length > CONDITION_LIMITS.terms
        )
          fail()
        for (const term of rule.terms as unknown[])
          stack.push({ value: term, depth: depth + 1 })
      } else if (!leaf.safeParse(rule).success) fail()
    }
    return copy as ConditionPredicate
  } catch {
    return fail()
  }
}
export function parseContentCondition(input: unknown): ContentCondition {
  try {
    const copy = snapshotRenderInput(input, CONDITION_LIMITS.bytes)
    const outer = z
      .object({
        version: z.literal(1),
        name: z.string().trim().min(1).max(100),
        predicate: z.unknown()
      })
      .strict()
      .parse(copy)
    return { ...outer, predicate: parseConditionPredicate(outer.predicate) }
  } catch {
    return fail()
  }
}
export const ConditionPredicateSchema = z
  .unknown()
  .transform((input, ctx): ConditionPredicate => {
    try {
      return parseConditionPredicate(input)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid condition' })
      return z.NEVER
    }
  })
export const ConditionDefinitionInputSchema = z
  .object({
    client_id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    predicate: ConditionPredicateSchema
  })
  .strict()
export const ConditionDefinitionPatchSchema
  = ConditionDefinitionInputSchema.omit({ client_id: true })
    .partial()
    .strict()
    .refine(value => Object.keys(value).length > 0)
export type ConditionDefinitionInput = z.infer<
  typeof ConditionDefinitionInputSchema
>
export type ConditionDefinition = ConditionDefinitionInput & { id: string }
/** Missing/empty values never satisfy comparisons, including not-equals. Exact,
 * case-sensitive literal comparison; no trim, coercion, regex or field traversal. */
export function evaluateCondition(
  input: unknown,
  recipient: Partial<Record<ConditionField, string>>
): boolean {
  const predicate = parseConditionPredicate(input)
  function test(rule: ConditionPredicate): boolean {
    if ('terms' in rule)
      return rule.op === 'all' ? rule.terms.every(test) : rule.terms.some(test)
    const value = Object.getOwnPropertyDescriptor(recipient, rule.field)?.value
    if (typeof value !== 'string' || !value.length || value.length > 8192)
      return false
    if (rule.op === 'exists') return true
    return rule.op === 'equals'
      ? value === rule.value
      : rule.op === 'not-equals'
        ? value !== rule.value
        : value.includes(rule.value)
  }
  return test(predicate)
}
export const CONDITION_MARKER_PREFIX = '<!--xf-condition'
const prefix = CONDITION_MARKER_PREFIX
/** Only compiler-created structured regions use this reserved namespace. Hex
 * UTF-8 JSON cannot form HTML, comments, merge tokens or executable directives. */
export function wrapConditionalHtml(
  html: string,
  input: unknown,
  id: string
): string {
  const condition = parseContentCondition(input)
  if (!/^c[0-9]{1,4}$/.test(id))
    throw new EmailConditionError('INVALID_CONDITION_MARKER')
  const payload = Array.from(
    new TextEncoder().encode(JSON.stringify(condition)),
    byte => byte.toString(16).padStart(2, '0')
  ).join('')
  return `${prefix}:v1:open:${id}:${payload}-->${html}${prefix}:v1:close:${id}-->`
}
/** Throw on every malformed/unknown reserved marker, even inside hidden content.
 * Validation runs before output; never return a partially personalized message.
 * Ordinary comments (including Outlook conditionals) are byte-for-byte slices. */
export function resolveConditionalHtml(
  html: string,
  recipient: Partial<Record<ConditionField, string>>
): string {
  const bad = (): never => {
    throw new EmailConditionError('INVALID_CONDITION_MARKER')
  }
  if (
    html.length > CONDITION_LIMITS.htmlBytes
    || new TextEncoder().encode(html).length > CONDITION_LIMITS.htmlBytes
  )
    bad()
  const stack: Array<{ id: string, visible: boolean }> = []
  const opened = new Set<string>()
  const output: string[] = []
  let cursor = 0
  let markers = 0
  while (true) {
    const start = html.indexOf(prefix, cursor)
    if (start < 0) break
    if (++markers > CONDITION_LIMITS.markers) bad()
    if (stack.every(frame => frame.visible))
      output.push(html.slice(cursor, start))
    const end = html.indexOf('-->', start)
    if (end < 0 || end - start > CONDITION_LIMITS.bytes * 2 + 100) bad()
    const marker = html.slice(start, end + 3)
    const open = /^<!--xf-condition:v1:open:(c[0-9]{1,4}):([a-f0-9]+)-->$/.exec(
      marker
    )
    const close = /^<!--xf-condition:v1:close:(c[0-9]{1,4})-->$/.exec(marker)
    if (open) {
      if (stack.length >= 32 || open[2]!.length % 2 || opened.has(open[1]!))
        bad()
      opened.add(open[1]!)
      let condition: ContentCondition
      try {
        const bytes = Uint8Array.from(open[2]!.match(/../g)!, hex =>
          Number.parseInt(hex, 16)
        )
        condition = parseContentCondition(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
        )
      } catch {
        return bad()
      }
      stack.push({
        id: open[1]!,
        visible: evaluateCondition(condition.predicate, recipient)
      })
    } else if (close) {
      if (!stack.length || stack.pop()!.id !== close[1]) bad()
    } else bad()
    cursor = end + 3
  }
  if (stack.length) bad()
  output.push(html.slice(cursor))
  return output.join('')
}
