// app/utils/edmModuleFragment.ts
// Pure helpers for EDM custom modules (enterprise Phase 2).
//
//  • extractFragment — given the editor document and a block id, collect that
//    block and all of its descendants (via data.childrenIds AND
//    data.props.columns[].childrenIds for ColumnsContainer) into a standalone,
//    deep-cloned document fragment rooted at the block. Used when SAVING a
//    selected section as a reusable module.
//  • reidFragment   — remap every block id in a fragment to a fresh id,
//    rewriting all internal references (childrenIds + column childrenIds +
//    rootChildrenIds). Used when INSERTING a saved module so its ids never
//    collide with blocks already in the document.
//
// Both are framework-free and fully unit-tested. Children are referenced the
// same way the store walks them (see useEdmBuilder.addBlockToColumn / insertBlocks).

import type { EdmFlyhubBlock, EdmFlyhubDocument } from '~~/app/types/edm'
import { generateBlockId } from '~~/app/types/edm'
import type { EdmDocumentFragment, EdmPresetBlockTemplate } from '~~/app/utils/edmPresets'

interface ColumnSlot { childrenIds?: string[] }

// All child ids a block references, across both container shapes.
function childIdsOf(block: EdmFlyhubBlock): string[] {
  const ids: string[] = []
  if (Array.isArray(block.data.childrenIds)) ids.push(...block.data.childrenIds)
  const columns = block.data.props?.columns as ColumnSlot[] | undefined
  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (Array.isArray(col?.childrenIds)) ids.push(...col.childrenIds)
    }
  }
  return ids
}

// Rewrite a block's child-reference arrays (childrenIds + columns childrenIds)
// in place via `fn`. `fn` returns the replacement id, or null to drop the ref.
// Mutates the passed block (callers pass a clone).
function rewriteChildRefs(block: EdmFlyhubBlock, fn: (id: string) => string | null): void {
  if (Array.isArray(block.data.childrenIds)) {
    block.data.childrenIds = block.data.childrenIds
      .map(fn)
      .filter((id): id is string => id !== null)
  }
  const columns = block.data.props?.columns as ColumnSlot[] | undefined
  if (Array.isArray(columns)) {
    for (const col of columns) {
      if (Array.isArray(col?.childrenIds)) {
        col.childrenIds = col.childrenIds
          .map(fn)
          .filter((id): id is string => id !== null)
      }
    }
  }
}

/**
 * Collect `rootBlockId` and its full descendant subtree into a deep-cloned
 * fragment. Throws on the layout root or a missing block.
 */
export function extractFragment(document: EdmFlyhubDocument, rootBlockId: string): EdmDocumentFragment {
  if (rootBlockId === 'root') {
    throw new Error('edm_module_extract: cannot save the email layout root as a module')
  }
  const start = document[rootBlockId]
  if (!start) {
    throw new Error(`edm_module_extract: block not found: ${rootBlockId}`)
  }

  const blocks: Record<string, EdmFlyhubBlock> = {}
  const stack = [rootBlockId]
  while (stack.length) {
    const id = stack.pop() as string
    if (blocks[id]) continue // guard against accidental cycles
    const block = document[id]
    if (!block) continue // skip dangling references defensively
    blocks[id] = structuredClone(block)
    stack.push(...childIdsOf(block))
  }

  // Closure pass: strip any child reference that didn't resolve to a collected
  // block, so the persisted fragment is internally closed (no dangling refs that
  // could leak an original id on insert — see reidFragment).
  for (const block of Object.values(blocks)) {
    rewriteChildRefs(block, id => (blocks[id] ? id : null))
  }

  return { blocks, rootChildrenIds: [rootBlockId] }
}

/**
 * Remap all ids in a fragment to fresh ids, rewriting every internal reference.
 * `genId` is injectable for deterministic tests; defaults to generateBlockId.
 */
export function reidFragment(
  fragment: EdmDocumentFragment,
  genId: () => string = generateBlockId
): EdmDocumentFragment {
  // Assign a fresh, unique id to every block. Guard against id-generator
  // collisions (generateBlockId is time+random; a tight loop shares Date.now()).
  const idMap = new Map<string, string>()
  const used = new Set<string>()
  for (const oldId of Object.keys(fragment.blocks)) {
    let next = genId()
    while (used.has(next)) next = genId()
    used.add(next)
    idMap.set(oldId, next)
  }
  // Only remap ids we actually minted; an unmapped (dangling) ref is dropped
  // rather than passed through as its original id (which could collide with a
  // block already in the target document).
  const remap = (id: string): string | null => idMap.get(id) ?? null

  const blocks: Record<string, EdmFlyhubBlock> = {}
  for (const [oldId, block] of Object.entries(fragment.blocks)) {
    const clone = structuredClone(block)
    rewriteChildRefs(clone, remap)
    blocks[idMap.get(oldId) as string] = clone
  }

  return {
    blocks,
    rootChildrenIds: fragment.rootChildrenIds
      .map(remap)
      .filter((id): id is string => id !== null)
  }
}

/**
 * The fragment's top-level blocks as preset block templates ({ type, data }).
 * Used to render a saved module's thumbnail through EdmSectionThumbnail, which
 * renders each top-level block standalone (rich sections are single Html blocks).
 */
export function fragmentTopLevelTemplates(fragment: EdmDocumentFragment): EdmPresetBlockTemplate[] {
  return fragment.rootChildrenIds
    .map(id => fragment.blocks[id])
    .filter((b): b is EdmFlyhubBlock => Boolean(b))
    .map(b => ({ type: b.type, data: b.data }))
}
