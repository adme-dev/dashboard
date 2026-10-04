<script setup lang="ts">
import { BANNER_IMAGE_MODEL } from '~~/shared/bannerImageGeneration'

const {
  isGenerating, showGenerateSlideover, generatePrompt, generatePreviewUrl,
  generateError, generateAspectRatio, generationReady,
  submitGenerate, applyGenerate, cancelGenerate
} = useAiImageGenerate()
const canSubmit = computed(() => generatePrompt.value.trim().length > 0 && generatePrompt.value.length <= 2000 && !isGenerating.value)
const aspectOptions = [
  { label: 'Square · 1:1', value: '1:1' },
  { label: 'Landscape · 16:9', value: '16:9' },
  { label: 'Story · 9:16', value: '9:16' },
  { label: 'Landscape · 4:3', value: '4:3' },
  { label: 'Portrait · 3:4', value: '3:4' }
]
</script>

<template>
  <USlideover
    v-model:open="showGenerateSlideover"
    title="Create an image"
    description="Generate a background or supporting artwork for this client."
    :ui="{ content: 'max-w-lg' }"
    @update:open="open => { if (!open) cancelGenerate() }"
  >
    <template #body>
      <div class="space-y-5">
        <UFormField label="Image brief" description="Describe the setting, colours and lighting. Use approved photography for vehicles and product logos.">
          <UTextarea
            v-model="generatePrompt"
            class="w-full"
            :rows="5"
            :maxlength="2000"
            placeholder="A dark showroom interior, soft reflections and subtle lime lighting. Leave room for a headline."
            :disabled="isGenerating"
            @keydown.meta.enter="canSubmit && submitGenerate()"
          />
        </UFormField>
        <UFormField label="Image shape">
          <USelect
            v-model="generateAspectRatio"
            :items="aspectOptions"
            class="w-full"
            :disabled="isGenerating"
          />
        </UFormField>
        <div class="rounded-lg border border-default bg-elevated p-4 space-y-2 text-sm">
          <p class="font-medium">
            {{ BANNER_IMAGE_MODEL.label }}
          </p>
          <p class="text-muted">
            {{ BANNER_IMAGE_MODEL.provider }} · estimated US${{ BANNER_IMAGE_MODEL.estimatedGenerationUsd.toFixed(2) }} per image
          </p>
          <p class="text-xs text-muted">
            Generation only; quality inspection and storage may add charges. Pricing checked {{ BANNER_IMAGE_MODEL.pricingCheckedAt }}.
          </p>
          <UButton
            :to="BANNER_IMAGE_MODEL.pricingSource"
            target="_blank"
            variant="link"
            size="xs"
            label="Provider pricing"
          />
        </div>
        <UButton
          :label="isGenerating ? 'Generating image…' : 'Generate image'"
          icon="i-lucide-sparkles"
          :loading="isGenerating"
          :disabled="!canSubmit"
          block
          @click="submitGenerate"
        />
        <UAlert
          v-if="generateError"
          color="warning"
          title="Image not ready"
          :description="generateError"
        />
        <div v-if="generatePreviewUrl" class="space-y-3">
          <img :src="generatePreviewUrl" alt="Generated artwork preview" class="w-full max-h-80 object-contain rounded-lg bg-elevated">
          <div class="flex flex-wrap gap-2">
            <UButton
              label="Add image layer"
              icon="i-lucide-plus"
              :disabled="!generationReady"
              @click="applyGenerate(false)"
            />
            <UButton
              label="Use as background"
              variant="outline"
              :disabled="!generationReady"
              @click="applyGenerate(true)"
            />
            <UButton label="Discard" variant="ghost" @click="cancelGenerate" />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
