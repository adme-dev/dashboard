import { z } from 'zod'
import { RenderBoundaryError, snapshotRenderInput } from './bounds'

// New authoring boundary only. Legacy documents continue through their existing
// paths until revision migration explicitly snapshots and validates them.
export const DESIGN_LIMITS = {
  moduleBytes: 512 * 1024,
  documentBytes: 2 * 1024 * 1024,
  blocks: 300,
  depth: 32,
  assets: 100
} as const
const Id = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
  .refine(
    value => !['__proto__', 'prototype', 'constructor'].includes(value)
  )
const Digest = z.string().regex(/^[a-f0-9]{64}$/)
const FieldPath = z.string().min(1).max(512)
const RevisionPin = z.object({ moduleId: Id, revisionId: Id }).strict()
const Block = z
  .object({
    type: z.string().min(1).max(80),
    data: z
      .object({
        childrenIds: z.array(Id).max(300).optional(),
        props: z.record(z.string(), z.unknown()).nullable().optional()
      })
      .passthrough()
  })
  .strict()
const Policy = z
  .object({
    version: z.literal(1),
    editableFields: z.array(FieldPath).max(3000)
  })
  .strict()
const DesignSchema = z
  .object({
    schemaVersion: z.literal(1),
    kind: z.enum(['module', 'template', 'campaign-draft']),
    // This is a declaration, never authority. Services must resolve and compare
    // scope using the authenticated actor before reading or writing any resource.
    scope: z.object({ clientId: z.string().uuid().nullable() }).strict(),
    source: z
      .object({
        editor: z.enum(['composer', 'figflow', 'legacy']),
        nativeArtifact: z
          .object({ id: Id, sha256: Digest })
          .strict()
          .nullable()
      })
      .strict(),
    blocks: z.record(Id, Block),
    rootChildrenIds: z.array(Id).min(1).max(300),
    lineage: z
      .array(
        z
          .object({ blockId: Id, nodeId: Id, fields: z.record(Id, Id) })
          .strict()
      )
      .max(300),
    dependencies: z.array(RevisionPin).max(300),
    moduleInstances: z
      .array(
        z
          .object({
            instanceId: Id,
            moduleId: Id,
            revisionId: Id,
            rootBlockIds: z.array(Id).min(1).max(300),
            overrides: z.record(FieldPath, z.unknown())
          })
          .strict()
      )
      .max(300),
    assets: z
      .array(
        z
          .object({
            id: Id,
            sha256: Digest,
            mimeType: z.enum(['image/png', 'image/jpeg', 'image/gif']),
            bytes: z
              .number()
              .int()
              .positive()
              .max(10 * 1024 * 1024),
            width: z.number().int().positive().max(10000),
            height: z.number().int().positive().max(10000)
          })
          .strict()
      )
      .max(DESIGN_LIMITS.assets),
    policy: Policy
  })
  .strict()
export type EmailDesignDocument = z.infer<typeof DesignSchema>
export type EmailDesignBlock = EmailDesignDocument['blocks'][string]
export type EmailDesignPolicy = EmailDesignDocument['policy']

export class EmailDesignError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_DESIGN'
      | 'LIMIT_EXCEEDED'
      | 'POLICY_CHANGE_FORBIDDEN'
      | 'EDIT_FORBIDDEN',
    public readonly field?: string
  ) {
    super(code)
  }
}
function invalid(field: string): never {
  throw new EmailDesignError('INVALID_DESIGN', field)
}

/** Only the two existing composer child-reference shapes are traversed. */
export function designChildIds(block: EmailDesignBlock): string[] {
  const children = block.data.childrenIds ?? []
  const isContainer
    = block.type === 'EmailLayout' || block.type === 'Container'
  if (!isContainer && children.length) invalid('childrenIds')
  const columns = block.data.props?.columns
  if (block.type !== 'ColumnsContainer') {
    // Other block props may legitimately have a numeric column count, but
    // structural references on a non-container must never hide source nodes.
    if (
      Array.isArray(columns)
      && columns.some(
        column =>
          column
          && typeof column === 'object'
          && Object.hasOwn(column, 'childrenIds')
      )
    )
      invalid('columns')
    return [...children]
  }
  const count = block.data.props?.columnsCount ?? 2
  if (
    !Number.isInteger(count)
    || (count as number) < 1
    || (count as number) > 3
  )
    invalid('columnsCount')
  // New designs require exact parity. Legacy three-slot/two-visible palettes
  // need an explicit adapter; never silently discard a possibly hidden child.
  if (!Array.isArray(columns) || columns.length !== count) invalid('columns')
  const ids: string[] = []
  for (const column of columns) {
    if (!column || typeof column !== 'object' || Array.isArray(column))
      invalid('columns')
    if (column.childrenIds !== undefined)
      ids.push(...z.array(Id).max(300).parse(column.childrenIds))
  }
  return ids
}
function unique(values: string[], field: string) {
  if (new Set(values).size !== values.length) invalid(field)
}
function hasPath(blocks: EmailDesignDocument['blocks'], path: string): boolean {
  const parts = path.split('.')
  if (parts.length < 3 || parts[1] !== 'data' || parts.includes('childrenIds'))
    return false
  let value: unknown = blocks
  for (const part of parts) {
    if (
      ['__proto__', 'prototype', 'constructor'].includes(part)
      || !value
      || typeof value !== 'object'
      || !Object.hasOwn(value, part)
    )
      return false
    value = (value as Record<string, unknown>)[part]
  }
  return (
    value !== null && ['string', 'number', 'boolean'].includes(typeof value)
  )
}

function parseEmailDesign(input: unknown): EmailDesignDocument {
  // Reject cycles, excessive nesting, accessors, non-JSON values and UTF-8
  // overflow before Zod or stringify can recursively consume untrusted input.
  const snapshot = snapshotRenderInput(input, DESIGN_LIMITS.documentBytes)
  const design = DesignSchema.parse(snapshot)
  if (design.kind === 'campaign-draft' && design.scope.clientId === null)
    invalid('scope.clientId')
  if (design.kind === 'module')
    snapshotRenderInput(snapshot, DESIGN_LIMITS.moduleBytes)
  const ids = Object.keys(design.blocks)
  if (!ids.length || ids.length > DESIGN_LIMITS.blocks) invalid('blocks')
  if (
    design.kind !== 'module'
    && (design.rootChildrenIds.length !== 1
      || design.rootChildrenIds[0] !== 'root'
      || design.blocks.root?.type !== 'EmailLayout')
  )
    invalid('rootChildrenIds')
  // A strict tree prevents cycles, shared-node exponential expansion and
  // ambiguous ownership. Repeated module insertions must mint fresh block IDs.
  const visited = new Set<string>()
  const stack = design.rootChildrenIds.map(id => ({
    id,
    depth: design.kind === 'module' ? 2 : 1
  }))
  while (stack.length) {
    const { id, depth } = stack.pop()!
    if (
      depth > DESIGN_LIMITS.depth
      || visited.has(id)
      || !Object.hasOwn(design.blocks, id)
    )
      invalid(`blocks.${id}`)
    visited.add(id)
    if (
      design.blocks[id].type === 'EmailLayout'
      && (design.kind === 'module' || id !== 'root')
    )
      invalid(`blocks.${id}.type`)
    for (const child of designChildIds(design.blocks[id]))
      stack.push({ id: child, depth: depth + 1 })
  }
  if (visited.size !== ids.length) invalid('blocks.orphans')
  unique(
    design.lineage.map(item => item.blockId),
    'lineage.blockId'
  )
  unique(
    design.lineage.map(item => item.nodeId),
    'lineage.nodeId'
  )
  unique(
    design.lineage.flatMap(item => Object.values(item.fields)),
    'lineage.fields'
  )
  for (const item of design.lineage)
    if (!visited.has(item.blockId)) invalid('lineage.blockId')
  unique(design.policy.editableFields, 'policy.editableFields')
  for (const path of design.policy.editableFields)
    if (!hasPath(design.blocks, path)) invalid('policy.editableFields')
  unique(
    design.dependencies.map(pin => `${pin.moduleId}:${pin.revisionId}`),
    'dependencies'
  )
  unique(
    design.moduleInstances.map(instance => instance.instanceId),
    'moduleInstances'
  )
  const pins = new Set(
    design.dependencies.map(pin => `${pin.moduleId}:${pin.revisionId}`)
  )
  const instanceOwners = new Set<string>()
  for (const instance of design.moduleInstances) {
    if (!pins.has(`${instance.moduleId}:${instance.revisionId}`))
      invalid('moduleInstances.revisionId')
    unique(instance.rootBlockIds, 'moduleInstances.rootBlockIds')
    for (const id of instance.rootBlockIds)
      if (!visited.has(id) || design.blocks[id].type === 'EmailLayout')
        invalid('moduleInstances.rootBlockIds')
    const owned = new Set<string>()
    const pending = [...instance.rootBlockIds]
    while (pending.length) {
      const id = pending.pop()!
      if (instanceOwners.has(id)) invalid('moduleInstances.overlappingRoots')
      instanceOwners.add(id)
      owned.add(id)
      pending.push(...designChildIds(design.blocks[id]))
    }
    for (const path of Object.keys(instance.overrides)) {
      const currentValue = path
        .split('.')
        .reduce<unknown>(
          (value, part) =>
            value && typeof value === 'object'
              ? (value as Record<string, unknown>)[part]
              : undefined,
          design.blocks
        )
      if (
        typeof instance.overrides[path] !== typeof currentValue
        || instance.overrides[path] === null
      )
        invalid('moduleInstances.overrides.type')
      if (
        !owned.has(path.split('.')[0])
        || !hasPath(design.blocks, path)
        || !design.policy.editableFields.includes(path)
      )
        invalid('moduleInstances.overrides')
    }
  }
  unique(
    design.assets.map(asset => asset.id),
    'assets'
  )
  return design
}

/** Stable, content-free errors for callers; do not leak schema payloads. */
export function validateEmailDesign(input: unknown): EmailDesignDocument {
  try {
    return parseEmailDesign(input)
  } catch (error) {
    if (error instanceof EmailDesignError) throw error
    if (error instanceof RenderBoundaryError && error.code === 'LIMIT_EXCEEDED')
      throw new EmailDesignError('LIMIT_EXCEEDED')
    throw new EmailDesignError('INVALID_DESIGN')
  }
}

/** Use for staff mutations against a freshly read persisted policy. This guard
 * protects the policy only; allowed-field diffs and authority belong to F08. */
export function assertDesignPolicyUnchanged(
  current: EmailDesignDocument,
  next: unknown
): void {
  const candidate = validateEmailDesign(next)
  const before = [...current.policy.editableFields].sort()
  const after = [...candidate.policy.editableFields].sort()
  if (
    current.policy.version !== candidate.policy.version
    || JSON.stringify(before) !== JSON.stringify(after)
  ) {
    throw new EmailDesignError('POLICY_CHANGE_FORBIDDEN')
  }
}

/** Applies to newly authored structured designs, never retroactively to legacy
 * documents. Only fields already present are granted; layout stays opt-in. */
export function defaultDesignPolicy(
  blocks: EmailDesignDocument['blocks']
): EmailDesignPolicy {
  const contentFields: Record<string, string[]> = {
    Heading: ['text'],
    Text: ['text'],
    Button: ['text', 'url'],
    Image: ['url', 'alt', 'linkHref']
  }
  const editableFields: string[] = []
  for (const [id, block] of Object.entries(blocks)) {
    for (const field of contentFields[block.type] ?? []) {
      if (Object.hasOwn(block.data.props ?? {}, field))
        editableFields.push(`${id}.data.props.${field}`)
    }
  }
  return { version: 1, editableFields }
}

/** Validates a staff content-only mutation against a fresh persisted revision.
 * The caller still owns fresh actor authorisation and revision compare-and-swap.
 * Metadata, including instance provenance and scope, is never client-writable. */
export function assertStaffDesignEdit(
  current: EmailDesignDocument,
  next: unknown
): void {
  const candidate = validateEmailDesign(next)
  assertDesignPolicyUnchanged(current, candidate)
  const allowed = new Set(
    current.policy.editableFields.map(path => `blocks.${path}`)
  )
  function compare(before: unknown, after: unknown, path: string): void {
    if (before === after) return
    if (
      allowed.has(path)
      && before !== null
      && after !== null
      && typeof before === typeof after
      && ['string', 'number', 'boolean'].includes(typeof before)
    )
      return
    if (
      !before
      || !after
      || typeof before !== 'object'
      || typeof after !== 'object'
      || Array.isArray(before) !== Array.isArray(after)
    )
      throw new EmailDesignError('EDIT_FORBIDDEN', path)
    const beforeKeys = Object.keys(before).sort()
    const afterKeys = Object.keys(after).sort()
    if (JSON.stringify(beforeKeys) !== JSON.stringify(afterKeys))
      throw new EmailDesignError('EDIT_FORBIDDEN', path)
    for (const key of beforeKeys)
      compare(
        (before as Record<string, unknown>)[key],
        (after as Record<string, unknown>)[key],
        path ? `${path}.${key}` : key
      )
  }
  compare(current, candidate, '')
}
