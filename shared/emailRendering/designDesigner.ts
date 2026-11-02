/* eslint no-control-regex: off -- Reject control bytes explicitly at the untrusted designer content boundary. */
import { z } from 'zod'
import { RenderBoundaryError, snapshotRenderInput } from './bounds'
import { designChildIds, DESIGN_LIMITS, EmailDesignError, validateEmailDesign, type EmailDesignDocument } from './designContract'
import { designToRendererDocument } from './designAdapter'
import { FONT_FAMILY_MAP } from './fonts'
import { newEmailBlockDefaults } from './designBrandDefaults'
import { designStructureLocked } from './designBrand'
import { parseRoundtripRequest, type RoundtripRequest, type DesignHandoff } from './designRoundtrip'

function boundedSnapshot(input: unknown): unknown {
  try {
    return snapshotRenderInput(input, DESIGN_LIMITS.documentBytes)
  } catch (error) {
    throw new EmailDesignError(error instanceof RenderBoundaryError && error.code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' : 'INVALID_DESIGN')
  }
}
const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/).refine(id => !['__proto__', 'constructor', 'prototype'].includes(id))
const Uuid = z.string().uuid()
const Color = z.string().regex(/^#[a-fA-F0-9]{6}$/)
const Length = z.number().finite().min(0).max(600)
const Style = z.object({
  color: Color.optional(), backgroundColor: Color.optional(),
  fontFamily: z.enum(Object.keys(FONT_FAMILY_MAP) as [string, ...string[]]).optional(),
  fontSize: z.number().finite().min(8).max(96).optional(),
  fontWeight: z.enum(['normal', 'bold', '100', '200', '300', '400', '500', '600', '700', '800', '900']).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional(),
  padding: z.object({ top: Length, right: Length, bottom: Length, left: Length }).strict().optional(),
  lineHeight: z.number().finite().min(0.8).max(3).optional(),
  letterSpacing: z.number().finite().min(-2).max(20).optional(),
  borderWidth: z.number().finite().min(0).max(20).optional(),
  borderStyle: z.enum(['solid', 'dashed', 'dotted']).optional(), borderColor: Color.optional(),
  borderRadius: z.number().finite().min(0).max(100).optional()
}).strict()
const SectionType = z.enum(['Heading', 'Text', 'Button', 'Image', 'Spacer', 'Divider', 'Container', 'ColumnsContainer'])
const Target = { parentId: Id, columnIndex: z.number().int().min(0).max(2).optional(), index: z.number().int().min(0).max(300) }
const Operation = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set-style'), blockId: Id, style: Style, mobile: z.boolean().optional() }).strict(),
  z.object({ op: z.literal('set-props'), blockId: Id, props: z.record(z.string(), z.unknown()), mobile: z.boolean().optional() }).strict(),
  z.object({ op: z.literal('add-section'), ...Target, sectionType: SectionType }).strict(),
  z.object({ op: z.literal('move-section'), ...Target, blockId: Id }).strict(),
  z.object({ op: z.literal('duplicate-section'), ...Target, blockId: Id }).strict(),
  z.object({ op: z.literal('remove-section'), blockId: Id }).strict()
])
export type DesignerOperation = z.infer<typeof Operation>
const Proposal = z.object({
  version: z.literal(1), action: z.literal('propose-designer-return'), operationId: Uuid,
  scope: z.object({ clientId: Uuid.nullable() }).strict(), draftId: Uuid, baseRevisionId: Uuid,
  operations: z.array(Operation).max(300)
}).strict()
export type DesignerProposalAction = z.infer<typeof Proposal>
export type DesignerRoundtripRequest = Exclude<RoundtripRequest, { command: 'propose' }>
  | { command: 'propose', handoffId: string, action: DesignerProposalAction }

export function parseDesignerRoundtripRequest(input: unknown): DesignerRoundtripRequest {
  const snapshot = boundedSnapshot(input)
  const propose = z.object({ command: z.literal('propose'), handoffId: Uuid, action: Proposal }).strict().safeParse(snapshot)
  if (propose.success) return propose.data
  if (snapshot && typeof snapshot === 'object' && 'command' in snapshot && snapshot.command === 'propose') throw new EmailDesignError('INVALID_DESIGN', 'designer.proposal')
  return parseRoundtripRequest(snapshot) as DesignerRoundtripRequest
}
export function parseDesignerProposal(input: unknown): DesignerProposalAction {
  return Proposal.parse(boundedSnapshot(input))
}
const supported = new Set(['EmailLayout', ...SectionType.options])
// A literal ampersand is plain copy. Entity-rich/HTML source remains locked.
const richText = /[<>]|&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]+);/i
const legal = /unsubscribe|email[_ -]?preferences|postal[_ -]?address|mailing[_ -]?address|\{\{\s*(?:address|business_address|company_address)\s*\}\}/i
const content: Record<string, string[]> = { Heading: ['text'], Text: ['text'], Button: ['text', 'url'], Image: ['url', 'alt', 'linkHref'] }
function deny(field: string): never {
  throw new EmailDesignError('EDIT_FORBIDDEN', field)
}
function descendants(design: EmailDesignDocument, id: string): string[] {
  if (!Object.hasOwn(design.blocks, id)) return deny('blockId')
  return [id, ...designChildIds(design.blocks[id]).flatMap(child => descendants(design, child))]
}
function ownLocked(design: EmailDesignDocument, id: string): boolean {
  const block = design.blocks[id]
  if (!supported.has(block.type) || design.policy.designerLocks?.blockIds.includes(id)) return true
  // Preserve legacy lock metadata and unknown block extensions conservatively.
  if (Object.keys(block.data).some(key => !['props', 'style', 'childrenIds', 'mobile', 'hideOnMobile', 'hideOnDesktop'].includes(key))) return true
  if (Object.keys(block.data.props ?? {}).some(key => /lock|legal|required|brand/i.test(key))) return true
  if (legal.test(JSON.stringify(block.data.props ?? {}))) return true
  // A missing content grant is an existing brand/content lock, not permission
  // for a designer to delete or clone the protected field through structure.
  return (content[block.type] ?? []).some(field => Object.hasOwn(block.data.props ?? {}, field)
    && !design.policy.editableFields.includes(`${id}.data.props.${field}`))
}
function locked(design: EmailDesignDocument, id: string): boolean {
  return descendants(design, id).some(child => ownLocked(design, child))
}
function assertEditable(design: EmailDesignDocument, id: string): void {
  if (locked(design, id)) deny(id)
  // A parent lock protects all descendants, including inherited brand styles.
  for (const parent of Object.keys(design.blocks)) {
    if (parent !== id && ownLocked(design, parent) && descendants(design, parent).includes(id)) deny(id)
  }
}
function childList(design: EmailDesignDocument, parentId: string, columnIndex?: number): string[] {
  if (!Object.hasOwn(design.blocks, parentId)) return deny('parentId')
  if (designStructureLocked(design, parentId)) deny('designerLocks')
  if (ownLocked(design, parentId)) deny(parentId)
  for (const parent of Object.keys(design.blocks)) {
    if (parent !== parentId && ownLocked(design, parent) && descendants(design, parent).includes(parentId)) deny(parentId)
  }
  const block = design.blocks[parentId]
  if (block.type === 'ColumnsContainer') {
    if (columnIndex === undefined) return deny('columnIndex')
    const columns = block.data.props?.columns as Array<{ childrenIds?: string[] }>
    if (!columns[columnIndex]) return deny('columnIndex')
    return columns[columnIndex].childrenIds ??= []
  }
  if (!['EmailLayout', 'Container'].includes(block.type) || columnIndex !== undefined) return deny('parentId')
  return block.data.childrenIds ??= []
}
function locate(design: EmailDesignDocument, id: string): string[] {
  for (const block of Object.values(design.blocks)) {
    if (block.data.childrenIds?.includes(id)) return block.data.childrenIds
    if (block.type === 'ColumnsContainer') {
      for (const col of block.data.props!.columns as Array<{ childrenIds?: string[] }>) if (col.childrenIds?.includes(id)) return col.childrenIds
    }
  }
  return deny('root')
}
function insert(list: string[], index: number, id: string) {
  if (index > list.length) deny('index')
  list.splice(index, 0, id)
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stable((value as Record<string, unknown>)[k])}`).join(',')}}`
}
function tokens(value: unknown): string[] {
  return typeof value === 'string' ? (value.match(/\{\{[^{}]+\}\}/g) ?? []).sort() : []
}
/** Desktop style restrictions inherit through containers and also cover mobile
 * overrides. Root semantic colours/fonts map to their materialized block keys. */
function lockedStylePath(design: EmailDesignDocument, blockId: string, path: string): boolean {
  const canonical = path.replace('.data.mobile.', '.data.')
  const semantic = (suffix: string) => suffix
    .replace(/^\.data\.props\.fontFamily$/, '.data.style.fontFamily')
    .replace(/^\.data\.props\.(?:textColor|buttonTextColor)$/, '.data.style.color')
    .replace(/^\.data\.props\.(?:canvasColor|backdropColor|buttonBackgroundColor)$/, '.data.style.backgroundColor')
  return (design.policy.designerLocks?.styleFields ?? []).some((field) => {
    field = field.replace('.data.mobile.', '.data.')
    const owner = field.split('.')[0]
    if (owner === blockId) return [canonical, path].some(candidate => candidate === field || candidate.startsWith(`${field}.`) || field.startsWith(`${candidate}.`))
    if (!descendants(design, owner).includes(blockId)) {
      // An inherited value cannot be changed indirectly at an ancestor while
      // its descendant field is locked (including a mobile-only persisted field).
      if (!descendants(design, blockId).includes(owner)) return false
      const before = semantic(field.slice(owner.length))
      const candidate = semantic(canonical.slice(blockId.length))
      return before === candidate || before.startsWith(`${candidate}.`) || candidate.startsWith(`${before}.`)
    }
    let suffix = field.slice(owner.length).replace('.data.mobile.', '.data.')
    if (suffix === '.data.props.fontFamily') suffix = '.data.style.fontFamily'
    if (['.data.props.textColor', '.data.style.color'].includes(suffix)) return /\.data\.(?:style\.color|props\.buttonTextColor)$/.test(canonical)
    if (['.data.props.canvasColor', '.data.props.backdropColor', '.data.style.backgroundColor'].includes(suffix)) return /\.data\.(?:style\.backgroundColor|props\.buttonBackgroundColor)$/.test(canonical)
    if (suffix === '.data.props.primaryColor') return /\.data\.(?:style\.color|props\.(?:buttonBackgroundColor|lineColor))$/.test(canonical)
    const inherited = `${blockId}${suffix}`
    return canonical === inherited || canonical.startsWith(`${inherited}.`) || inherited.startsWith(`${canonical}.`)
  })
}
function safeLink(value: unknown, image: boolean): boolean {
  if (typeof value !== 'string' || value.length > 8192 || /[\s<>"'\x00-\x1f]/.test(value)) return false
  if (!image && (value === '' || /^#[A-Za-z0-9_.:-]*$/.test(value))) return true
  try {
    const u = new URL(value)
    return !u.username && !u.password && (image ? ['https:'] : ['https:', 'http:', 'mailto:', 'tel:']).includes(u.protocol)
  } catch {
    return false
  }
}
const propsByType: Record<string, z.ZodType> = {
  EmailLayout: z.object({ primaryColor: Color.optional(), contentWidth: z.number().int().min(320).max(960).optional(), backdropColor: Color.optional(), canvasColor: Color.optional(), textColor: Color.optional(), fontFamily: z.enum(Object.keys(FONT_FAMILY_MAP) as [string, ...string[]]).optional(), borderColor: Color.optional(), borderRadius: z.number().int().min(0).max(100).optional() }).strict(),
  Heading: z.object({ text: z.string().max(8192).optional(), level: z.enum(['h1', 'h2', 'h3']).optional() }).strict(),
  Text: z.object({ text: z.string().max(8192).optional() }).strict(),
  Button: z.object({ text: z.string().max(8192).optional(), url: z.string().max(8192).optional(), buttonBackgroundColor: Color.optional(), buttonTextColor: Color.optional(), buttonStyle: z.enum(['rounded', 'pill', 'square']).optional(), size: z.enum(['x-small', 'small', 'medium', 'large']).optional(), fullWidth: z.boolean().optional() }).strict(),
  Image: z.object({ url: z.string().max(8192).optional(), alt: z.string().max(8192).optional(), linkHref: z.string().max(8192).optional(), width: z.union([z.number().int().min(1).max(800), z.literal('100%')]).optional(), contentAlignment: z.enum(['left', 'center', 'right']).optional() }).strict(),
  Spacer: z.object({ height: Length.optional() }).strict(), Divider: z.object({ lineColor: Color.optional(), lineThickness: z.number().int().min(1).max(20).optional() }).strict(),
  Container: z.object({}).strict(),
  ColumnsContainer: z.object({ columnsGap: Length.optional(), contentAlignment: z.enum(['top', 'middle', 'bottom']).optional(), columnsCount: z.number().int().min(1).max(3).optional() }).strict()
}

/** All mutations start from the persisted baseline. Unknown fields, provenance,
 * assets and immutable pins never enter the client operation vocabulary. */
export function designerBlockId(operationId: string, operationIndex: number, childIndex = 0): string {
  Uuid.parse(operationId)
  return `designer-${operationId}-${operationIndex}-${childIndex}`
}
export function applyDesignerOperations(input: unknown, operations: unknown, operationId: string): EmailDesignDocument {
  Uuid.parse(operationId)
  const design = validateEmailDesign(input)
  const base = validateEmailDesign(input)
  const ops = z.array(Operation).max(300).parse(boundedSnapshot(operations))
  if (design.source.nativeArtifact !== null) deny('source.nativeArtifact.unverified')
  const linked = new Set(design.moduleInstances.flatMap(instance => instance.rootBlockIds.flatMap(id => descendants(design, id))))
  const existingImages = new Set(Object.values(base.blocks).filter(b => b.type === 'Image').map(b => b.data.props?.url).filter(url => safeLink(url, true)))
  const assertMutable = (id: string) => {
    assertEditable(design, id)
    if (descendants(design, id).some(child => linked.has(child))) deny('moduleInstances')
    for (const root of linked) if (descendants(design, root).includes(id)) deny('moduleInstances')
  }
  for (const [operationIndex, op] of ops.entries()) {
    if (op.op === 'set-style' || op.op === 'set-props') {
      assertMutable(op.blockId)
      const block = design.blocks[op.blockId]
      if (block.type === 'EmailLayout' && op.op === 'set-style') deny('root.style')
      if (op.mobile && op.op === 'set-props') deny('mobile.props')
      const patch = op.op === 'set-style' ? op.style : propsByType[block.type].parse(op.props) as Record<string, unknown>
      for (const key of Object.keys(patch)) {
        const path = `${op.blockId}.data.${op.mobile ? 'mobile.' : ''}${op.op === 'set-style' ? 'style' : 'props'}.${key}`
        if (lockedStylePath(design, op.blockId, path)) deny(path)
      }
      if (op.op === 'set-props') {
        for (const [key, value] of Object.entries(patch)) {
          const previous = block.data.props?.[key]
          if ((content[block.type] ?? []).includes(key)) {
            if (op.mobile || !design.policy.editableFields.includes(`${op.blockId}.data.props.${key}`)) deny(key)
            if (typeof value !== 'string' || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) deny(key)
            if (stable(tokens(previous)) !== stable(tokens(value))) deny('mergeTokens')
          }
          if (key === 'text' && (richText.test(String(previous ?? '')) || richText.test(String(value)))) deny('richText')
          if (key === 'url' || key === 'linkHref') {
            if (!safeLink(value, block.type === 'Image' && key === 'url')) deny(key)
            if (block.type === 'Image' && key === 'url' && value !== previous && !existingImages.has(value)) deny('assets')
          }
        }
      }
      if (op.op === 'set-props' && block.type === 'ColumnsContainer' && 'columnsCount' in patch) {
        if (op.mobile) deny('columnsCount')
        const count = patch.columnsCount as number
        const columns = block.data.props!.columns as Array<{ childrenIds?: string[] }>
        if (columns.slice(count).some(column => column.childrenIds?.length)) deny('columnsCount.nonempty')
        block.data.props!.columns = Array.from({ length: count }, (_, index) => columns[index] ?? { childrenIds: [] })
      }
      const holder = op.mobile ? (block.data.mobile ??= {}) as Record<string, unknown> : block.data
      const key = op.op === 'set-style' ? 'style' : 'props'
      holder[key] = { ...(holder[key] as Record<string, unknown> ?? {}), ...patch }
    } else if (op.op === 'add-section') {
      const list = childList(design, op.parentId, op.columnIndex)
      const blockId = designerBlockId(operationId, operationIndex)
      if (linked.has(op.parentId) || Object.hasOwn(design.blocks, blockId)) deny('blockId')
      const defaults: Record<string, Record<string, unknown>> = { Heading: { text: 'Heading' }, Text: { text: 'Text' }, Button: { text: 'Button', url: '#' }, Image: { url: '', alt: '', linkHref: '' }, Spacer: { height: 24 }, Divider: {}, Container: {}, ColumnsContainer: { columnsCount: 2, columns: [{ childrenIds: [] }, { childrenIds: [] }] } }
      const theme = newEmailBlockDefaults(op.sectionType, design)
      design.blocks[blockId] = { type: op.sectionType, data: { style: theme.style, props: { ...defaults[op.sectionType], ...theme.props }, ...(['Container'].includes(op.sectionType) ? { childrenIds: [] } : {}) } }
      insert(list, op.index, blockId)
      for (const field of content[op.sectionType] ?? []) design.policy.editableFields.push(`${blockId}.data.props.${field}`)
      // Canonical identity is a deterministic server derivation, not client lineage.
      design.lineage.push({ blockId, nodeId: `node-${blockId}`, fields: Object.fromEntries((content[op.sectionType] ?? []).map(field => [field, `field-${blockId}-${field}`])) })
    } else {
      if (op.blockId === 'root') deny('root')
      assertMutable(op.blockId)
      // Moving/cloning a subtree out of inherited restrictions or deleting a
      // locked style is an indirect relaxation, not a structural edit grant.
      if (design.policy.designerLocks?.styleFields.some((path) => {
        const owner = path.split('.')[0]
        return descendants(design, op.blockId).includes(owner) || descendants(design, owner).includes(op.blockId)
      })) deny('designerLocks')
      if (op.op === 'remove-section' && design.policy.designerLocks?.styleFields.some(path => descendants(design, op.blockId).includes(path.split('.')[0]))) deny('designerLocks')
      const ids = descendants(design, op.blockId)
      if (op.op === 'remove-section') {
        const list = locate(design, op.blockId)
        // Mutation of the parent must also be authorised.
        for (const id of Object.keys(design.blocks)) if (designChildIds(design.blocks[id]).includes(op.blockId) && ownLocked(design, id)) deny(id)
        list.splice(list.indexOf(op.blockId), 1)
        design.blocks = Object.fromEntries(Object.entries(design.blocks).filter(([id]) => !ids.includes(id)))
        design.lineage = design.lineage.filter(item => !ids.includes(item.blockId))
        design.policy.editableFields = design.policy.editableFields.filter(path => !ids.includes(path.split('.')[0]))
      } else {
        if (ids.includes(op.parentId) || linked.has(op.parentId)) deny('parentId')
        const list = childList(design, op.parentId, op.columnIndex)
        if (op.op === 'move-section') {
          const old = locate(design, op.blockId)
          old.splice(old.indexOf(op.blockId), 1)
          insert(list, op.index, op.blockId)
        } else {
          const newBlockIds = Object.fromEntries(ids.map((id, index) => [id, designerBlockId(operationId, operationIndex, index)]))
          const fresh = Object.values(newBlockIds)
          if (new Set(fresh).size !== fresh.length || fresh.some(id => Object.hasOwn(design.blocks, id))) deny('newBlockIds')
          for (const id of ids) {
            const copy = JSON.parse(JSON.stringify(design.blocks[id]))
            if (copy.data.childrenIds) copy.data.childrenIds = copy.data.childrenIds.map((child: string) => newBlockIds[child])
            if (copy.type === 'ColumnsContainer') for (const col of copy.data.props.columns) col.childrenIds = (col.childrenIds ?? []).map((child: string) => newBlockIds[child])
            const nextId = newBlockIds[id]
            design.blocks[nextId] = copy
            const grants = [...design.policy.editableFields].filter(path => path.startsWith(`${id}.`))
            design.policy.editableFields.push(...grants.map(path => `${nextId}${path.slice(id.length)}`))
            const fieldNames = new Set([...Object.keys(design.lineage.find(item => item.blockId === id)?.fields ?? {}), ...grants.map(path => path.split('.').at(-1)!)])
            design.lineage.push({ blockId: nextId, nodeId: `node-${nextId}`, fields: Object.fromEntries([...fieldNames].map(field => [field, `field-${nextId}-${field}`])) })
            if (design.policy.designerLocks) design.policy.designerLocks.styleFields.push(...design.policy.designerLocks.styleFields.filter(path => path.startsWith(`${id}.`)).map(path => `${nextId}${path.slice(id.length)}`))
          }
          insert(list, op.index, newBlockIds[op.blockId])
        }
      }
    }
    // Bound intermediate graphs too; a large operation list cannot expand then
    // shrink a tree to evade block, depth, lineage or UTF-8 limits.
    validateEmailDesign(design)
  }
  designToRendererDocument(design)
  return validateEmailDesign(design)
}
export function assertDesignerOperationsResult(base: EmailDesignDocument, candidate: EmailDesignDocument, operations: DesignerOperation[], operationId: string) {
  if (stable(applyDesignerOperations(base, operations, operationId)) !== stable(candidate)) deny('designer.proposal')
}
export function designerCapabilities(input: unknown) {
  const design = validateEmailDesign(input)
  return {
    version: 1 as const,
    operations: ['set-style', 'set-props', 'add-section', 'move-section', 'duplicate-section', 'remove-section'] as const,
    blocks: Object.keys(design.blocks).map((blockId) => {
      const inheritedLock = Object.keys(design.blocks).some(parent => parent !== blockId && ownLocked(design, parent) && descendants(design, parent).includes(blockId))
      const editable = !inheritedLock && !locked(design, blockId) && !design.moduleInstances.some(instance => instance.rootBlockIds.some(root => descendants(design, root).includes(blockId) || descendants(design, blockId).includes(root)))
      return { blockId, editable, canInsert: ['EmailLayout', 'Container', 'ColumnsContainer'].includes(design.blocks[blockId].type) && !designStructureLocked(design, blockId) && !ownLocked(design, blockId) && !inheritedLock && !design.moduleInstances.some(instance => instance.rootBlockIds.some(root => descendants(design, root).includes(blockId))), lockedStyleFields: (design.policy.designerLocks?.styleFields ?? []).filter(path => path.startsWith(`${blockId}.`)) }
    }),
    nativeSource: { state: 'canonical-only' as const, artifact: null, reason: 'PRIVATE_NATIVE_STAGING_UNAVAILABLE' as const }
  }
}

export type DesignerCapabilities = ReturnType<typeof designerCapabilities>
export interface DesignerHandoffResponse {
  handoff: DesignHandoff
  capabilities: DesignerCapabilities
  preview: { html: string, source: 'canonical-renderer' }
}

export interface DesignerAuthoringDiscovery {
  available: boolean
  endpoint: '/api/email/design/designer'
  capabilities: DesignerCapabilities | null
}
