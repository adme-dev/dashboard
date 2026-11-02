import { z } from 'zod'
import { snapshotRenderInput, RenderBoundaryError } from './bounds'
import { designChildIds, DESIGN_LIMITS, EmailDesignError, validateEmailDesign, type EmailDesignDocument } from './designContract'
import { designStructureLocked } from './designBrand'
import { applyDesignerOperations, assertLibraryImageReplaceable } from './designDesigner'

const Uuid = z.string().uuid()
const Id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/)
const identity = { version: z.literal(1), operationId: Uuid }
const source = { draftId: Uuid, expectedDraftRevisionId: Uuid }
const metadata = { name: z.string().trim().min(1).max(200), category: z.string().trim().min(1).max(80), description: z.string().max(500).nullable(), previewTone: z.enum(['light', 'dark', 'accent']) }
const publication = { ...identity, ...source, rootBlockIds: z.array(Id).min(1).max(300).optional(), includedOverridePaths: z.array(z.string().min(1).max(512)).max(3000), ...metadata }
const target = { parentId: Id, columnIndex: z.number().int().min(0).max(2).optional(), index: z.number().int().min(0).max(300) }
const Pin = { moduleId: Uuid, revisionId: Uuid }
const Request = z.discriminatedUnion('command', [
  z.object({ command: z.literal('publish-module'), ...publication }).strict(),
  z.object({ command: z.literal('revise-module'), ...publication, moduleId: Uuid, expectedModuleRevisionId: Uuid }).strict(),
  z.object({ command: z.literal('insert-module'), ...identity, ...source, ...Pin, ...target }).strict(),
  z.object({ command: z.literal('update-module-instance'), ...identity, ...source, instanceId: Id, revisionId: Uuid, overrides: z.enum(['preserve', 'discard']) }).strict(),
  z.object({ command: z.literal('detach-module-instance'), ...identity, ...source, instanceId: Id }).strict(),
  z.object({ command: z.literal('insert-published-image'), ...identity, ...source, assetId: Uuid, ...target }).strict(),
  z.object({ command: z.literal('replace-published-image'), ...identity, ...source, assetId: Uuid, blockId: Id }).strict()
])
export type DesignModuleRequest = z.infer<typeof Request>
export type ModulePublicationRequest = Extract<DesignModuleRequest, { command: 'publish-module' | 'revise-module' }>
export type ModuleInstanceRequest = Exclude<DesignModuleRequest, ModulePublicationRequest | { command: 'insert-published-image' | 'replace-published-image' }>

const NativeContext = z.object({
  operationId: Uuid, operations: z.array(z.unknown()).max(300),
  selectedBlockIds: z.array(Id).max(300), insertionTarget: z.object(target).strict().optional()
}).strict()
export type NativeLibraryContext = z.infer<typeof NativeContext>
/** Native selection is a bounded hint, never authority. Validate it against the
 * exact canonical operation log before exposing publication or insertion UI. */
export function parseNativeLibraryContext(base: unknown, input: unknown, operationId: string): NativeLibraryContext {
  const context = NativeContext.parse(snapshotRenderInput(input, DESIGN_LIMITS.documentBytes))
  if (context.operationId !== operationId || new Set(context.selectedBlockIds).size !== context.selectedBlockIds.length) throw new EmailDesignError('INVALID_DESIGN')
  const design = applyDesignerOperations(base, context.operations, operationId)
  if (context.selectedBlockIds.some(id => !Object.hasOwn(design.blocks, id))) throw new EmailDesignError('INVALID_DESIGN')
  context.selectedBlockIds = orderedDesignSelection(design, context.selectedBlockIds)
  if (context.insertionTarget) {
    const list = insertionList(design, context.insertionTarget.parentId, context.insertionTarget.columnIndex)
    if (context.insertionTarget.index > list.length) throw new EmailDesignError('INVALID_DESIGN', 'index')
  }
  return context
}
export function parseDesignModuleRequest(input: unknown): DesignModuleRequest {
  try {
    return Request.parse(snapshotRenderInput(input, DESIGN_LIMITS.documentBytes))
  } catch (error) {
    if (error instanceof RenderBoundaryError) throw new EmailDesignError(error.code === 'LIMIT_EXCEEDED' ? 'LIMIT_EXCEEDED' : 'INVALID_DESIGN')
    throw error
  }
}
export class DesignModuleError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'IDEMPOTENCY_CONFLICT' | 'DESIGNER_REQUIRED' | 'PUBLISHER_REQUIRED' | 'SCOPE_MISMATCH' | 'SAVED_DRAFT_REQUIRED' | 'CLOSED_SELECTION_REQUIRED' | 'LOCAL_OVERRIDE_REVIEW_REQUIRED' | 'OVERRIDE_CONFLICT' | 'ASSET_NOT_READY' | 'ASSET_STORAGE_UNAVAILABLE' | 'NATIVE_ARTIFACT_STORAGE_UNAVAILABLE') {
    super(code)
  }
}
export function stableDesignJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableDesignJson).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableDesignJson((value as Record<string, unknown>)[key])}`).join(',')}}`
}
export async function designDigest(value: unknown): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(stableDesignJson(value)))), b => b.toString(16).padStart(2, '0')).join('')
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value))
export function subtreeIds(design: EmailDesignDocument, roots: string[]): Set<string> {
  const ids = new Set<string>()
  const pending = [...roots]
  while (pending.length) {
    const id = pending.pop()!
    if (!design.blocks[id] || ids.has(id)) throw new DesignModuleError('CLOSED_SELECTION_REQUIRED')
    ids.add(id)
    pending.push(...designChildIds(design.blocks[id]))
  }
  return ids
}
/** Native multi-selection is unordered. Publication follows canonical reading
 * order; overlapping ancestor/descendant selections are explicitly refused. */
function orderedDesignSelection(design: EmailDesignDocument, roots: string[]): string[] {
  subtreeIds(design, roots)
  const selected = new Set(roots)
  const ordered: string[] = []
  const visit = (id: string) => {
    if (selected.has(id)) ordered.push(id)
    for (const child of designChildIds(design.blocks[id])) visit(child)
  }
  for (const root of design.rootChildrenIds) visit(root)
  if (ordered.length !== roots.length) throw new DesignModuleError('CLOSED_SELECTION_REQUIRED')
  return ordered
}
export type ModuleRecord = { moduleId: string, revisionId: string, design: EmailDesignDocument }
export function refreshModuleDependencies(design: EmailDesignDocument, records: ModuleRecord[]): void {
  const pins = new Map<string, { moduleId: string, revisionId: string }>()
  for (const instance of design.moduleInstances) {
    const record = records.find(r => r.moduleId === instance.moduleId && r.revisionId === instance.revisionId)
    if (!record) throw new DesignModuleError('NOT_FOUND')
    for (const pin of [{ moduleId: instance.moduleId, revisionId: instance.revisionId }, ...record.design.dependencies]) pins.set(`${pin.moduleId}:${pin.revisionId}`, pin)
  }
  design.dependencies = [...pins.values()]
}
/** Closed extraction retains persisted policy and complete linked instances.
 * Asset descriptors are deliberately supplied by the server, never the caller. */
export function extractDesignModule(input: unknown, roots: string[] | undefined, records: ModuleRecord[], includedOverridePaths: string[]): EmailDesignDocument {
  const design = validateEmailDesign(input)
  const selected = orderedDesignSelection(design, roots ?? designChildIds(design.blocks.root!))
  const ids = subtreeIds(design, selected)
  if (!selected.length || ids.has('root')) throw new DesignModuleError('CLOSED_SELECTION_REQUIRED')
  const instances = design.moduleInstances.filter((instance) => {
    const owned = subtreeIds(design, instance.rootBlockIds)
    const count = [...owned].filter(id => ids.has(id)).length
    if (count && count !== owned.size) throw new DesignModuleError('CLOSED_SELECTION_REQUIRED')
    return count > 0
  })
  const selectedInstances = instances.map((i) => {
    const record = records.find(r => r.moduleId === i.moduleId && r.revisionId === i.revisionId)
    if (!record) throw new DesignModuleError('NOT_FOUND')
    return { ...i, overrides: moduleLocalOverrides(design, i.instanceId, record.design) }
  })
  const actualOverrides = selectedInstances.flatMap(i => Object.keys(i.overrides))
  if (stableDesignJson([...new Set(actualOverrides)].sort()) !== stableDesignJson([...new Set(includedOverridePaths)].sort())) throw new DesignModuleError('LOCAL_OVERRIDE_REVIEW_REQUIRED')
  const result: EmailDesignDocument = {
    ...design, kind: 'module', source: { ...design.source, editor: 'composer', nativeArtifact: null },
    blocks: Object.fromEntries(Object.entries(design.blocks).filter(([id]) => ids.has(id))), rootChildrenIds: selected,
    lineage: design.lineage.filter(item => ids.has(item.blockId)), moduleInstances: selectedInstances,
    assets: [], policy: {
      version: design.policy.version, editableFields: design.policy.editableFields.filter(path => ids.has(path.split('.')[0]!)),
      ...(design.policy.designerLocks ? { designerLocks: { blockIds: design.policy.designerLocks.blockIds.filter(id => ids.has(id)), styleFields: design.policy.designerLocks.styleFields.filter(path => ids.has(path.split('.')[0]!)) } } : {})
    }
  }
  refreshModuleDependencies(result, records)
  return validateEmailDesign(result)
}
/** IDs are allocated in an instance namespace using stable sorted source IDs.
 * Every minted block/node/field is checked against the whole destination. */
function mapping(module: EmailDesignDocument, instanceId: string) {
  return new Map(Object.keys(module.blocks).sort().map((id, index) => [id, `mi_${instanceId}_${index}`]))
}
function remapPath(path: string, ids: Map<string, string>): string {
  const [id, ...rest] = path.split('.')
  if (!id || !ids.has(id)) throw new DesignModuleError('OVERRIDE_CONFLICT')
  return [ids.get(id), ...rest].join('.')
}
function getPath(blocks: EmailDesignDocument['blocks'], path: string): unknown {
  return path.split('.').reduce<unknown>((v, key) => v && typeof v === 'object' && Object.hasOwn(v, key) ? (v as Record<string, unknown>)[key] : undefined, blocks)
}
function setPath(blocks: EmailDesignDocument['blocks'], path: string, value: unknown) {
  const parts = path.split('.')
  let obj: Record<string, unknown> = blocks
  for (const key of parts.slice(0, -1)) obj = obj[key] as Record<string, unknown>
  obj[parts.at(-1)!] = value
}
export function moduleLocalOverrides(design: EmailDesignDocument, instanceId: string, module: EmailDesignDocument): Record<string, unknown> {
  const instance = design.moduleInstances.find(i => i.instanceId === instanceId)
  if (!instance) throw new DesignModuleError('NOT_FOUND')
  const ids = mapping(module, instanceId)
  const overrides: Record<string, unknown> = {}
  for (const path of module.policy.editableFields) {
    const destination = remapPath(path, ids)
    const value = getPath(design.blocks, destination)
    if (value === undefined || typeof value !== typeof getPath(module.blocks, path)) throw new DesignModuleError('OVERRIDE_CONFLICT')
    if (value !== getPath(module.blocks, path)) overrides[destination] = value
  }
  return overrides
}
function insertionList(design: EmailDesignDocument, parentId: string, columnIndex?: number): string[] {
  const parent = design.blocks[parentId]
  if (designStructureLocked(design, parentId)) throw new EmailDesignError('EDIT_FORBIDDEN', 'designerLocks')
  if (!parent || design.policy.designerLocks?.blockIds.includes(parentId) || design.moduleInstances.some(i => subtreeIds(design, i.rootBlockIds).has(parentId))) throw new EmailDesignError('EDIT_FORBIDDEN', parentId)
  if ((parent.type === 'EmailLayout' || parent.type === 'Container') && columnIndex === undefined) return parent.data.childrenIds ??= []
  const columns = parent.data.props?.columns as { childrenIds?: string[] }[] | undefined
  if (parent.type === 'ColumnsContainer' && columnIndex !== undefined && columns?.[columnIndex]) return columns[columnIndex].childrenIds ??= []
  throw new EmailDesignError('INVALID_DESIGN', 'parentId')
}
export function insertDesignImage(input: unknown, asset: EmailDesignDocument['assets'][number], url: string, operationId: string, target: { parentId: string, columnIndex?: number, index: number }): EmailDesignDocument {
  const design = validateEmailDesign(input)
  const list = insertionList(design, target.parentId, target.columnIndex)
  if (target.index > list.length) throw new EmailDesignError('INVALID_DESIGN', 'index')
  const id = `img_${operationId}`
  if (design.blocks[id]) throw new EmailDesignError('INVALID_DESIGN', 'collision')
  design.blocks[id] = { type: 'Image', data: { props: { url, alt: '' } } }
  design.lineage.push({ blockId: id, nodeId: `imgn_${operationId}`, fields: { alt: `imgf_${operationId}` } })
  // URL is a verified immutable publication; ordinary content editing gets alt only.
  design.policy.editableFields.push(`${id}.data.props.alt`)
  const previous = design.assets.find(a => a.id === asset.id)
  if (previous && stableDesignJson(previous) !== stableDesignJson(asset)) throw new DesignModuleError('ASSET_NOT_READY')
  if (!previous) design.assets.push(asset)
  list.splice(target.index, 0, id)
  design.source.nativeArtifact = null
  return validateEmailDesign(design)
}
/** The server supplies both descriptor and URL after registered-byte checks.
 * Replacement keeps identity/content/layout, and retains referenced old assets. */
export function replaceDesignImage(input: unknown, asset: EmailDesignDocument['assets'][number], url: string, blockId: string, verifiedLibraryUrl = false): EmailDesignDocument {
  const design = validateEmailDesign(input)
  const block = design.blocks[blockId]
  assertLibraryImageReplaceable(design, blockId, verifiedLibraryUrl)
  if (design.moduleInstances.some(instance => subtreeIds(design, instance.rootBlockIds).has(blockId))) throw new EmailDesignError('EDIT_FORBIDDEN', blockId)
  const previous = design.assets.find(a => a.id === asset.id)
  if (previous && stableDesignJson(previous) !== stableDesignJson(asset)) throw new DesignModuleError('ASSET_NOT_READY')
  if (!previous) design.assets.push(asset)
  block.data.props = { ...block.data.props, url }
  return validateEmailDesign(design)
}
export function applyModuleInstance(input: unknown, request: ModuleInstanceRequest, records: ModuleRecord[]): EmailDesignDocument {
  const design = validateEmailDesign(input)
  let instanceId = request.operationId
  let target: { parentId: string, columnIndex?: number, index: number }
  let priorOverrides: Record<string, unknown> = {}
  let oldMapping: Map<string, string> | undefined
  let selectedModuleId = request.command === 'insert-module' ? request.moduleId : undefined
  if (request.command === 'insert-module') target = request
  else {
    instanceId = request.instanceId
    const instance = design.moduleInstances.find(i => i.instanceId === instanceId)
    if (!instance) throw new DesignModuleError('NOT_FOUND')
    if (request.command === 'detach-module-instance') {
      design.moduleInstances = design.moduleInstances.filter(i => i !== instance)
      refreshModuleDependencies(design, records)
      design.source.nativeArtifact = null
      return validateEmailDesign(design)
    }
    if (instance.rootBlockIds.some(id => designStructureLocked(design, id, true))) throw new EmailDesignError('EDIT_FORBIDDEN', 'designerLocks')
    const old = records.find(r => r.moduleId === instance.moduleId && r.revisionId === instance.revisionId)
    if (!old) throw new DesignModuleError('NOT_FOUND')
    if (request.overrides === 'preserve') priorOverrides = moduleLocalOverrides(design, instanceId, old.design)
    oldMapping = mapping(old.design, instanceId)
    const owned = subtreeIds(design, instance.rootBlockIds)
    let found: typeof target | undefined
    for (const [id, block] of Object.entries(design.blocks)) {
      const lists: { list: string[], columnIndex?: number }[] = block.type === 'ColumnsContainer'
        ? ((block.data.props?.columns ?? []) as { childrenIds?: string[] }[]).map((c, columnIndex) => ({ list: c.childrenIds ?? [], columnIndex }))
        : [{ list: block.data.childrenIds ?? [] }]
      for (const { list, columnIndex } of lists) {
        const index = list.indexOf(instance.rootBlockIds[0]!)
        if (index >= 0 && stableDesignJson(list.slice(index, index + instance.rootBlockIds.length)) === stableDesignJson(instance.rootBlockIds)) {
          found = { parentId: id, columnIndex, index }
          list.splice(index, instance.rootBlockIds.length)
        }
      }
    }
    if (!found) throw new DesignModuleError('CLOSED_SELECTION_REQUIRED')
    target = found
    design.blocks = Object.fromEntries(Object.entries(design.blocks).filter(([id]) => !owned.has(id)))
    design.lineage = design.lineage.filter(item => !owned.has(item.blockId))
    design.policy.editableFields = design.policy.editableFields.filter(path => !owned.has(path.split('.')[0]!))
    if (design.policy.designerLocks) {
      design.policy.designerLocks.blockIds = design.policy.designerLocks.blockIds.filter(id => !owned.has(id))
      design.policy.designerLocks.styleFields = design.policy.designerLocks.styleFields.filter(path => !owned.has(path.split('.')[0]!))
    }
    design.moduleInstances = design.moduleInstances.filter(i => i !== instance)
    // The target module identity is derived from persisted provenance.
    selectedModuleId = instance.moduleId
  }
  const revisionId = request.revisionId
  const record = records.find(r => r.moduleId === selectedModuleId && r.revisionId === revisionId)
  if (!record || (record.design.scope.clientId !== null && record.design.scope.clientId !== design.scope.clientId)) throw new DesignModuleError('SCOPE_MISMATCH')
  const module = validateEmailDesign(record.design)
  const ids = mapping(module, instanceId)
  const roots = module.rootChildrenIds.map(id => ids.get(id)!)
  const list = insertionList(design, target.parentId, target.columnIndex)
  if (target.index > list.length) throw new EmailDesignError('INVALID_DESIGN', 'index')
  const reserved = new Set([...Object.keys(design.blocks), ...design.lineage.flatMap(l => [l.nodeId, ...Object.values(l.fields)])])
  const mint = (id: string) => {
    if (reserved.has(id)) throw new EmailDesignError('INVALID_DESIGN', 'collision')
    reserved.add(id)
    return id
  }
  for (const [id, block] of Object.entries(module.blocks)) {
    const next = copy(block)
    if (next.data.childrenIds) next.data.childrenIds = next.data.childrenIds.map(c => ids.get(c)!)
    if (next.type === 'ColumnsContainer') for (const c of next.data.props!.columns as { childrenIds?: string[] }[]) if (c.childrenIds) c.childrenIds = c.childrenIds.map(child => ids.get(child)!)
    design.blocks[mint(ids.get(id)!)] = next
  }
  module.lineage.forEach((item, index) => design.lineage.push({ blockId: ids.get(item.blockId)!, nodeId: mint(`mn_${instanceId}_${index}`), fields: Object.fromEntries(Object.keys(item.fields).map((field, f) => [field, mint(`mf_${instanceId}_${index}_${f}`)])) }))
  design.policy.editableFields.push(...module.policy.editableFields.map(path => remapPath(path, ids)))
  if (module.policy.designerLocks) {
    const locks = design.policy.designerLocks ??= { blockIds: [], styleFields: [] }
    locks.blockIds.push(...module.policy.designerLocks.blockIds.map(id => ids.get(id)!))
    locks.styleFields.push(...module.policy.designerLocks.styleFields.map(path => remapPath(path, ids)))
  }
  const overrides: Record<string, unknown> = {}
  const reverse = new Map([...(oldMapping ?? [])].map(([a, b]) => [b, a]))
  for (const [path, value] of Object.entries(priorOverrides)) {
    const [oldId, ...rest] = path.split('.')
    const sourcePath = [reverse.get(oldId!), ...rest].join('.')
    if (!module.policy.editableFields.includes(sourcePath)) throw new DesignModuleError('OVERRIDE_CONFLICT')
    const nextPath = remapPath(sourcePath, ids)
    if (typeof getPath(design.blocks, nextPath) !== typeof value || value === undefined) throw new DesignModuleError('OVERRIDE_CONFLICT')
    setPath(design.blocks, nextPath, value)
    overrides[nextPath] = value
  }
  list.splice(target.index, 0, ...roots)
  design.moduleInstances.push({ instanceId, moduleId: record.moduleId, revisionId: record.revisionId, rootBlockIds: roots, overrides })
  for (const asset of module.assets) {
    const previous = design.assets.find(a => a.id === asset.id)
    if (previous && stableDesignJson(previous) !== stableDesignJson(asset)) throw new DesignModuleError('ASSET_NOT_READY')
    if (!previous) design.assets.push(asset)
  }
  refreshModuleDependencies(design, records)
  design.source.nativeArtifact = null
  return validateEmailDesign(design)
}
