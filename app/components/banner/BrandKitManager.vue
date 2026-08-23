<script setup lang="ts">
/**
 * Brand Kit Manager — list, create (blank / from client / from website), edit, duplicate,
 * set default, version history, delete. Used full-size on /agency/banner-studio/brand-kits
 * and compact inside the studio's Brand panel.
 */
import type { BannerBrandKit, BrandKitColor, BrandKitFont, BrandKitLogo, BrandKitVersion, BrandKitExtraction, BrandColorRole, BrandFontRole } from '~/types/banner-studio'
import { BRAND_COLOR_ROLES, BRAND_FONT_ROLES, normaliseHex } from '~/utils/banner-brand-kit'
import { FONT_FAMILIES } from '~/utils/banner-constants'
import { createBannerUploadSession } from '~/utils/bannerUpload'

const props = defineProps<{
  /** Compact list for the studio side panel */
  compact?: boolean
  /** Pre-filter / pre-select a client (studio context) */
  clientId?: string | null
}>()

const emit = defineEmits<{
  apply: [kit: BannerBrandKit]
}>()

const toast = useToast()
const { customFonts, fetchCustomFonts } = useBannerFonts()
// Typed-route $fetch can't see the new brand-kit sub-routes until nuxt prepare runs; keep calls untyped
const api = $fetch as <T = unknown>(request: string, options?: Record<string, unknown>) => Promise<T>

// ── Data ───────────────────────────────────────────────────────────────
const brandKits = ref<BannerBrandKit[]>([])
const clients = ref<Array<{ id: string, name: string, logo_url?: string | null, logoUrl?: string | null, website?: string | null }>>([])
const loading = ref(true)

async function refresh() {
  loading.value = true
  try {
    brandKits.value = await $fetch<BannerBrandKit[]>('/api/agency/banner-studio/brand-kits', {
      query: props.clientId ? { clientId: props.clientId } : undefined
    })
  } finally {
    loading.value = false
  }
}
async function refreshClients() {
  clients.value = await $fetch<any[]>('/api/agency/clients')
}
refresh()
refreshClients()
fetchCustomFonts()

const clientOptions = computed(() => [
  { label: 'Agency-wide (no client)', value: 'none' },
  ...clients.value.map(c => ({ label: c.name, value: c.id }))
])
const fontItems = computed(() => {
  const custom = customFonts.value.map(f => ({ label: `${f.name} · uploaded`, value: f.name }))
  const lib = FONT_FAMILIES.map(f => ({ label: f, value: f }))
  return [...custom, ...lib]
})

// ── Editor state ───────────────────────────────────────────────────────
const editorOpen = ref(false)
const editorTab = ref<'design' | 'history'>('design')
const editing = ref<BannerBrandKit | null>(null)
const form = reactive({
  name: '',
  clientId: 'none' as string,
  isDefault: false,
  sourceUrl: null as string | null,
  colors: [] as BrandKitColor[],
  fonts: [] as BrandKitFont[],
  logos: [] as BrandKitLogo[],
  guidelines: ''
})
const saving = ref(false)
const formKit = computed(() => ({ name: form.name || 'Brand', colors: form.colors, fonts: form.fonts, logos: form.logos }))

function resetForm() {
  form.name = ''
  form.clientId = props.clientId || 'none'
  form.isDefault = false
  form.sourceUrl = null
  form.colors = BRAND_COLOR_ROLES.slice(0, 4).map(r => ({ role: r.role, hex: r.role === 'background' ? '#0f1115' : r.role === 'accent' ? '#34e52e' : '#ffffff' }))
  form.fonts = [
    { role: 'heading', family: 'Barlow Condensed', weights: [700] },
    { role: 'body', family: 'Barlow', weights: [400, 600] }
  ]
  form.logos = []
  form.guidelines = ''
}
function openBlank() {
  editing.value = null
  resetForm()
  editorTab.value = 'design'
  editorOpen.value = true
}
function openEdit(kit: BannerBrandKit) {
  editing.value = kit
  form.name = kit.name
  form.clientId = kit.clientId || 'none'
  form.isDefault = kit.isDefault
  form.sourceUrl = kit.sourceUrl || null
  form.colors = kit.colors.map(c => ({ ...c }))
  form.fonts = kit.fonts.map(f => ({ ...f, weights: [...f.weights] }))
  form.logos = kit.logos.map(l => ({ ...l }))
  form.guidelines = kit.guidelines || ''
  editorTab.value = 'design'
  editorOpen.value = true
}

// ── Starters: from client / from website ───────────────────────────────
const starterClientId = ref<string>('')
function openFromClient() {
  const c = clients.value.find(x => x.id === starterClientId.value)
  if (!c) return
  openBlank()
  form.name = `${c.name} brand`
  form.clientId = c.id
  form.isDefault = !brandKits.value.some(k => k.clientId === c.id && k.isDefault)
  const logo = c.logoUrl || c.logo_url
  if (logo) form.logos = [{ name: `${c.name} logo`, url: logo, r2Key: '', variant: 'any' }]
  if (c.website) extractUrl.value = c.website
}

const extractUrl = ref('')
const extracting = ref(false)
async function extractFromWebsite(intoOpenForm = false) {
  const url = extractUrl.value.trim()
  if (!url) return
  extracting.value = true
  try {
    const x = await api<BrandKitExtraction>('/api/agency/banner-studio/brand-kits/extract', { method: 'POST', body: { url } })
    if (!intoOpenForm) openBlank()
    if (!form.name || !intoOpenForm) form.name = x.name
    form.sourceUrl = x.sourceUrl
    if (x.colors.length) form.colors = x.colors
    if (x.fonts.length) form.fonts = x.fonts
    if (x.logos.length) form.logos = [...x.logos, ...form.logos.filter(l => !x.logos.some(n => n.url === l.url))]
    toast.add({
      title: 'Brand extracted',
      description: `${x.colors.length} colours, ${x.fonts.length} fonts, ${x.logos.length} logo${x.logos.length === 1 ? '' : 's'} found — check and adjust before saving.`,
      color: 'success'
    })
  } catch (e: any) {
    toast.add({ title: 'Couldn’t read that site', description: e?.data?.statusMessage || e?.message || 'Try the homepage URL', color: 'error' })
  } finally {
    extracting.value = false
  }
}

// ── Colours ────────────────────────────────────────────────────────────
function colorFor(role: BrandColorRole) {
  return form.colors.find(c => c.role === role)
}
function setColor(role: BrandColorRole, hex: string, label?: string) {
  const n = normaliseHex(hex)
  if (!n) return
  const c = colorFor(role)
  if (c) { c.hex = n; if (label !== undefined) c.label = label } else form.colors.push({ role, hex: n, label })
}
function clearColor(role: BrandColorRole) {
  form.colors = form.colors.filter(c => c.role !== role)
}
const extraColors = computed(() => form.colors.filter(c => c.role === 'extra'))
function addExtraColor() {
  if (form.colors.length >= 24) return
  form.colors.push({ role: 'extra', hex: '#888888' })
}
function removeExtra(c: BrandKitColor) {
  form.colors = form.colors.filter(x => x !== c)
}
function onHexInput(c: BrandKitColor, v: string | number) {
  const n = normaliseHex(String(v))
  if (n) c.hex = n
}

// ── Fonts ──────────────────────────────────────────────────────────────
const WEIGHTS = [300, 400, 500, 600, 700, 800, 900]
function fontFor(role: BrandFontRole) {
  return form.fonts.find(f => f.role === role)
}
function setFontFamily(role: BrandFontRole, family: string) {
  const f = fontFor(role)
  if (f) f.family = family
  else form.fonts.push({ role, family, weights: [400, 700] })
}
function toggleWeight(f: BrandKitFont, w: number) {
  const i = f.weights.indexOf(w)
  if (i >= 0) { if (f.weights.length > 1) f.weights.splice(i, 1) } else { f.weights.push(w); f.weights.sort((a, b) => a - b) }
}

// ── Logos ──────────────────────────────────────────────────────────────
const logoInput = ref<HTMLInputElement | null>(null)
const uploadingLogo = ref(false)
/** Uploads go through the shared session: content-hash idempotency keys + serialised requests */
const uploadSession = createBannerUploadSession()
async function uploadLogo(files: FileList | File[]) {
  if (!files.length) return
  uploadingLogo.value = true
  try {
    const outcomes = await uploadSession.attemptFiles(files, async (request) => {
      return await api<{ url: string, r2Key: string }>('/api/agency/banner-studio/assets/upload', { method: 'POST', ...request })
    })
    outcomes.forEach((outcome, i) => {
      const file = files[i]
      if (outcome?.ok) {
        form.logos.push({ name: file.name.replace(/\.[^.]+$/, ''), url: outcome.value.url, r2Key: outcome.value.r2Key, variant: 'any' })
      } else {
        toast.add({ title: 'Upload failed', description: file.name, color: 'error' })
      }
    })
  } finally {
    uploadingLogo.value = false
  }
}
async function onLogoFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  try {
    if (input.files?.length) await uploadLogo(input.files)
  } finally {
    input.value = ''
  }
}
function cycleVariant(l: BrandKitLogo) {
  l.variant = l.variant === 'any' || !l.variant ? 'dark' : l.variant === 'dark' ? 'light' : 'any'
}
const VARIANT_LABEL: Record<string, string> = { any: 'Any background', dark: 'For dark backgrounds', light: 'For light backgrounds' }

// ── Save / duplicate / default / delete ───────────────────────────────
async function save() {
  if (!form.name.trim()) {
    toast.add({ title: 'Name the kit', description: 'A brand kit needs a name.', color: 'error' })
    return
  }
  saving.value = true
  const payload = {
    name: form.name.trim(),
    clientId: form.clientId === 'none' ? null : form.clientId,
    isDefault: form.isDefault,
    sourceUrl: form.sourceUrl,
    colors: form.colors,
    fonts: form.fonts,
    logos: form.logos,
    guidelines: form.guidelines.trim() || null
  }
  try {
    if (editing.value) {
      await $fetch(`/api/agency/banner-studio/brand-kits/${editing.value.id}`, { method: 'PATCH', body: payload })
      toast.add({ title: 'Saved', description: `"${payload.name}" updated`, color: 'success' })
    } else {
      await $fetch('/api/agency/banner-studio/brand-kits', { method: 'POST', body: payload })
      toast.add({ title: 'Created', description: `"${payload.name}" is ready to apply`, color: 'success' })
    }
    editorOpen.value = false
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Couldn’t save', description: e?.data?.statusMessage || 'Check the fields and try again', color: 'error' })
  } finally {
    saving.value = false
  }
}
async function duplicate(kit: BannerBrandKit) {
  try {
    await api(`/api/agency/banner-studio/brand-kits/${kit.id}/duplicate`, { method: 'POST' })
    toast.add({ title: 'Duplicated', description: `"${kit.name} (copy)" created`, color: 'success' })
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to duplicate', color: 'error' })
  }
}
async function setDefault(kit: BannerBrandKit, value: boolean) {
  try {
    await $fetch(`/api/agency/banner-studio/brand-kits/${kit.id}`, { method: 'PATCH', body: { isDefault: value } })
    toast.add({
      title: value ? 'Default set' : 'Default cleared',
      description: value ? `New ${kit.clientName || 'agency'} projects will be offered "${kit.name}".` : undefined,
      color: 'success'
    })
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to update default', color: 'error' })
  }
}

const deleting = ref<BannerBrandKit | null>(null)
async function confirmDelete() {
  if (!deleting.value) return
  try {
    await $fetch(`/api/agency/banner-studio/brand-kits/${deleting.value.id}`, { method: 'DELETE' })
    toast.add({ title: 'Deleted', description: `"${deleting.value.name}" removed`, color: 'success' })
    deleting.value = null
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete', color: 'error' })
  }
}

// ── History ────────────────────────────────────────────────────────────
const versions = ref<BrandKitVersion[]>([])
const versionsLoading = ref(false)
watch(editorTab, async (t) => {
  if (t !== 'history' || !editing.value) return
  versionsLoading.value = true
  try { versions.value = await api<BrandKitVersion[]>(`/api/agency/banner-studio/brand-kits/${editing.value.id}/versions`) } finally { versionsLoading.value = false }
})
async function restore(v: BrandKitVersion) {
  if (!editing.value) return
  try {
    const kit = await api<BannerBrandKit>(`/api/agency/banner-studio/brand-kits/${editing.value.id}/restore`, { method: 'POST', body: { version: v.version } })
    toast.add({ title: `Restored v${v.version}`, color: 'success' })
    openEdit(kit)
    await refresh()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to restore', color: 'error' })
  }
}

function kitMenu(kit: BannerBrandKit) {
  return [
    [
      { label: 'Apply to project', icon: 'i-lucide-paintbrush', onSelect: () => emit('apply', kit) },
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(kit) },
      { label: 'Duplicate', icon: 'i-lucide-copy', onSelect: () => duplicate(kit) }
    ],
    [
      kit.isDefault
        ? { label: 'Clear default', icon: 'i-lucide-star-off', onSelect: () => setDefault(kit, false) }
        : { label: kit.clientId ? 'Set as client default' : 'Set as agency default', icon: 'i-lucide-star', onSelect: () => setDefault(kit, true) },
      { label: 'History', icon: 'i-lucide-history', onSelect: () => { openEdit(kit); editorTab.value = 'history' } }
    ],
    [
      { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { deleting.value = kit } }
    ]
  ]
}
</script>

<template>
  <div :class="compact ? 'p-3 space-y-3' : 'space-y-6'">
    <!-- Header row -->
    <div class="flex items-center justify-between gap-3">
      <h4 v-if="compact" class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">
        Brand kits
      </h4>
      <p v-else class="text-sm text-(--ui-text-muted)">
        {{ brandKits.length ? `${brandKits.length} kit${brandKits.length === 1 ? '' : 's'}` : 'Nothing saved yet' }}
      </p>
      <UButton
        icon="i-lucide-plus"
        :label="compact ? undefined : 'New kit'"
        :size="compact ? 'xs' : 'sm'"
        @click="openBlank"
      />
    </div>

    <!-- Starters (always available in full mode; in compact only when empty) -->
    <div
      v-if="!compact || !brandKits.length"
      class="grid gap-3"
      :class="compact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'"
    >
      <!-- From website -->
      <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-4 space-y-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-globe" class="w-4 h-4 text-(--ui-primary)" />
          <div class="text-sm font-semibold">
            From a website
          </div>
        </div>
        <p class="text-xs text-(--ui-text-muted)">
          Pulls colours, fonts and the logo off the client’s homepage. You confirm before it saves.
        </p>
        <div class="flex gap-2">
          <UInput
            v-model="extractUrl"
            placeholder="leapmotor.com.au"
            size="sm"
            class="flex-1"
            @keydown.enter="extractFromWebsite()"
          />
          <UButton
            :loading="extracting"
            size="sm"
            label="Extract"
            @click="extractFromWebsite()"
          />
        </div>
      </div>
      <!-- From client -->
      <div class="rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) p-4 space-y-3">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-building-2" class="w-4 h-4 text-(--ui-primary)" />
          <div class="text-sm font-semibold">
            From a client
          </div>
        </div>
        <p class="text-xs text-(--ui-text-muted)">
          Starts a kit linked to the client, using the logo already on their record.
        </p>
        <div class="flex gap-2">
          <USelectMenu
            v-model="starterClientId"
            :items="clients.map(c => ({ label: c.name, value: c.id }))"
            value-key="value"
            placeholder="Choose client"
            searchable
            size="sm"
            class="flex-1"
          />
          <UButton
            size="sm"
            label="Start"
            :disabled="!starterClientId"
            @click="openFromClient"
          />
        </div>
      </div>
      <!-- Blank -->
      <button
        class="rounded-lg border border-dashed border-(--ui-border) p-4 text-left space-y-2 hover:border-(--ui-primary)/50 hover:bg-(--ui-bg-elevated) transition-colors"
        @click="openBlank"
      >
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-swatch-book" class="w-4 h-4 text-(--ui-primary)" />
          <div class="text-sm font-semibold">
            Blank kit
          </div>
        </div>
        <p class="text-xs text-(--ui-text-muted)">
          Set the roles yourself — primary, accent, background, heading and body fonts.
        </p>
      </button>
    </div>

    <!-- Kit cards -->
    <div v-if="brandKits.length" :class="compact ? 'space-y-2' : 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4'">
      <div
        v-for="kit in brandKits"
        :key="kit.id"
        class="group rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated) overflow-hidden hover:ring-2 hover:ring-(--ui-primary)/30 transition-all"
      >
        <div class="p-2 pb-0 cursor-pointer" @click="openEdit(kit)">
          <BannerBrandKitPreview :kit="kit" :compact="compact" :ratio="compact ? 3 : 300 / 200" />
        </div>
        <div class="p-3 flex items-start gap-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-sm font-semibold truncate">{{ kit.name }}</span>
              <UTooltip v-if="kit.isDefault" :text="kit.clientId ? 'Default for this client' : 'Agency default'">
                <UIcon name="i-lucide-star" class="w-3.5 h-3.5 text-warning shrink-0" />
              </UTooltip>
            </div>
            <div class="text-xs text-(--ui-text-muted) truncate">
              {{ kit.clientName || 'Agency-wide' }}
              <span v-if="kit.fonts.length"> · {{ kit.fonts.map(f => f.family).join(' / ') }}</span>
            </div>
            <!-- Palette strip -->
            <div class="flex gap-1 mt-2">
              <UTooltip v-for="c in kit.colors.slice(0, 8)" :key="c.role + c.hex" :text="`${c.label || c.role} ${c.hex}`">
                <span class="w-4 h-4 rounded-sm border border-black/20" :style="{ backgroundColor: c.hex }" />
              </UTooltip>
            </div>
          </div>
          <div class="flex items-center gap-0.5 shrink-0">
            <UTooltip v-if="!compact" text="Apply to the open project">
              <UButton
                icon="i-lucide-paintbrush"
                variant="ghost"
                size="xs"
                @click="emit('apply', kit)"
              />
            </UTooltip>
            <UButton
              v-else
              size="xs"
              variant="soft"
              label="Apply"
              @click="emit('apply', kit)"
            />
            <UDropdownMenu :items="kitMenu(kit)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-more-vertical" variant="ghost" size="xs" />
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </div>
    <div v-else-if="!loading && compact" class="text-center py-4 text-xs text-(--ui-text-muted)">
      No brand kits yet — create one above.
    </div>

    <!-- ───────── Editor ───────── -->
    <USlideover v-model:open="editorOpen" side="right" :ui="{ content: 'max-w-2xl' }">
      <template #content>
        <div class="h-full flex flex-col bg-(--ui-bg)">
          <div class="flex items-center justify-between px-5 py-4 border-b border-(--ui-border)">
            <div>
              <h2 class="text-base font-bold">
                {{ editing ? 'Edit brand kit' : 'New brand kit' }}
              </h2>
              <p v-if="form.sourceUrl" class="text-xs text-(--ui-text-muted)">
                Extracted from {{ form.sourceUrl }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <UTabs
                v-if="editing"
                v-model="editorTab"
                :items="[{ label: 'Design', value: 'design' }, { label: 'History', value: 'history' }]"
                size="xs"
                :content="false"
              />
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                size="xs"
                @click="editorOpen = false"
              />
            </div>
          </div>

          <div class="flex-1 overflow-y-auto">
            <!-- Design tab -->
            <div v-if="editorTab === 'design'" class="p-5 space-y-7">
              <!-- Live preview -->
              <div class="grid grid-cols-[1fr_auto] gap-4 items-start">
                <BannerBrandKitPreview :kit="formKit" :ratio="300 / 160" />
                <div class="w-28">
                  <BannerBrandKitPreview
                    :kit="formKit"
                    :ratio="160 / 200"
                    compact
                    headline="Square"
                    cta="Go"
                  />
                </div>
              </div>

              <!-- Identity -->
              <section class="space-y-4">
                <div class="grid grid-cols-2 gap-4">
                  <UFormField label="Name" required>
                    <UInput v-model="form.name" placeholder="e.g. Leapmotor master brand" class="w-full" />
                  </UFormField>
                  <UFormField label="Client">
                    <USelectMenu
                      v-model="form.clientId"
                      :items="clientOptions"
                      value-key="value"
                      searchable
                      class="w-full"
                    />
                  </UFormField>
                </div>
                <div class="flex items-center justify-between rounded-md border border-(--ui-border) px-3 py-2">
                  <div>
                    <div class="text-sm font-medium">
                      Default {{ form.clientId === 'none' ? 'for the agency' : 'for this client' }}
                    </div>
                    <div class="text-xs text-(--ui-text-muted)">
                      Offered automatically when a project is linked to {{ form.clientId === 'none' ? 'no client' : 'this client' }}.
                    </div>
                  </div>
                  <USwitch v-model="form.isDefault" />
                </div>
                <div v-if="!editing" class="flex gap-2">
                  <UInput
                    v-model="extractUrl"
                    placeholder="Fill from website URL…"
                    size="sm"
                    class="flex-1"
                    @keydown.enter="extractFromWebsite(true)"
                  />
                  <UButton
                    :loading="extracting"
                    size="sm"
                    variant="soft"
                    icon="i-lucide-globe"
                    label="Extract"
                    @click="extractFromWebsite(true)"
                  />
                </div>
              </section>

              <!-- Colours -->
              <section class="space-y-3">
                <div class="flex items-baseline justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">
                    Colours
                  </h3>
                  <span class="text-[11px] text-(--ui-text-dimmed)">Roles decide where each colour lands when applied</span>
                </div>
                <div class="space-y-2">
                  <div
                    v-for="r in BRAND_COLOR_ROLES"
                    :key="r.role"
                    class="grid grid-cols-[2.25rem_7rem_1fr_auto] items-center gap-3"
                  >
                    <label class="relative w-9 h-9 rounded-md border border-(--ui-border) overflow-hidden cursor-pointer" :title="`Pick ${r.label.toLowerCase()}`">
                      <span class="absolute inset-0" :style="{ backgroundColor: colorFor(r.role)?.hex || 'transparent' }" />
                      <span v-if="!colorFor(r.role)" class="absolute inset-0 flex items-center justify-center text-(--ui-text-dimmed)"><UIcon name="i-lucide-plus" class="w-4 h-4" /></span>
                      <input
                        type="color"
                        class="absolute inset-0 opacity-0 cursor-pointer"
                        :value="colorFor(r.role)?.hex || '#888888'"
                        @input="(e: Event) => setColor(r.role, (e.target as HTMLInputElement).value)"
                      >
                    </label>
                    <div>
                      <div class="text-sm font-medium leading-tight">
                        {{ r.label }}
                      </div>
                      <div class="text-[11px] text-(--ui-text-dimmed) leading-tight">
                        {{ r.hint }}
                      </div>
                    </div>
                    <UInput
                      :model-value="colorFor(r.role)?.hex || ''"
                      placeholder="#000000"
                      size="sm"
                      class="w-full font-mono"
                      @update:model-value="v => setColor(r.role, String(v))"
                    />
                    <UButton
                      icon="i-lucide-x"
                      variant="ghost"
                      size="xs"
                      color="neutral"
                      :class="{ invisible: !colorFor(r.role) }"
                      @click="clearColor(r.role)"
                    />
                  </div>
                </div>
                <!-- Extra swatches -->
                <div class="flex flex-wrap items-center gap-2 pt-1">
                  <div v-for="(c, ei) in extraColors" :key="`extra-${ei}`" class="flex items-center gap-1 rounded-md border border-(--ui-border) pl-1 pr-0.5 py-0.5">
                    <label class="relative w-6 h-6 rounded-sm overflow-hidden cursor-pointer" :style="{ backgroundColor: c.hex }">
                      <input
                        type="color"
                        class="absolute inset-0 opacity-0 cursor-pointer"
                        :value="c.hex"
                        @input="(e: Event) => onHexInput(c, (e.target as HTMLInputElement).value)"
                      >
                    </label>
                    <UInput
                      :model-value="c.hex"
                      size="xs"
                      class="w-20 font-mono"
                      @update:model-value="v => onHexInput(c, v)"
                    />
                    <UButton
                      icon="i-lucide-x"
                      variant="ghost"
                      size="xs"
                      color="neutral"
                      @click="removeExtra(c)"
                    />
                  </div>
                  <UButton
                    icon="i-lucide-plus"
                    label="Extra colour"
                    variant="ghost"
                    size="xs"
                    @click="addExtraColor"
                  />
                </div>
              </section>

              <!-- Typography -->
              <section class="space-y-3">
                <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">
                  Typography
                </h3>
                <div class="space-y-3">
                  <div v-for="r in BRAND_FONT_ROLES" :key="r.role" class="rounded-md border border-(--ui-border) p-3 space-y-2">
                    <div class="grid grid-cols-[7rem_1fr] items-center gap-3">
                      <div>
                        <div class="text-sm font-medium leading-tight">
                          {{ r.label }}
                        </div>
                        <div class="text-[11px] text-(--ui-text-dimmed) leading-tight">
                          {{ r.hint }}
                        </div>
                      </div>
                      <USelectMenu
                        :model-value="fontFor(r.role)?.family"
                        :items="fontItems"
                        value-key="value"
                        searchable
                        placeholder="Choose a font"
                        class="w-full"
                        @update:model-value="v => setFontFamily(r.role, String(v))"
                      />
                    </div>
                    <div v-if="fontFor(r.role)" class="flex items-center gap-3">
                      <span
                        class="text-lg leading-none truncate flex-1"
                        :style="{ fontFamily: fontFor(r.role)!.family, fontWeight: fontFor(r.role)!.weights[fontFor(r.role)!.weights.length - 1] }"
                      >The quick brown fox</span>
                      <div class="flex gap-1">
                        <button
                          v-for="w in WEIGHTS"
                          :key="w"
                          class="text-[10px] px-1.5 py-0.5 rounded border transition-colors"
                          :class="fontFor(r.role)!.weights.includes(w)
                            ? 'border-(--ui-primary) bg-(--ui-primary)/10 text-(--ui-primary)'
                            : 'border-(--ui-border) text-(--ui-text-muted) hover:border-(--ui-primary)/40'"
                          @click="toggleWeight(fontFor(r.role)!, w)"
                        >
                          {{ w }}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <!-- Logos -->
              <section class="space-y-3">
                <div class="flex items-baseline justify-between">
                  <h3 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted)">
                    Logos
                  </h3>
                  <span class="text-[11px] text-(--ui-text-dimmed)">Click the tag to say which background a mark is for</span>
                </div>
                <div class="flex flex-wrap gap-3">
                  <div v-for="(l, i) in form.logos" :key="l.url" class="w-32 rounded-md border border-(--ui-border) overflow-hidden">
                    <div
                      class="h-20 flex items-center justify-center p-2"
                      :style="{ backgroundColor: l.variant === 'light' ? '#f4f5f7' : l.variant === 'dark' ? '#0f1115' : undefined, backgroundImage: l.variant === 'any' || !l.variant ? 'repeating-conic-gradient(#2a2a2e 0 25%, #1a1a1e 0 50%)' : undefined, backgroundSize: '12px 12px' }"
                    >
                      <img :src="l.url" :alt="l.name" class="max-h-full max-w-full object-contain">
                    </div>
                    <div class="flex items-center justify-between px-1.5 py-1 gap-1">
                      <button class="text-[10px] text-(--ui-text-muted) hover:text-(--ui-text) truncate" :title="VARIANT_LABEL[l.variant || 'any']" @click="cycleVariant(l)">
                        {{ (l.variant || 'any') === 'any' ? 'Any bg' : l.variant === 'dark' ? 'Dark bg' : 'Light bg' }}
                      </button>
                      <UButton
                        icon="i-lucide-x"
                        variant="ghost"
                        size="xs"
                        color="neutral"
                        @click="() => { form.logos.splice(i, 1) }"
                      />
                    </div>
                  </div>
                  <button
                    class="w-32 h-[7.25rem] rounded-md border border-dashed border-(--ui-border) flex flex-col items-center justify-center gap-1 text-(--ui-text-muted) hover:border-(--ui-primary)/50 hover:text-(--ui-text) transition-colors"
                    :disabled="uploadingLogo"
                    @click="logoInput?.click()"
                  >
                    <UIcon :name="uploadingLogo ? 'i-lucide-loader-circle' : 'i-lucide-upload'" class="w-5 h-5" :class="{ 'animate-spin': uploadingLogo }" />
                    <span class="text-[11px]">Upload SVG / PNG</span>
                  </button>
                  <input
                    ref="logoInput"
                    type="file"
                    accept="image/*"
                    multiple
                    class="hidden"
                    @change="onLogoFileSelect"
                  >
                </div>
              </section>

              <!-- Guidelines -->
              <section class="space-y-2">
                <UFormField label="Guidelines" help="Read by the AI copy and code assistants when a project is linked to this client — tone of voice, do’s and don’ts, legal lines.">
                  <UTextarea
                    v-model="form.guidelines"
                    :rows="6"
                    class="w-full"
                    placeholder="e.g. Never abbreviate the brand name. Always pair the green CTA with white text. Tone: confident, plain-spoken, no exclamation marks."
                  />
                </UFormField>
              </section>
            </div>

            <!-- History tab -->
            <div v-else class="p-5">
              <div v-if="versionsLoading" class="text-sm text-(--ui-text-muted)">
                Loading…
              </div>
              <div v-else-if="!versions.length" class="text-sm text-(--ui-text-muted)">
                No earlier versions — a snapshot is kept every time the kit is saved.
              </div>
              <ul v-else class="divide-y divide-(--ui-border)">
                <li v-for="v in versions" :key="v.id" class="py-3 flex items-center gap-3">
                  <div class="w-24 shrink-0">
                    <BannerBrandKitPreview
                      :kit="v.snapshot"
                      :ratio="3"
                      compact
                      headline=""
                      cta="CTA"
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium">
                      v{{ v.version }} · {{ v.snapshot.name }}
                    </div>
                    <div class="text-xs text-(--ui-text-muted)">
                      {{ new Date(v.createdAt).toLocaleString() }}<span v-if="(v as any).createdByName"> · {{ (v as any).createdByName }}</span><span v-if="v.note"> · {{ v.note }}</span>
                    </div>
                  </div>
                  <UButton
                    size="xs"
                    variant="soft"
                    label="Restore"
                    @click="restore(v)"
                  />
                </li>
              </ul>
            </div>
          </div>

          <div class="flex items-center justify-between px-5 py-3 border-t border-(--ui-border)">
            <UButton
              v-if="editing"
              icon="i-lucide-paintbrush"
              variant="ghost"
              size="sm"
              label="Apply to project"
              @click="emit('apply', editing)"
            />
            <span v-else />
            <div class="flex gap-2">
              <UButton
                label="Cancel"
                variant="ghost"
                size="sm"
                @click="editorOpen = false"
              />
              <UButton
                :label="editing ? 'Save changes' : 'Create kit'"
                size="sm"
                :loading="saving"
                @click="save"
              />
            </div>
          </div>
        </div>
      </template>
    </USlideover>

    <!-- Delete confirm -->
    <UModal :open="!!deleting" @update:open="v => { if (!v) deleting = null }">
      <template #content>
        <div class="p-6 space-y-4">
          <h3 class="text-lg font-bold">
            Delete “{{ deleting?.name }}”?
          </h3>
          <p class="text-sm text-(--ui-text-muted)">
            Projects that already had it applied keep their colours. Version history is deleted with the kit.
          </p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" @click="deleting = null" />
            <UButton label="Delete kit" color="error" @click="confirmDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
