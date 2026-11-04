import {
  CONDITION_MARKER_PREFIX,
  EmailConditionError,
  parseContentCondition
} from './conditions'

type Block = {
  type: string
  data: {
    childrenIds?: string[]
    props?: Record<string, unknown> | null
    [key: string]: unknown
  }
}
type Blocks = Record<string, Block>
const eligible = new Set([
  'Text',
  'Heading',
  'Button',
  'Image',
  'Avatar',
  'Divider',
  'Spacer',
  'Container',
  'ColumnsContainer'
])
const protectedKeys = [
  'required',
  'legal',
  'locked',
  'brandLocked',
  'isRequired',
  'isLegal',
  'isLocked',
  'moduleId',
  'moduleRevisionId',
  'libraryId',
  'libraryPin',
  'sourcePolicy'
]
function children(block: Block): string[] {
  const columns
    = block.type === 'ColumnsContainer'
      && Array.isArray(block.data.props?.columns)
      ? block.data.props.columns
      : []
  return [
    ...(Array.isArray(block.data.childrenIds) ? block.data.childrenIds : []),
    ...columns.flatMap(column =>
      column && typeof column === 'object' && Array.isArray(column.childrenIds)
        ? (column.childrenIds as string[])
        : []
    )
  ]
}
function protectedBlock(block: Block, linked: boolean): boolean {
  if (linked || !eligible.has(block.type)) return true
  const props = block.data.props ?? {}
  if (
    protectedKeys.some(key => Boolean(props[key]) || Boolean(block.data[key]))
  )
    return true
  // Legal/required text has no universal typed flag in legacy composer documents.
  // Conservatively lock recognizable legal/unsubscribe content and its ancestors.
  return /unsubscribe|\blegal\b|\bprivacy\b|\bterms\b|postal address|receiving this email/i.test(
    JSON.stringify({
      ...block.data,
      props: Object.fromEntries(
        Object.entries(props).filter(([key]) => key !== 'visibilityCondition')
      )
    })
  )
}
/** Reject an eligible ancestor if ANY descendant is required/unknown/linked.
 * Never trust UI eligibility; canonical and renderer boundaries call this too. */
export function canConditionBlock(
  blocks: Blocks,
  id: string,
  linkedIds: readonly string[] = []
): boolean {
  const linked = new Set(linkedIds)
  const seen = new Set<string>()
  const stack = [id]
  while (stack.length) {
    const next = stack.pop()!
    const block = Object.hasOwn(blocks, next) ? blocks[next] : undefined
    if (
      !block
      || seen.has(next)
      || seen.size >= 2048
      || protectedBlock(block, linked.has(next))
    )
      return false
    seen.add(next)
    stack.push(...children(block))
  }
  // A locked ancestor also protects descendants, not just its own wrapper.
  const parents = new Map<string, string[]>()
  for (const [parent, block] of Object.entries(blocks))
    for (const child of children(block))
      parents.set(child, [...(parents.get(child) ?? []), parent])
  const ancestors = [...(parents.get(id) ?? [])]
  const visited = new Set<string>()
  while (ancestors.length) {
    const next = ancestors.pop()!
    if (visited.has(next)) continue
    visited.add(next)
    const block = blocks[next]
    if (
      !block
      || (block.type !== 'EmailLayout' && protectedBlock(block, linked.has(next)))
    )
      return false
    if (
      block.type === 'EmailLayout'
      && (linked.has(next)
        || protectedKeys.some(
          key => Boolean(block.data.props?.[key]) || Boolean(block.data[key])
        ))
    )
      return false
    ancestors.push(...(parents.get(next) ?? []))
  }
  return true
}
export function assertDocumentConditions(
  blocks: Blocks,
  linkedRoots: readonly string[] = []
): void {
  const linked: string[] = []
  const pending = [...linkedRoots]
  const visited = new Set<string>()
  while (pending.length) {
    const id = pending.pop()!
    if (visited.has(id)) continue
    visited.add(id)
    if (visited.size > 2048)
      throw new EmailConditionError('PROTECTED_CONDITION_TARGET')
    linked.push(id)
    if (blocks[id]) pending.push(...children(blocks[id]))
  }
  for (const [id, block] of Object.entries(blocks)) {
    // Authored HTML/text cannot forge compiler-owned regions around legal rows.
    if (JSON.stringify(block.data).includes(CONDITION_MARKER_PREFIX))
      throw new EmailConditionError('INVALID_CONDITION_MARKER')
    const mobile = block.data.mobile as
      { props?: Record<string, unknown> } | undefined
    if (mobile?.props && Object.hasOwn(mobile.props, 'visibilityCondition'))
      throw new EmailConditionError('INVALID_CONDITION')
    const condition = block.data.props?.visibilityCondition
    if (condition === undefined || condition === null) continue
    parseContentCondition(condition)
    if (!canConditionBlock(blocks, id, linked))
      throw new EmailConditionError('PROTECTED_CONDITION_TARGET')
  }
}

/** Brand metadata is descriptive. Persisted designer locks are policy authority;
 * conservatively treat a style lock as a block lock for visibility, including
 * root inheritance. The owning brand schema independently validates the shape. */
export function conditionPolicyLockIds(policy: unknown): string[] {
  const locks = (
    policy as
    | { designerLocks?: { blockIds?: string[], styleFields?: string[] } }
    | undefined
  )?.designerLocks
  return [
    ...(locks?.blockIds ?? []),
    ...(locks?.styleFields ?? []).map(path => path.split('.')[0]!)
  ]
}
