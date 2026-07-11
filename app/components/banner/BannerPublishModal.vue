<script setup lang="ts">
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'
import { buildBannerHTML } from '~/utils/banner-html-builder'
import { getScaledLayers } from '~/utils/banner-scaling'
import type { BannerPublished } from '~/types/banner-studio'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean]; 'open-dco': [] }>()

const { state, activeLayers } = useBannerStudio()
const { feedsState } = useBannerFeeds()
const { getExportCustomFonts } = useBannerFonts()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

// Feed attachment
const selectedFeedId = ref<string | null>(null)

const selectedFeed = computed(() =>
  selectedFeedId.value ? feedsState.feeds.find(f => f.id === selectedFeedId.value) || null : null
)

// Feed items for USelect
const feedSelectModel = computed({
  get: () => selectedFeedId.value || 'none',
  set: (val: string) => { selectedFeedId.value = val === 'none' ? null : val },
})
const feedSelectItems = computed(() => [
  { label: 'None — static banner', value: 'none' },
  ...feedsState.feeds.map(f => ({ label: `${f.name} (${f.rowCount} rows)`, value: f.id })),
])

// Publish config
const clickUrl = ref('')
const impressionPixel = ref('')
const clickPixel = ref('')
const isPublishing = ref(false)
const publishProgress = ref(0)

// Schedule publish
const scheduleMode = ref(false)
const scheduleDate = ref('')
const scheduleTime = ref('')
const isScheduling = ref(false)

// Selected sizes to publish
const selected = ref<Set<string>>(new Set(state.setKeys))

// Published banners for this project
const hasProjectId = computed(() => !!state.project?.id)
const publishedBanners = ref<BannerPublished[]>([])

async function refreshPublished() {
  if (!hasProjectId.value || !state.project?.id) {
    publishedBanners.value = []
    return
  }

  publishedBanners.value = await apiFetch<BannerPublished[]>(
    `/api/agency/banner-studio/published/by-project/${state.project.id}`
  )
}

watch(() => state.project?.id, () => {
  refreshPublished()
}, { immediate: true })

// Map of formatKey → published record
const publishedMap = computed(() => {
  const map: Record<string, BannerPublished> = {}
  for (const p of publishedBanners.value) {
    map[p.formatKey] = p
  }
  return map
})

// Tag viewing
const showTags = ref(false)
const tagsForBanner = ref<BannerPublished | null>(null)
const adTags = ref<Array<{ type: string; code: string; label: string }>>([])
const copiedTag = ref<string | null>(null)

// Group by platform
const platformGroups = computed(() => {
  const groups: Record<string, string[]> = {}
  state.setKeys.forEach(key => {
    const fmt = FORMATS[key]
    if (!fmt) return
    if (!groups[fmt.platform]) groups[fmt.platform] = []
    groups[fmt.platform].push(key)
  })
  return groups
})

function togglePlatform(platform: string) {
  const keys = platformGroups.value[platform] || []
  const allSelected = keys.every(k => selected.value.has(k))
  keys.forEach(k => {
    if (allSelected) selected.value.delete(k)
    else selected.value.add(k)
  })
}

function toggleSize(key: string) {
  if (selected.value.has(key)) selected.value.delete(key)
  else selected.value.add(key)
}

async function publish() {
  const keys = [...selected.value]
  if (!keys.length) return

  if (!state.project?.id) {
    toast.add({ title: 'Save first', description: 'Save the project before publishing', color: 'warning' })
    return
  }

  isPublishing.value = true
  publishProgress.value = 0

  try {
    let completed = 0

    for (const key of keys) {
      const fmt = FORMATS[key]
      if (!fmt) continue

      const layers = getScaledLayers(key, state.sets, state.activeKey, activeLayers.value)

      // Collect feed bindings from all layers if a feed is attached
      let feedOpts: { feedUrl?: string; feedBindings?: Record<number, { column: string; property: string }[]> } = {}
      if (selectedFeed.value?.dataUrl) {
        const bindings: Record<number, { column: string; property: string }[]> = {}
        for (const l of layers) {
          if (l.feedBindings?.length) {
            bindings[l.id] = l.feedBindings
              .filter(b => b.feedId === selectedFeed.value!.id)
              .map(b => ({ column: b.column, property: b.property }))
            if (!bindings[l.id].length) delete bindings[l.id]
          }
        }
        if (Object.keys(bindings).length) {
          feedOpts = { feedUrl: selectedFeed.value.dataUrl, feedBindings: bindings }
        }
      }

      const html = buildBannerHTML(key, layers, {
        includeAnimations: true,
        bgColor: state.sets[key]?.bgColor || state.bgColor || '#0a0a10',
        customFonts: getExportCustomFonts(layers),
        ...feedOpts,
      })

      await apiFetch('/api/agency/banner-studio/publish', {
        method: 'POST',
        body: {
          projectId: state.project.id,
          formatKey: key,
          html,
          width: fmt.w,
          height: fmt.h,
          clickUrl: clickUrl.value || undefined,
          impressionPixel: impressionPixel.value || undefined,
          clickPixel: clickPixel.value || undefined,
        },
      })

      completed++
      publishProgress.value = Math.round((completed / keys.length) * 100)
    }

    toast.add({
      title: 'Published',
      description: `${keys.length} banner${keys.length > 1 ? 's' : ''} published successfully`,
      color: 'success',
    })

    await refreshPublished()
  } catch (err: any) {
    const message = err?.data?.statusMessage || err?.message || 'Publish failed'
    toast.add({ title: 'Publish failed', description: message, color: 'error' })
  } finally {
    isPublishing.value = false
    publishProgress.value = 0
  }
}

async function schedulePublish() {
  if (!state.project?.id || !scheduleDate.value || !scheduleTime.value) return
  isScheduling.value = true
  try {
    const scheduledAt = new Date(`${scheduleDate.value}T${scheduleTime.value}`).toISOString()
    const formatKeys = Array.from(selected.value)

    await apiFetch('/api/agency/banner-studio/schedule', {
      method: 'POST',
      body: {
        projectId: state.project.id,
        formatKeys,
        scheduledAt,
        clickUrl: clickUrl.value || undefined,
        impressionPixel: impressionPixel.value || undefined,
        clickPixel: clickPixel.value || undefined,
      },
    })

    toast.add({ title: 'Scheduled', description: `Publish scheduled for ${scheduleDate.value} ${scheduleTime.value}`, color: 'success' })
    scheduleMode.value = false
    await refreshPublished()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err?.data?.statusMessage || 'Failed to schedule', color: 'error' })
  } finally {
    isScheduling.value = false
  }
}

async function viewTags(pub: BannerPublished) {
  try {
    const result = await apiFetch<{ tags: Array<{ type: string; code: string; label: string }> }>(
      `/api/agency/banner-studio/published/${pub.id}/tags`
    )
    adTags.value = result.tags
    tagsForBanner.value = pub
    showTags.value = true
  } catch {
    toast.add({ title: 'Error', description: 'Failed to load ad tags', color: 'error' })
  }
}

async function copyTag(code: string, type: string) {
  await navigator.clipboard.writeText(code)
  copiedTag.value = type
  setTimeout(() => { copiedTag.value = null }, 2000)
  toast.add({ title: 'Copied', description: `${type} tag copied to clipboard`, color: 'success' })
}

async function unpublish(pub: BannerPublished) {
  try {
    await apiFetch(`/api/agency/banner-studio/published/${pub.id}`, { method: 'DELETE' })
    toast.add({ title: 'Unpublished', description: `${pub.formatKey} removed`, color: 'success' })
    await refreshPublished()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to unpublish', color: 'error' })
  }
}

function getPublishedMenuItems(pub: BannerPublished) {
  return [[
    { label: 'Open in new tab', icon: 'i-lucide-external-link', onSelect: () => window.open(pub.url, '_blank') },
  ], [
    { label: 'Unpublish', icon: 'i-lucide-trash-2', onSelect: () => unpublish(pub) },
  ]]
}
</script>

<template>
  <UModal :open="props.open" @update:open="emit('update:open', $event)" :ui="{ content: 'max-w-2xl' }">
    <template #content>
      <div class="p-5">
        <div class="flex items-center justify-between mb-5">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-globe" class="w-5 h-5" style="color: var(--nb-accent-teal);" />
            <h3 class="text-xl font-bold">Publish & Ad Tags</h3>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="emit('update:open', false)" />
        </div>

        <!-- Click-through & Tracking Config -->
        <div class="space-y-3 mb-4 p-4 bg-(--ui-bg) rounded-lg border border-(--ui-border)">
          <div>
            <label class="text-xs font-medium text-(--ui-text-muted) mb-1 block">Click-through URL</label>
            <UInput
              v-model="clickUrl"
              placeholder="https://example.com/landing-page"
              size="sm"
              icon="i-lucide-external-link"
            />
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-medium text-(--ui-text-muted) mb-1 block">Impression Pixel</label>
              <UInput v-model="impressionPixel" placeholder="https://..." size="sm" />
            </div>
            <div>
              <label class="text-xs font-medium text-(--ui-text-muted) mb-1 block">Click Pixel</label>
              <UInput v-model="clickPixel" placeholder="https://..." size="sm" />
            </div>
          </div>
        </div>

        <!-- Data Feed Attachment -->
        <div v-if="feedsState.feeds.length" class="mb-4 p-4 bg-(--ui-bg) rounded-lg border border-(--ui-border)">
          <label class="text-xs font-medium text-(--ui-text-muted) mb-1.5 block">Attach Data Feed</label>
          <USelect
            v-model="feedSelectModel"
            :items="feedSelectItems"
            size="sm"
          />
          <p v-if="selectedFeed" class="text-[11px] text-(--ui-text-muted) mt-1">
            Published banner will swap content from feed data at runtime.
            Use <code class="text-(--ui-primary)">?row=N</code> to target a specific row.
          </p>
          <p v-if="feedsState.feeds.length" class="text-[11px] text-(--ui-text-muted) mt-1.5">
            Need pre-generated per-row variants for ad platforms?
            <button class="text-(--ui-primary) underline" @click="emit('update:open', false); emit('open-dco')">
              Use DCO Generate
            </button>
          </p>
        </div>

        <!-- Size Selection -->
        <div class="space-y-3 mb-4 max-h-[200px] overflow-y-auto">
          <div v-for="(keys, platform) in platformGroups" :key="platform">
            <div
              class="flex items-center gap-2 mb-1.5 rounded-md px-3 py-1.5"
              :style="{ backgroundColor: (PLATFORM_META[platform]?.color || '#888') + '10' }"
            >
              <UCheckbox
                :model-value="keys.every(k => selected.has(k))"
                @update:model-value="togglePlatform(platform)"
              />
              <span
                class="w-2.5 h-2.5 rounded-full"
                :style="{ backgroundColor: PLATFORM_META[platform]?.color || '#888' }"
              />
              <span class="text-sm font-semibold">{{ PLATFORM_META[platform]?.label || platform }}</span>
            </div>
            <div class="ml-6 space-y-1">
              <div
                v-for="key in keys"
                :key="key"
                class="flex items-center gap-2"
              >
                <UCheckbox
                  :model-value="selected.has(key)"
                  @update:model-value="toggleSize(key)"
                />
                <span class="text-xs">{{ FORMATS[key]?.name }}</span>
                <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</span>
                <UBadge v-if="publishedMap[key]" color="success" variant="subtle" size="xs">
                  v{{ publishedMap[key].version }}
                </UBadge>
              </div>
            </div>
          </div>
        </div>

        <!-- Platform validation -->
        <div v-if="state.project?.id" class="mb-4 p-3 bg-(--ui-bg) rounded-lg">
          <div class="text-xs font-medium text-(--ui-text-muted) mb-2">Platform Compliance</div>
          <BannerValidationBadges :project-id="state.project.id" />
        </div>

        <!-- Progress -->
        <div v-if="isPublishing" class="mb-4">
          <div class="text-xs text-(--ui-text-muted) mb-1">Publishing... {{ publishProgress }}%</div>
          <div class="w-full bg-(--ui-bg-elevated) rounded-full h-2 overflow-hidden">
            <div
              class="h-full bg-(--ui-primary) rounded-full transition-all duration-300"
              :style="{ width: `${publishProgress}%` }"
            />
          </div>
        </div>

        <!-- Schedule toggle -->
        <div class="mb-4">
          <button
            class="flex items-center gap-1.5 text-xs text-(--ui-text-muted) hover:text-(--ui-text) transition-colors mb-2"
            @click="scheduleMode = !scheduleMode"
          >
            <UIcon name="i-lucide-clock" class="w-3.5 h-3.5" />
            {{ scheduleMode ? 'Publish now instead' : 'Schedule for later' }}
          </button>

          <div v-if="scheduleMode" class="flex gap-2 mb-3">
            <UInput v-model="scheduleDate" type="date" size="sm" class="flex-1" />
            <UInput v-model="scheduleTime" type="time" size="sm" class="w-28" />
          </div>
        </div>

        <!-- Publish / Schedule Button -->
        <div class="flex gap-2 mb-4">
          <UButton
            v-if="!scheduleMode"
            icon="i-lucide-globe"
            class="flex-1"
            :disabled="selected.size === 0 || isPublishing"
            :loading="isPublishing"
            @click="publish"
          >
            Publish Selected
          </UButton>
          <UButton
            v-else
            icon="i-lucide-clock"
            class="flex-1"
            :disabled="selected.size === 0 || isScheduling || !scheduleDate || !scheduleTime"
            :loading="isScheduling"
            @click="schedulePublish"
          >
            Schedule Publish
          </UButton>
        </div>

        <!-- Published Banners List -->
        <div v-if="publishedBanners.length" class="border-t border-(--ui-border) pt-4">
          <h4 class="text-xs font-bold uppercase tracking-wider text-(--ui-text-muted) mb-3">Published Banners</h4>
          <div class="space-y-2">
            <div
              v-for="pub in publishedBanners"
              :key="pub.id"
              class="p-3 rounded-lg border border-(--ui-border) hover:bg-(--ui-bg-elevated) transition-colors"
            >
              <div class="flex items-center gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span class="text-xs font-semibold">{{ FORMATS[pub.formatKey]?.name || pub.formatKey }}</span>
                    <span class="text-[11px] font-mono text-(--ui-text-muted)">{{ pub.width }}x{{ pub.height }}</span>
                    <UBadge :color="pub.isLive ? 'success' : 'neutral'" variant="subtle" size="xs">
                      {{ pub.isLive ? 'Live' : 'Paused' }}
                    </UBadge>
                    <UBadge color="neutral" variant="subtle" size="xs">v{{ pub.version }}</UBadge>
                  </div>
                  <div class="text-[11px] text-(--ui-text-muted) truncate mt-0.5">
                    {{ pub.url }}
                  </div>
                </div>
                <div class="flex items-center gap-1">
                  <UButton
                    icon="i-lucide-code"
                    variant="soft"
                    size="xs"
                    title="Get Ad Tags"
                    @click="viewTags(pub)"
                  />
                  <UDropdownMenu :items="getPublishedMenuItems(pub)">
                    <UButton
                      icon="i-lucide-more-horizontal"
                      variant="ghost"
                      size="xs"
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>

  <!-- Ad Tags Sub-Modal -->
  <UModal :open="showTags" @update:open="showTags = $event" :ui="{ content: 'max-w-xl' }">
    <template #content>
      <div class="p-5">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="text-lg font-semibold">Ad Tags</h3>
            <p class="text-xs text-(--ui-text-muted)">
              {{ FORMATS[tagsForBanner?.formatKey || '']?.name }} — {{ tagsForBanner?.width }}x{{ tagsForBanner?.height }}
            </p>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="showTags = false" />
        </div>

        <div class="space-y-4">
          <div
            v-for="tag in adTags"
            :key="tag.type"
            class="rounded-lg border border-(--ui-border) overflow-hidden"
          >
            <div class="flex items-center justify-between px-3 py-2 bg-(--ui-bg-elevated)">
              <span class="text-xs font-semibold">{{ tag.label }}</span>
              <UButton
                :icon="copiedTag === tag.type ? 'i-lucide-check' : 'i-lucide-copy'"
                :label="copiedTag === tag.type ? 'Copied' : 'Copy'"
                variant="soft"
                size="xs"
                @click="copyTag(tag.code, tag.type)"
              />
            </div>
            <pre class="p-3 text-[11px] leading-relaxed font-mono text-(--ui-text-muted) overflow-x-auto max-h-[120px]">{{ tag.code }}</pre>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
