<script setup lang="ts">
const {
  isGenerating,
  showGenerateSlideover,
  generatePrompt,
  generatePreviewUrl,
  generateError,
  generateAspectRatio,
  generateGuidance,
  generateSteps,
  generatePromptEnhance,
  generateUseSeed,
  generateSeedInput,
  lastGenerateSeed,
  submitGenerate,
  applyGenerate,
  cancelGenerate,
} = useAiImageGenerate()

const canSubmit = computed(() => {
  return generatePrompt.value.trim().length > 0 && !isGenerating.value
})

const showAdvanced = ref(false)

function handleSubmit() {
  if (canSubmit.value) submitGenerate()
}

function reuseSeed() {
  if (lastGenerateSeed.value != null) {
    generateUseSeed.value = true
    generateSeedInput.value = lastGenerateSeed.value
  }
}

const aspectOptions = [
  { label: '1:1 Square', value: '1:1' },
  { label: '16:9 Wide', value: '16:9' },
  { label: '9:16 Tall', value: '9:16' },
  { label: '4:3 Landscape', value: '4:3' },
  { label: '3:4 Portrait', value: '3:4' },
]
</script>

<template>
  <USlideover
    v-model:open="showGenerateSlideover"
    title="Generate Image with AI"
    side="right"
    :ui="{ width: 'max-w-md' }"
    @update:open="(val: boolean) => { if (!val) cancelGenerate() }"
  >
    <template #content>
      <div class="p-5 space-y-4">
        <!-- Prompt input -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-(--ui-text-muted)">Describe the image</label>
          <UTextarea
            v-model="generatePrompt"
            :rows="4"
            placeholder="e.g. &quot;A sleek sports car on a mountain road at sunset, cinematic lighting&quot;"
            :disabled="isGenerating"
            @keydown.meta.enter="handleSubmit"
          />
          <div class="text-[10px] text-(--ui-text-dimmed)">
            {{ generatePrompt.length }}/1000 &middot; Cmd+Enter to submit
          </div>
        </div>

        <!-- Aspect ratio -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-(--ui-text-muted)">Aspect Ratio</label>
          <div class="flex gap-1.5 flex-wrap">
            <UButton
              v-for="opt in aspectOptions"
              :key="opt.value"
              :label="opt.label"
              size="xs"
              :variant="generateAspectRatio === opt.value ? 'solid' : 'outline'"
              :color="generateAspectRatio === opt.value ? 'primary' : 'neutral'"
              @click="generateAspectRatio = opt.value"
            />
          </div>
        </div>

        <!-- Prompt enhance toggle -->
        <div class="flex items-center gap-2">
          <UCheckbox v-model="generatePromptEnhance" :disabled="isGenerating" />
          <label class="text-xs text-(--ui-text-muted)">Enhance prompt (AI rewrites for better quality)</label>
        </div>

        <!-- Advanced settings -->
        <div>
          <button
            class="flex items-center gap-1 text-xs text-(--ui-text-muted) hover:text-(--ui-text) transition-colors"
            @click="showAdvanced = !showAdvanced"
          >
            <UIcon
              name="i-lucide-chevron-right"
              class="w-3 h-3 transition-transform"
              :class="showAdvanced ? 'rotate-90' : ''"
            />
            Advanced Settings
          </button>
          <div v-if="showAdvanced" class="mt-2 space-y-3 pl-4">
            <div class="flex items-center gap-3">
              <label class="text-xs text-(--ui-text-muted) w-24 shrink-0">Guidance</label>
              <UInput
                v-model.number="generateGuidance"
                type="number"
                :min="1"
                :max="10"
                step="0.5"
                size="xs"
                class="w-20"
              />
              <span class="text-[10px] text-(--ui-text-dimmed)">1–10</span>
            </div>
            <div class="flex items-center gap-3">
              <label class="text-xs text-(--ui-text-muted) w-24 shrink-0">Steps</label>
              <UInput
                v-model.number="generateSteps"
                type="number"
                :min="1"
                :max="50"
                size="xs"
                class="w-20"
              />
              <span class="text-[10px] text-(--ui-text-dimmed)">1–50</span>
            </div>
            <!-- Seed control -->
            <div class="space-y-1.5">
              <div class="flex items-center gap-2">
                <UCheckbox v-model="generateUseSeed" />
                <label class="text-xs text-(--ui-text-muted)">Use specific seed</label>
              </div>
              <div v-if="generateUseSeed" class="flex items-center gap-3 pl-6">
                <UInput
                  v-model.number="generateSeedInput"
                  type="number"
                  :min="0"
                  :max="2147483647"
                  size="xs"
                  class="w-32"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Info banner -->
        <div class="flex items-start gap-2 p-2.5 rounded-lg bg-(--ui-bg-elevated) border border-(--ui-border)">
          <UIcon name="i-lucide-info" class="w-4 h-4 text-(--ui-text-muted) shrink-0 mt-0.5" />
          <p class="text-[11px] text-(--ui-text-muted) leading-relaxed">
            First generation may take 30–60s while the AI model loads. Subsequent generations are faster.
          </p>
        </div>

        <!-- Submit button -->
        <UButton
          :label="isGenerating ? 'Generating...' : (generatePreviewUrl ? 'Try Again' : 'Generate Image')"
          :icon="isGenerating ? 'i-lucide-loader-2' : 'i-lucide-sparkles'"
          :loading="isGenerating"
          :disabled="!canSubmit"
          block
          @click="handleSubmit"
        />

        <!-- Error -->
        <UAlert
          v-if="generateError"
          color="error"
          :title="generateError"
          icon="i-lucide-alert-circle"
        />

        <!-- Preview -->
        <div v-if="generatePreviewUrl" class="space-y-3">
          <div class="text-xs font-medium text-(--ui-text-muted)">Generated Image</div>
          <div class="rounded-lg overflow-hidden border border-(--ui-border) bg-(--ui-bg-elevated)">
            <img
              :src="generatePreviewUrl"
              alt="AI Generated"
              class="w-full max-h-64 object-contain"
            />
          </div>

          <!-- Seed display -->
          <div v-if="lastGenerateSeed != null" class="flex items-center gap-2">
            <span class="text-[10px] text-(--ui-text-dimmed)">Seed: {{ lastGenerateSeed }}</span>
            <UButton
              label="Reuse"
              variant="link"
              size="xs"
              @click="reuseSeed"
            />
          </div>

          <div class="flex gap-2">
            <UButton
              label="Add to Canvas"
              icon="i-lucide-plus"
              color="primary"
              class="flex-1"
              @click="applyGenerate"
            />
            <UButton
              label="Cancel"
              variant="outline"
              class="flex-1"
              @click="cancelGenerate"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
