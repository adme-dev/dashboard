<script setup lang="ts">
import { computed } from 'vue'
import type { VideoGenerationJobView } from '~~/app/composables/useVideoGenerationJobs'
import type { VideoLibraryTimelinePayload } from '~~/app/utils/video/videoLibraryTimeline'

const props = defineProps<{
  open: boolean
  projectId: string
  timelineStills: { clipId: string; label: string }[]
  defaultAspect: string
  initialPrompt?: string | null
  initialSourceAsset?: { assetId: string; title: string } | null
  recentJobs?: VideoGenerationJobView[]
  prepareTimelineStillSource?: () => Promise<void>
}>()

const emit = defineEmits<{
  (e: 'update:open', v: boolean): void
  (e: 'submitted', jobId: string): void
  (e: 'add-to-timeline', payload: VideoLibraryTimelinePayload): void
}>()

const openModel = computed({
  get: () => props.open,
  set: value => emit('update:open', value)
})
</script>

<template>
  <USlideover
    v-model:open="openModel"
    title="Generate video (AI)"
    description="Create a clip from a prompt or animate a still."
  >
    <template #body>
      <MediaGenerateComposer
        :active="props.open"
        :project-id="props.projectId"
        :timeline-stills="props.timelineStills"
        :default-aspect="props.defaultAspect"
        :initial-prompt="props.initialPrompt"
        :initial-source-asset="props.initialSourceAsset"
        :recent-jobs="props.recentJobs"
        :prepare-timeline-still-source="props.prepareTimelineStillSource"
        @submitted="emit('submitted', $event)"
        @add-to-timeline="emit('add-to-timeline', $event)"
        @close="emit('update:open', false)"
      />
    </template>
  </USlideover>
</template>
