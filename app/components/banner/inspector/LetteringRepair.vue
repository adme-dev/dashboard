<script setup lang="ts">
import { useBannerLetteringRepair } from '~/composables/useBannerLetteringRepair'

const { selectedLayer } = useBannerStudio()
const api = useBannerLetteringRepair()
const { opened, loading, error, region, sourceWording, wording, instruction, regionReviewed, reviewed,
  showOriginal, proposal, candidate, fontFamily, fontSize, color, fonts, canApply, textFits, validRegion, blockReason } = api
const fields = [{ key: 'x', label: 'Left (%)' }, { key: 'y', label: 'Top (%)' }, { key: 'w', label: 'Width (%)' }, { key: 'h', label: 'Height (%)' }] as const
function setPercent(key: 'x' | 'y' | 'w' | 'h', value: string | number) {
  region.value = { ...region.value, [key]: Number(value) / 100 }
}
const regionStyle = computed(() => ({ left: `${region.value.x * 100}%`, top: `${region.value.y * 100}%`, width: `${region.value.w * 100}%`, height: `${region.value.h * 100}%` }))
</script>

<template>
  <section v-if="selectedLayer?.type === 'image' && !selectedLayer.platformQr" class="space-y-3 @container" data-testid="lettering-repair">
    <UButton
      label="Rebuild lettering"
      icon="i-lucide-text-cursor-input"
      variant="soft"
      size="xs"
      class="w-full"
      :disabled="!!blockReason"
      data-testid="lettering-repair-open"
      @click="api.open(selectedLayer)"
    />
    <p v-if="blockReason" class="text-xs text-muted">
      {{ blockReason }}
    </p>
    <div v-if="opened" class="grid grid-cols-1 gap-4">
      <p class="text-xs text-muted">
        Mark the lettering to remove from this flat image. Review the repaired background, then add the new words as editable text.
      </p>
      <figure class="m-0 space-y-2">
        <div class="relative overflow-hidden bg-elevated rounded" data-testid="lettering-repair-region-preview">
          <img
            :src="selectedLayer.src"
            alt="Original flat image with outlined lettering repair region"
            class="block w-full h-auto"
            draggable="false"
          >
          <div
            v-if="validRegion"
            :style="regionStyle"
            class="absolute border-2 border-primary bg-primary/10 pointer-events-none"
            data-testid="lettering-repair-region-outline"
          />
        </div>
        <figcaption class="text-xs text-muted">
          Outlined area to repair. Include all old letters and their shadows; keep other artwork outside the outline.
        </figcaption>
      </figure>
      <div class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
        <UFormField v-for="field in fields" :key="field.key" :label="field.label">
          <UInput
            :model-value="Number((region[field.key] * 100).toFixed(3))"
            type="number"
            min="0"
            max="100"
            step="0.1"
            class="w-full"
            :aria-label="field.label"
            :data-testid="`lettering-repair-region-${field.key}`"
            :disabled="loading || !!candidate"
            @update:model-value="setPercent(field.key, $event)"
          />
        </UFormField>
      </div>
      <UAlert
        v-if="!validRegion"
        color="warning"
        title="Keep the entire region inside the image"
        description="Left plus width and top plus height must each be at most 100%."
      />
      <UFormField label="Source wording" description="Transcribe every word in the outlined area. This is your transcription, not automatic text detection.">
        <UTextarea
          v-model="sourceWording"
          :rows="2"
          class="w-full"
          aria-label="Repair source wording"
          data-testid="lettering-repair-source-wording"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <UFormField label="Exact new wording" description="These words will become a separate, editable text layer.">
        <UTextarea
          v-model="wording"
          :rows="2"
          class="w-full"
          aria-label="Repair exact new wording"
          data-testid="lettering-repair-wording"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <UFormField label="Background repair instructions">
        <UTextarea
          v-model="instruction"
          :rows="2"
          class="w-full"
          aria-label="Background repair instructions"
          :disabled="loading || !!candidate"
        />
      </UFormField>
      <UCheckbox
        v-model="regionReviewed"
        label="I checked the region and source wording; no approved copy, QR code or other protected content is inside it."
        :disabled="loading || !!candidate || !validRegion"
        data-testid="lettering-repair-region-reviewed"
      />
      <UAlert
        v-if="error"
        color="error"
        :description="error"
        data-testid="lettering-repair-error"
      />
      <UButton
        v-if="!candidate"
        label="Generate repaired background preview"
        :loading="loading"
        :disabled="loading || !validRegion || !regionReviewed || !sourceWording.trim() || !wording.trim()"
        data-testid="lettering-repair-generate"
        @click="api.generate()"
      />
      <template v-if="candidate && proposal">
        <figure class="m-0 space-y-2">
          <img
            :src="proposal.backgroundAsset.url"
            alt="Full repaired background without replacement lettering"
            class="block w-full h-auto rounded bg-elevated"
            data-testid="lettering-repair-background"
          >
          <figcaption class="text-xs text-muted">
            Full repaired background. Check for remaining letters, missing artwork or visible patch edges.
          </figcaption>
        </figure>
        <UAlert color="warning" title="Review the new text on the canvas" description="The canvas combines this background with editable text. Check exact words, fit, contrast and surrounding artwork before applying." />
        <div class="grid grid-cols-1 @lg:grid-cols-2 gap-4">
          <UFormField label="Font">
            <USelect
              v-model="fontFamily"
              :items="fonts"
              class="w-full"
              aria-label="Repair font"
            />
          </UFormField>
          <UFormField label="Font size">
            <UInput
              v-model="fontSize"
              type="number"
              min="4"
              max="512"
              step="1"
              class="w-full"
              aria-label="Repair font size"
            />
          </UFormField>
          <UFormField label="Text colour" description="Six-digit hex colour, for example #111111." class="@lg:col-span-2">
            <UInput v-model="color" class="w-full" aria-label="Repair text colour" />
          </UFormField>
        </div>
        <UAlert
          v-if="!textFits"
          color="warning"
          title="The text does not fit the repair region"
          description="Reduce the font size or discard this preview and choose a larger region."
        />
        <UCheckbox v-model="showOriginal" label="Show original in canvas for comparison" data-testid="lettering-repair-original" />
        <p v-for="warning in proposal.warnings" :key="warning" class="text-xs text-muted">
          {{ warning }}
        </p>
        <p class="text-xs text-muted">
          Generated by {{ proposal.evidence.provider }} using {{ proposal.evidence.model }}. Background quality needs your review.
        </p>
        <UCheckbox
          v-model="reviewed"
          :disabled="showOriginal"
          label="I checked the repaired background and exact new text in the canvas, including fit and protected artwork."
          data-testid="lettering-repair-reviewed"
        />
        <UButton
          label="Apply repaired lettering"
          :disabled="!canApply"
          data-testid="lettering-repair-apply"
          @click="api.apply()"
        />
        <UButton
          label="Discard preview"
          variant="ghost"
          color="neutral"
          @click="api.discard()"
        />
      </template>
      <UButton
        :label="loading ? 'Cancel repair request' : 'Close repair'"
        variant="ghost"
        color="neutral"
        @click="api.close()"
      />
    </div>
  </section>
</template>
