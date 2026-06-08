<script setup lang="ts">
// MediaOverlayPicker.vue — USlideover to pick a Banner Studio project + a format key for an
// overlay clip. Emits pick({ gsapProjectId, gsapFormatKey, projectName }). Format keys come
// from the project's canvasData object keys.
import { ref, computed } from 'vue'

defineProps<{ open: boolean }>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'pick', payload: { gsapProjectId: string; gsapFormatKey: string; projectName: string }): void
}>()

interface BannerProject { id: string; name: string; clientName?: string; canvasData: Record<string, unknown>; thumbnailUrl: string | null }

const { data, pending, refresh } = useFetch('/api/agency/banner-studio/projects', { query: { limit: 100 }, lazy: true })
const projects = computed((): BannerProject[] => (data.value as any)?.projects ?? (data.value as any) ?? [])

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return projects.value
  return projects.value.filter(p => (p.name ?? '').toLowerCase().includes(q))
})

const selectedId = ref<string | null>(null)
const selectedFormat = ref<string | null>(null)

function formatsFor(p: BannerProject): string[] { return Object.keys(p.canvasData ?? {}) }

function selectProject(p: BannerProject) {
  selectedId.value = p.id
  selectedFormat.value = formatsFor(p)[0] ?? null
}

function confirm() {
  const p = projects.value.find(x => x.id === selectedId.value)
  if (!p || !selectedFormat.value) return
  emit('pick', { gsapProjectId: p.id, gsapFormatKey: selectedFormat.value, projectName: p.name })
  emit('update:open', false)
  selectedId.value = null; selectedFormat.value = null
}
</script>

<template>
  <USlideover :open="open" title="Add overlay" description="Pick a Banner Studio project and a format to overlay on the video." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4 h-full min-h-0">
        <div class="flex gap-2">
          <UInput v-model="search" placeholder="Search banner projects…" icon="i-lucide-search" size="sm" class="flex-1" />
          <UButton icon="i-lucide-refresh-cw" variant="ghost" color="neutral" size="sm" :loading="pending" aria-label="Refresh" @click="refresh()" />
        </div>

        <div class="flex-1 overflow-y-auto space-y-2 pr-0.5">
          <div v-if="pending && !projects.length" class="space-y-2">
            <USkeleton v-for="n in 4" :key="n" class="h-16 w-full rounded-lg" />
          </div>
          <UAlert v-else-if="!filtered.length" color="neutral" variant="subtle" icon="i-lucide-inbox" title="No banner projects" description="Create one in Banner Studio first." />

          <div v-for="p in filtered" :key="p.id"
               class="rounded-lg border bg-elevated p-3 transition-colors"
               :class="selectedId === p.id ? 'border-primary ring-1 ring-primary' : 'border-default hover:border-primary/50'">
            <button class="flex w-full items-center gap-3 text-left" @click="selectProject(p)">
              <div class="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <UIcon name="i-lucide-shapes" class="size-4 text-primary" />
              </div>
              <div class="flex-1 min-w-0">
                <p class="truncate text-sm font-medium text-highlighted">{{ p.name }}</p>
                <p v-if="p.clientName" class="truncate text-xs text-muted">{{ p.clientName }}</p>
              </div>
              <UBadge :label="`${formatsFor(p).length} formats`" size="xs" variant="subtle" color="neutral" />
            </button>

            <div v-if="selectedId === p.id" class="mt-3 flex flex-wrap gap-1.5">
              <UButton v-for="fk in formatsFor(p)" :key="fk" :label="fk" size="xs"
                       :variant="selectedFormat === fk ? 'solid' : 'soft'"
                       :color="selectedFormat === fk ? 'primary' : 'neutral'"
                       @click="selectedFormat = fk" />
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-2 border-t border-default pt-3">
          <UButton variant="ghost" color="neutral" label="Cancel" @click="emit('update:open', false)" />
          <UButton color="primary" label="Add overlay" :disabled="!selectedId || !selectedFormat" @click="confirm" />
        </div>
      </div>
    </template>
  </USlideover>
</template>
