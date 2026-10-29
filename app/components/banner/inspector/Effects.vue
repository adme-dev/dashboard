<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { EFFECT_PRESETS, type BannerEffectStyle } from '~~/shared/bannerEffects'

const { state, selectedLayer } = useBannerStudio()
const { recipe, presets, references, loading, uploading, generating, saving, reviewing, fitting, sourceText, isArtwork, error, preview, canGenerate, canRestore, canRetryReview, applyStyle, restoreOriginal, loadPreset, uploadReferences, removeReference, generate, retryReview, applyArtwork, refitArtwork, restoreText, removeTexture, savePreset } = useBannerEffects()
const name = ref('')
const scope = ref<'client' | 'agency'>('client')
const files = ref<File[]>([])
const presetChoice = ref('__none__')
watch(() => `${state.project?.id}:${state.project?.clientId}`, () => {
  name.value = ''
  scope.value = state.project?.clientId ? 'client' : 'agency'
  files.value = []
  presetChoice.value = '__none__'
}, { immediate: true })
const supported = computed(() => ['text', 'image'].includes(selectedLayer.value?.type || ''))
const locked = computed(() => !!selectedLayer.value?.locked)
const presetItems = computed(() => [{ label: 'Choose saved recipe', value: '__none__' }, ...presets.value.map(p => ({ label: `${p.name} · ${p.clientId ? 'Client' : 'Agency'}`, value: p.id }))])
const filterItems = [
  { label: 'Original', value: 'none' }, { label: 'Greyscale', value: 'grayscale(1)' },
  { label: 'Vivid', value: 'saturate(1.5)' }, { label: 'Brighter', value: 'brightness(1.2)' }, { label: 'Soft focus', value: 'blur(2px)' }
]
function choosePreset(value: string) {
  const preset = presets.value.find(p => p.id === value)
  if (preset) loadPreset(preset)
}
function chooseStyle(style: BannerEffectStyle) {
  recipe.value.style = { ...style, textDepth: recipe.value.style.textDepth }
}
async function attach() {
  await uploadReferences(files.value)
  files.value = []
}
function clearReferences() {
  recipe.value.referenceIds = []
  recipe.value.referenceProjectId = null
}
</script>

<template>
  <div class="space-y-4 min-w-0 text-xs">
    <div class="rounded-lg border border-default bg-elevated p-3 space-y-1">
      <div class="flex items-center gap-2 font-medium text-highlighted">
        <UIcon name="i-lucide-sparkles" class="text-primary size-4" /> Layer effects
      </div>
      <p class="text-muted leading-relaxed">
        Style a layer, then add motion in Animation. AI artwork is previewed before it is added.
      </p>
    </div>
    <UAlert
      v-if="!supported"
      title="Select a text or image layer"
      description="Effects are available for text and images."
      icon="i-lucide-mouse-pointer-2"
      color="neutral"
      variant="subtle"
    />
    <template v-else>
      <UAlert
        v-if="locked"
        title="Layer is locked"
        description="Unlock it in Layers before applying an effect."
        color="neutral"
        variant="subtle"
      />
      <UFormField label="Saved recipes">
        <USelect
          v-model="presetChoice"
          :items="presetItems"
          :loading="loading"
          size="sm"
          class="w-full"
          @update:model-value="choosePreset"
        />
      </UFormField>
      <section v-if="selectedLayer?.type === 'text'" class="space-y-2">
        <h3 class="font-medium text-highlighted">
          Editable text looks
        </h3>
        <div class="grid grid-cols-2 gap-2">
          <UButton
            v-for="preset in EFFECT_PRESETS"
            :key="preset.id"
            color="neutral"
            variant="outline"
            size="sm"
            class="justify-center"
            :disabled="locked"
            @click="chooseStyle(preset.style)"
          >
            {{ preset.label }}
          </UButton>
        </div>
        <BannerInspectorTextEffectPreview :layer="{ ...selectedLayer, ...recipe.style }" />
        <p class="text-muted">
          {{ selectedLayer.fontFamily || 'Barlow Condensed' }} · Original lettering
        </p>
      </section>
      <BannerInspectorTextDepth v-if="selectedLayer?.type === 'text'" v-model="recipe.style.textDepth" :disabled="locked" />
      <UFormField label="Filter">
        <USelect
          v-model="recipe.style.visualFilter"
          :items="filterItems"
          placeholder="Original"
          :disabled="locked"
          size="sm"
          class="w-full"
        />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton
          size="sm"
          :disabled="locked"
          icon="i-lucide-check"
          @click="applyStyle"
        >
          Apply effect
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          :disabled="locked || !canRestore"
          @click="restoreOriginal"
        >
          Restore original
        </UButton>
      </div>
      <div v-if="isArtwork && sourceText" class="space-y-2 border-t border-default pt-3">
        <p class="text-muted leading-relaxed">
          Source text: {{ sourceText.text }}
        </p>
        <UButton
          size="sm"
          color="neutral"
          variant="outline"
          icon="i-lucide-scan"
          class="w-full justify-center"
          :loading="fitting"
          :disabled="locked || fitting || generating"
          @click="refitArtwork"
        >
          Fit artwork to text
        </UButton>
        <UButton
          size="sm"
          color="neutral"
          variant="ghost"
          icon="i-lucide-type"
          :disabled="locked || sourceText.locked || fitting"
          @click="restoreText"
        >
          Return to editable text
        </UButton>
      </div>
      <UButton
        v-if="selectedLayer?.type === 'text' && selectedLayer.textTexture"
        size="sm"
        color="neutral"
        variant="ghost"
        icon="i-lucide-eraser"
        :disabled="locked"
        @click="removeTexture"
      >
        Remove AI texture
      </UButton>
      <section v-if="sourceText" class="space-y-3 border-t border-default pt-4">
        <h3 class="font-medium text-highlighted">
          {{ selectedLayer?.textTexture ? 'Refine AI texture' : 'Create AI text texture' }}
        </h3>
        <UFormField label="Model">
          <USelect
            v-model="recipe.modelId"
            :items="[{ label: 'Recraft V4.1', value: 'aigateway/recraft-offer-card' }]"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Effect brief" help="Describe the material, colours and lighting. Your original font and wording are preserved.">
          <UTextarea
            v-model="recipe.prompt"
            placeholder="Polished gold with warm highlights, or glowing red and orange fire…"
            :rows="4"
            :maxlength="1400"
            class="w-full"
          />
        </UFormField>
        <UFormField label="References and style guides" help="PNG, JPEG, WebP ≤5 MB; TXT or Markdown guides. Up to 3 images and 6 files total.">
          <UFileUpload
            v-model="files"
            multiple
            accept=".png,.jpg,.jpeg,.webp,.txt,.md,.markdown"
            size="sm"
            class="w-full"
            :disabled="uploading"
          />
        </UFormField>
        <UButton
          v-if="files.length"
          size="sm"
          color="neutral"
          variant="outline"
          :loading="uploading"
          @click="attach"
        >
          Attach {{ files.length }} {{ files.length === 1 ? 'file' : 'files' }}
        </UButton>
        <ul v-if="references.length" class="space-y-2">
          <li v-for="reference in references" :key="reference.id" class="flex items-center gap-2 rounded border border-default p-2 min-w-0">
            <UIcon :name="reference.kind === 'image' ? 'i-lucide-image' : 'i-lucide-file-text'" class="shrink-0 text-muted" />
            <span class="min-w-0 flex-1 break-words">{{ reference.name }}</span>
            <UButton
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              size="xs"
              :aria-label="`Remove ${reference.name}`"
              @click="removeReference(reference.id)"
            />
          </li>
        </ul>
        <UButton
          v-if="recipe.referenceIds.length && !references.length"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="clearReferences"
        >
          Clear {{ recipe.referenceIds.length }} saved references
        </UButton>
        <p class="text-muted leading-relaxed">
          References provide analysed style guidance. The texture fills your original letters; flames outside the letters need a separate transparent layer. Generation uses your AI allowance.
        </p>
        <p v-if="!state.project?.id || state.project.id === 'new' || state.isDirty" class="text-warning">
          Save this banner before generating.
        </p>
        <UButton
          icon="i-lucide-sparkles"
          size="sm"
          class="w-full justify-center"
          :disabled="locked || !canGenerate || reviewing"
          :loading="generating"
          @click="generate"
        >
          {{ preview ? 'Generate again' : 'Generate preview' }}
        </UButton>
        <div v-if="preview" class="space-y-2 rounded-lg border border-default p-2">
          <BannerInspectorTextEffectPreview v-if="recipe.artworkMode === 'keep-font'" :layer="{ ...sourceText, ...recipe.style, hidden: false, textTexture: preview.url }" />
          <img
            v-else
            :src="preview.url"
            alt="Generated text artwork preview"
            class="w-full object-contain rounded bg-[#111114] max-h-60"
          >
          <UButton
            v-if="preview.ready"
            icon="i-lucide-plus"
            size="sm"
            class="w-full justify-center"
            :disabled="locked || !preview.ready || fitting || generating"
            :loading="fitting"
            @click="applyArtwork"
          >
            {{ recipe.artworkMode === 'keep-font' ? 'Apply texture to text' : isArtwork ? 'Replace this artwork' : 'Add artwork layer' }}
          </UButton>
          <UAlert
            v-if="preview.review && !preview.ready"
            :title="preview.review.status === 'unavailable' ? 'Review unavailable' : 'Artwork needs changes'"
            :description="preview.review.message"
            :icon="preview.review.status === 'unavailable' ? 'i-lucide-cloud-alert' : 'i-lucide-circle-alert'"
            :color="preview.review.status === 'unavailable' ? 'warning' : 'error'"
            variant="subtle"
          />
          <UButton
            v-if="preview.review?.status === 'unavailable' && preview.assetId"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            size="sm"
            class="w-full justify-center"
            :loading="reviewing"
            :disabled="!canRetryReview"
            @click="retryReview"
          >
            Retry review
          </UButton>
          <p class="text-muted">
            {{ recipe.artworkMode === 'keep-font' ? 'The original lettering stays editable, with transparency around its shape.' : 'Artwork is fitted without stretching. Original text is retained in Layers.' }}
          </p>
        </div>
      </section>
      <UAlert
        v-if="error"
        :title="error"
        icon="i-lucide-circle-alert"
        color="error"
        variant="subtle"
      />
      <section class="space-y-3 border-t border-default pt-4">
        <h3 class="font-medium text-highlighted">
          Save this recipe
        </h3>
        <UFormField label="Preset name">
          <UInput
            v-model="name"
            placeholder="EOFY chrome headline"
            :maxlength="100"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Available to">
          <USelect
            v-model="scope"
            :items="[{ label: 'This client', value: 'client', disabled: !state.project?.clientId }, { label: 'Agency', value: 'agency' }]"
            size="sm"
            class="w-full"
          />
        </UFormField>
        <UButton
          color="neutral"
          variant="outline"
          size="sm"
          icon="i-lucide-bookmark"
          :loading="saving"
          :disabled="!name.trim() || !state.project?.id || state.project.id === 'new' || (scope === 'client' && !state.project?.clientId)"
          @click="savePreset(name, scope)"
        >
          Save preset
        </UButton>
      </section>
    </template>
  </div>
</template>
