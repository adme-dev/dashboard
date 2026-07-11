<script setup lang="ts">
const {
  isEditing,
  editingLayerId,
  showEditSlideover,
  editPrompt,
  editPreviewUrl,
  editError,
  editGuidance,
  editSteps,
  editUseSeed,
  editSeedInput,
  lastSeed,
  submitEdit,
  applyEdit,
  cancelEdit,
} = useAiLayerEdit()

function reuseSeed() {
  if (lastSeed.value != null) {
    editUseSeed.value = true
    editSeedInput.value = lastSeed.value
  }
}

const { activeLayers } = useBannerStudio()

const editingLayer = computed(() => {
  if (!editingLayerId.value) return null
  return activeLayers.value.find(l => l.id === editingLayerId.value) ?? null
})

const canSubmit = computed(() => {
  return editPrompt.value.trim().length > 0 && !isEditing.value
})

const showAdvanced = ref(false)

function handleSubmit() {
  if (canSubmit.value) submitEdit()
}
</script>

<template>
  <USlideover
    v-model:open="showEditSlideover"
    title="Edit Layer with AI"
    side="right"
    :ui="{ content: 'max-w-md' }"
    @update:open="(val: boolean) => { if (!val) cancelEdit() }"
  >
    <template #content>
      <div class="p-5 space-y-4">
        <!-- Source thumbnail -->
        <div v-if="editingLayer?.src" class="space-y-1.5">
          <div class="text-xs font-medium text-(--ui-text-muted)">Source Image</div>
          <div class="rounded-lg overflow-hidden border border-(--ui-border) bg-(--ui-bg-elevated)">
            <img
              :src="editingLayer.src"
              :alt="editingLayer.name"
              class="w-full h-32 object-contain"
            />
          </div>
          <div class="text-[10px] text-(--ui-text-dimmed)">
            {{ editingLayer.name }} &middot; {{ editingLayer.w }}&times;{{ editingLayer.h }}
          </div>
        </div>

        <!-- Prompt input -->
        <div class="space-y-1.5">
          <label class="text-xs font-medium text-(--ui-text-muted)">Edit Prompt</label>
          <UTextarea
            v-model="editPrompt"
            :rows="3"
            placeholder="e.g. &quot;Make the background blue&quot;, &quot;Remove the text&quot;, &quot;Add a sunset sky&quot;"
            :disabled="isEditing"
            @keydown.meta.enter="handleSubmit"
          />
          <div class="text-[10px] text-(--ui-text-dimmed)">
            {{ editPrompt.length }}/500 &middot; Cmd+Enter to submit
          </div>
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
                v-model.number="editGuidance"
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
                v-model.number="editSteps"
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
                <UCheckbox v-model="editUseSeed" />
                <label class="text-xs text-(--ui-text-muted)">Use specific seed (for reproducibility)</label>
              </div>
              <div v-if="editUseSeed" class="flex items-center gap-3 pl-6">
                <UInput
                  v-model.number="editSeedInput"
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
            First edit may take 30–60s while the AI model loads. Subsequent edits are faster.
          </p>
        </div>

        <!-- Submit button -->
        <UButton
          :label="isEditing ? 'Generating...' : (editPreviewUrl ? 'Try Again' : 'Generate Edit')"
          :icon="isEditing ? 'i-lucide-loader-2' : 'i-lucide-wand-2'"
          :loading="isEditing"
          :disabled="!canSubmit"
          block
          @click="handleSubmit"
        />

        <!-- Error -->
        <UAlert
          v-if="editError"
          color="error"
          :title="editError"
          icon="i-lucide-alert-circle"
        />

        <!-- Preview: before/after -->
        <div v-if="editPreviewUrl" class="space-y-3">
          <div class="text-xs font-medium text-(--ui-text-muted)">Result Preview</div>
          <div class="grid grid-cols-2 gap-2">
            <div class="space-y-1">
              <div class="text-[10px] text-(--ui-text-dimmed) text-center">Before</div>
              <div class="rounded-lg overflow-hidden border border-(--ui-border) bg-(--ui-bg-elevated)">
                <img
                  v-if="editingLayer?.src"
                  :src="editingLayer.src"
                  class="w-full h-28 object-contain"
                />
              </div>
            </div>
            <div class="space-y-1">
              <div class="text-[10px] text-(--ui-text-dimmed) text-center">After</div>
              <div class="rounded-lg overflow-hidden border border-(--ui-border) bg-(--ui-bg-elevated)">
                <img
                  :src="editPreviewUrl"
                  class="w-full h-28 object-contain"
                />
              </div>
            </div>
          </div>

          <!-- Seed display -->
          <div v-if="lastSeed != null" class="flex items-center gap-2">
            <span class="text-[10px] text-(--ui-text-dimmed)">Seed: {{ lastSeed }}</span>
            <UButton
              label="Reuse"
              variant="link"
              size="xs"
              @click="reuseSeed"
            />
          </div>

          <div class="flex gap-2">
            <UButton
              label="Apply"
              icon="i-lucide-check"
              color="primary"
              class="flex-1"
              @click="applyEdit"
            />
            <UButton
              label="Cancel"
              variant="outline"
              class="flex-1"
              @click="cancelEdit"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
