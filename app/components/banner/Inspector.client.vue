<script setup lang="ts">
const { selectedLayer } = useBannerStudio()
const { feedsState } = useBannerFeeds()

const activeTab = ref('background')

const tabs = [
  { label: 'Properties', value: 'properties' },
  { label: 'Animation', value: 'animation' },
  { label: 'Background', value: 'background' },
]

// When a layer is selected, switch to properties if on background tab
watch(selectedLayer, (layer) => {
  if (layer && activeTab.value === 'background') {
    activeTab.value = 'properties'
  }
  if (!layer) {
    activeTab.value = 'background'
  }
})
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
    <!-- No selection: show Background tab directly -->
    <template v-if="!selectedLayer">
      <!-- Tab bar with only Background active -->
      <div class="flex border-b border-[#3a3a3f] shrink-0">
        <button
          class="flex-1 text-[10px] font-semibold uppercase tracking-wider py-2 px-1 text-center text-[#4a8fe8] bg-[#4a8fe8]/8 border-b-2 border-[#4a8fe8]"
        >
          Background
        </button>
      </div>
      <div class="flex-1 overflow-y-auto p-3 space-y-4 inspector-content">
        <BannerInspectorBackground />
      </div>
    </template>

    <!-- Inspector content when layer selected -->
    <template v-else>
      <!-- Tab bar -->
      <div class="flex border-b border-[#3a3a3f] shrink-0">
        <button
          v-for="tab in tabs"
          :key="tab.value"
          class="flex-1 text-[10px] font-semibold uppercase tracking-wider py-2 px-1 text-center transition-colors"
          :class="activeTab === tab.value
            ? 'text-[#4a8fe8] bg-[#4a8fe8]/8 border-b-2 border-[#4a8fe8]'
            : 'text-[#666] hover:text-[#999]'"
          @click="activeTab = tab.value"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-3 space-y-4 inspector-content">
        <!-- Properties tab -->
        <template v-if="activeTab === 'properties'">
          <BannerInspectorPosition />

          <div class="border-t border-(--ui-border)" />

          <BannerInspectorAlignment />

          <div class="border-t border-(--ui-border)" />

          <BannerInspectorText v-if="selectedLayer.type === 'text'" />
          <BannerInspectorImage v-else-if="selectedLayer.type === 'image'" />
          <BannerInspectorVideo v-else-if="selectedLayer.type === 'video'" />
          <BannerInspectorButton v-else-if="selectedLayer.type === 'button'" />
          <BannerInspectorRect v-else-if="selectedLayer.type === 'rect'" />
          <BannerInspectorAudio v-else-if="selectedLayer.type === 'audio'" />

          <!-- Mask inspector -->
          <BannerInspectorMask />

          <!-- Motion Path inspector -->
          <BannerInspectorMotionPath />

          <!-- Feed Bindings (Phase 3a) -->
          <BannerInspectorFeedBindings v-if="feedsState.feeds.length > 0" />
        </template>

        <!-- Animation tab -->
        <template v-if="activeTab === 'animation'">
          <BannerInspectorAnimation />
          <div class="border-t border-(--ui-border)" />
          <BannerInspectorPresence />
        </template>

        <!-- Background tab -->
        <template v-if="activeTab === 'background'">
          <BannerInspectorBackground />
        </template>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* === DISCLOSURE MARKERS === */
:deep(details.bs-section > summary) { list-style: none; }
:deep(details.bs-section > summary::-webkit-details-marker) { display: none; }

/* === INSPECTOR THEME OVERRIDES === */
/* Override Nuxt UI CSS vars so inputs/selects stand out against #252528 panel */
.inspector-content {
  --ui-bg: #1a1a1e;
  --ui-bg-elevated: #222225;
  --ui-border: #444;
  --ui-border-accented: #555;
  --ui-text: #e0e0e0;
  --ui-text-highlighted: #fff;
  --ui-text-muted: #999;
  --ui-text-dimmed: #666;
  color: #e0e0e0;
}

/* === FORCE LIGHT TEXT IN ALL INPUTS === */
:deep(input:not([type="color"]):not([type="range"]):not([type="checkbox"]):not([type="file"])) {
  color: #e0e0e0 !important;
  -webkit-text-fill-color: #e0e0e0 !important;
}
:deep(input::placeholder) {
  color: #666 !important;
  -webkit-text-fill-color: #666 !important;
}
/* USelectMenu trigger text */
:deep(button[role="combobox"]),
:deep(button[aria-haspopup="listbox"]),
:deep(button[aria-haspopup="menu"]) {
  color: #e0e0e0 !important;
}
:deep(button[role="combobox"] span),
:deep(button[aria-haspopup="listbox"] span) {
  color: #e0e0e0 !important;
}

/* === TYPOGRAPHY === */
:deep(input[type="number"]) {
  font-family: 'JetBrains Mono', ui-monospace, monospace;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}

/* === RANGE SLIDER STYLING === */
:deep(input[type="range"]) {
  -webkit-appearance: none !important;
  appearance: none !important;
  height: 6px !important;
  border-radius: 3px;
  background: #333;
  outline: none;
  cursor: pointer;
}
:deep(input[type="range"]::-webkit-slider-thumb) {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #4a8fe8;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  margin-top: -4px;
}
:deep(input[type="range"]::-moz-range-thumb) {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid #4a8fe8;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
}
:deep(input[type="range"]::-moz-range-track) {
  height: 6px;
  border-radius: 3px;
  background: #333;
}

/* === NATIVE SELECT ELEMENTS (FeedBindings) === */
:deep(select) {
  background-color: #1a1a1e;
  border: 1px solid #444;
  border-radius: 6px;
  color: #ddd;
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}
:deep(select:focus) {
  border-color: #4a8fe8;
  outline: none;
}
:deep(select option) {
  background-color: #1a1a1e;
  color: #ddd;
}

/* === COLOR INPUT ENHANCEMENT === */
:deep(input[type="color"]) {
  border-color: #444;
}
:deep(input[type="color"]:hover) {
  border-color: #555;
}
</style>
