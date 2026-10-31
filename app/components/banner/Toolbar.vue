<script setup lang="ts">
const { state } = useBannerStudio()
const { insertElement } = useBannerInsert()
const emit = defineEmits<{ (e: 'switch-tab', tab: string): void }>()

const tools = [
  { id: 'select', icon: 'i-lucide-mouse-pointer', label: 'Select', shortcut: 'V', group: 'mode' },
  { id: 'hand', icon: 'i-lucide-hand', label: 'Hand', shortcut: 'H', group: 'mode' },
  { id: 'sep1', separator: true },
  { id: 'text', icon: 'i-lucide-type', label: 'Text', shortcut: 'T', group: 'create' },
  { id: 'rect', icon: 'i-lucide-square', label: 'Rectangle', shortcut: 'R', group: 'create' },
  { id: 'button', icon: 'i-lucide-mouse-pointer-click', label: 'Button', shortcut: 'B', group: 'create' },
  { id: 'image', icon: 'i-lucide-image', label: 'Image', shortcut: 'I', group: 'create' },
  { id: 'video', icon: 'i-lucide-video', label: 'Video', shortcut: '', group: 'create' },
  { id: 'audio', icon: 'i-lucide-music', label: 'Audio', shortcut: 'A', group: 'create' },
  { id: 'mask', icon: 'i-lucide-scan', label: 'Mask', shortcut: 'K', group: 'create' },
  { id: 'sep2', separator: true },
  { id: 'comment', icon: 'i-lucide-message-circle', label: 'Comment', shortcut: 'M', group: 'mode' }
] as const

type ToolbarTool = (typeof tools)[number]

function handleToolClick(toolId: string) {
  if (['text', 'rect', 'button', 'mask'].includes(toolId)) {
    insertElement(toolId)
  } else if (['image', 'video', 'audio'].includes(toolId)) {
    emit('switch-tab', toolId)
    state.activeTool = 'select'
  } else if (toolId === 'comment') {
    state.activeTool = state.activeTool === 'comment' ? 'select' : 'comment'
  } else if (toolId === 'select' || toolId === 'hand') {
    state.activeTool = toolId
  }
}

function isActive(toolId: string): boolean {
  if (toolId === 'select' || toolId === 'hand' || toolId === 'comment') {
    return state.activeTool === toolId
  }
  return false
}

function isSeparator(tool: ToolbarTool): boolean {
  return 'separator' in tool && tool.separator === true
}

function toolTooltip(tool: ToolbarTool): string {
  return 'label' in tool ? tool.group === 'mode' ? `${tool.label} (${tool.shortcut})` : tool.label : ''
}

function toolIcon(tool: ToolbarTool): string {
  return 'icon' in tool ? tool.icon : ''
}
</script>

<template>
  <div class="w-10 shrink-0 bg-default border-r border-default flex flex-col items-center pt-2 gap-0.5">
    <template v-for="tool in tools" :key="tool.id">
      <div v-if="isSeparator(tool)" class="h-px w-6 bg-accented my-1" />
      <UTooltip
        v-else
        :text="toolTooltip(tool)"
        :delay-duration="300"
        side="right"
      >
        <UButton
          :aria-label="'label' in tool ? tool.label : undefined"
          color="neutral"
          variant="ghost"
          class="w-8 h-8 flex items-center justify-center rounded transition-all"
          :class="isActive(tool.id)
            ? 'bg-[#4a8fe8] text-white shadow-[0_0_8px_rgba(74,143,232,0.3)]'
            : 'text-muted hover:text-highlighted hover:bg-accented'"
          @click="handleToolClick(tool.id)"
        >
          <UIcon :name="toolIcon(tool)" class="w-4 h-4" />
        </UButton>
      </UTooltip>
    </template>
  </div>
</template>
