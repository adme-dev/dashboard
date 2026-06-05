<!-- app/components/email/builder/EditorBlockWrapper.vue -->
<!-- Wraps a top-level canvas block: hover/selection outline, move/save/duplicate/delete
     actions, and insert-above/below "+" popovers. Ported + Nuxt UI re-skin;
     dynamic-block paths removed. -->
<template>
  <div
    :class="[
      'editor-block-wrapper',
      {
        'is-selected': isSelected,
        'is-hovered': isHovered,
        'is-drag-source': isDragSource,
        'is-drop-before': dropPlacement === 'before',
        'is-drop-after': dropPlacement === 'after'
      }
    ]"
    @mouseenter.stop="isHovered = true"
    @mouseleave="onLeave"
    @click.stop="handleClick"
    @dragover.stop="handleDragOver"
    @dragleave.stop="emit('drag-leave')"
    @drop.stop="handleDrop"
  >
    <!-- Insert Above Zone -->
    <div
      class="insert-zone insert-above"
      @mouseenter="showInsertAbove = true"
      @mouseleave="showInsertAbove = false"
    >
      <UPopover v-model:open="insertAboveOpen" :content="{ side: 'top', align: 'center' }">
        <button
          v-show="(isHovered && showInsertAbove) || insertAboveOpen"
          type="button"
          class="insert-button"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3 pointer-events-none" />
        </button>
        <template #content>
          <EmailBuilderEdmAddModuleMenu
            @insert="insertPresetAbove"
            @insert-module="insertCustomModuleAbove"
            @rename-module="renameModule"
            @delete-module="deleteModule"
          />
        </template>
      </UPopover>
    </div>

    <!-- Block Actions (shows on selection) -->
    <div v-if="isSelected" class="block-actions">
      <UButton
        data-edm-drag-handle
        icon="i-lucide-grip-vertical"
        variant="ghost"
        color="neutral"
        size="xs"
        class="drag-handle"
        title="Drag to reorder"
        draggable="true"
        @click.stop
        @dragstart.stop="handleDragStart"
        @dragend.stop="handleDragEnd"
      />
      <UButton
        icon="i-lucide-chevron-up"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Move up"
        @click.stop="emit('move-up')"
      />
      <UButton
        icon="i-lucide-chevron-down"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Move down"
        @click.stop="emit('move-down')"
      />
      <UButton
        icon="i-lucide-copy"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Duplicate"
        @click.stop="emit('duplicate')"
      />
      <UButton
        icon="i-lucide-bookmark-plus"
        variant="ghost"
        color="neutral"
        size="xs"
        title="Save module"
        @click.stop="emit('save')"
      />
      <UButton
        icon="i-lucide-trash-2"
        variant="ghost"
        color="error"
        size="xs"
        title="Delete"
        @click.stop="emit('delete')"
      />
    </div>

    <div
      v-if="dropPlacement === 'before'"
      class="drop-indicator drop-indicator-before"
      aria-hidden="true"
    />

    <!-- Block Content -->
    <slot />

    <div
      v-if="dropPlacement === 'after'"
      class="drop-indicator drop-indicator-after"
      aria-hidden="true"
    />

    <!-- Insert Below Zone -->
    <div
      class="insert-zone insert-below"
      @mouseenter="showInsertBelow = true"
      @mouseleave="showInsertBelow = false"
    >
      <UPopover v-model:open="insertBelowOpen" :content="{ side: 'bottom', align: 'center' }">
        <button
          v-show="(isHovered && showInsertBelow) || insertBelowOpen"
          type="button"
          class="insert-button"
        >
          <UIcon name="i-lucide-plus" class="h-3 w-3 pointer-events-none" />
        </button>
        <template #content>
          <EmailBuilderEdmAddModuleMenu
            @insert="insertPresetBelow"
            @insert-module="insertCustomModuleBelow"
            @rename-module="renameModule"
            @delete-module="deleteModule"
          />
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { EdmRootDropPlacement } from '~~/app/utils/edmDragReorder'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

const props = withDefaults(defineProps<{
  blockId: string
  isDragSource?: boolean
  dropPlacement?: EdmRootDropPlacement | null
}>(), {
  isDragSource: false,
  dropPlacement: null
})

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  'duplicate': []
  'save': []
  'delete': []
  'insert-preset-above': [preset: EdmSectionPreset]
  'insert-preset-below': [preset: EdmSectionPreset]
  'insert-module-above': [module: EdmCustomModule]
  'insert-module-below': [module: EdmCustomModule]
  'rename-module': [module: EdmCustomModule]
  'delete-module': [module: EdmCustomModule]
  'drag-start': []
  'drag-over': [placement: EdmRootDropPlacement]
  'drag-leave': []
  'drop': [placement: EdmRootDropPlacement]
  'drag-end': []
}>()

const store = useEdmBuilder()
const isHovered = ref(false)
const showInsertAbove = ref(false)
const showInsertBelow = ref(false)
const insertAboveOpen = ref(false)
const insertBelowOpen = ref(false)

const isSelected = computed(() => store.selectedBlockId.value === props.blockId)

function onLeave() {
  isHovered.value = false
  showInsertAbove.value = false
  showInsertBelow.value = false
}

function handleClick() {
  store.setSelectedBlockId(props.blockId)
}

function insertPresetAbove(preset: EdmSectionPreset) {
  emit('insert-preset-above', preset)
  insertAboveOpen.value = false
}

function insertPresetBelow(preset: EdmSectionPreset) {
  emit('insert-preset-below', preset)
  insertBelowOpen.value = false
}

function insertCustomModuleAbove(module: EdmCustomModule) {
  emit('insert-module-above', module)
  insertAboveOpen.value = false
}

function insertCustomModuleBelow(module: EdmCustomModule) {
  emit('insert-module-below', module)
  insertBelowOpen.value = false
}

function renameModule(module: EdmCustomModule) {
  emit('rename-module', module)
}

function deleteModule(module: EdmCustomModule) {
  emit('delete-module', module)
}

function getDropPlacement(event: DragEvent): EdmRootDropPlacement {
  const el = event.currentTarget as HTMLElement | null
  if (!el) return 'after'
  const rect = el.getBoundingClientRect()
  return event.clientY < rect.top + rect.height / 2 ? 'before' : 'after'
}

function handleDragStart(event: DragEvent) {
  event.dataTransfer?.setData('text/plain', props.blockId)
  event.dataTransfer?.setData('application/x-edm-root-block-id', props.blockId)
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
  }
  emit('drag-start')
}

function handleDragOver(event: DragEvent) {
  event.preventDefault()
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
  emit('drag-over', getDropPlacement(event))
}

function handleDrop(event: DragEvent) {
  event.preventDefault()
  emit('drop', getDropPlacement(event))
}

function handleDragEnd() {
  emit('drag-end')
}
</script>

<style scoped>
.editor-block-wrapper {
  position: relative;
  transition: all 0.15s ease;
}

.editor-block-wrapper.is-hovered {
  outline: 2px solid rgba(59, 130, 246, 0.3);
  outline-offset: 2px;
}

.editor-block-wrapper.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.block-actions {
  position: absolute;
  top: 0;
  left: -48px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  z-index: 10;
  background-color: var(--ui-bg);
}

.drag-handle {
  cursor: grab;
}

.drag-handle:active {
  cursor: grabbing;
}

.editor-block-wrapper.is-drag-source {
  opacity: 0.55;
}

.drop-indicator {
  position: absolute;
  left: -8px;
  right: -8px;
  height: 3px;
  border-radius: 9999px;
  background-color: rgb(59, 130, 246);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.16);
  pointer-events: none;
  z-index: 12;
}

.drop-indicator-before {
  top: -8px;
}

.drop-indicator-after {
  bottom: -8px;
}

.insert-zone {
  position: absolute;
  left: 0;
  right: 0;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
}

.insert-zone :deep(> *) {
  display: flex;
  justify-content: center;
  width: 100%;
}

.insert-above {
  top: -10px;
}

.insert-below {
  bottom: -10px;
}

.insert-button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: rgb(59, 130, 246);
  color: white;
  border: 2px solid white;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
}

.insert-button:hover {
  background-color: rgb(37, 99, 235);
  transform: scale(1.15);
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
