import { z } from 'zod'
import { designChildIds, EmailDesignError, validateEmailDesign, type EmailDesignDocument } from './designContract'
import { stableDesignJson } from './designModules'

const identity = { version: z.literal(1), draftId: z.string().uuid() }
const request = z.discriminatedUnion('command', [
  z
    .object({ ...identity, command: z.literal('list-revisions'), beforeRevisionId: z.string().uuid().optional() })
    .strict(),
  z
    .object({
      ...identity,
      command: z.literal('preview-revision'),
      expectedRevisionId: z.string().uuid(),
      revisionId: z.string().uuid()
    })
    .strict(),
  z
    .object({
      ...identity,
      command: z.literal('restore-revision'),
      expectedRevisionId: z.string().uuid(),
      revisionId: z.string().uuid(),
      operationId: z.string().uuid()
    })
    .strict()
])
export type DesignHistoryRequest = z.infer<typeof request>
export const parseDesignHistoryRequest = (input: unknown) => request.parse(input)
const get = (value: unknown, path: string): unknown =>
  path
    .split('.')
    .reduce<unknown>(
      (v, key) =>
        v && typeof v === 'object' && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined,
      value
    )
const same = (a: unknown, b: unknown) => stableDesignJson(a) === stableDesignJson(b)
function directPlacement(design: EmailDesignDocument, id: string) {
  return Object.entries(design.blocks)
    .flatMap<{ child: string, parent: string, column: number | null, index: number }>(([parent, block]) => {
      if (block.type === 'ColumnsContainer')
        return (block.data.props?.columns as { childrenIds?: string[] }[]).flatMap((col, column) =>
          (col.childrenIds ?? []).map((child, index) => ({ child, parent, column, index }))
        )
      return (block.data.childrenIds ?? []).map((child, index) => ({ child, parent, column: null, index }))
    })
    .find(p => p.child === id)
}
function placement(design: EmailDesignDocument, id: string): unknown {
  const direct = directPlacement(design, id)
  return direct ? { ...direct, ancestry: placement(design, direct.parent) } : null
}
/** Server-only derivation from two stored revisions. Historical grants, locks,
 * tenancy and source authority never replace today's policy or brand snapshot.
 * Reintroduced nodes get no content grants that the current policy lacks. */
export function deriveHistoryRestore(currentInput: unknown, snapshotInput: unknown): EmailDesignDocument {
  const current = validateEmailDesign(currentInput),
    snapshot = validateEmailDesign(snapshotInput)
  if (current.kind !== snapshot.kind || !same(current.scope, snapshot.scope))
    throw new EmailDesignError('POLICY_CHANGE_FORBIDDEN')
  if (current.source.nativeArtifact && !same(current.blocks, snapshot.blocks))
    throw new EmailDesignError('EDIT_FORBIDDEN', 'nativeArtifact')
  const deny = (field: string): never => {
    throw new EmailDesignError('EDIT_FORBIDDEN', field)
  }
  const descendants = (id: string): string[] => [id, ...designChildIds(current.blocks[id]!).flatMap(descendants)]
  const locks = current.policy.designerLocks
  for (const root of locks?.blockIds ?? [])
    for (const id of descendants(root)) {
      if (!same(current.blocks[id], snapshot.blocks[id]) || !same(placement(current, id), placement(snapshot, id)))
        deny('designerLocks')
    }
  for (const path of locks?.styleFields ?? []) {
    const id = path.split('.')[0]!
    // A field lock protects inheritance, ancestry and responsive equivalents.
    if (
      !same(get(current.blocks, path), get(snapshot.blocks, path))
      || !same(placement(current, id), placement(snapshot, id))
    )
      deny('designerLocks')
    const suffix = path.slice(id.length).replace('.data.', '.data.mobile.')
    if (!same(get(current.blocks, id + suffix), get(snapshot.blocks, id + suffix))) deny('designerLocks')
    const historicalDescendants = (root: string): string[] =>
      snapshot.blocks[root] ? [root, ...designChildIds(snapshot.blocks[root]!).flatMap(historicalDescendants)] : []
    const protectedOwners = new Set([
      ...descendants(id),
      ...historicalDescendants(id),
      ...Object.keys(current.blocks).filter(owner => descendants(owner).includes(id))
    ])
    for (const owner of protectedOwners) {
      if (
        !same(current.blocks[owner]?.data.style, snapshot.blocks[owner]?.data.style)
        || !same(current.blocks[owner]?.data.mobile, snapshot.blocks[owner]?.data.mobile)
      )
        deny('designerLocks')
      const props = ['fontFamily', 'primaryColor', 'textColor', 'canvasColor', 'backdropColor', 'contentWidth', 'buttonBackgroundColor', 'buttonTextColor', 'lineColor']
      for (const key of props)
        if (!same(current.blocks[owner]?.data.props?.[key], snapshot.blocks[owner]?.data.props?.[key]))
          deny('designerLocks')
    }
  }
  const content: Record<string, string[]> = {
    Heading: ['text'],
    Text: ['text'],
    Button: ['text', 'url'],
    Image: ['url', 'alt', 'linkHref'],
    Html: ['contents']
  }
  for (const [id, block] of Object.entries(current.blocks)) {
    if (snapshot.blocks[id]?.type !== block.type) {
      if (
        (content[block.type] ?? []).some(
          field =>
            Object.hasOwn(block.data.props ?? {}, field)
            && !current.policy.editableFields.includes(`${id}.data.props.${field}`)
        )
      )
        deny(id)
      continue
    }
    for (const field of content[block.type] ?? [])
      if (
        !current.policy.editableFields.includes(`${id}.data.props.${field}`)
        && !same(block.data.props?.[field], snapshot.blocks[id]?.data.props?.[field])
      )
        deny(id)
    if (
      block.data.visibilityCondition !== undefined
      && !same(block.data.visibilityCondition, snapshot.blocks[id]?.data.visibilityCondition)
    )
      deny(id)
  }
  const next = {
    ...snapshot,
    scope: current.scope,
    source: current.source,
    policy: {
      ...current.policy,
      editableFields: current.policy.editableFields.filter(path => get(snapshot.blocks, path) != null)
    }
  }
  // Overrides are provenance, not grants. Keep only grants still allowed today.
  next.moduleInstances = next.moduleInstances.map(instance => ({
    ...instance,
    overrides: Object.fromEntries(
      Object.entries(instance.overrides).filter(([path]) => next.policy.editableFields.includes(path))
    )
  }))
  return validateEmailDesign(next)
}
export interface DesignHistoryList {
  currentRevisionId: string
  revisions: Array<{
    id: string
    parent_revision_id: string | null
    schema_version: number
    created_at: string
    subject: string | null
    preview_text: string | null
  }>
  nextRevisionId: string | null
}
export interface DesignHistoryPreview {
  previewHtml: string | null
  draftId: string
  revisionId: string
  expectedRevisionId: string
  design: EmailDesignDocument | null
  restorable: boolean
  blockedReason: string | null
  subject: string | null
  previewText: string | null
}
