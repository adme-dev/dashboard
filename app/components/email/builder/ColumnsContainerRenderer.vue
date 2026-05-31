<!-- app/components/email/builder/ColumnsContainerRenderer.vue -->
<!-- Renders a ColumnsContainer (2 or 3 columns) with per-column children + add
     buttons. Ported; dynamic-block + @flyhub block-component paths removed. -->
<template>
  <div class="columns-container" :style="containerStyle">
    <div class="columns-grid" :style="gridStyle">
      <div
        v-for="(column, colIndex) in columns"
        :key="colIndex"
        class="column"
        :style="getColumnStyle()"
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
            <EmailBuilderEdmBlockRenderer
              :type="getBlockType(childId)"
              :style="getBlockData(childId).style"
              :props="getBlockData(childId).props"
            />
          </div>
        </template>

        <div class="column-add-block">
          <UPopover v-model:open="columnPickerOpen[colIndex]" :content="{ side: 'bottom', align: 'center' }">
            <button
              v-show="columnHovered[colIndex] || columnPickerOpen[colIndex]"
              type="button"
              class="add-block-trigger"
            >
              <UIcon name="i-lucide-plus" class="h-4 w-4 pointer-events-none" />
            </button>
            <template #content>
              <div class="grid grid-cols-4 gap-1 p-2 w-64">
                <button
                  v-for="blockType in CHILD_PALETTE"
                  :key="blockType.type"
                  class="block-picker-item"
                  @click="addBlockToColumn(blockType.type, colIndex)"
                >
                  <UIcon :name="blockType.icon" class="h-4 w-4" />
                  <span class="text-[10px]">{{ blockType.name }}</span>
                </button>
              </div>
            </template>
          </UPopover>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import { BLOCK_PALETTE, getDefaultBlockData } from '~~/app/utils/edmBlocks'
import { generateBlockId } from '~~/app/types/edm'

interface ColumnData { childrenIds: string[] }

const props = defineProps<{
  blockId: string
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

const CHILD_PALETTE = BLOCK_PALETTE.filter(
  b => b.type !== 'Container' && b.type !== 'ColumnsContainer'
)

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

function getColumnStyle() {
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
  return store.document.value[blockId]?.data || {}
}

function addBlockToColumn(type: string, columnIndex: number) {
  const newBlockId = generateBlockId()
  const data = getDefaultBlockData(type)
  data.style = { padding: { top: 8, bottom: 8, left: 8, right: 8 } }
  store.addBlockToDocument(newBlockId, type, data)
  store.addBlockToColumn(props.blockId, columnIndex, newBlockId)
  columnPickerOpen[columnIndex] = false
}
</script>

<style scoped>
.columns-container {
  min-height: 80px;
  position: relative;
}

.columns-grid {
  width: 100%;
}

.column {
  background: rgba(59, 130, 246, 0.05);
  border: 1px dashed rgba(59, 130, 246, 0.3);
  border-radius: 4px;
  padding: 8px;
  min-height: 60px;
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

.column-add-block {
  display: flex;
  justify-content: center;
  padding: 8px 0;
  margin-top: auto;
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
