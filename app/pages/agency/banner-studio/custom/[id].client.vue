<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const route = useRoute()
const router = useRouter()
const instanceId = route.params.id as string

const {
  loading, saving, publishing, instance,
  instanceName, variableValues,
  htmlOverride, cssOverride, jsOverride,
  width, height, clickUrl, impressionPixel, clickPixel,
  templateVariables, templateHtml, templateCss, templateJs,
  effectiveHtml, effectiveCss, effectiveJs,
  previewHtml, isDirty,
  load, save, publish,
  resetCodeToTemplate, resetVariablesToDefaults,
} = useCustomBannerEditor(instanceId)

// Code editor active tab
const codeTab = ref('html')
const codeTabs = [
  { label: 'HTML', value: 'html' },
  { label: 'CSS', value: 'css' },
  { label: 'JS', value: 'js' },
]

// Preview debounce
const debouncedPreview = ref('')
let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(previewHtml, (val) => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    debouncedPreview.value = val
  }, 500)
}, { immediate: true })

// Scale the preview iframe to fit
const previewContainerRef = ref<HTMLElement | null>(null)
const scaleToFit = ref(true)

const previewScale = computed(() => {
  if (!scaleToFit.value) return 1
  const maxW = 380
  const maxH = 360
  const sx = maxW / width.value
  const sy = maxH / height.value
  return Math.min(sx, sy, 1)
})

// Publish modal
const showPublishModal = ref(false)

async function handlePublish() {
  const result = await publish()
  if (result) {
    showPublishModal.value = true
  }
}

// Grouped variables
const variableGroups = computed(() => {
  const groups: Record<string, typeof templateVariables.value> = {}
  for (const v of templateVariables.value) {
    const g = v.group || 'General'
    if (!groups[g]) groups[g] = []
    groups[g].push(v)
  }
  return groups
})

// Current code model for the active tab
const currentCode = computed({
  get() {
    switch (codeTab.value) {
      case 'html': return effectiveHtml.value
      case 'css': return effectiveCss.value
      case 'js': return effectiveJs.value
      default: return ''
    }
  },
  set(val: string) {
    switch (codeTab.value) {
      case 'html': htmlOverride.value = val; break
      case 'css': cssOverride.value = val; break
      case 'js': jsOverride.value = val; break
    }
  },
})

const currentLanguage = computed(() => {
  return codeTab.value === 'js' ? 'javascript' : codeTab.value as 'html' | 'css'
})

// Load on mount
onMounted(() => load())

// Keyboard shortcut: Cmd+S to save
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="h-screen flex flex-col overflow-hidden">
    <!-- Loading -->
    <div v-if="loading" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="animate-spin text-3xl text-muted" />
    </div>

    <template v-else-if="instance">
      <!-- Toolbar -->
      <div class="flex items-center gap-3 px-4 py-2 border-b border-default bg-default shrink-0">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          size="sm"
          @click="router.push('/agency/banner-studio/custom-templates')"
        />
        <UInput
          v-model="instanceName"
          variant="none"
          class="font-semibold text-lg w-64"
          placeholder="Instance name"
        />
        <UBadge :label="instance.templateCategory" variant="subtle" size="xs" />
        <span class="text-xs text-muted">{{ width }}x{{ height }}</span>

        <div class="flex-1" />

        <UBadge
          v-if="instance.isPublished"
          label="Published"
          color="success"
          variant="subtle"
          size="xs"
        />
        <UBadge
          v-if="isDirty"
          label="Unsaved"
          color="warning"
          variant="subtle"
          size="xs"
        />

        <UButton
          label="Save"
          icon="i-lucide-save"
          variant="outline"
          size="sm"
          :loading="saving"
          @click="save"
        />
        <UButton
          label="Publish"
          icon="i-lucide-globe"
          color="primary"
          size="sm"
          :loading="publishing"
          @click="handlePublish"
        />
      </div>

      <!-- 3-Panel Layout -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left: Variable Form (280px) -->
        <div class="w-[280px] border-r border-default overflow-y-auto p-3 shrink-0">
          <h3 class="text-sm font-semibold mb-3">Variables</h3>

          <div v-for="(vars, group) in variableGroups" :key="group" class="mb-4">
            <h4 v-if="Object.keys(variableGroups).length > 1" class="text-xs font-medium text-muted mb-2 uppercase tracking-wide">
              {{ group }}
            </h4>
            <div v-for="v in vars" :key="v.name" class="mb-3">
              <label class="text-xs text-muted block mb-1">{{ v.label }}</label>
              <div v-if="v.type === 'color'" class="flex gap-2">
                <input
                  type="color"
                  :value="variableValues[v.name] || v.default"
                  class="w-8 h-8 rounded border border-default cursor-pointer"
                  @input="variableValues[v.name] = ($event.target as HTMLInputElement).value"
                >
                <UInput
                  :model-value="variableValues[v.name] || v.default"
                  size="xs"
                  class="flex-1 font-mono"
                  @update:model-value="variableValues[v.name] = $event"
                />
              </div>
              <UInput
                v-else
                :model-value="variableValues[v.name] || v.default"
                size="xs"
                :type="v.type === 'number' ? 'number' : 'text'"
                :placeholder="v.default"
                @update:model-value="variableValues[v.name] = String($event)"
              />
            </div>
          </div>

          <UButton
            label="Reset to Defaults"
            icon="i-lucide-rotate-ccw"
            variant="ghost"
            size="xs"
            class="mt-2"
            @click="resetVariablesToDefaults"
          />

          <!-- Instance metadata -->
          <div class="mt-6 pt-4 border-t border-default">
            <h3 class="text-sm font-semibold mb-3">Settings</h3>

            <div class="mb-3">
              <label class="text-xs text-muted block mb-1">Width</label>
              <UInput v-model.number="width" type="number" size="xs" />
            </div>
            <div class="mb-3">
              <label class="text-xs text-muted block mb-1">Height</label>
              <UInput v-model.number="height" type="number" size="xs" />
            </div>
            <div class="mb-3">
              <label class="text-xs text-muted block mb-1">Click URL</label>
              <UInput v-model="clickUrl" size="xs" placeholder="https://..." />
            </div>
            <div class="mb-3">
              <label class="text-xs text-muted block mb-1">Impression Pixel</label>
              <UInput v-model="impressionPixel" size="xs" placeholder="https://..." />
            </div>
            <div class="mb-3">
              <label class="text-xs text-muted block mb-1">Click Pixel</label>
              <UInput v-model="clickPixel" size="xs" placeholder="https://..." />
            </div>
          </div>
        </div>

        <!-- Center: Code Editor -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div class="flex items-center gap-1 px-3 py-2 border-b border-default shrink-0">
            <UButton
              v-for="tab in codeTabs"
              :key="tab.value"
              :label="tab.label"
              :variant="codeTab === tab.value ? 'solid' : 'ghost'"
              :color="codeTab === tab.value ? 'primary' : 'neutral'"
              size="xs"
              @click="codeTab = tab.value"
            />
            <div class="flex-1" />
            <UButton
              label="Reset to Template"
              icon="i-lucide-rotate-ccw"
              variant="ghost"
              size="xs"
              @click="resetCodeToTemplate"
            />
          </div>
          <div class="flex-1 overflow-hidden">
            <BannerCodeEditor
              :model-value="currentCode"
              :language="currentLanguage"
              height="100%"
              @update:model-value="currentCode = $event"
            />
          </div>
        </div>

        <!-- Right: Live Preview (400px) -->
        <div class="w-[400px] border-l border-default overflow-hidden flex flex-col shrink-0">
          <div class="flex items-center justify-between px-3 py-2 border-b border-default shrink-0">
            <h3 class="text-sm font-semibold">Live Preview</h3>
            <div class="flex items-center gap-2">
              <label class="text-xs text-muted flex items-center gap-1">
                <UCheckbox v-model="scaleToFit" size="xs" />
                Scale to fit
              </label>
              <UButton
                icon="i-lucide-refresh-cw"
                variant="ghost"
                size="xs"
                @click="debouncedPreview = previewHtml"
              />
            </div>
          </div>
          <div
            ref="previewContainerRef"
            class="flex-1 bg-elevated flex items-center justify-center overflow-auto p-4"
          >
            <div
              :style="{
                transform: `scale(${previewScale})`,
                transformOrigin: 'top center',
              }"
            >
              <iframe
                :srcdoc="debouncedPreview"
                :width="width"
                :height="height"
                sandbox="allow-scripts"
                class="border border-default rounded bg-white"
                style="display: block;"
              />
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- Publish Modal -->
    <BannerCustomBannerPublishModal
      v-if="instance"
      v-model:open="showPublishModal"
      :instance="instance"
    />
  </div>
</template>
