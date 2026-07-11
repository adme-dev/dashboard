<script setup lang="ts">
const { state, addLayer, toggleMask } = useBannerStudio()
const emit = defineEmits<{ (e: 'switch-tab', tab: string): void }>()

const tools = [
  { id: 'select', icon: 'i-lucide-mouse-pointer', label: 'Select', shortcut: 'V', group: 'mode' },
  { id: 'hand', icon: 'i-lucide-hand', label: 'Hand', shortcut: 'H', group: 'mode' },
  { id: 'sep1', separator: true },
  { id: 'text', icon: 'i-lucide-type', label: 'Text', shortcut: 'T', group: 'create' },
  { id: 'rect', icon: 'i-lucide-square', label: 'Rectangle', shortcut: 'R', group: 'create' },
  { id: 'button', icon: 'i-lucide-mouse-pointer-click', label: 'Button', shortcut: 'B', group: 'create' },
  { id: 'image', icon: 'i-lucide-image', label: 'Image', shortcut: 'I', group: 'create' },
  { id: 'audio', icon: 'i-lucide-music', label: 'Audio', shortcut: 'A', group: 'create' },
  { id: 'mask', icon: 'i-lucide-scan', label: 'Mask', shortcut: 'K', group: 'create' },
  { id: 'sep2', separator: true },
  { id: 'comment', icon: 'i-lucide-message-circle', label: 'Comment', shortcut: 'M', group: 'mode' },
] as const

type ToolbarTool = (typeof tools)[number]

const LAYER_DEFAULTS: Record<string, Record<string, any>> = {
  text: { type: 'text', name: 'Text', text: 'Text', fontSize: 24, fontWeight: 700, fontFamily: 'Barlow Condensed', color: '#fff', textAlign: 'left', w: 200, h: 40, animIn: 'fadeIn' },
  rect: { type: 'rect', name: 'Rectangle', fillColor: 'rgba(255,255,255,0.1)', w: 120, h: 80, animIn: 'fadeIn' },
  button: { type: 'button', name: 'Button', text: 'CLICK HERE', fontSize: 12, fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: '#e8c84a', textColor: '#000', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em', w: 140, h: 36, animIn: 'slideU', delay: 1 },
  mask: { type: 'rect', name: 'Mask', fillColor: 'rgba(255,255,255,0.3)', w: 120, h: 80, animIn: 'fadeIn' },
}

function handleToolClick(toolId: string) {
  if (toolId === 'mask') {
    const layer = addLayer(LAYER_DEFAULTS.mask)
    // Auto-select all non-bg/audio/mask layers below as targets
    toggleMask(layer.id)
    state.activeTool = 'select'
    return
  }
  if (toolId in LAYER_DEFAULTS) {
    addLayer(LAYER_DEFAULTS[toolId])
    state.activeTool = 'select'
  } else if (toolId === 'image' || toolId === 'audio') {
    emit('switch-tab', 'assets')
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
  return 'label' in tool ? `${tool.label} (${tool.shortcut})` : ''
}

function toolIcon(tool: ToolbarTool): string {
  return 'icon' in tool ? tool.icon : ''
}
</script>

<template>
  <div class="w-10 shrink-0 bg-[#2a2a2e] border-r border-[#3a3a3f] flex flex-col items-center pt-2 gap-0.5">
    <template v-for="tool in tools" :key="tool.id">
      <div v-if="isSeparator(tool)" class="h-px w-6 bg-[#3a3a3f] my-1" />
      <UTooltip v-else :text="toolTooltip(tool)" :delay-duration="300" side="right">
        <button
          class="w-8 h-8 flex items-center justify-center rounded transition-all"
          :class="isActive(tool.id)
            ? 'bg-[#4a8fe8] text-white shadow-[0_0_8px_rgba(74,143,232,0.3)]'
            : 'text-[#888] hover:text-white hover:bg-[#3a3a3f]'"
          @click="handleToolClick(tool.id)"
        >
          <UIcon :name="toolIcon(tool)" class="w-4 h-4" />
        </button>
      </UTooltip>
    </template>
  </div>
</template>
