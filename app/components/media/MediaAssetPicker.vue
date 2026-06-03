<script setup lang="ts">
// MediaAssetPicker.vue — USlideover that lists audio_assets for the editor's
// "Add clip" flow. Supports kind filter + title search, inline audio preview,
// and emits `pick(asset)` with the asset's presigned streamUrl included so the
// calling page can pass it to addClipAction(…, presignedUrl).
import { ref, computed } from 'vue'
import type { AudioAsset } from '~~/app/types'

export interface PickedAsset {
  id: string
  r2_key_master: string
  title: string | null
  kind: 'voiceover' | 'music'
  /** presigned playback URL — present if the API minted one */
  streamUrl?: string
}

const props = defineProps<{
  open: boolean
  /** If provided, pre-selects this kind in the filter */
  defaultKind?: 'voiceover' | 'music' | null
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', asset: PickedAsset): void
}>()

// ─── Data ────────────────────────────────────────────────────────────────────

const KIND_OPTIONS = [
  { label: 'All kinds', value: 'all' },
  { label: 'Voiceover', value: 'voiceover' },
  { label: 'Music', value: 'music' }
]

const selectedKind = ref<string>(props.defaultKind ?? 'all')
const searchQuery = ref('')

const { data, refresh, pending } = useFetch('/api/agency/audio/assets', {
  query: computed(() => ({
    kind: selectedKind.value !== 'all' ? selectedKind.value : undefined
  })),
  watch: [selectedKind],
  lazy: true
})

const assets = computed((): AudioAsset[] => (data.value as any)?.assets ?? [])

const filtered = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return assets.value
  return assets.value.filter(a =>
    (a.title ?? '').toLowerCase().includes(q) ||
    a.kind.toLowerCase().includes(q)
  )
})

// ─── Preview ──────────────────────────────────────────────────────────────────

const previewingId = ref<string | null>(null)

function togglePreview(assetId: string) {
  previewingId.value = previewingId.value === assetId ? null : assetId
}

// ─── Pick ─────────────────────────────────────────────────────────────────────

function pick(asset: AudioAsset) {
  if (!asset.r2KeyMaster) return
  emit('pick', {
    id: asset.id,
    r2_key_master: asset.r2KeyMaster,
    title: asset.title,
    kind: asset.kind,
    streamUrl: asset.streamUrl
  })
  emit('update:open', false)
}

// ─── Kind icon ────────────────────────────────────────────────────────────────

function kindIcon(kind: string) {
  return kind === 'music' ? 'i-lucide-music' : 'i-lucide-mic'
}
</script>

<template>
  <USlideover
    :open="open"
    title="Add clip from library"
    description="Pick a voiceover or music asset to add to the timeline."
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="flex flex-col gap-4 h-full min-h-0">
        <!-- Filters -->
        <div class="flex gap-3">
          <USelect
            v-model="selectedKind"
            :items="KIND_OPTIONS"
            value-key="value"
            class="w-36"
            size="sm"
          />
          <UInput
            v-model="searchQuery"
            placeholder="Search by title…"
            icon="i-lucide-search"
            size="sm"
            class="flex-1"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            variant="ghost"
            color="neutral"
            size="sm"
            aria-label="Refresh"
            :loading="pending"
            @click="refresh()"
          />
        </div>

        <!-- List -->
        <div class="flex-1 overflow-y-auto space-y-2 pr-0.5">
          <div v-if="pending && !assets.length" class="space-y-2">
            <USkeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
          </div>

          <UAlert
            v-else-if="!pending && !filtered.length"
            color="neutral"
            variant="subtle"
            icon="i-lucide-inbox"
            title="No assets found"
            description="Generate voiceover or music in the Audio Studio first."
          />

          <div
            v-for="asset in filtered"
            :key="asset.id"
            class="group flex items-center gap-3 rounded-lg border border-default bg-elevated p-3 hover:border-primary/50 transition-colors"
          >
            <!-- Kind icon -->
            <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <UIcon :name="kindIcon(asset.kind)" class="size-4 text-primary" />
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <p class="truncate text-sm font-medium text-highlighted">
                {{ asset.title ?? '(untitled)' }}
              </p>
              <p class="text-xs text-muted flex items-center gap-1.5 mt-0.5">
                <UBadge :label="asset.kind" size="xs" variant="subtle" color="neutral" />
                <span v-if="asset.durationSec">{{ asset.durationSec.toFixed(1) }}s</span>
                <UBadge
                  v-if="asset.status !== 'ready' && asset.status !== 'done'"
                  :label="asset.status"
                  size="xs"
                  variant="subtle"
                  :color="asset.status === 'failed' ? 'error' : 'warning'"
                />
              </p>
            </div>

            <!-- Preview toggle -->
            <UButton
              v-if="asset.streamUrl"
              :icon="previewingId === asset.id ? 'i-lucide-square' : 'i-lucide-play'"
              size="xs"
              variant="ghost"
              color="neutral"
              :aria-label="previewingId === asset.id ? 'Stop preview' : 'Preview'"
              @click.stop="togglePreview(asset.id)"
            />

            <!-- Add button -->
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="primary"
              variant="soft"
              label="Add"
              :disabled="!asset.r2KeyMaster || (asset.status !== 'ready' && asset.status !== 'done')"
              @click="pick(asset)"
            />
          </div>
        </div>

        <!-- Inline audio preview players (hidden <audio> elements) -->
        <div aria-hidden="true" class="sr-only">
          <audio
            v-for="asset in filtered.filter(a => a.streamUrl)"
            :key="asset.id"
            :src="asset.streamUrl"
            :ref="(el) => {
              if (el && previewingId === asset.id) (el as HTMLAudioElement).play().catch(() => {})
              else if (el && previewingId !== asset.id) { (el as HTMLAudioElement).pause(); (el as HTMLAudioElement).currentTime = 0 }
            }"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
