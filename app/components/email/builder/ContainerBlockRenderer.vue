<!-- app/components/email/builder/ContainerBlockRenderer.vue -->
<!-- Renders a Container block's children + unified add-child module popover. -->
<template>
  <div
    class="container-block"
    :style="containerStyle"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <template v-if="childBlocks.length > 0">
      <div
        v-for="child in childBlocks"
        :key="child.id"
        class="container-child"
        :class="{ 'is-selected': store.selectedBlockId.value === child.id }"
        @click.stop="store.setSelectedBlockId(child.id)"
      >
        <EmailBuilderEdmBlockRenderer
          :type="child.type"
          :style="child.data.style"
          :props="child.data.props"
          :hidden-on-device="child.hiddenOnDevice"
          editable
          @update:text="(text) => updateChildText(child.id, text)"
          @update:props="(propsPatch) => updateChildProps(child.id, propsPatch)"
          @update:style="(stylePatch) => updateChildStyle(child.id, stylePatch)"
        />
      </div>
    </template>

    <div class="container-add-block">
      <UPopover v-model:open="showBlockPicker" :content="{ side: 'bottom', align: 'center' }">
        <button v-show="isHovered || showBlockPicker" type="button" class="add-block-trigger">
          <UIcon name="i-lucide-plus" class="h-4 w-4 pointer-events-none" />
        </button>
        <template #content>
          <EmailBuilderEdmAddModuleMenu
            @insert="insertPresetChild"
            @insert-module="insertCustomModuleChild"
            @rename-module="noop"
            @delete-module="noop"
          />
        </template>
      </UPopover>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { buildSectionDocumentFragment } from '~~/app/utils/edmPresets'
import type { EdmSectionPreset } from '~~/app/utils/edmPresets'
import { reidFragment } from '~~/app/utils/edmModuleFragment'
import { getBlockForDevice, isHiddenOnDevice, type EdmDevice } from '~~/app/utils/edmResponsive'
import type { EdmCustomModule } from '~~/app/composables/useEdmCustomModules'

const props = defineProps<{
  blockId: string
  device?: EdmDevice
  style?: {
    backgroundColor?: string | null
    borderColor?: string | null
    borderRadius?: number | null
    padding?: { top: number, bottom: number, left: number, right: number } | null
  } | null
  props?: Record<string, unknown> | null
}>()

const store = useEdmBuilder()
const isHovered = ref(false)
const showBlockPicker = ref(false)

const containerStyle = computed(() => {
  const style = props.style || {}
  return {
    backgroundColor: style.backgroundColor || 'transparent',
    borderColor: style.borderColor || 'transparent',
    borderWidth: style.borderColor ? '1px' : '0',
    borderStyle: style.borderColor ? 'solid' : 'none',
    borderRadius: style.borderRadius ? `${style.borderRadius}px` : '0',
    paddingTop: `${style.padding?.top ?? 16}px`,
    paddingBottom: `${style.padding?.bottom ?? 16}px`,
    paddingLeft: `${style.padding?.left ?? 24}px`,
    paddingRight: `${style.padding?.right ?? 24}px`
  }
})

const childBlocks = computed(() => {
  const block = store.document.value[props.blockId]
  if (!block) return []
  const childrenIds = block.data?.childrenIds || []
  return childrenIds.map((id) => {
    const childBlock = store.document.value[id]
    if (!childBlock) return { id, type: 'Unknown', data: {}, hiddenOnDevice: false }
    const active = getBlockForDevice(childBlock, props.device || 'desktop')
    return {
      id,
      type: childBlock.type,
      data: active.data,
      hiddenOnDevice: isHiddenOnDevice(childBlock, props.device || 'desktop')
    }
  })
})

function insertPresetChild(preset: EdmSectionPreset) {
  const fragment = buildSectionDocumentFragment(preset.id)
  store.insertBlocks(fragment.blocks, fragment.rootChildrenIds, props.blockId)
  showBlockPicker.value = false
}

function insertCustomModuleChild(module: EdmCustomModule) {
  const fragment = reidFragment(module.blocks)
  store.insertBlocks(fragment.blocks, fragment.rootChildrenIds, props.blockId)
  showBlockPicker.value = false
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
.container-block {
  min-height: 60px;
  position: relative;
}

.container-child {
  position: relative;
  transition: outline 0.15s ease;
}

.container-child:hover {
  outline: 1px dashed rgba(59, 130, 246, 0.5);
  outline-offset: 2px;
}

.container-child.is-selected {
  outline: 2px solid rgb(59, 130, 246);
  outline-offset: 2px;
}

.container-add-block {
  display: flex;
  justify-content: center;
  padding: 8px 0;
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
