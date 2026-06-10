<script setup lang="ts">
// Floating status card for AI video generation — shows queued/running jobs with a live
// elapsed timer + spinner, and surfaces failures so the user is never left guessing.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'

const props = defineProps<{ jobs: VideoGenerationJobView[] }>()

const dismissed = ref<Set<string>>(new Set())
const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null
onMounted(() => { timer = setInterval(() => { now.value = Date.now() }, 1000) })
onBeforeUnmount(() => { if (timer) clearInterval(timer) })

// Show active jobs always; show finished (succeeded/failed) until dismissed.
const visible = computed(() => {
  const raw: any = props.jobs
  const list: VideoGenerationJobView[] = Array.isArray(raw) ? raw : Array.isArray(raw?.value) ? raw.value : []
  return list
    .filter((j) => ['queued', 'running', 'succeeded', 'failed'].includes(j.status) && !dismissed.value.has(j.id))
    .slice(0, 4)
})

function elapsed(j: VideoGenerationJobView): string {
  const start = new Date(j.startedAt || j.createdAt).getTime()
  const end = j.completedAt ? new Date(j.completedAt).getTime() : now.value
  const s = Math.max(0, Math.floor((end - start) / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function dismiss(id: string) { dismissed.value = new Set([...dismissed.value, id]) }

const meta: Record<string, { icon: string; color: string; label: string; spin?: boolean }> = {
  queued: { icon: 'i-lucide-loader-circle', color: 'text-blue-400', label: 'Queued', spin: true },
  running: { icon: 'i-lucide-loader-circle', color: 'text-primary', label: 'Generating', spin: true },
  succeeded: { icon: 'i-lucide-check-circle', color: 'text-emerald-400', label: 'Done — in Library' },
  failed: { icon: 'i-lucide-alert-circle', color: 'text-red-400', label: 'Failed' },
}
</script>

<template>
  <div v-if="visible.length" class="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
    <UCard v-for="j in visible" :key="j.id" :ui="{ body: 'p-3 sm:p-3' }" class="shadow-lg ring-1 ring-default/60 bg-default/95 backdrop-blur">
      <div class="flex items-start gap-3">
        <UIcon :name="meta[j.status].icon" :class="[meta[j.status].color, meta[j.status].spin && 'animate-spin', 'size-5 shrink-0 mt-0.5']" />
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-default">{{ meta[j.status].label }}</span>
            <span v-if="j.status === 'queued' || j.status === 'running'" class="text-xs tabular-nums text-muted">{{ elapsed(j) }}</span>
            <UButton
              v-if="j.status === 'succeeded' || j.status === 'failed'"
              icon="i-lucide-x" size="xs" variant="ghost" color="neutral" class="ml-auto -mr-1 -mt-1"
              @click="dismiss(j.id)"
            />
          </div>
          <p class="mt-0.5 truncate text-xs text-muted">{{ j.prompt }}</p>
          <p v-if="j.status === 'failed' && j.errorMessage" class="mt-1 text-xs text-red-400 line-clamp-2">{{ j.errorMessage }}</p>
          <p v-else-if="j.status === 'running'" class="mt-1 text-xs text-muted">AI video can take a few minutes — you can keep working.</p>
        </div>
      </div>
    </UCard>
  </div>
</template>
