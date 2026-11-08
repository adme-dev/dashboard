<script setup lang="ts">
import type { VideoModelOption } from '~~/app/utils/video/modelPresentation'
import { videoModelPresentation } from '~~/app/utils/video/modelPresentation'

withDefaults(defineProps<{
  models?: VideoModelOption[]
  pending?: boolean
  generationEnabled?: boolean
  statusDetail?: string
}>(), { models: () => [], pending: false, generationEnabled: false, statusDetail: '' })
const emit = defineEmits<{
  (event: 'storyboard' | 'produce' | 'library' | 'history'): void
  (event: 'select-model', id: string): void
}>()
</script>

<template>
  <UPopover :content="{ align: 'start', sideOffset: 12 }">
    <UButton
      label="Studio tools"
      icon="i-lucide-panels-top-left"
      trailing-icon="i-lucide-chevron-down"
      color="neutral"
      variant="ghost"
    />
    <template #content="{ close }">
      <div class="grid max-h-[75svh] w-[min(54rem,calc(100vw-2rem))] grid-cols-1 gap-6 overflow-y-auto p-5 md:grid-cols-[1fr_1fr_1.2fr]">
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">
            Create and edit
          </h3>
          <UButton
            label="Storyboard"
            icon="i-lucide-panels-top-left"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            @click="emit('storyboard'); close()"
          />
          <p class="text-xs leading-5 text-muted">
            Brief, approved copy, references and a shot plan you can review before applying.
          </p>
          <UButton
            label="Voice and overlays"
            icon="i-lucide-mic-2"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            @click="emit('produce'); close()"
          />
          <p class="text-xs leading-5 text-muted">
            Open the existing voice, overlay and assembly controls. No generation starts here.
          </p>
        </section>
        <section class="space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">
            Project media
          </h3>
          <UButton
            label="Asset library"
            icon="i-lucide-library"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            @click="emit('library'); close()"
          />
          <p class="text-xs leading-5 text-muted">
            Browse actual project assets and choose what belongs in the edit.
          </p>
          <UButton
            label="Outputs and history"
            icon="i-lucide-history"
            variant="ghost"
            color="neutral"
            block
            class="justify-start"
            @click="emit('history'); close()"
          />
          <p class="text-xs leading-5 text-muted">
            Review saved jobs, versions and output status. Publishing remains a separate action.
          </p>
        </section>
        <section class="space-y-3 border-t border-default pt-4 md:border-l md:border-t-0 md:pl-5 md:pt-0">
          <div class="flex items-center justify-between gap-3">
            <h3 class="text-sm font-semibold text-highlighted">
              Video models
            </h3><UBadge color="neutral" variant="subtle" :label="pending ? 'Checking' : `${models.length} listed`" />
          </div>
          <p class="text-xs leading-5 text-muted">
            Select a model for the next request. Source approval, provider setup and budget are checked before submission.
          </p>
          <div v-if="pending" class="space-y-2">
            <USkeleton v-for="i in 3" :key="i" class="h-14 w-full" />
          </div>
          <UAlert
            v-else-if="!generationEnabled || !models.length"
            color="neutral"
            variant="subtle"
            title="Generation needs setup"
            :description="statusDetail || 'No selectable models are available for this project. Ask an administrator to check provider and tenant policy.'"
          />
          <UButton
            v-for="model in models"
            v-else
            :key="model.id"
            :disabled="!generationEnabled"
            variant="ghost"
            color="neutral"
            block
            class="justify-start py-3 text-left"
            @click="emit('select-model', model.id); close()"
          >
            <UIcon :name="videoModelPresentation(model).icon" class="size-5 shrink-0 text-muted" />
            <span class="min-w-0 flex-1"><span class="block text-sm font-medium">{{ model.label }}</span><span class="mt-0.5 block text-xs text-muted">{{ videoModelPresentation(model).sublabel }}</span></span>
            <span class="text-xs text-muted">{{ videoModelPresentation(model).costLabel }}</span>
          </UButton>
        </section>
      </div>
    </template>
  </UPopover>
</template>
