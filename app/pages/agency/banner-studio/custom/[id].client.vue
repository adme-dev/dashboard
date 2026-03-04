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
  includeGsap, enableConsoleRelay,
  previewHtml, isDirty,
  load, save, publish,
  savingAsTemplate, saveAsTemplate,
  resetCodeToTemplate, resetVariablesToDefaults,
} = useCustomBannerEditor(instanceId)

// Center panel: preview is default, can switch to code tabs
const centerTab = ref<'preview' | 'html' | 'css' | 'js'>('preview')

// Preview debounce
const debouncedPreview = ref('')
let previewTimer: ReturnType<typeof setTimeout> | null = null

watch(previewHtml, (val) => {
  if (previewTimer) clearTimeout(previewTimer)
  previewTimer = setTimeout(() => {
    debouncedPreview.value = val
  }, 500)
}, { immediate: true })

// Dynamic preview scaling based on container size
const previewContainerRef = ref<HTMLElement | null>(null)
const containerRect = ref({ width: 800, height: 600 })

function measureContainer() {
  if (previewContainerRef.value) {
    const r = previewContainerRef.value.getBoundingClientRect()
    containerRect.value = { width: r.width - 32, height: r.height - 32 } // subtract padding
  }
}

// Zoom controls
const zoomMode = ref<'fit' | 'manual'>('fit')
const manualZoom = ref(1)

const fitScale = computed(() => {
  const cw = containerRect.value.width
  const ch = containerRect.value.height
  const sx = cw / width.value
  const sy = ch / height.value
  return Math.min(sx, sy, 3) * 0.85
})

const previewScale = computed(() => {
  return zoomMode.value === 'fit' ? fitScale.value : manualZoom.value
})

const zoomPercent = computed(() => Math.round(previewScale.value * 100))

function zoomIn() {
  zoomMode.value = 'manual'
  manualZoom.value = Math.min((manualZoom.value || fitScale.value) + 0.1, 3)
}

function zoomOut() {
  zoomMode.value = 'manual'
  manualZoom.value = Math.max((manualZoom.value || fitScale.value) - 0.1, 0.1)
}

function zoomFit() {
  zoomMode.value = 'fit'
  manualZoom.value = fitScale.value
}

// Sync manual zoom when switching to manual mode for the first time
watch(fitScale, (val) => {
  if (zoomMode.value === 'fit') manualZoom.value = val
})


let resizeObserver: ResizeObserver | null = null
onMounted(() => {
  measureContainer()
  if (previewContainerRef.value) {
    resizeObserver = new ResizeObserver(() => measureContainer())
    resizeObserver.observe(previewContainerRef.value)
  }
})
onUnmounted(() => { resizeObserver?.disconnect() })

// Error console
interface ConsoleLine {
  id: number
  level: 'log' | 'info' | 'warn' | 'error'
  message: string
  timestamp: number
}
const consoleLogs = ref<ConsoleLine[]>([])
const showConsole = ref(true)
let consoleIdCounter = 0

function onPreviewMessage(e: MessageEvent) {
  if (e.data?.type !== 'preview-console') return
  consoleLogs.value.push({
    id: ++consoleIdCounter,
    level: e.data.level || 'log',
    message: e.data.message || '',
    timestamp: e.data.timestamp || Date.now(),
  })
  if (consoleLogs.value.length > 200) {
    consoleLogs.value = consoleLogs.value.slice(-200)
  }
}

watch(debouncedPreview, () => { consoleLogs.value = [] })

onMounted(() => window.addEventListener('message', onPreviewMessage))
onUnmounted(() => window.removeEventListener('message', onPreviewMessage))

const consoleContainerRef = ref<HTMLElement | null>(null)
watch(() => consoleLogs.value.length, () => {
  nextTick(() => {
    if (consoleContainerRef.value) {
      consoleContainerRef.value.scrollTop = consoleContainerRef.value.scrollHeight
    }
  })
})

const errorCount = computed(() => consoleLogs.value.filter(l => l.level === 'error').length)
const warnCount = computed(() => consoleLogs.value.filter(l => l.level === 'warn').length)

// Console resize
const consoleHeight = ref(160)
const isResizingConsole = ref(false)

function onConsoleResizeStart(e: MouseEvent) {
  e.preventDefault()
  isResizingConsole.value = true
  const startY = e.clientY
  const startH = consoleHeight.value

  function onMove(ev: MouseEvent) {
    const delta = startY - ev.clientY
    consoleHeight.value = Math.max(60, Math.min(startH + delta, 500))
  }

  function onUp() {
    isResizingConsole.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// AI panel toggle
const showAiPanel = ref(false)

// Hide Activity Hub when AI panel is active
const { hidden: activityHubHidden } = useActivityHub()
watch(showAiPanel, (val) => { activityHubHidden.value = val }, { immediate: true })
onUnmounted(() => { activityHubHidden.value = false })

// AI assistant context
const aiContext = computed(() => ({
  html: effectiveHtml.value,
  css: effectiveCss.value,
  js: effectiveJs.value,
  width: width.value,
  height: height.value,
  templateName: instance.value?.name,
  templateCategory: instance.value?.templateCategory,
  variables: templateVariables.value.map(v => ({ name: v.name, label: v.label, type: v.type })),
}))

const toast = useToast()

function handleApplyCode(language: string, code: string) {
  switch (language) {
    case 'html':
      htmlOverride.value = code
      centerTab.value = 'html'
      break
    case 'css':
      cssOverride.value = code
      centerTab.value = 'css'
      break
    case 'javascript':
      jsOverride.value = code
      centerTab.value = 'js'
      break
    default:
      return
  }
  toast.add({ title: 'Code applied', description: `${language.toUpperCase()} updated from AI suggestion`, color: 'success' })
}

// Export modal
const showExportModal = ref(false)

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

// Current code model for the active code tab
const currentCode = computed({
  get() {
    switch (centerTab.value) {
      case 'html': return effectiveHtml.value
      case 'css': return effectiveCss.value
      case 'js': return effectiveJs.value
      default: return ''
    }
  },
  set(val: string) {
    switch (centerTab.value) {
      case 'html': htmlOverride.value = val; break
      case 'css': cssOverride.value = val; break
      case 'js': jsOverride.value = val; break
    }
  },
})

const currentLanguage = computed(() => {
  return centerTab.value === 'js' ? 'javascript' : centerTab.value as 'html' | 'css'
})

// Load on mount
onMounted(() => load())

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault()
    save()
  }
  if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'i') {
    e.preventDefault()
    showAiPanel.value = !showAiPanel.value
  }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="h-full flex flex-col overflow-hidden">
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
          icon="i-lucide-sparkles"
          :variant="showAiPanel ? 'solid' : 'ghost'"
          :color="showAiPanel ? 'primary' : 'neutral'"
          size="sm"
          @click="showAiPanel = !showAiPanel"
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
          label="Save as Template"
          icon="i-lucide-layout-template"
          variant="outline"
          size="sm"
          :loading="savingAsTemplate"
          @click="saveAsTemplate()"
        />
        <UButton
          label="Export"
          icon="i-lucide-download"
          variant="outline"
          size="sm"
          @click="showExportModal = true"
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

      <!-- Main layout -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left: Variable Form + Settings -->
        <div class="w-[280px] border-r border-default overflow-y-auto p-3 shrink-0 space-y-3">
          <h3 class="text-sm font-semibold">Variables</h3>

          <div v-for="(vars, group) in variableGroups" :key="group">
            <h4
              v-if="Object.keys(variableGroups).length > 1"
              class="text-xs font-medium text-muted mb-2 uppercase tracking-wide"
            >
              {{ group }}
            </h4>
            <div v-for="v in vars" :key="v.name" class="mb-3">
              <label class="text-xs text-muted block mb-1">{{ v.label }}</label>
              <div v-if="v.type === 'color'" class="flex gap-2">
                <input
                  type="color"
                  :value="variableValues[v.name] || v.default"
                  class="w-8 h-8 rounded border border-default cursor-pointer shrink-0"
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
                class="w-full"
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
            @click="resetVariablesToDefaults"
          />

          <!-- Settings -->
          <div class="pt-3 border-t border-default space-y-3">
            <h3 class="text-sm font-semibold">Settings</h3>

            <div>
              <label class="text-xs text-muted block mb-1">Width</label>
              <UInput v-model.number="width" type="number" size="xs" class="w-full" />
            </div>
            <div>
              <label class="text-xs text-muted block mb-1">Height</label>
              <UInput v-model.number="height" type="number" size="xs" class="w-full" />
            </div>
            <div>
              <label class="text-xs text-muted block mb-1">Click URL</label>
              <UInput v-model="clickUrl" size="xs" class="w-full" placeholder="https://..." />
            </div>
            <div>
              <label class="text-xs text-muted block mb-1">Impression Pixel</label>
              <UInput v-model="impressionPixel" size="xs" class="w-full" placeholder="https://..." />
            </div>
            <div>
              <label class="text-xs text-muted block mb-1">Click Pixel</label>
              <UInput v-model="clickPixel" size="xs" class="w-full" placeholder="https://..." />
            </div>
          </div>
        </div>

        <!-- Center: Preview / Code (CodePen-style) -->
        <div class="flex-1 flex flex-col min-w-0 overflow-hidden">
          <!-- Tab bar: Preview | HTML | CSS | JS -->
          <div class="flex items-center gap-1 px-3 py-2 border-b border-default shrink-0">
            <UButton
              label="Preview"
              icon="i-lucide-eye"
              :variant="centerTab === 'preview' ? 'solid' : 'ghost'"
              :color="centerTab === 'preview' ? 'primary' : 'neutral'"
              size="xs"
              @click="centerTab = 'preview'"
            />
            <div class="w-px h-4 bg-default mx-1" />
            <UButton
              label="HTML"
              :variant="centerTab === 'html' ? 'solid' : 'ghost'"
              :color="centerTab === 'html' ? 'primary' : 'neutral'"
              size="xs"
              @click="centerTab = 'html'"
            />
            <UButton
              label="CSS"
              :variant="centerTab === 'css' ? 'solid' : 'ghost'"
              :color="centerTab === 'css' ? 'primary' : 'neutral'"
              size="xs"
              @click="centerTab = 'css'"
            />
            <UButton
              label="JS"
              :variant="centerTab === 'js' ? 'solid' : 'ghost'"
              :color="centerTab === 'js' ? 'primary' : 'neutral'"
              size="xs"
              @click="centerTab = 'js'"
            />
            <div class="flex-1" />

            <!-- Preview controls -->
            <template v-if="centerTab === 'preview'">
              <label class="text-xs text-muted flex items-center gap-1">
                <UCheckbox v-model="includeGsap" size="xs" />
                GSAP
              </label>
              <div class="w-px h-4 bg-default mx-1" />
              <UButton
                icon="i-lucide-minus"
                variant="ghost"
                size="xs"
                @click="zoomOut"
              />
              <button
                class="text-xs text-muted tabular-nums min-w-[3rem] text-center hover:text-default transition-colors"
                @click="zoomFit"
                title="Fit to view"
              >
                {{ zoomPercent }}%
              </button>
              <UButton
                icon="i-lucide-plus"
                variant="ghost"
                size="xs"
                @click="zoomIn"
              />
              <UButton
                icon="i-lucide-maximize-2"
                variant="ghost"
                size="xs"
                :color="zoomMode === 'fit' ? 'primary' : 'neutral'"
                title="Fit to view"
                @click="zoomFit"
              />
              <UButton
                icon="i-lucide-refresh-cw"
                variant="ghost"
                size="xs"
                @click="debouncedPreview = previewHtml"
              />
            </template>

            <!-- Code controls -->
            <UButton
              v-if="centerTab !== 'preview'"
              label="Reset to Template"
              icon="i-lucide-rotate-ccw"
              variant="ghost"
              size="xs"
              @click="resetCodeToTemplate"
            />
          </div>

          <!-- Preview canvas -->
          <div
            v-show="centerTab === 'preview'"
            ref="previewContainerRef"
            class="flex-1 min-h-0 bg-elevated overflow-auto relative"
          >
            <!-- Checkerboard / canvas background with centered content -->
            <div
              class="min-w-full min-h-full flex items-center justify-center p-6"
              :style="{
                minWidth: `${width * previewScale + 48}px`,
                minHeight: `${height * previewScale + 48}px`,
              }"
            >
              <div
                :style="{
                  width: `${width * previewScale}px`,
                  height: `${height * previewScale}px`,
                }"
              >
                <iframe
                  :srcdoc="debouncedPreview"
                  :width="width"
                  :height="height"
                  sandbox="allow-scripts allow-same-origin"
                  class="border border-default rounded bg-white shadow-sm"
                  :style="{
                    display: 'block',
                    transform: `scale(${previewScale})`,
                    transformOrigin: 'top left',
                  }"
                />
              </div>
            </div>
          </div>

          <!-- Code editor -->
          <div v-if="centerTab !== 'preview'" class="flex-1 min-h-0 overflow-hidden">
            <BannerCodeEditor
              :model-value="currentCode"
              :language="currentLanguage"
              height="100%"
              @update:model-value="currentCode = $event"
            />
          </div>

          <!-- Console: drag handle + panel -->
          <div v-if="showConsole" class="shrink-0 border-t border-default">
            <div
              class="h-1.5 cursor-row-resize bg-default hover:bg-primary/20 transition-colors flex items-center justify-center group"
              :class="{ 'bg-primary/20': isResizingConsole }"
              @mousedown="onConsoleResizeStart"
            >
              <div class="w-8 h-0.5 rounded-full bg-muted/30 group-hover:bg-primary/50 transition-colors" />
            </div>
            <div
              ref="consoleContainerRef"
              class="overflow-y-auto bg-[#1a1a2e] font-mono text-[11px] leading-relaxed"
              :style="{ height: `${consoleHeight}px` }"
            >
              <div v-if="consoleLogs.length === 0" class="px-3 py-2 text-white/30 italic">
                No console output yet. Errors, warnings, and logs from the preview will appear here.
              </div>
              <div
                v-for="line in consoleLogs"
                :key="line.id"
                class="px-3 py-0.5 border-b border-white/5 flex items-start gap-2"
                :class="{
                  'text-red-400 bg-red-500/10': line.level === 'error',
                  'text-yellow-400 bg-yellow-500/5': line.level === 'warn',
                  'text-blue-300': line.level === 'info',
                  'text-white/70': line.level === 'log',
                }"
              >
                <span class="shrink-0 w-1.5 h-1.5 rounded-full mt-1.5" :class="{
                  'bg-red-400': line.level === 'error',
                  'bg-yellow-400': line.level === 'warn',
                  'bg-blue-400': line.level === 'info',
                  'bg-white/30': line.level === 'log',
                }" />
                <span class="whitespace-pre-wrap break-all">{{ line.message }}</span>
              </div>
            </div>
          </div>

          <!-- Console toggle bar -->
          <button
            class="w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-elevated transition-colors border-t border-default shrink-0"
            @click="showConsole = !showConsole"
          >
            <UIcon name="i-lucide-terminal" class="text-muted" />
            <span class="font-medium text-muted">Console</span>
            <UBadge
              v-if="errorCount > 0"
              :label="String(errorCount)"
              color="error"
              variant="subtle"
              size="xs"
            />
            <UBadge
              v-if="warnCount > 0"
              :label="String(warnCount)"
              color="warning"
              variant="subtle"
              size="xs"
            />
            <span v-if="consoleLogs.length > 0 && errorCount === 0 && warnCount === 0" class="text-muted/50">
              {{ consoleLogs.length }} lines
            </span>
            <div class="flex-1" />
            <UButton
              v-if="showConsole && consoleLogs.length > 0"
              icon="i-lucide-trash-2"
              variant="ghost"
              size="xs"
              @click.stop="consoleLogs = []"
            />
            <UIcon
              :name="showConsole ? 'i-lucide-chevron-down' : 'i-lucide-chevron-up'"
              class="text-muted"
            />
          </button>
        </div>

        <!-- Right: AI Assistant (togglable) -->
        <div
          v-if="showAiPanel"
          class="w-[400px] border-l border-default overflow-hidden flex flex-col shrink-0"
        >
          <div class="flex items-center gap-2 px-3 py-2 border-b border-default shrink-0">
            <UIcon name="i-lucide-sparkles" class="text-primary" />
            <span class="text-sm font-semibold">AI Assistant</span>
            <div class="flex-1" />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              size="xs"
              @click="showAiPanel = false"
            />
          </div>
          <BannerCodeAssistPanel
            :context="aiContext"
            :instance-id="instanceId"
            class="flex-1 min-h-0"
            @apply="handleApplyCode"
          />
        </div>
      </div>
    </template>

    <!-- Publish Modal -->
    <BannerCustomBannerPublishModal
      v-if="instance"
      v-model:open="showPublishModal"
      :instance="instance"
    />

    <!-- Export Modal -->
    <BannerCustomBannerExportModal
      v-if="instance"
      v-model:open="showExportModal"
      :instance-id="instanceId"
      :instance-name="instanceName"
      :width="width"
      :height="height"
    />
  </div>
</template>
