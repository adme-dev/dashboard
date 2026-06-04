/**
 * EDM Email Builder Store (FlyHub Integration)
 *
 * Pinia store for managing the FlyHub email builder document state.
 * Based on the FlyHub editor-sample pattern but adapted for our EDM system.
 */

import { ref, computed } from 'vue'
import { createEmptyDocument, generateBlockId } from '~~/app/types/edm'
import type { EdmFlyhubBlock } from '~~/app/types/edm'
import {
  buildSectionDocumentFragment,
  buildStarterTemplateDocument
} from '~~/app/utils/edmPresets'
import type {
  EdmBlockBase,
  EdmFlyhubDocument,
  EdmEmailLayoutSettings,
  SidebarTab,
  MainTab,
  ScreenSize,
  EditorSnapshot
} from '~~/app/types/edm'

const HISTORY_LIMIT = 50

// The editor is client-only (/agency/** is ssr:false), so a single module-scoped
// instance is a safe singleton — no SSR cross-request state bleed. createStore()
// holds all state + actions; useEdmBuilder() returns the one cached instance.
function createStore() {
  // Core document state
  const document = ref<EdmFlyhubDocument>(createEmptyDocument())

  // UI state
  const selectedBlockId = ref<string | null>(null)
  const selectedSidebarTab = ref<SidebarTab>('styles')
  const selectedMainTab = ref<MainTab>('editor')
  const selectedScreenSize = ref<ScreenSize>('desktop')
  const inspectorDrawerOpen = ref(false)

  // Dynamic blocks are managed separately (our custom feature)
  const dynamicBlocks = ref<EdmBlockBase[]>([])
  const selectedDynamicBlock = ref<EdmBlockBase | null>(null)

  // Mapping from Html placeholder block IDs to dynamic block IDs
  // This allows us to detect when a placeholder is selected and show the right config
  const dynamicBlockMapping = ref<Map<string, string>>(new Map())

  // Undo/redo history stacks
  const past = ref<EditorSnapshot[]>([])
  const future = ref<EditorSnapshot[]>([])

  // Batching flag — prevents composite functions from recording multiple snapshots
  let _isRecording = false

  // Constants
  const INSPECTOR_DRAWER_WIDTH = 335

  // ========================================
  // Undo/Redo History
  // ========================================

  function takeSnapshot(): EditorSnapshot {
    return JSON.parse(
      JSON.stringify({
        document: document.value,
        dynamicBlocks: dynamicBlocks.value,
        dynamicBlockMapping: Object.fromEntries(dynamicBlockMapping.value)
      })
    )
  }

  function restoreSnapshot(snapshot: EditorSnapshot) {
    document.value = snapshot.document
    dynamicBlocks.value = snapshot.dynamicBlocks
    dynamicBlockMapping.value = new Map(Object.entries(snapshot.dynamicBlockMapping))
  }

  function recordHistory() {
    if (_isRecording) return
    _isRecording = true
    past.value = [...past.value.slice(-(HISTORY_LIMIT - 1)), takeSnapshot()]
    future.value = []
    queueMicrotask(() => {
      _isRecording = false
    })
  }

  function undo() {
    if (past.value.length === 0) return
    const snapshot = past.value[past.value.length - 1]
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, takeSnapshot()]
    restoreSnapshot(snapshot)
  }

  function redo() {
    if (future.value.length === 0) return
    const snapshot = future.value[future.value.length - 1]
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, takeSnapshot()]
    restoreSnapshot(snapshot)
  }

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  // ========================================
  // Block Selection
  // ========================================

  function setSelectedBlockId(blockId: string | null) {
    const tab = blockId === null ? 'styles' : 'block-configuration'

    if (blockId !== null) {
      inspectorDrawerOpen.value = true
    }

    selectedBlockId.value = blockId
    selectedSidebarTab.value = tab
  }

  function clearSelection() {
    selectedBlockId.value = null
    selectedSidebarTab.value = 'styles'
  }

  // ========================================
  // Document Management
  // ========================================

  function setDocument(newDocument: EdmFlyhubDocument) {
    past.value = []
    future.value = []
    document.value = {
      ...document.value,
      ...newDocument
    }

    // Restore dynamic blocks from persisted config in Html blocks (if not already loaded)
    for (const [blockId, block] of Object.entries(newDocument)) {
      if (block.type === 'Html') {
        const persistedConfig = block.data?.props?.dynamicBlockConfig as EdmBlockBase | undefined
        if (persistedConfig && !dynamicBlockMapping.value.has(blockId)) {
          // Add to dynamic blocks array if not already present
          const existingIndex = dynamicBlocks.value.findIndex(db => db.id === persistedConfig.id)
          if (existingIndex === -1) {
            dynamicBlocks.value.push(persistedConfig)
          }
          // Add mapping
          dynamicBlockMapping.value.set(blockId, persistedConfig.id)
        }
      }
    }
  }

  function resetDocument(newDocument?: EdmFlyhubDocument) {
    document.value = newDocument || createEmptyDocument()
    past.value = []
    future.value = []
    selectedSidebarTab.value = 'styles'
    selectedBlockId.value = null
    dynamicBlocks.value = []
    selectedDynamicBlock.value = null
    dynamicBlockMapping.value.clear()

    // Restore dynamic blocks from persisted config in Html blocks
    if (newDocument) {
      for (const [blockId, block] of Object.entries(newDocument)) {
        if (block.type === 'Html') {
          const persistedConfig = block.data?.props?.dynamicBlockConfig as EdmBlockBase | undefined
          if (persistedConfig) {
            // Add to dynamic blocks array
            dynamicBlocks.value.push(persistedConfig)
            // Add mapping
            dynamicBlockMapping.value.set(blockId, persistedConfig.id)
          }
        }
      }
    }
  }

  function getBlock(blockId: string): EdmFlyhubBlock | undefined {
    return document.value[blockId]
  }

  function updateBlock(blockId: string, updates: Partial<EdmFlyhubBlock>) {
    recordHistory()
    const block = document.value[blockId]
    if (block) {
      document.value = {
        ...document.value,
        [blockId]: {
          ...block,
          ...updates,
          data: {
            ...block.data,
            ...(updates.data || {})
          }
        }
      }
    }
  }

  function updateBlockData(blockId: string, dataUpdates: Partial<EdmFlyhubBlock['data']>) {
    recordHistory()
    const block = document.value[blockId]
    if (block) {
      document.value = {
        ...document.value,
        [blockId]: {
          ...block,
          data: {
            ...block.data,
            ...dataUpdates
          }
        }
      }
    }
  }

  function updateBlockStyle(
    blockId: string,
    styleUpdates: Partial<NonNullable<EdmFlyhubBlock['data']['style']>>
  ) {
    recordHistory()
    const block = document.value[blockId]
    if (block) {
      document.value = {
        ...document.value,
        [blockId]: {
          ...block,
          data: {
            ...block.data,
            style: {
              ...(block.data.style || {}),
              ...styleUpdates
            }
          }
        }
      }
    }
  }

  function updateBlockProps(blockId: string, propsUpdates: Record<string, unknown>) {
    recordHistory()
    const block = document.value[blockId]
    if (block) {
      document.value = {
        ...document.value,
        [blockId]: {
          ...block,
          data: {
            ...block.data,
            props: {
              ...(block.data.props || {}),
              ...propsUpdates
            }
          }
        }
      }
    }
  }

  // ========================================
  // Block CRUD Operations
  // ========================================

  function addBlock(
    blockType: string,
    parentId: string = 'root',
    position?: number,
    initialData?: Partial<EdmFlyhubBlock['data']>
  ): string {
    recordHistory()
    const blockId = generateBlockId()
    const parent = document.value[parentId]

    if (!parent) {
      console.error(`Parent block ${parentId} not found`)
      return ''
    }

    // Create the new block
    const newBlock: EdmFlyhubBlock = {
      type: blockType,
      data: {
        style: {
          padding: { top: 16, bottom: 16, left: 24, right: 24 }
        },
        props: {},
        ...initialData
      }
    }

    // Add block to document
    document.value = {
      ...document.value,
      [blockId]: newBlock
    }

    // Add block ID to parent's children
    const childrenIds = [...(parent.data.childrenIds || [])]
    if (position !== undefined && position >= 0 && position < childrenIds.length) {
      childrenIds.splice(position, 0, blockId)
    } else {
      childrenIds.push(blockId)
    }

    updateBlockData(parentId, { childrenIds })

    return blockId
  }

  function insertBlocks(
    blocks: Record<string, EdmFlyhubBlock>,
    blockIds: string[],
    parentId: string = 'root',
    position?: number
  ) {
    recordHistory()
    const parent = document.value[parentId]
    if (!parent) return

    const childrenIds = [...(parent.data.childrenIds || [])]
    const insertAt = position === undefined
      ? childrenIds.length
      : Math.max(0, Math.min(position, childrenIds.length))

    childrenIds.splice(insertAt, 0, ...blockIds)

    document.value = {
      ...document.value,
      ...blocks,
      [parentId]: {
        ...parent,
        data: {
          ...parent.data,
          childrenIds
        }
      }
    }
  }

  function insertSectionPreset(sectionPresetId: string, position?: number) {
    const fragment = buildSectionDocumentFragment(sectionPresetId)
    insertBlocks(fragment.blocks, fragment.rootChildrenIds, 'root', position)
  }

  function setTemplatePreset(starterTemplateId: string) {
    resetDocument(buildStarterTemplateDocument(starterTemplateId))
  }

  function removeBlock(blockId: string) {
    recordHistory()
    if (blockId === 'root') {
      console.error('Cannot remove root block')
      return
    }

    const block = document.value[blockId]
    if (!block) return

    // Find parent and remove from children
    for (const [id, b] of Object.entries(document.value)) {
      if (b.data.childrenIds?.includes(blockId)) {
        updateBlockData(id, {
          childrenIds: b.data.childrenIds.filter(cid => cid !== blockId)
        })
        break
      }
    }

    // Remove the block itself by creating a new object without the key
    const { [blockId]: _removed, ...remaining } = document.value
    document.value = remaining

    // Clear selection if this block was selected
    if (selectedBlockId.value === blockId) {
      clearSelection()
    }
  }

  function moveBlock(blockId: string, newParentId: string, newPosition: number) {
    recordHistory()
    if (blockId === 'root') return

    const block = document.value[blockId]
    if (!block) return

    // Find current parent and remove
    for (const [id, b] of Object.entries(document.value)) {
      if (b.data.childrenIds?.includes(blockId)) {
        updateBlockData(id, {
          childrenIds: b.data.childrenIds.filter(cid => cid !== blockId)
        })
        break
      }
    }

    // Add to new parent
    const newParent = document.value[newParentId]
    if (!newParent) return

    const childrenIds = [...(newParent.data.childrenIds || [])]
    if (newPosition >= 0 && newPosition <= childrenIds.length) {
      childrenIds.splice(newPosition, 0, blockId)
    } else {
      childrenIds.push(blockId)
    }

    updateBlockData(newParentId, { childrenIds })
  }

  function duplicateBlock(blockId: string): string | null {
    recordHistory()
    if (blockId === 'root') return null

    const block = document.value[blockId]
    if (!block) return null

    // Find parent
    let parentId: string | null = null
    let position = 0

    for (const [id, b] of Object.entries(document.value)) {
      const idx = b.data.childrenIds?.indexOf(blockId)
      if (idx !== undefined && idx >= 0) {
        parentId = id
        position = idx + 1
        break
      }
    }

    if (!parentId) return null

    // Create duplicate with new ID
    const newBlockId = addBlock(block.type, parentId, position, {
      style: block.data.style ? { ...block.data.style } : undefined,
      props: block.data.props ? { ...block.data.props } : undefined
    })

    return newBlockId
  }

  // Add a block directly to the document without adding to any parent's childrenIds
  // Used for adding blocks to ColumnsContainer columns
  function addBlockToDocument(
    blockId: string,
    blockType: string,
    initialData?: Partial<EdmFlyhubBlock['data']>
  ) {
    recordHistory()
    const newBlock: EdmFlyhubBlock = {
      type: blockType,
      data: {
        style: {
          padding: { top: 8, bottom: 8, left: 8, right: 8 }
        },
        props: {},
        ...initialData
      }
    }

    document.value = {
      ...document.value,
      [blockId]: newBlock
    }
  }

  // Add a block to a specific column in a ColumnsContainer
  function addBlockToColumn(columnsContainerId: string, columnIndex: number, blockId: string) {
    recordHistory()
    const container = document.value[columnsContainerId]
    if (!container) {
      console.error(`ColumnsContainer ${columnsContainerId} not found`)
      return
    }

    const props = container.data.props || {}
    const columns = (props.columns as Array<{ childrenIds: string[] }>) || [
      { childrenIds: [] },
      { childrenIds: [] },
      { childrenIds: [] }
    ]

    // Ensure the column exists
    if (!columns[columnIndex]) {
      columns[columnIndex] = { childrenIds: [] }
    }

    // Add the block to the column
    columns[columnIndex].childrenIds = [...columns[columnIndex].childrenIds, blockId]

    updateBlockProps(columnsContainerId, { columns })
  }

  // ========================================
  // Dynamic Blocks Management
  // ========================================

  function addDynamicBlock(block: EdmBlockBase) {
    recordHistory()
    dynamicBlocks.value = [...dynamicBlocks.value, block]
  }

  // Add a mapping from an Html placeholder block to a dynamic block
  function addDynamicBlockMapping(htmlBlockId: string, dynamicBlockId: string) {
    recordHistory()
    dynamicBlockMapping.value.set(htmlBlockId, dynamicBlockId)
  }

  // Get the dynamic block ID for an Html placeholder, or null if not a placeholder
  function getDynamicBlockIdForHtml(htmlBlockId: string): string | null {
    return dynamicBlockMapping.value.get(htmlBlockId) || null
  }

  // Get a dynamic block by its ID
  function getDynamicBlockById(dynamicBlockId: string): EdmBlockBase | null {
    return dynamicBlocks.value.find(b => b.id === dynamicBlockId) || null
  }

  function updateDynamicBlock(updatedBlock: EdmBlockBase) {
    recordHistory()
    const index = dynamicBlocks.value.findIndex(b => b.id === updatedBlock.id)
    if (index !== -1) {
      const newBlocks = [...dynamicBlocks.value]
      newBlocks[index] = updatedBlock
      dynamicBlocks.value = newBlocks
    }
  }

  function removeDynamicBlock(blockId: string) {
    recordHistory()
    dynamicBlocks.value = dynamicBlocks.value.filter(b => b.id !== blockId)
    if (selectedDynamicBlock.value?.id === blockId) {
      selectedDynamicBlock.value = null
    }
    // Clean up the mapping - find and remove any entries pointing to this dynamic block
    for (const [htmlId, dynId] of dynamicBlockMapping.value.entries()) {
      if (dynId === blockId) {
        dynamicBlockMapping.value.delete(htmlId)
        break
      }
    }
  }

  function selectDynamicBlock(block: EdmBlockBase | null) {
    selectedDynamicBlock.value = block
  }

  function setDynamicBlocks(blocks: EdmBlockBase[]) {
    recordHistory()
    dynamicBlocks.value = blocks
  }

  // ========================================
  // Layout Settings
  // ========================================

  function getLayoutSettings(): EdmEmailLayoutSettings {
    const root = document.value.root
    const props = (root?.data?.props || {}) as Record<string, unknown>

    return {
      backdropColor: (props.backdropColor as string) || '#F5F5F5',
      canvasColor: (props.canvasColor as string) || '#FFFFFF',
      textColor: (props.textColor as string) || '#262626',
      fontFamily: (props.fontFamily as string) || 'MODERN_SANS',
      borderColor: props.borderColor as string | undefined,
      borderRadius: props.borderRadius as number | undefined
    }
  }

  function updateLayoutSettings(settings: Partial<EdmEmailLayoutSettings>) {
    recordHistory()
    updateBlockProps('root', settings)
  }

  // ========================================
  // Export
  // ========================================

  return {
    // State
    document,
    selectedBlockId,
    selectedSidebarTab,
    selectedMainTab,
    selectedScreenSize,
    inspectorDrawerOpen,
    dynamicBlocks,
    selectedDynamicBlock,
    INSPECTOR_DRAWER_WIDTH,

    // Block Selection
    setSelectedBlockId,
    clearSelection,

    // Document Management
    setDocument,
    resetDocument,
    getBlock,
    updateBlock,
    updateBlockData,
    updateBlockStyle,
    updateBlockProps,

    // Block CRUD
    addBlock,
    insertBlocks,
    insertSectionPreset,
    setTemplatePreset,
    removeBlock,
    moveBlock,
    duplicateBlock,
    addBlockToDocument,
    addBlockToColumn,

    // Dynamic Blocks
    addDynamicBlock,
    addDynamicBlockMapping,
    getDynamicBlockIdForHtml,
    getDynamicBlockById,
    updateDynamicBlock,
    removeDynamicBlock,
    selectDynamicBlock,
    setDynamicBlocks,
    dynamicBlockMapping,

    // Layout Settings
    getLayoutSettings,
    updateLayoutSettings,

    // Undo/Redo
    past,
    future,
    canUndo,
    canRedo,
    undo,
    redo
  }
}

let _instance: ReturnType<typeof createStore> | null = null

export function useEdmBuilder() {
  if (!_instance) _instance = createStore()
  return _instance
}
