<!-- app/components/email/builder/EditorBlockWrapper.vue -->
<!-- Wraps a top-level canvas block: hover/selection outline, move/duplicate/delete
     actions, and insert-above/below "+" popovers. Ported + Nuxt UI re-skin;
     dynamic-block paths removed. -->
<template>
  <div
    :class="['editor-block-wrapper', { 'is-selected': isSelected, 'is-hovered': isHovered }]"
    @mouseenter.stop="isHovered = true"
    @mouseleave="onLeave"
    @click.stop="handleClick"
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
          <div class="grid grid-cols-4 gap-1 p-2">
            <button
              v-for="blockType in BLOCK_PALETTE"
              :key="blockType.type"
              class="block-picker-item"
              @click="insertBlockAbove(blockType.type)"
            >
              <UIcon :name="blockType.icon" class="h-4 w-4" />
              <span class="text-[10px]">{{ blockType.name }}</span>
            </button>
          </div>
        </template>
      </UPopover>
    </div>

    <!-- Block Actions (shows on selection) -->
    <div v-if="isSelected" class="block-actions">
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
        icon="i-lucide-trash-2"
        variant="ghost"
        color="error"
        size="xs"
        title="Delete"
        @click.stop="emit('delete')"
      />
    </div>

    <!-- Block Content -->
    <slot />

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
          <div class="grid grid-cols-4 gap-1 p-2">
            <button
              v-for="blockType in BLOCK_PALETTE"
              :key="blockType.type"
              class="block-picker-item"
              @click="insertBlockBelow(blockType.type)"
            >
              <UIcon :name="blockType.icon" class="h-4 w-4" />
              <span class="text-[10px]">{{ blockType.name }}</span>
            </button>
          </div>
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { BLOCK_PALETTE } from '~~/app/utils/edmBlocks'

const props = defineProps<{ blockId: string }>()

const emit = defineEmits<{
  'move-up': []
  'move-down': []
  'duplicate': []
  'delete': []
  'insert-above': [type: string]
  'insert-below': [type: string]
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

function insertBlockAbove(type: string) {
  emit('insert-above', type)
  insertAboveOpen.value = false
}

function insertBlockBelow(type: string) {
  emit('insert-below', type)
  insertBelowOpen.value = false
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
