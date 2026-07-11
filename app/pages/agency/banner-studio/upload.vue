<script setup lang="ts">
import { matchImageToFormat, type FormatMatch } from '~/utils/banner-format-matcher'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown }
) => Promise<T>

const projectName = ref('')
const uploading = ref(false)
const showHelp = ref(false)

interface UploadFile {
  file: File
  preview: string
  w: number
  h: number
  format: FormatMatch
}

const files = ref<UploadFile[]>([])
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

function getImageDimensions(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight })
      URL.revokeObjectURL(img.src)
    }
    img.onerror = () => {
      URL.revokeObjectURL(img.src)
      reject(new Error('Failed to read image'))
    }
    img.src = URL.createObjectURL(file)
  })
}

async function addFiles(newFiles: FileList | File[]) {
  for (const file of Array.from(newFiles)) {
    if (!file.type.startsWith('image/')) {
      toast.add({ title: 'Invalid file', description: `${file.name} is not an image`, color: 'error' })
      continue
    }
    try {
      const { w, h } = await getImageDimensions(file)
      const format = matchImageToFormat(w, h)
      files.value.push({
        file,
        preview: URL.createObjectURL(file),
        w,
        h,
        format,
      })
    } catch {
      toast.add({ title: 'Error', description: `Failed to read ${file.name}`, color: 'error' })
    }
  }
}

function removeFile(index: number) {
  const removed = files.value.splice(index, 1)
  if (removed[0]) URL.revokeObjectURL(removed[0].preview)
}

function clearAll() {
  for (const f of files.value) URL.revokeObjectURL(f.preview)
  files.value = []
}

// Drag and drop
const isDragging = ref(false)

function onDrop(e: DragEvent) {
  isDragging.value = false
  if (e.dataTransfer?.files) addFiles(e.dataTransfer.files)
}

function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files) addFiles(input.files)
  input.value = ''
}

async function submit() {
  if (!projectName.value.trim()) {
    toast.add({ title: 'Error', description: 'Project name is required', color: 'error' })
    return
  }
  if (files.value.length === 0) {
    toast.add({ title: 'Error', description: 'Upload at least one image', color: 'error' })
    return
  }

  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('name', projectName.value.trim())
    formData.append('dimensions', JSON.stringify(files.value.map(f => ({ w: f.w, h: f.h }))))
    for (const f of files.value) {
      formData.append('files', f.file)
    }

    const result = await apiFetch<{ id: string; name: string; formatCount: number }>(
      '/api/agency/banner-studio/projects/upload-banners',
      { method: 'POST', body: formData }
    )

    toast.add({
      title: 'Project created',
      description: `${result.name} with ${result.formatCount} format${result.formatCount !== 1 ? 's' : ''}`,
      color: 'success',
    })

    await navigateTo(`/agency/banner-studio/${result.id}`)
  } catch (error: any) {
    toast.add({
      title: 'Upload failed',
      description: error?.data?.statusMessage || error?.message || 'Something went wrong',
      color: 'error',
    })
  } finally {
    uploading.value = false
  }
}

const totalSize = computed(() => {
  const bytes = files.value.reduce((sum, f) => sum + f.file.size, 0)
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
})

onUnmounted(() => {
  for (const f of files.value) URL.revokeObjectURL(f.preview)
})
</script>

<template>
  <div class="px-8 py-8">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div class="flex items-center gap-3">
        <UButton
          icon="i-lucide-arrow-left"
          variant="ghost"
          size="sm"
          to="/agency/banner-studio"
        />
        <div>
          <h1 class="text-xl font-bold">Upload Banners</h1>
          <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
            Import finished banners from Photoshop, Figma, Canva, or any design tool
          </p>
        </div>
      </div>
      <UButton
        icon="i-lucide-help-circle"
        variant="ghost"
        color="neutral"
        size="xs"
        @click="showHelp = true"
      />
    </div>

    <!-- Project name -->
    <div class="mb-5">
      <label class="block text-xs font-medium text-[var(--ui-text-muted)] mb-1">Project Name</label>
      <UInput
        v-model="projectName"
        placeholder="e.g. Q1 Campaign Banners"
        size="md"
        class="max-w-lg"
      />
    </div>

    <!-- Drop zone -->
    <div
      class="relative border-2 border-dashed rounded-lg transition-colors cursor-pointer mb-5"
      :class="[
        isDragging ? 'border-primary bg-primary/5' : 'border-[var(--ui-border)] hover:border-[var(--ui-border-hover)]',
        files.length > 0 ? 'p-5' : 'p-12',
      ]"
      @dragover.prevent="isDragging = true"
      @dragleave="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput?.click()"
    >
      <input
        ref="fileInput"
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        class="hidden"
        @change="onFileInput"
      >
      <div class="flex flex-col items-center gap-1.5">
        <div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mb-1">
          <UIcon name="i-lucide-upload-cloud" class="text-xl text-primary" />
        </div>
        <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">
          {{ files.length > 0 ? 'Add more images' : 'Drop images here or click to browse' }}
        </p>
        <p class="text-xs text-[var(--ui-text-muted)]">PNG, JPG, GIF, WebP</p>
      </div>
    </div>

    <!-- File list -->
    <div v-if="files.length > 0" class="mb-6">
      <div class="flex items-center justify-between mb-3">
        <p class="text-xs font-medium text-[var(--ui-text-muted)]">
          {{ files.length }} image{{ files.length !== 1 ? 's' : '' }} &middot; {{ totalSize }}
        </p>
        <UButton
          label="Clear all"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="clearAll"
        />
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <div
          v-for="(f, i) in files"
          :key="i"
          class="group border border-[var(--ui-border)] rounded-lg overflow-hidden bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-border-hover)] transition-colors"
        >
          <!-- Thumbnail -->
          <div class="aspect-[4/3] bg-black/80 flex items-center justify-center overflow-hidden relative">
            <img
              :src="f.preview"
              :alt="f.file.name"
              class="max-w-full max-h-full object-contain"
            >
            <UButton
              icon="i-lucide-x"
              variant="solid"
              color="neutral"
              size="xs"
              class="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
              @click.stop="removeFile(i)"
            />
          </div>
          <!-- Info -->
          <div class="px-2.5 py-2">
            <p class="text-xs font-medium truncate text-[var(--ui-text-highlighted)]" :title="f.file.name">{{ f.file.name }}</p>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-[10px] text-[var(--ui-text-muted)]">{{ f.w }}&times;{{ f.h }}</span>
              <UBadge
                :color="f.format.matchType === 'exact' ? 'success' : f.format.matchType === 'aspect' ? 'warning' : 'neutral'"
                size="xs"
                variant="subtle"
              >
                {{ f.format.name }}
              </UBadge>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Submit bar -->
    <div class="flex items-center justify-between pt-4 border-t border-[var(--ui-border)]">
      <p v-if="files.length > 0" class="text-xs text-[var(--ui-text-muted)]">
        {{ files.length }} format{{ files.length !== 1 ? 's' : '' }} will be created in the editor
      </p>
      <p v-else class="text-xs text-[var(--ui-text-muted)]">
        Upload at least one image to create a project
      </p>
      <UButton
        label="Create Project"
        icon="i-lucide-arrow-right"
        trailing
        :loading="uploading"
        :disabled="files.length === 0 || !projectName.trim()"
        @click="submit"
      />
    </div>

    <!-- Help slideover -->
    <USlideover v-model:open="showHelp">
      <template #content>
        <div class="p-6 overflow-y-auto">
          <div class="flex items-center justify-between mb-6">
            <h2 class="text-base font-bold">How it works</h2>
            <UButton icon="i-lucide-x" variant="ghost" color="neutral" size="xs" @click="showHelp = false" />
          </div>

          <div class="space-y-5">
            <!-- Step 1 -->
            <div class="flex gap-3">
              <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">1</div>
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">Upload your images</p>
                <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
                  Drag and drop or browse for finished banner images. Supports PNG, JPG, GIF, and WebP.
                </p>
              </div>
            </div>

            <!-- Step 2 -->
            <div class="flex gap-3">
              <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">2</div>
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">Auto format detection</p>
                <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
                  Dimensions are matched to standard ad sizes across Google, Meta, TikTok, and LinkedIn.
                </p>
                <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                  <span class="inline-flex items-center gap-1 text-[10px] text-[var(--ui-text-muted)]"><UBadge color="success" size="xs" variant="subtle">Exact</UBadge> Standard size</span>
                  <span class="inline-flex items-center gap-1 text-[10px] text-[var(--ui-text-muted)]"><UBadge color="warning" size="xs" variant="subtle">Aspect</UBadge> Similar ratio</span>
                  <span class="inline-flex items-center gap-1 text-[10px] text-[var(--ui-text-muted)]"><UBadge color="neutral" size="xs" variant="subtle">Custom</UBadge> Non-standard</span>
                </div>
              </div>
            </div>

            <!-- Step 3 -->
            <div class="flex gap-3">
              <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">3</div>
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">A project is created</p>
                <p class="text-xs text-[var(--ui-text-muted)] mt-0.5">
                  Images are permanently saved to cloud storage and a Banner Studio project is created. Each image becomes a format tab in the editor.
                </p>
              </div>
            </div>

            <!-- Step 4 -->
            <div class="flex gap-3">
              <div class="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">4</div>
              <div>
                <p class="text-sm font-medium text-[var(--ui-text-highlighted)]">Use the full pipeline</p>
                <p class="text-xs text-[var(--ui-text-muted)] mt-0.5 mb-2">
                  Once in the editor, uploaded banners have access to:
                </p>
                <ul class="space-y-2">
                  <li class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]">
                    <UIcon name="i-lucide-globe" class="mt-0.5 flex-shrink-0 text-[var(--ui-text-dimmed)]" />
                    <span><span class="font-medium text-[var(--ui-text)]">Publish</span> &mdash; hosted URLs, iframe/JS/AMP ad tags</span>
                  </li>
                  <li class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]">
                    <UIcon name="i-lucide-monitor-play" class="mt-0.5 flex-shrink-0 text-[var(--ui-text-dimmed)]" />
                    <span><span class="font-medium text-[var(--ui-text)]">Preview</span> &mdash; platform mockups (FB, IG, Google, etc.)</span>
                  </li>
                  <li class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]">
                    <UIcon name="i-lucide-upload" class="mt-0.5 flex-shrink-0 text-[var(--ui-text-dimmed)]" />
                    <span><span class="font-medium text-[var(--ui-text)]">Meta Upload</span> &mdash; push to Facebook/Instagram campaigns</span>
                  </li>
                  <li class="flex items-start gap-2 text-xs text-[var(--ui-text-muted)]">
                    <UIcon name="i-lucide-layers" class="mt-0.5 flex-shrink-0 text-[var(--ui-text-dimmed)]" />
                    <span><span class="font-medium text-[var(--ui-text)]">Edit</span> &mdash; add text, CTAs, shapes, animations</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <!-- Tips -->
          <div class="mt-6 border border-[var(--ui-border)] rounded-lg p-3 bg-[var(--ui-bg-elevated)]">
            <p class="text-xs font-medium text-[var(--ui-text-highlighted)] mb-1.5">Tips</p>
            <ul class="text-[11px] text-[var(--ui-text-muted)] space-y-1">
              <li>Upload multiple sizes at once to create a multi-format project.</li>
              <li>Non-standard sizes work fine as custom formats.</li>
              <li>You can add text, buttons, and shapes in the editor after upload.</li>
              <li>All images are permanently saved to cloud storage.</li>
            </ul>
          </div>
        </div>
      </template>
    </USlideover>
  </div>
</template>
