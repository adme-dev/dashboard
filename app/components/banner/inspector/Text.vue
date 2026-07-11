<script setup lang="ts">
import { FORMATS, FONT_WEIGHTS, TEXT_SHADOW_PRESETS, TEXT_STROKE_PRESETS } from '~/utils/banner-constants'
import type { FontCategory } from '~/composables/useBannerFonts'

const { state, selectedLayer, updateLayer } = useBannerStudio()
const {
  searchFonts, selectFont, recentFonts, loadFont, getFont,
  customFonts, isCustomFont, fetchCustomFonts, uploadCustomFont, deleteCustomFont,
} = useBannerFonts()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// AI copy generation
const showAiSuggest = ref(false)
const aiLoading = ref(false)
const aiSuggestions = ref<{ text: string; tone: string; charCount: number }[]>([])

async function fetchAiCopy() {
  if (!selectedLayer.value?.text) return
  aiLoading.value = true
  aiSuggestions.value = []
  showAiSuggest.value = true

  try {
    const fmt = state.activeKey ? FORMATS[state.activeKey] : null
    const result = await apiFetch<{ suggestions: typeof aiSuggestions.value }>('/api/agency/banner-studio/ai/copy-suggest', {
      method: 'POST',
      body: {
        text: selectedLayer.value.text,
        context: {
          projectName: state.project?.name,
          format: fmt ? `${fmt.w}x${fmt.h}` : undefined,
        },
      },
    })
    aiSuggestions.value = result.suggestions
  } catch {
    toast.add({ title: 'AI unavailable', description: 'Could not generate suggestions', color: 'warning' })
    showAiSuggest.value = false
  } finally {
    aiLoading.value = false
  }
}

function applyAiSuggestion(text: string) {
  set('text', text)
  showAiSuggest.value = false
  toast.add({ title: 'Applied', description: 'Text updated', color: 'success' })
}

const TONE_COLORS: Record<string, string> = {
  punchy: 'error',
  bold: 'error',
  professional: 'primary',
  formal: 'primary',
  playful: 'success',
  inviting: 'success',
  urgent: 'warning',
  'benefit-focused': 'info',
  concise: 'neutral',
  clean: 'neutral',
  general: 'neutral',
}

// Font picker state
const fontSearch = ref('')
const fontCategory = ref<FontCategory>('all')
const showFontPicker = ref(false)
const uploading = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

const filteredFonts = computed(() => searchFonts(fontSearch.value, fontCategory.value))

function pickFont(family: string) {
  selectFont(family)
  set('fontFamily', family)
  showFontPicker.value = false
  fontSearch.value = ''
}

// Trigger file input for font upload
function triggerFontUpload() {
  fileInputRef.value?.click()
}

async function handleFontUpload(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  input.value = '' // reset so same file can be re-selected

  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!ext || !['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
    toast.add({ title: 'Invalid format', description: 'Supported: .woff2, .woff, .ttf, .otf', color: 'error' })
    return
  }
  if (file.size > 5 * 1024 * 1024) {
    toast.add({ title: 'File too large', description: 'Max font size is 5MB', color: 'error' })
    return
  }

  uploading.value = true
  try {
    const cf = await uploadCustomFont(file)
    if (cf) {
      const family = cf.name
      pickFont(family)
      toast.add({ title: 'Font uploaded', description: family, color: 'success' })
    }
  } catch (err: any) {
    toast.add({ title: 'Upload failed', description: err?.data?.statusMessage || 'Unknown error', color: 'error' })
  } finally {
    uploading.value = false
  }
}

async function handleDeleteFont(id: number, family: string) {
  try {
    await deleteCustomFont(id)
    toast.add({ title: 'Font deleted', description: family, color: 'success' })
  } catch {
    toast.add({ title: 'Delete failed', color: 'error' })
  }
}

// Load the currently selected font + fetch custom fonts on mount
onMounted(async () => {
  fetchCustomFonts()
  const family = selectedLayer.value?.fontFamily
  if (family) {
    const font = getFont(family)
    if (font) loadFont(family, font.weights)
    else loadFont(family)
  }
})

function set(key: string, val: any) {
  if (!selectedLayer.value) return
  updateLayer(selectedLayer.value.id, { [key]: val })
}

function setNum(key: string, val: string | number) {
  set(key, Number(val))
}

const textTransformOptions = [
  { label: 'None', value: 'none' },
  { label: 'Uppercase', value: 'uppercase' },
  { label: 'Lowercase', value: 'lowercase' },
  { label: 'Capitalize', value: 'capitalize' },
]

const alignOptions = [
  { icon: 'i-lucide-align-left', value: 'left' },
  { icon: 'i-lucide-align-center', value: 'center' },
  { icon: 'i-lucide-align-right', value: 'right' },
]

// Text effect state — track when user explicitly picks "Custom"
const forceCustomShadow = ref(false)
const forceCustomStroke = ref(false)

const shadowPresetValue = computed(() => {
  if (forceCustomShadow.value) return '__custom__'
  const current = selectedLayer.value?.textShadow || 'none'
  const found = TEXT_SHADOW_PRESETS.find(p => p.value === current && p.value !== '__custom__')
  return found ? found.value : '__custom__'
})

const strokePresetValue = computed(() => {
  if (forceCustomStroke.value) return '__custom__'
  const current = selectedLayer.value?.textStroke || 'none'
  const found = TEXT_STROKE_PRESETS.find(p => p.value === current && p.value !== '__custom__')
  return found ? found.value : '__custom__'
})

function setShadowPreset(v: string) {
  if (v === '__custom__') {
    forceCustomShadow.value = true
  } else {
    forceCustomShadow.value = false
    set('textShadow', v === 'none' ? undefined : v)
  }
}

function setStrokePreset(v: string) {
  if (v === '__custom__') {
    forceCustomStroke.value = true
  } else {
    forceCustomStroke.value = false
    set('textStroke', v === 'none' ? undefined : v)
  }
}

const gradientEnabled = computed(() => (selectedLayer.value?.gradientColors?.length ?? 0) >= 2)

function toggleGradient() {
  if (gradientEnabled.value) {
    set('gradientColors', undefined)
  } else {
    set('gradientColors', ['#ff0000', '#0000ff'])
  }
}
</script>

<template>
  <div v-if="selectedLayer" class="space-y-3">
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Text</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Content</label>
      <UInput size="xs" :model-value="selectedLayer.text ?? ''" @update:model-value="v => set('text', v)" />
      <UPopover v-model:open="showAiSuggest">
        <UButton
          size="xs"
          variant="soft"
          color="primary"
          icon="i-lucide-sparkles"
          class="mt-1 w-full"
          :loading="aiLoading"
          :disabled="!selectedLayer.text"
          @click="fetchAiCopy"
        >
          AI Suggest Copy
        </UButton>
        <template #content>
          <div class="w-72 p-3 space-y-2">
            <div class="text-xs font-semibold flex items-center gap-1.5">
              <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-(--ui-primary)" />
              AI Suggestions
            </div>
            <div v-if="aiLoading" class="flex items-center justify-center py-6">
              <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin text-(--ui-text-muted)" />
            </div>
            <template v-else>
              <button
                v-for="(s, si) in aiSuggestions"
                :key="si"
                class="w-full text-left px-3 py-2 rounded-md text-xs hover:bg-(--ui-bg-accented) transition-colors border border-(--ui-border)/50 space-y-1"
                @click="applyAiSuggestion(s.text)"
              >
                <div class="font-medium text-(--ui-text)">{{ s.text }}</div>
                <div class="flex items-center gap-1.5">
                  <UBadge size="xs" variant="subtle" :color="(TONE_COLORS[s.tone] as any) || 'neutral'">{{ s.tone }}</UBadge>
                  <span class="text-[10px] text-(--ui-text-dimmed) font-mono">{{ s.charCount }} chars</span>
                </div>
              </button>
              <div v-if="!aiSuggestions.length" class="text-center text-xs text-(--ui-text-muted) py-4">
                No suggestions generated
              </div>
            </template>
          </div>
        </template>
      </UPopover>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Font</label>
        <UPopover v-model:open="showFontPicker">
          <UButton
            size="xs"
            variant="outline"
            class="w-full justify-between font-normal"
            trailing-icon="i-lucide-chevron-down"
            @click="showFontPicker = !showFontPicker"
          >
            <span class="truncate text-xs">{{ selectedLayer.fontFamily ?? 'Barlow Condensed' }}</span>
          </UButton>
          <template #content>
            <div class="w-72 max-h-80 flex flex-col">
              <div class="p-2 border-b border-(--ui-border)">
                <UInput v-model="fontSearch" icon="i-lucide-search" placeholder="Search fonts..." size="xs" autofocus />
                <div class="flex gap-0.5 mt-1.5 flex-wrap">
                  <UButton
                    v-for="cat in [{ l: 'All', v: 'all' }, { l: 'Custom', v: 'custom' }, { l: 'Sans', v: 'sans-serif' }, { l: 'Serif', v: 'serif' }, { l: 'Display', v: 'display' }, { l: 'Script', v: 'handwriting' }, { l: 'Mono', v: 'monospace' }]"
                    :key="cat.v"
                    size="xs"
                    :variant="fontCategory === cat.v ? 'solid' : 'ghost'"
                    @click="fontCategory = cat.v as FontCategory"
                  >
                    {{ cat.l }}
                  </UButton>
                </div>
              </div>
              <div class="overflow-y-auto flex-1">
                <!-- Upload button (always visible in Custom tab, or at top of All) -->
                <div v-if="fontCategory === 'custom' || fontCategory === 'all'" class="p-2 border-b border-(--ui-border)">
                  <input ref="fileInputRef" type="file" accept=".woff2,.woff,.ttf,.otf" class="hidden" @change="handleFontUpload" />
                  <UButton
                    size="xs"
                    variant="soft"
                    icon="i-lucide-upload"
                    :loading="uploading"
                    class="w-full"
                    @click="triggerFontUpload"
                  >
                    Upload Custom Font
                  </UButton>
                  <div class="text-[10px] text-(--ui-text-dimmed) mt-1 text-center">.woff2, .woff, .ttf, .otf — max 5MB</div>
                </div>

                <!-- Custom fonts section (in Custom tab) -->
                <template v-if="fontCategory === 'custom'">
                  <template v-if="customFonts.length">
                    <div
                      v-for="cf in customFonts"
                      :key="cf.id"
                      class="w-full px-3 py-1.5 text-xs hover:bg-(--ui-bg-elevated) transition-colors flex items-center justify-between group"
                      :class="selectedLayer?.fontFamily === (cf.name) ? 'text-(--ui-primary) bg-(--ui-primary)/5' : ''"
                    >
                      <button class="flex-1 text-left truncate" @click="pickFont(cf.name)">
                        {{ cf.name }}
                      </button>
                      <div class="flex items-center gap-1">
                        <span class="text-[10px] text-(--ui-text-dimmed)">{{ Math.round(cf.fileSize / 1024) }}KB</span>
                        <UButton
                          size="xs"
                          variant="ghost"
                          color="error"
                          icon="i-lucide-trash-2"
                          class="opacity-0 group-hover:opacity-100 transition-opacity"
                          @click.stop="handleDeleteFont(cf.id, cf.name)"
                        />
                      </div>
                    </div>
                  </template>
                  <div v-else class="p-4 text-center text-xs text-(--ui-text-muted)">
                    No custom fonts yet. Upload one above.
                  </div>
                </template>

                <!-- Recently used -->
                <template v-if="fontCategory !== 'custom'">
                  <template v-if="!fontSearch && fontCategory === 'all' && recentFonts.length">
                    <div class="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-(--ui-text-muted)">Recent</div>
                    <button
                      v-for="f in recentFonts"
                      :key="'r-' + f"
                      class="w-full text-left px-3 py-1.5 text-xs hover:bg-(--ui-bg-elevated) transition-colors flex items-center justify-between"
                      :class="selectedLayer?.fontFamily === f ? 'text-(--ui-primary) bg-(--ui-primary)/5' : ''"
                      @click="pickFont(f)"
                    >
                      <span>{{ f }}</span>
                      <div class="flex items-center gap-1">
                        <UBadge v-if="isCustomFont(f)" size="xs" variant="subtle" color="warning">custom</UBadge>
                        <UIcon v-if="selectedLayer?.fontFamily === f" name="i-lucide-check" class="w-3 h-3" />
                      </div>
                    </button>
                    <div class="border-b border-(--ui-border) mx-2 my-1" />
                  </template>
                  <!-- Font list -->
                  <button
                    v-for="font in filteredFonts"
                    :key="font.family"
                    class="w-full text-left px-3 py-1.5 text-xs hover:bg-(--ui-bg-elevated) transition-colors flex items-center justify-between"
                    :class="selectedLayer?.fontFamily === font.family ? 'text-(--ui-primary) bg-(--ui-primary)/5' : ''"
                    @click="pickFont(font.family)"
                  >
                    <span>{{ font.family }}</span>
                    <span class="text-[10px] text-(--ui-text-dimmed)">{{ font.category === 'custom' ? 'custom' : font.category.replace('-', ' ') }}</span>
                  </button>
                  <div v-if="!filteredFonts.length" class="p-4 text-center text-xs text-(--ui-text-muted)">No fonts found</div>
                </template>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Weight</label>
        <USelectMenu
          size="xs"
          :model-value="String(selectedLayer.fontWeight ?? 400)"
          :items="FONT_WEIGHTS.map(w => ({ label: w.label, value: String(w.value) }))"
          value-key="value"
          @update:model-value="v => setNum('fontWeight', v)"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Size</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.fontSize ?? 16" @update:model-value="v => setNum('fontSize', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Line Height</label>
        <UInput type="number" size="xs" step="0.1" :model-value="selectedLayer.lineHeight ?? 1.2" @update:model-value="v => setNum('lineHeight', v)" />
      </div>
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Color</label>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="selectedLayer.color ?? '#ffffff'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('color', (e.target as HTMLInputElement).value)"
        />
        <UInput size="xs" class="flex-1" :model-value="selectedLayer.color ?? '#ffffff'" @update:model-value="v => set('color', v)" />
      </div>
    </div>

    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Align</label>
      <div class="flex gap-0.5">
        <UButton
          v-for="opt in alignOptions"
          :key="opt.value"
          size="xs"
          :icon="opt.icon"
          :variant="(selectedLayer.textAlign ?? 'left') === opt.value ? 'solid' : 'ghost'"
          @click="set('textAlign', opt.value)"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Transform</label>
        <USelectMenu
          size="xs"
          :model-value="selectedLayer.textTransform ?? 'none'"
          :items="textTransformOptions"
          value-key="value"
          @update:model-value="v => set('textTransform', v)"
        />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Spacing</label>
        <UInput size="xs" :model-value="selectedLayer.letterSpacing ?? '0'" @update:model-value="v => set('letterSpacing', v)" />
      </div>
    </div>

    <!-- Background color (for badge-style text) -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Background</label>
      <div class="flex items-center gap-1.5">
        <input
          type="color"
          :value="selectedLayer.bgColor ?? '#000000'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('bgColor', (e.target as HTMLInputElement).value)"
        />
        <UInput size="xs" class="flex-1" :model-value="selectedLayer.bgColor ?? ''" placeholder="none" @update:model-value="v => set('bgColor', v)" />
      </div>
    </div>

    <div v-if="selectedLayer.bgColor" class="grid grid-cols-2 gap-1.5">
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Pad H</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.paddingH ?? 0" @update:model-value="v => setNum('paddingH', v)" />
      </div>
      <div>
        <label class="text-[10px] text-(--ui-text-muted)">Pad V</label>
        <UInput type="number" size="xs" :model-value="selectedLayer.paddingV ?? 0" @update:model-value="v => setNum('paddingV', v)" />
      </div>
    </div>

      </div>
    </details>

    <!-- Effects -->
    <details open class="bs-section group">
      <summary class="flex items-center gap-1.5 cursor-pointer select-none py-1.5 -mx-1 px-1 rounded hover:bg-white/[0.03]">
        <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-[#555] transition-transform duration-150 group-open:rotate-90" />
        <span class="text-[10px] font-semibold uppercase tracking-wider text-[#888]">Effects</span>
      </summary>
      <div class="pt-1.5 space-y-3">
    <!-- Italic toggle -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Style</label>
      <div class="flex gap-0.5">
        <UButton
          size="xs"
          icon="i-lucide-italic"
          :variant="selectedLayer.fontStyle === 'italic' ? 'solid' : 'ghost'"
          @click="set('fontStyle', selectedLayer.fontStyle === 'italic' ? 'normal' : 'italic')"
        />
      </div>
    </div>

    <!-- Text Shadow -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Shadow</label>
      <USelectMenu
        size="xs"
        :model-value="shadowPresetValue"
        :items="TEXT_SHADOW_PRESETS.map(p => ({ label: p.label, value: p.value }))"
        value-key="value"
        @update:model-value="setShadowPreset"
      />
      <UInput
        v-if="shadowPresetValue === '__custom__'"
        size="xs"
        class="mt-1"
        placeholder="2px 2px 4px rgba(0,0,0,0.5)"
        :model-value="selectedLayer.textShadow ?? ''"
        @update:model-value="v => set('textShadow', v || undefined)"
      />
    </div>

    <!-- Text Stroke -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Stroke</label>
      <USelectMenu
        size="xs"
        :model-value="strokePresetValue"
        :items="TEXT_STROKE_PRESETS.map(p => ({ label: p.label, value: p.value }))"
        value-key="value"
        @update:model-value="setStrokePreset"
      />
      <UInput
        v-if="strokePresetValue === '__custom__'"
        size="xs"
        class="mt-1"
        placeholder="1px #000"
        :model-value="selectedLayer.textStroke ?? ''"
        @update:model-value="v => set('textStroke', v || undefined)"
      />
    </div>

    <!-- Gradient Text -->
    <div>
      <label class="text-[10px] text-(--ui-text-muted)">Gradient</label>
      <div class="flex items-center gap-2">
        <UCheckbox :model-value="gradientEnabled" @update:model-value="toggleGradient" />
        <span class="text-xs text-(--ui-text-muted)">Gradient fill</span>
      </div>
      <div v-if="gradientEnabled" class="flex items-center gap-1.5 mt-1">
        <input
          type="color"
          :value="selectedLayer.gradientColors?.[0] ?? '#ff0000'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('gradientColors', [(e.target as HTMLInputElement).value, selectedLayer.gradientColors?.[1] ?? '#0000ff'])"
        />
        <span class="text-[10px] text-(--ui-text-muted)">→</span>
        <input
          type="color"
          :value="selectedLayer.gradientColors?.[1] ?? '#0000ff'"
          class="w-6 h-6 rounded cursor-pointer border border-(--ui-border)"
          @input="(e: Event) => set('gradientColors', [selectedLayer.gradientColors?.[0] ?? '#ff0000', (e.target as HTMLInputElement).value])"
        />
      </div>
    </div>
      </div>
    </details>
  </div>
</template>
