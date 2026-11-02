import { z } from 'zod'
import { designChildIds, EmailDesignError, validateEmailDesign, type EmailDesignDocument } from './designContract'
import { EmailBrandSnapshotSchema, type EmailBrandSnapshot } from './designBrandDefaults'

const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).refine(v => !['__proto__', 'constructor', 'prototype'].includes(v))
const Identity = { version: z.literal(1), operationId: z.string().uuid(), draftId: z.string().uuid(), expectedRevisionId: z.string().uuid() }
const Lock = z.discriminatedUnion('target', [
  z.object({ blockId: Id, target: z.literal('block'), locked: z.boolean() }).strict(),
  z.object({ blockId: Id, target: z.literal('style'), field: z.string().min(1).max(128), locked: z.boolean() }).strict()
])
export const DesignBrandRequestSchema = z.discriminatedUnion('command', [
  z.object({ ...Identity, command: z.literal('apply-brand'), kitId: z.string().uuid(), kitDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ ...Identity, command: z.literal('set-design-lock'), lock: Lock }).strict()
])
export type DesignBrandRequest = z.infer<typeof DesignBrandRequestSchema>
export type DesignLockChange = z.infer<typeof Lock>
/** A structural change cannot enter, escape or replace an explicitly locked
 * ancestry/subtree through another authoring boundary such as modules/assets. */
export function designStructureLocked(design: EmailDesignDocument, blockId: string, descendants = false): boolean {
  const ids = (id: string): string[] => design.blocks[id] ? [id, ...designChildIds(design.blocks[id]).flatMap(ids)] : []
  const owners = [...design.policy.designerLocks?.blockIds ?? [], ...(design.policy.designerLocks?.styleFields ?? []).map(path => path.split('.')[0])]
  return owners.some(owner => ids(owner).includes(blockId) || (descendants && ids(blockId).includes(owner)))
}
export function applyDesignBrand(input: unknown, snapshot: EmailBrandSnapshot): EmailDesignDocument {
  const design = validateEmailDesign(input)
  if (design.policy.designerLocks?.blockIds.includes('root') || design.policy.designerLocks?.styleFields.some(path => path.startsWith('root.'))) throw new EmailDesignError('EDIT_FORBIDDEN', 'designerLocks')
  // Existing root settings participate in inheritance and are authored design.
  // Applying a kit changes future defaults only, with no hidden render changes.
  design.source.brand = EmailBrandSnapshotSchema.parse(snapshot)
  const root = design.blocks.root
  if (root?.type === 'EmailLayout') {
    root.data.props = { ...root.data.props, primaryColor: snapshot.defaults.primaryColor }
    if (!root.data.childrenIds?.length) {
      root.data.props.fontFamily = snapshot.defaults.fontFamily
      root.data.props.contentWidth = snapshot.defaults.contentWidth
    }
  }
  return validateEmailDesign(design)
}
const styleKeys = new Set(['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'textAlign', 'lineHeight', 'letterSpacing', 'borderWidth', 'borderStyle', 'borderColor', 'borderRadius'])
const propsByType: Record<string, string[]> = { EmailLayout: ['primaryColor', 'fontFamily', 'contentWidth', 'textColor', 'canvasColor', 'backdropColor', 'borderColor', 'borderRadius'], Button: ['buttonBackgroundColor', 'buttonTextColor', 'buttonStyle', 'size', 'fullWidth'], Image: ['width', 'contentAlignment'], Divider: ['lineColor', 'lineThickness'], Spacer: ['height'], ColumnsContainer: ['columnsGap', 'contentAlignment', 'columnsCount'], Heading: ['level'] }
/** Field identities are derived from the exact saved source. No client path can
 * assign content grants, role policy, unknown extensions or asset metadata. */
export function designLockTargets(input: unknown) {
  const design = validateEmailDesign(input)
  return Object.entries(design.blocks).map(([blockId, block]) => {
    const styleFields: string[] = []
    const scan = (style: unknown, prefix: string) => {
      if (!style || typeof style !== 'object') return
      for (const [key, value] of Object.entries(style)) {
        if (styleKeys.has(key) && value !== null && ['string', 'number', 'boolean'].includes(typeof value)) styleFields.push(`${prefix}.${key}`)
        if (key === 'padding' && value && typeof value === 'object') for (const [edge, length] of Object.entries(value)) if (['top', 'left', 'right', 'bottom'].includes(edge) && typeof length === 'number') styleFields.push(`${prefix}.padding.${edge}`)
      }
    }
    scan(block.data.style, 'data.style')
    const mobile = block.data.mobile
    if (mobile && typeof mobile === 'object') scan((mobile as Record<string, unknown>).style, 'data.style')
    for (const key of propsByType[block.type] ?? []) if (block.data.props?.[key] != null) styleFields.push(`data.props.${key}`)
    const existing = (design.policy.designerLocks?.styleFields ?? []).filter(path => path.startsWith(`${blockId}.`)).map(path => path.slice(blockId.length + 1))
    return { blockId, type: block.type, locked: design.policy.designerLocks?.blockIds.includes(blockId) ?? false, styleFields: [...new Set([...styleFields, ...existing])], lockedStyleFields: existing }
  })
}
export function applyDesignLock(input: unknown, change: DesignLockChange): EmailDesignDocument {
  const design = validateEmailDesign(input)
  const lock = Lock.parse(change)
  const target = designLockTargets(design).find(t => t.blockId === lock.blockId)
  if (!target || (lock.target === 'style' && !target.styleFields.includes(lock.field))) throw new EmailDesignError('EDIT_FORBIDDEN', 'designerLocks')
  const locks = design.policy.designerLocks ??= { blockIds: [], styleFields: [] }
  const list = lock.target === 'block' ? locks.blockIds : locks.styleFields
  const key = lock.target === 'block' ? lock.blockId : `${lock.blockId}.${lock.field}`
  const index = list.indexOf(key)
  if (lock.locked && index < 0) list.push(key)
  if (!lock.locked && index >= 0) list.splice(index, 1)
  return validateEmailDesign(design)
}
