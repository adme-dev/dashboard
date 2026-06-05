<!-- app/components/email/builder/ColumnsContainerRenderer.vue -->
<!-- Renders a ColumnsContainer with per-column children + unified add popovers. -->
<template>
  <div class="columns-container" :style="containerStyle">
    <div class="columns-grid" :style="gridStyle">
      <div
        v-for="(column, colIndex) in columns"
        :key="colIndex"
        class="column"
        :class="{ 'is-empty': isColumnEmpty(colIndex) }"
        :style="getColumnStyle(colIndex)"
        @mouseenter="columnHovered[colIndex] = true"
        @mouseleave="columnHovered[colIndex] = false"
      >
        <template v-if="column.childrenIds && column.childrenIds.length > 0">
          <div
            v-for="childId in column.childrenIds"
            :key="childId"
            class="column-child"
            :class="{ 'is-selected': store.selectedBlockId.value === childId }"
            @click.stop="store.setSelectedBlockId(childId)"
          >
            <div v-if="store.selectedBlockId.value === childId" class="column-child-actions">
              <button
                type="button"
                data-edm-column-child-delete
                class="column-child-action is-danger"
                title="Delete element"
                aria-label="Delete element"
                @click.stop="store.removeBlock(childId)"
              >
                <UIcon name="i-lucide-trash-2" class="h-3.5 w-3.5 pointer-events-none" />
              </button>
            </div>
            <EmailBuilderEdmBlockRenderer
              :type="getBlockType(childId)"
              :style="getBlockData(childId).style"
              :props="getBlockData(childId).props"
              :hidden-on-device="isBlockHiddenOnDevice(childId)"
              :html-editing-enabled="store.selectedBlockId.value === childId"
              editable
              @update:text="(text) => updateChildText(childId, text)"
              @update:props="(propsPatch) => updateChildProps(childId, propsPatch)"
              @update:style="(stylePatch) => updateChildStyle(childId, stylePatch)"
            />
          </div>
        </template>

        <div class="column-add-block" :class="isColumnEmpty(colIndex) ? 'is-empty' : 'is-inline'">
          <UPopover v-model:open="columnPickerOpen[colIndex]" :content="{ side: 'bottom', align: 'center' }">
            <button
              v-show="isColumnEmpty(colIndex) || columnHovered[colIndex] || columnPickerOpen[colIndex]"
              type="button"
              data-edm-nested-add-trigger
              :data-edm-column-index="colIndex"
              class="add-block-trigger"
            >
              <UIcon name="i-lucide-plus" class="h-4 w-4 pointer-events-none" />
            </button>
            <template #content>
              <EmailBuilderEdmAddModuleMenu
                @insert="(preset) => insertPresetInColumn(preset, colIndex)"
                @insert-module="(module) => insertCustomModuleInColumn(module, colIndex)"
                @rename-module="noop"
                @delete-module="noop"
              />
            </template>
          </UPopover>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { buildSectionDocumentFragment } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import { reidFragment } from '~~/app/utils/edmModuleFragment'
import { getBlockForDevice, isHiddenOnDevice, type EdmDevice } from '~~/app/utils/edmResponsive'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

interface ColumnData { childrenIds: string[] }

const props = defineProps<{
  blockId: string
  device?: EdmDevice
  style?: {
    backgroundColor?: string | null
    padding?: { top: number, bottom: number, left: number, right: number } | null
  } | null
  props?: {
    columnsCount?: 2 | 3
    columnsGap?: number
    contentAlignment?: 'top' | 'middle' | 'bottom'
    columns?: ColumnData[]
    fixedWidths?: (number | null)[]
  } | null
}>()

const store = useEdmBuilder()
const columnHovered = reactive<boolean[]>([false, false, false])
const columnPickerOpen = reactive<boolean[]>([false, false, false])

const columnsCount = computed(() => props.props?.columnsCount || 2)

const columns = computed(() => {
  const cols = props.props?.columns || []
  const count = columnsCount.value
  const result: ColumnData[] = []
  for (let i = 0; i < count; i++) {
    result.push(cols[i] || { childrenIds: [] })
  }
  return result
})

const containerStyle = computed(() => {
  const style = props.style || {}
  return {
    backgroundColor: style.backgroundColor || 'transparent',
    paddingTop: `${style.padding?.top ?? 16}px`,
    paddingBottom: `${style.padding?.bottom ?? 16}px`,
    paddingLeft: `${style.padding?.left ?? 24}px`,
    paddingRight: `${style.padding?.right ?? 24}px`
  }
})

const gridStyle = computed(() => {
  const count = columnsCount.value
  const gap = props.props?.columnsGap ?? 16
  const fixedWidths = props.props?.fixedWidths || []
  const columnWidths: string[] = []
  for (let i = 0; i < count; i++) {
    columnWidths.push(fixedWidths[i] ? `${fixedWidths[i]}px` : '1fr')
  }
  return {
    display: 'grid',
    gridTemplateColumns: columnWidths.join(' '),
    gap: `${gap}px`
  }
})

function getColumnStyle(columnIndex: number) {
  if (isColumnEmpty(columnIndex)) {
    return {
      display: 'flex',
      flexDirection: 'column' as const,
      alignItems: 'stretch',
      justifyContent: 'center',
      minHeight: '60px'
    }
  }

  const alignment = props.props?.contentAlignment || 'top'
  let alignItems = 'flex-start'
  if (alignment === 'middle') alignItems = 'center'
  if (alignment === 'bottom') alignItems = 'flex-end'
  return {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems,
    minHeight: '60px'
  }
}

function getBlockType(blockId: string): string {
  return store.document.value[blockId]?.type || 'Html'
}

function getBlockData(blockId: string): Record<string, unknown> {
  const block = store.document.value[blockId]
  return block ? getBlockForDevice(block, props.device || 'desktop').data : {}
}

function isBlockHiddenOnDevice(blockId: string): boolean {
  const block = store.document.value[blockId]
  return block ? isHiddenOnDevice(block, props.device || 'desktop') : false
}

function isColumnEmpty(columnIndex: number): boolean {
  return !columns.value[columnIndex]?.childrenIds?.length
}

function insertPresetInColumn(preset: EdmSectionPreset, columnIndex: number) {
  const fragment = buildSectionDocumentFragment(preset.id)
  store.insertBlocksToColumn(props.blockId, columnIndex, fragment.blocks, fragment.rootChildrenIds)
  columnPickerOpen[columnIndex] = false
}

function insertCustomModuleInColumn(module: EdmCustomModule, columnIndex: number) {
  const fragment = reidFragment(module.blocks)
  store.insertBlocksToColumn(props.blockId, columnIndex, fragment.blocks, fragment.rootChildrenIds)
  columnPickerOpen[columnIndex] = false
}

function noop() {}

function updateChildText(blockId: string, text: string) {
  if ((props.device || 'desktop') === 'mobile') {
    store.updateBlockMobileProps(blockId, { text })
    return
  }
  store.updateBlockProps(blockId, { text })
}

function updateChildProps(blockId: string, propsPatch: Record<string, unknown>) {
  if ((props.device || 'desktop') === 'mobile') {
    store.updateBlockMobileProps(blockId, propsPatch)
    return
  }
  store.updateBlockProps(blockId, propsPatch)
}

function updateChildStyle(blockId: string, stylePatch: Record<string, unknown>) {
  if ((props.device || 'desktop') === 'mobile') {
    store.updateBlockMobileStyle(blockId, stylePatch)
    return
  }
  store.updateBlockStyle(blockId, stylePatch)
}
</script>

<style scoped>
.columns-container {
  min-height: 60px;
  position: relative;
}

.columns-grid {
  width: 100%;
}

.column {
  position: relative;
  background: rgba(59, 130, 246, 0.05);
  border: 1px dashed rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  padding: 8px;
  min-height: 60px;
}

.column.is-empty {
  background: rgba(59, 130, 246, 0.04);
  border-color: rgba(59, 130, 246, 0.28);
}

.column-child {
  position: relative;
  transition: outline 0.15s ease;
  width: 100%;
}

.column-child:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

.column-child.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.column-child-actions {
  position: absolute;
  top: -14px;
  right: -12px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px;
  border-radius: 999px;
  background: rgb(17, 24, 39);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.18);
  z-index: 12;
}

.column-child-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 999px;
  color: rgb(203, 213, 225);
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.column-child-action:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.column-child-action.is-danger {
  color: rgb(248, 113, 113);
}

.column-child-action.is-danger:hover {
  background: rgba(248, 113, 113, 0.14);
  color: rgb(254, 202, 202);
}

.column-add-block {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.column-add-block.is-inline {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -11px;
  height: 22px;
  padding: 0;
  margin: 0;
  pointer-events: none;
  z-index: 8;
}

.column-add-block.is-empty {
  flex: 0 0 auto;
  min-height: 44px;
  padding: 0;
  margin-top: 0;
}

.add-block-trigger {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background-color: rgb(59, 130, 246);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(37, 99, 235, 0.18);
}

.column-add-block.is-inline .add-block-trigger {
  width: 22px;
  height: 22px;
  border: 2px solid white;
  box-shadow: 0 4px 10px rgba(37, 99, 235, 0.24);
  pointer-events: auto;
}

.add-block-trigger:hover {
  background-color: rgb(37, 99, 235);
  transform: scale(1.1);
}

.block-picker-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: background-color 0.15s ease;
  min-width: 56px;
}

.block-picker-item:hover {
  background-color: var(--ui-bg-muted);
}
</style>
