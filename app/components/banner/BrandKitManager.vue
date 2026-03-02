<script setup lang="ts">
import type { BannerBrandKit, BrandKitFont, BrandKitLogo } from '~/types/banner-studio'

defineProps<{
  /** When true, shows compact view for sidebar embed */
  compact?: boolean
}>()

const emit = defineEmits<{
  apply: [kit: BannerBrandKit]
}>()

const toast = useToast()

// ── Data fetching ──────────────────────
const { data: brandKits, refresh } = useFetch<BannerBrandKit[]>('/api/agency/banner-studio/brand-kits', {
  default: () => [],
})

const { data: clientsData } = useFetch<Array<{ id: string; name: string }>>('/api/agency/clients', {
  default: () => [],
})

// ── Modal state ────────────────────────
const showEditModal = ref(false)
const showDeleteConfirm = ref(false)
const editingKit = ref<BannerBrandKit | null>(null)
const deletingKit = ref<BannerBrandKit | null>(null)

// ── Form state ─────────────────────────
const formName = ref('')
const formClientId = ref<string | null>(null)
const formColors = ref<string[]>([])
const formFonts = ref<BrandKitFont[]>([])
const formLogos = ref<BrandKitLogo[]>([])
const formGuidelines = ref('')
const isSaving = ref(false)

// ── Color editing ──────────────────────
const newColor = ref('#e8c84a')

function addColor() {
  if (formColors.value.length >= 20) return
  formColors.value.push(newColor.value)
  newColor.value = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
}

function removeColor(index: number) {
  formColors.value.splice(index, 1)
}

// ── Font editing ───────────────────────
const newFontFamily = ref('')

function addFont() {
  const family = newFontFamily.value.trim()
  if (!family || formFonts.value.some(f => f.family === family)) return
  formFonts.value.push({ family, weights: [400, 700] })
  newFontFamily.value = ''
}

function removeFont(index: number) {
  formFonts.value.splice(index, 1)
}

function toggleFontWeight(font: BrandKitFont, weight: number) {
  const idx = font.weights.indexOf(weight)
  if (idx >= 0) {
    font.weights.splice(idx, 1)
  } else {
    font.weights.push(weight)
    font.weights.sort((a, b) => a - b)
  }
}

const availableWeights = [100, 200, 300, 400, 500, 600, 700, 800, 900]

// ── Logo management ────────────────────
const logoFileInput = ref<HTMLInputElement | null>(null)

async function uploadLogo(files: FileList | File[]) {
  for (const file of files) {
    const formData = new FormData()
    formData.append('file', file)
    try {
      const result = await $fetch<{ url: string; r2Key: string }>('/api/agency/banner-studio/assets/upload', {
        method: 'POST',
        body: formData,
      })
      formLogos.value.push({
        name: file.name.replace(/\.[^.]+$/, ''),
        url: result.url,
        r2Key: result.r2Key,
      })
    } catch {
      toast.add({ title: 'Upload failed', description: `Failed to upload ${file.name}`, color: 'error' })
    }
  }
}

function onLogoFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files?.length) uploadLogo(input.files)
  input.value = ''
}

function removeLogo(index: number) {
  formLogos.value.splice(index, 1)
}

// ── Client options ─────────────────────
const clientOptions = computed(() => {
  return [
    { label: 'No client', value: 'none' },
    ...(clientsData.value || []).map(c => ({ label: c.name, value: c.id })),
  ]
})

const formClientSelect = computed({
  get: () => formClientId.value || 'none',
  set: (v: string) => { formClientId.value = v === 'none' ? null : v },
})

// ── Open modal ─────────────────────────
function openCreate() {
  editingKit.value = null
  formName.value = ''
  formClientId.value = null
  formColors.value = []
  formFonts.value = []
  formLogos.value = []
  formGuidelines.value = ''
  showEditModal.value = true
}

function openEdit(kit: BannerBrandKit) {
  editingKit.value = kit
  formName.value = kit.name
  formClientId.value = kit.clientId
  formColors.value = [...kit.colors]
  formFonts.value = kit.fonts.map(f => ({ ...f, weights: [...f.weights] }))
  formLogos.value = kit.logos.map(l => ({ ...l }))
  formGuidelines.value = kit.guidelines || ''
  showEditModal.value = true
}

// ── Save ───────────────────────────────
async function save() {
  if (!formName.value.trim()) {
    toast.add({ title: 'Validation', description: 'Name is required', color: 'error' })
    return
  }
  isSaving.value = true
  try {
    const payload = {
      name: formName.value.trim(),
      clientId: formClientId.value,
      colors: formColors.value,
      fonts: formFonts.value,
      logos: formLogos.value,
      guidelines: formGuidelines.value || null,
    }

    if (editingKit.value) {
      await $fetch(`/api/agency/banner-studio/brand-kits/${editingKit.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
      toast.add({ title: 'Updated', description: `"${formName.value}" updated`, color: 'success' })
    } else {
      await $fetch('/api/agency/banner-studio/brand-kits', {
        method: 'POST',
        body: payload,
      })
      toast.add({ title: 'Created', description: `"${formName.value}" created`, color: 'success' })
    }
    showEditModal.value = false
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to save brand kit', color: 'error' })
  } finally {
    isSaving.value = false
  }
}

// ── Delete ─────────────────────────────
function confirmDelete(kit: BannerBrandKit) {
  deletingKit.value = kit
  showDeleteConfirm.value = true
}

async function doDelete() {
  if (!deletingKit.value) return
  try {
    await $fetch(`/api/agency/banner-studio/brand-kits/${deletingKit.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `"${deletingKit.value.name}" removed`, color: 'success' })
    showDeleteConfirm.value = false
    deletingKit.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete brand kit', color: 'error' })
  }
}

// ── Apply to studio ────────────────────
function applyKit(kit: BannerBrandKit) {
  emit('apply', kit)
  toast.add({ title: 'Applied', description: `"${kit.name}" colors & fonts applied`, color: 'success' })
}
</script>

<template>
  <div :class="compact ? 'p-3 space-y-3' : 'space-y-4'">
    <!-- Header -->
    <div class="flex items-center justify-between" :class="{ 'mb-2': !compact }">
      <h4 v-if="compact" class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">Brand Kits</h4>
      <h2 v-else class="text-lg font-bold text-(--ui-text)">Brand Kits</h2>
      <UButton
        icon="i-lucide-plus"
        :label="compact ? undefined : 'New Kit'"
        :size="compact ? 'xs' : 'sm'"
        @click="openCreate"
      />
    </div>

    <!-- Empty state -->
    <div v-if="!brandKits?.length" class="text-center py-8">
      <UIcon name="i-lucide-palette" class="w-10 h-10 text-(--ui-text-muted) mx-auto mb-2" />
      <p class="text-sm text-(--ui-text-muted)">No brand kits yet</p>
      <p class="text-xs text-(--ui-text-muted) mt-1">Create one to save colors, fonts & logos</p>
    </div>

    <!-- Brand kit cards -->
    <div :class="compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'">
      <div
        v-for="kit in brandKits"
        :key="kit.id"
        class="group rounded-lg border border-(--ui-border) overflow-hidden hover:ring-2 hover:ring-(--ui-primary)/30 transition-all"
        :class="compact ? '' : 'bg-(--ui-bg-elevated)'"
      >
        <!-- Color swatches preview -->
        <div class="flex h-3" :class="{ 'h-2': compact }">
          <div
            v-for="(color, ci) in kit.colors.slice(0, 8)"
            :key="ci"
            class="flex-1"
            :style="{ backgroundColor: color }"
          />
          <div v-if="!kit.colors.length" class="flex-1 bg-(--ui-bg)" />
        </div>

        <!-- Kit info -->
        <div class="p-3" :class="{ 'p-2': compact }">
          <div class="flex items-start justify-between gap-2">
            <div class="min-w-0">
              <div class="text-sm font-semibold truncate text-(--ui-text)">{{ kit.name }}</div>
              <div v-if="kit.clientName" class="text-xs text-(--ui-text-muted) truncate">{{ kit.clientName }}</div>
            </div>
            <UDropdownMenu
              :items="[
                [
                  { label: 'Apply to Studio', icon: 'i-lucide-paintbrush', click: () => applyKit(kit) },
                  { label: 'Edit', icon: 'i-lucide-pencil', click: () => openEdit(kit) },
                ],
                [
                  { label: 'Delete', icon: 'i-lucide-trash-2', click: () => confirmDelete(kit) },
                ],
              ]"
            >
              <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
            </UDropdownMenu>
          </div>

          <!-- Meta row -->
          <div class="flex items-center gap-2 mt-2 flex-wrap">
            <UBadge v-if="kit.colors.length" variant="subtle" size="xs">
              {{ kit.colors.length }} color{{ kit.colors.length === 1 ? '' : 's' }}
            </UBadge>
            <UBadge v-if="kit.fonts.length" variant="subtle" size="xs">
              {{ kit.fonts.length }} font{{ kit.fonts.length === 1 ? '' : 's' }}
            </UBadge>
            <UBadge v-if="kit.logos.length" variant="subtle" size="xs">
              {{ kit.logos.length }} logo{{ kit.logos.length === 1 ? '' : 's' }}
            </UBadge>
          </div>

          <!-- Font names preview (non-compact only) -->
          <div v-if="!compact && kit.fonts.length" class="mt-2 text-xs text-(--ui-text-muted) truncate">
            {{ kit.fonts.map(f => f.family).join(', ') }}
          </div>
        </div>
      </div>
    </div>

    <!-- Create/Edit Modal -->
    <UModal v-model:open="showEditModal">
      <template #content>
        <div class="p-6 space-y-5">
          <h3 class="text-lg font-bold text-(--ui-text)">
            {{ editingKit ? 'Edit Brand Kit' : 'New Brand Kit' }}
          </h3>

          <!-- Name -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-1">Name</label>
            <UInput v-model="formName" placeholder="e.g. Acme Corp Brand" />
          </div>

          <!-- Client -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-1">Client (optional)</label>
            <USelectMenu
              v-model="formClientSelect"
              :items="clientOptions"
              value-key="value"
              class="w-full"
            />
          </div>

          <!-- Colors -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Colors</label>
            <div class="flex flex-wrap gap-2 mb-2">
              <div
                v-for="(color, ci) in formColors"
                :key="ci"
                class="group/chip relative"
              >
                <div
                  class="w-10 h-10 rounded-lg border border-(--ui-border) cursor-pointer shadow-sm"
                  :style="{ backgroundColor: color }"
                  :title="color"
                />
                <button
                  class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-(--ui-bg-elevated) border border-(--ui-border) flex items-center justify-center opacity-0 group-hover/chip:opacity-100 transition-opacity"
                  @click="removeColor(ci)"
                >
                  <UIcon name="i-lucide-x" class="w-2.5 h-2.5" />
                </button>
              </div>

              <!-- Add color -->
              <div class="flex items-center gap-1">
                <input
                  v-model="newColor"
                  type="color"
                  class="w-10 h-10 rounded-lg border border-(--ui-border) cursor-pointer p-0.5"
                />
                <UButton icon="i-lucide-plus" variant="ghost" size="xs" @click="addColor" />
              </div>
            </div>
          </div>

          <!-- Fonts -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Fonts</label>
            <div class="space-y-2 mb-2">
              <div
                v-for="(font, fi) in formFonts"
                :key="fi"
                class="flex items-start gap-2 p-2 rounded-md border border-(--ui-border) bg-(--ui-bg)"
              >
                <div class="flex-1 min-w-0">
                  <div class="text-sm font-medium text-(--ui-text)">{{ font.family }}</div>
                  <div class="flex flex-wrap gap-1 mt-1">
                    <button
                      v-for="w in availableWeights"
                      :key="w"
                      class="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
                      :class="font.weights.includes(w)
                        ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                        : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-primary)/40'"
                      @click="toggleFontWeight(font, w)"
                    >
                      {{ w }}
                    </button>
                  </div>
                </div>
                <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="removeFont(fi)" />
              </div>
            </div>
            <div class="flex gap-2">
              <UInput
                v-model="newFontFamily"
                placeholder="Font family name"
                size="sm"
                class="flex-1"
                @keyup.enter="addFont"
              />
              <UButton icon="i-lucide-plus" label="Add" size="sm" variant="soft" @click="addFont" />
            </div>
          </div>

          <!-- Logos -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-2">Logos</label>
            <div class="flex flex-wrap gap-2 mb-2">
              <div
                v-for="(logo, li) in formLogos"
                :key="li"
                class="group/logo relative w-16 h-16 rounded-lg border border-(--ui-border) overflow-hidden bg-(--ui-bg)"
              >
                <img :src="logo.url" :alt="logo.name" class="w-full h-full object-contain p-1" />
                <button
                  class="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-(--ui-bg-elevated) border border-(--ui-border) flex items-center justify-center opacity-0 group-hover/logo:opacity-100 transition-opacity"
                  @click="removeLogo(li)"
                >
                  <UIcon name="i-lucide-x" class="w-2.5 h-2.5" />
                </button>
              </div>
            </div>
            <UButton
              icon="i-lucide-upload"
              label="Upload Logo"
              variant="soft"
              size="sm"
              @click="logoFileInput?.click()"
            />
            <input
              ref="logoFileInput"
              type="file"
              accept="image/*"
              multiple
              class="hidden"
              @change="onLogoFileSelect"
            >
          </div>

          <!-- Guidelines -->
          <div>
            <label class="block text-sm font-medium text-(--ui-text) mb-1">Brand Guidelines (optional)</label>
            <UTextarea
              v-model="formGuidelines"
              placeholder="Usage notes, do's and don'ts, spacing rules..."
              :rows="5"
            />
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-2">
            <UButton label="Cancel" variant="ghost" @click="showEditModal = false" />
            <UButton
              :label="editingKit ? 'Update' : 'Create'"
              :loading="isSaving"
              @click="save"
            />
          </div>
        </div>
      </template>
    </UModal>

    <!-- Delete confirmation modal -->
    <UModal v-model:open="showDeleteConfirm">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-bold text-(--ui-text)">Delete Brand Kit</h3>
          <p class="text-sm text-(--ui-text-muted)">
            Are you sure you want to delete "{{ deletingKit?.name }}"? This action cannot be undone.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" @click="showDeleteConfirm = false" />
            <UButton label="Delete" color="error" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
