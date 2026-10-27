<script setup lang="ts">
import LetteringRepair from './LetteringRepair.vue'
const { selectedLayer } = useBannerStudio()
const api = useBannerLettering()
const {
  opened,
  wording,
  instruction,
  mode,
  loading,
  error,
  candidate,
  proposal,
  reviewed,
  protectedCopy,
  showOriginal,
  sourceWording,
  isolationConfirmed
} = api
onUnmounted(api.dispose)
const modes = [
  { label: 'Recreate as editable text', value: 'native' },
  { label: 'Redraw with AI', value: 'raster' }
]
</script>

<template>
  <section
    v-if="
      selectedLayer
        && !selectedLayer.platformQr
        && ['text', 'image'].includes(selectedLayer.type)
    "
    class="border-b border-default pb-3 space-y-3 @container"
  >
    <LetteringRepair />
    <UButton
      :label="selectedLayer.type === 'image' ? 'Edit isolated lettering with AI' : 'Edit with AI'"
      icon="i-lucide-wand-sparkles"
      variant="soft"
      size="xs"
      :disabled="selectedLayer.locked"
      class="w-full"
      @click="api.open(selectedLayer)"
    />
    <div v-if="opened" class="grid grid-cols-1 gap-3">
      <div class="flex items-center gap-2 min-w-0">
        <img
          v-if="selectedLayer.type === 'image'"
          :src="selectedLayer.src"
          alt="Selected lettering reference"
          class="w-16 h-16 object-contain bg-elevated rounded"
        >
        <div
          v-else
          class="w-16 h-16 overflow-hidden flex items-center justify-center bg-elevated rounded text-sm"
          :style="{
            fontFamily: selectedLayer.fontFamily,
            color: selectedLayer.color
          }"
        >
          {{ selectedLayer.text }}
        </div>
        <p class="text-xs text-muted truncate">
          {{ selectedLayer.name }}
        </p>
      </div>
      <UAlert
        v-if="selectedLayer.type === 'image'"
        color="warning"
        variant="soft"
        title="Separated lettering required"
        description="A flat poster needs extraction and background repair first. Opaque, cropped or clipped artwork cannot replace a clean lettering layer."
      />
      <template v-if="selectedLayer.type === 'image'">
        <UFormField
          label="Source wording"
          description="Read the selected image and correct every word. This is a manual transcription, not verified detection."
        >
          <UTextarea
            v-model="sourceWording"
            class="w-full"
            :rows="2"
            :disabled="loading || !!candidate"
          />
        </UFormField>
        <UCheckbox
          v-model="isolationConfirmed"
          :disabled="loading || !!candidate"
          label="This is an isolated lettering cutout with a clean background and no duplicate lettering underneath."
        />
      </template>
      <UFormField
        label="Text"
        :description="
          selectedLayer.type === 'image'
            ? 'Review every word against the reference. Saved recipe wording is a guide, not proof of visible text.'
            : 'Exact wording; approved copy remains protected.'
        "
      >
        <UTextarea
          v-model="wording"
          class="w-full"
          :rows="3"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <p v-if="protectedCopy" class="text-xs text-muted">
        Approved wording and commercial facts must remain exact.
      </p>
      <UFormField label="Instructions">
        <UTextarea
          v-model="instruction"
          class="w-full"
          :rows="3"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <UFormField label="Result">
        <USelect
          v-model="mode"
          :items="modes"
          class="w-full"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <p class="text-xs text-muted">
        {{
          mode === "native"
            ? "Real text with existing font and effect controls. Perspective and texture may need manual adjustment."
            : "Image lettering. Wording and reference are retained for another generation; font controls do not edit its pixels."
        }}
      </p>
      <UAlert v-if="error" color="error" :description="error" />
      <UButton
        v-if="!candidate"
        label="Generate preview"
        :loading="loading"
        :disabled="loading || !wording.trim()"
        @click="api.generate()"
      />
      <template v-if="candidate && proposal">
        <UAlert
          color="warning"
          title="Preview in composition"
          description="Only the selected layer is previewed on the canvas. Compare before applying; generated pixels can contain wrong or missing letters."
        />
        <UCheckbox
          v-model="showOriginal"
          label="Show original in canvas for comparison"
        />
        <p
          v-for="warning in proposal.warnings"
          :key="warning"
          class="text-xs text-muted"
        >
          {{ warning }}
        </p>
        <p class="text-xs text-muted">
          {{ proposal.evidence.provider }} · {{ proposal.evidence.model }} ·
          Cost unknown
        </p>
        <UCheckbox
          v-model="reviewed"
          label="I checked exact words, fit, clipping, background and protected content in the canvas preview."
        />
        <div class="flex gap-2">
          <UButton
            label="Apply lettering"
            :disabled="!reviewed"
            @click="api.apply()"
          />
          <UButton
            label="Discard"
            color="neutral"
            variant="ghost"
            @click="api.discard()"
          />
        </div>
      </template>
      <UButton
        v-if="loading"
        label="Cancel request"
        color="neutral"
        variant="ghost"
        @click="api.discard()"
      />
    </div>
  </section>
</template>
