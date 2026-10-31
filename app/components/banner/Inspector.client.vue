<script setup lang="ts">
const { selectedLayer } = useBannerStudio()
const { feedsState } = useBannerFeeds()

const { inspectorTab: activeTab } = useBannerInspector()

const tabs = [
  { label: 'Properties', value: 'properties' },
  { label: 'Animation', value: 'animation' },
  { label: 'Background', value: 'background' },
  { label: 'Effects', value: 'effects' }
]

// When a layer is selected, switch to properties if on background tab
watch(selectedLayer, (layer, previous) => {
  if (layer && (activeTab.value === 'background' || (layer.type === 'video' && layer.id !== previous?.id))) {
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
      <div class="flex border-b border-default shrink-0">
        <button
          class="flex-1 text-[10px] font-semibold uppercase tracking-wider py-2 px-1 text-center text-[#4a8fe8] bg-[#4a8fe8]/8 border-b-2 border-[#4a8fe8]"
        >
          Background
        </button>
      </div>
      <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 inspector-content">
        <BannerInspectorBackground />
      </div>
    </template>

    <!-- Inspector content when layer selected -->
    <template v-else>
      <UTabs
        v-model="activeTab"
        :items="tabs"
        :content="false"
        size="xs"
        class="shrink-0 min-w-0"
        :ui="{ trigger: 'min-w-0 px-1 text-[10px]', list: 'rounded-none' }"
      />

      <!-- Scrollable content -->
      <div class="flex-1 min-h-0 overflow-y-auto p-3 space-y-3 inspector-content">
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

        <BannerInspectorEffects v-show="activeTab === 'effects'" />

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
  border-bottom: 1px solid var(--ui-border);
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
:deep(details.bs-section > summary:hover) { background: var(--ui-bg-accented); }

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
  background: var(--ui-border-accented);
}
:deep(input[type="range"]::-webkit-slider-thumb) {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  margin-top: -5px;
  border-radius: 50%;
  background: #4a8fe8;
  border: 2px solid var(--ui-bg);
  box-shadow: 0 0 0 1px var(--ui-border-accented);
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

/* Inputs inherit the active Nuxt UI theme. Artwork swatches keep their values. */
.inspector-content { color: var(--ui-text); }

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
  background: var(--ui-bg-accented);
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
  background: var(--ui-bg-accented);
}

/* === NATIVE SELECT ELEMENTS (FeedBindings) === */
:deep(select) {
  background-color: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  color: var(--ui-text);
  padding: 4px 8px;
  font-size: 11px;
  cursor: pointer;
}
:deep(select:focus) {
  border-color: #4a8fe8;
  outline: none;
}
:deep(select option) {
  background-color: var(--ui-bg);
  color: var(--ui-text);
}

/* === COLOR INPUT ENHANCEMENT === */
:deep(input[type="color"]) {
  border-color: var(--ui-border);
}
:deep(input[type="color"]:hover) {
  border-color: var(--ui-border-accented);
}
</style>
