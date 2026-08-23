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
      <div class="flex-1 overflow-y-auto p-3 space-y-3 inspector-content">
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
      <div class="flex-1 overflow-y-auto p-3 space-y-3 inspector-content">
        <!-- Properties tab -->
        <template v-if="activeTab === 'properties'">
          <BannerInspectorPosition />

          <BannerInspectorAlignment />

          <BannerInspectorText v-if="selectedLayer.type === 'text'" />
          <BannerInspectorImage v-else-if="selectedLayer.type === 'image'" />
          <BannerInspectorVideo v-else-if="selectedLayer.type === 'video'" />
          <BannerInspectorButton v-else-if="selectedLayer.type === 'button'" />
          <BannerInspectorRect v-else-if="selectedLayer.type === 'rect'" />
          <BannerInspectorAudio v-else-if="selectedLayer.type === 'audio'" />

          <!-- Mask inspector -->
          <BannerInspectorMask />

          <!-- Feed Bindings (Phase 3a) -->
          <BannerInspectorFeedBindings v-if="feedsState.feeds.length > 0" />
        </template>

        <!-- Animation tab -->
        <template v-if="activeTab === 'animation'">
          <BannerInspectorAnimation />
          <BannerInspectorPresence />
          <!-- Motion path + tweens belong with animation, not static properties -->
          <BannerInspectorMotionPath />
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

/* === SECTION RHYTHM ===
   Every section is a <details class="bs-section">: hairline below, even padding,
   so panels don't need to sprinkle their own dividers. */
:deep(details.bs-section) {
  padding-bottom: 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
:deep(details.bs-section:last-child) { border-bottom: 0; padding-bottom: 0; }
:deep(details.bs-section > summary) {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.25rem;
  margin: 0 -0.25rem 0.25rem;
  border-radius: 0.25rem;
  cursor: pointer;
  user-select: none;
}
:deep(details.bs-section > summary:hover) { background: rgba(255, 255, 255, 0.03); }

/* === FIELD LABELS ===
   Labels always sit above their control with one consistent gap — never inline. */
/* :where() keeps specificity at zero so utility classes (flex, mb-0 …) still win */
:deep(:where(label)) {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 10px;
  line-height: 1.2;
  letter-spacing: 0.02em;
  color: var(--ui-text-muted);
}
/* Checkbox / toggle rows keep their label beside the control */
:deep(:where(label:has(> input[type="checkbox"]), .bs-inline-label)) { display: inline-flex; align-items: center; margin-bottom: 0; }

/* === CONTROLS FILL THEIR COLUMN ===
   Nuxt UI inputs/selects size to content by default; in a narrow panel every
   control should span its grid cell so rows line up. */
/* Explicitly sized controls (w-14, w-16 …) are left alone. */
:deep(:where(.inspector-content) :where(button.inline-flex[aria-haspopup="listbox"], button.inline-flex[role="combobox"], .relative.inline-flex:has(> input:not([type="checkbox"]):not([type="color"]):not([type="range"]))):not([class*="w-"])) {
  width: 100%;
  min-width: 0;
}

/* === RANGE SLIDERS === thin track, accent thumb, consistent across panels */
:deep(input[type="range"]) {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  min-width: 0;
  height: 14px;
  background: transparent;
  cursor: pointer;
}
:deep(input[type="range"]::-webkit-slider-runnable-track) {
  height: 2px;
  border-radius: 1px;
  background: rgba(255, 255, 255, 0.14);
}
:deep(input[type="range"]::-webkit-slider-thumb) {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border-radius: 50%;
  background: #4a8fe8;
  border: 2px solid #1a1a1e;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.15);
}
:deep(input[type="range"]:focus-visible::-webkit-slider-thumb) { box-shadow: 0 0 0 2px #4a8fe8; }

/* === COLOR SWATCHES === */
:deep(input[type="color"]) {
  width: 1.5rem;
  height: 1.5rem;
  padding: 0;
  border-radius: 0.25rem;
  border: 1px solid var(--ui-border);
  background: transparent;
  cursor: pointer;
}
:deep(input[type="color"]::-webkit-color-swatch-wrapper) { padding: 2px; }
:deep(input[type="color"]::-webkit-color-swatch) { border: 0; border-radius: 2px; }

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
