<script setup lang="ts">
import { CTA_OPTIONS } from '~/composables/useMetaAdUpload'

const {
  primaryTexts,
  headlines,
  descriptions,
  callToAction,
  linkUrl,
  pageId,
  pages,
  connectionId,
  fetchPages,
  saveTextPreset,
  loadTextPresets,
  applyTextPreset,
  deleteTextPreset,
} = useMetaAdUpload()

const showPresetSave = ref(false)
const presetName = ref('')
const presets = ref(loadTextPresets())

onMounted(() => {
  fetchPages()
  presets.value = loadTextPresets()
})

// Watch connection changes to re-fetch pages
watch(() => connectionId.value, () => {
  if (connectionId.value) fetchPages()
})

function addField(arr: string[], max: number) {
  if (arr.length < max) arr.push('')
}

function removeField(arr: string[], idx: number) {
  if (arr.length > 1) arr.splice(idx, 1)
}

function handleSavePreset() {
  if (!presetName.value.trim()) return
  saveTextPreset(presetName.value.trim())
  presets.value = loadTextPresets()
  presetName.value = ''
  showPresetSave.value = false
}

function handleApplyPreset(preset: any) {
  applyTextPreset(preset)
}

function handleDeletePreset(name: string) {
  deleteTextPreset(name)
  presets.value = loadTextPresets()
}

const pageItems = computed(() =>
  pages.value.map((p: any) => ({
    label: p.name || p.id,
    value: p.id,
  })),
)
</script>

<template>
  <div class="space-y-5">
    <!-- Presets -->
    <div v-if="presets.length" class="space-y-1.5">
      <span class="text-xs font-medium text-(--ui-text-muted)">Saved Presets</span>
      <div class="flex flex-wrap gap-1.5">
        <div
          v-for="preset in presets"
          :key="preset.name"
          class="flex items-center gap-1 px-2 py-1 rounded-md bg-(--ui-bg) border border-(--ui-border) text-xs"
        >
          <button class="hover:underline" @click="handleApplyPreset(preset)">{{ preset.name }}</button>
          <button class="text-(--ui-text-muted) hover:text-red-500" @click="handleDeletePreset(preset.name)">
            <UIcon name="i-lucide-x" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Two-column: Primary Texts | Headlines + Descriptions -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
      <!-- Primary Texts -->
      <div>
        <div class="flex items-center justify-between mb-1.5">
          <label class="text-xs font-medium">Primary Text <span class="text-(--ui-text-muted)">(up to 5)</span></label>
          <UButton
            v-if="primaryTexts.length < 5"
            variant="ghost"
            size="xs"
            icon="i-lucide-plus"
            @click="addField(primaryTexts, 5)"
          >
            Add
          </UButton>
        </div>
        <div class="space-y-2">
          <div v-for="(_, i) in primaryTexts" :key="i" class="flex gap-1.5">
            <div class="flex-1 min-w-0 relative">
              <UTextarea
                v-model="primaryTexts[i]"
                :rows="3"
                size="sm"
                :placeholder="`Primary text ${i + 1}...`"
                :maxlength="250"
                class="w-full"
              />
              <span class="absolute bottom-1.5 right-2 text-[10px] text-(--ui-text-muted)">
                {{ primaryTexts[i]?.length || 0 }}/250
              </span>
            </div>
            <UButton
              v-if="primaryTexts.length > 1"
              variant="ghost"
              size="xs"
              icon="i-lucide-trash-2"
              color="error"
              @click="removeField(primaryTexts, i)"
            />
          </div>
        </div>
      </div>

      <!-- Headlines + Descriptions stacked -->
      <div class="space-y-5">
        <!-- Headlines -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-medium">Headlines <span class="text-(--ui-text-muted)">(up to 5, 40 chars)</span></label>
            <UButton
              v-if="headlines.length < 5"
              variant="ghost"
              size="xs"
              icon="i-lucide-plus"
              @click="addField(headlines, 5)"
            >
              Add
            </UButton>
          </div>
          <div class="space-y-2">
            <div v-for="(_, i) in headlines" :key="i" class="flex gap-1.5">
              <div class="flex-1 min-w-0 relative">
                <UInput
                  v-model="headlines[i]"
                  size="sm"
                  :placeholder="`Headline ${i + 1}...`"
                  :maxlength="40"
                  class="w-full"
                />
                <span class="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] text-(--ui-text-muted)">
                  {{ headlines[i]?.length || 0 }}/40
                </span>
              </div>
              <UButton
                v-if="headlines.length > 1"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                color="error"
                @click="removeField(headlines, i)"
              />
            </div>
          </div>
        </div>

        <!-- Descriptions -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label class="text-xs font-medium">Descriptions <span class="text-(--ui-text-muted)">(up to 5, 30 chars)</span></label>
            <UButton
              v-if="descriptions.length < 5"
              variant="ghost"
              size="xs"
              icon="i-lucide-plus"
              @click="addField(descriptions, 5)"
            >
              Add
            </UButton>
          </div>
          <div class="space-y-2">
            <div v-for="(_, i) in descriptions" :key="i" class="flex gap-1.5">
              <div class="flex-1 min-w-0 relative">
                <UInput
                  v-model="descriptions[i]"
                  size="sm"
                  :placeholder="`Description ${i + 1}...`"
                  :maxlength="30"
                  class="w-full"
                />
                <span class="absolute top-1/2 -translate-y-1/2 right-2 text-[10px] text-(--ui-text-muted)">
                  {{ descriptions[i]?.length || 0 }}/30
                </span>
              </div>
              <UButton
                v-if="descriptions.length > 1"
                variant="ghost"
                size="xs"
                icon="i-lucide-trash-2"
                color="error"
                @click="removeField(descriptions, i)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- CTA + Page + Link URL — three columns -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <label class="text-xs font-medium block mb-1.5">Call to Action</label>
        <USelect
          v-model="callToAction"
          :items="CTA_OPTIONS"
          value-key="value"
          size="sm"
          class="w-full"
        />
      </div>
      <div>
        <label class="text-xs font-medium block mb-1.5">Facebook Page</label>
        <USelect
          v-if="pageItems.length"
          v-model="pageId"
          :items="pageItems"
          value-key="value"
          size="sm"
          placeholder="Select page"
          class="w-full"
        />
        <p v-else class="text-xs text-(--ui-text-muted) py-1.5">No pages available</p>
      </div>
      <div>
        <label class="text-xs font-medium block mb-1.5">Link URL</label>
        <UInput
          v-model="linkUrl"
          size="sm"
          placeholder="https://example.com/landing-page"
          icon="i-lucide-link"
          class="w-full"
        />
        <p v-if="linkUrl && !/^https?:\/\/.+/.test(linkUrl)" class="text-[10px] text-red-500 mt-0.5">
          Must be a valid http/https URL
        </p>
      </div>
    </div>

    <!-- Save as preset -->
    <div class="pt-2 border-t border-(--ui-border)">
      <div v-if="!showPresetSave">
        <UButton variant="ghost" size="xs" icon="i-lucide-bookmark" @click="showPresetSave = true">
          Save as Preset
        </UButton>
      </div>
      <div v-else class="flex gap-2 max-w-sm">
        <UInput v-model="presetName" size="sm" placeholder="Preset name..." class="flex-1" />
        <UButton size="sm" @click="handleSavePreset">Save</UButton>
        <UButton variant="ghost" size="sm" @click="showPresetSave = false">Cancel</UButton>
      </div>
    </div>
  </div>
</template>
