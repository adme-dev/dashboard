<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { AudioAsset } from '~~/app/types'
import { apiErrorDescription } from '~~/app/utils/apiError'

const props = defineProps<{
  initialAsset?: Partial<AudioAsset> | null
  producerBrief?: string | null
  existingVoiceoverCount?: number
}>()

const emit = defineEmits<{
  (event: 'generated', asset: AudioAsset): void
  (event: 'add-to-timeline', asset: AudioAsset): void
  (event: 'replace-with-generated', asset: AudioAsset): void
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const title = ref('Video voiceover')
const script = ref('')
const generating = ref(false)
const generatedAsset = ref<Partial<AudioAsset> | null>(props.initialAsset ?? null)
const violations = ref<string[]>([])
const producerBrief = computed(() => props.producerBrief?.trim() ?? '')
const estimatedScriptDurationSec = computed(() => {
  const words = script.value.trim().split(/\s+/).filter(Boolean).length
  return words ? Math.max(1, Math.round(words / 2.6)) : null
})

watch(() => props.initialAsset, (next) => {
  generatedAsset.value = next ?? null
})

const CHANNELS = ['tiktok', 'meta'] as const

function durationLabel(seconds?: number | null) {
  if (!seconds) return null
  const rounded = Number.isInteger(seconds) ? seconds : Number(seconds.toFixed(1))
  return `${rounded}s`
}

function applyProducerBrief() {
  if (!producerBrief.value) return
  script.value = producerBrief.value
}

async function generateVoiceover() {
  const text = script.value.trim()
  if (!text || generating.value) return
  generating.value = true
  violations.value = []
  try {
    const res = await apiFetch<{ asset: AudioAsset; violations: string[] }>('/api/agency/audio/voiceover', {
      method: 'POST',
      body: {
        text,
        title: title.value.trim() || null,
        lang: 'en',
        channels: CHANNELS,
      },
    })
    generatedAsset.value = res.asset
    violations.value = res.violations ?? []
    if (violations.value.length) {
      toast.add({ title: 'Voice script adjusted', description: violations.value.join(', '), color: 'warning' })
    }
    toast.add({ title: 'Voiceover ready', color: 'success' })
    emit('generated', res.asset)
  } catch (error: unknown) {
    toast.add({ title: 'Voiceover failed', description: apiErrorDescription(error), color: 'error' })
  } finally {
    generating.value = false
  }
}

function addGeneratedToTimeline() {
  if (!generatedAsset.value?.id || !generatedAsset.value.r2KeyMaster) return
  emit('add-to-timeline', generatedAsset.value as AudioAsset)
}

function replaceExistingVoiceover() {
  if (!generatedAsset.value?.id || !generatedAsset.value.r2KeyMaster) return
  emit('replace-with-generated', generatedAsset.value as AudioAsset)
}
</script>

<template>
  <section class="rounded-md border border-default bg-elevated p-4">
    <div class="mb-3 flex items-start gap-2">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <UIcon name="i-lucide-mic-2" class="size-4 text-primary" />
      </div>
      <div class="min-w-0">
        <h4 class="text-sm font-medium text-highlighted">Voiceover</h4>
        <p class="mt-0.5 text-xs leading-snug text-muted">Generate Cloudflare voice audio and place it on the voiceover lane.</p>
      </div>
    </div>

    <div class="space-y-3">
      <UFormField label="Title">
        <UInput v-model="title" size="sm" placeholder="Opening voiceover" class="w-full" />
      </UFormField>

      <UFormField label="Script">
        <UTextarea
          v-model="script"
          :rows="5"
          autoresize
          placeholder="Write the spoken script for this edit..."
          class="min-h-32 w-full"
        />
        <div class="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <span class="text-[11px] text-muted">
            <template v-if="estimatedScriptDurationSec">Estimated {{ durationLabel(estimatedScriptDurationSec) }}</template>
            <template v-else>Script duration appears after you write.</template>
          </span>
          <UButton
            v-if="producerBrief"
            icon="i-lucide-clipboard-check"
            size="xs"
            variant="ghost"
            color="neutral"
            label="Use producer brief"
            @click="applyProducerBrief"
          />
        </div>
      </UFormField>

      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap gap-1">
          <UBadge label="Cloudflare Workers AI" size="xs" variant="subtle" color="neutral" />
          <UBadge label="voiceover lane" size="xs" variant="subtle" color="neutral" />
        </div>
        <UButton
          icon="i-lucide-sparkles"
          size="sm"
          color="primary"
          label="Generate"
          :loading="generating"
          :disabled="!script.trim()"
          @click="generateVoiceover"
        />
      </div>

      <div v-if="violations.length" class="rounded-md border border-warning/30 bg-warning/10 px-2 py-1.5 text-[11px] text-warning">
        {{ violations.join(', ') }}
      </div>

      <div v-if="generatedAsset" class="rounded-md border border-default bg-default/40 p-2">
        <div class="flex items-start gap-2">
          <UIcon name="i-lucide-volume-2" class="mt-0.5 size-4 shrink-0 text-muted" />
          <div class="min-w-0 flex-1">
            <p class="truncate text-xs font-medium text-highlighted">{{ generatedAsset.title ?? 'Generated voiceover' }}</p>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ generatedAsset.status ?? 'ready' }}<span v-if="durationLabel(generatedAsset.durationSec)"> · {{ durationLabel(generatedAsset.durationSec) }}</span>
            </p>
          </div>
          <UButton
            icon="i-lucide-list-plus"
            size="xs"
            variant="soft"
            color="primary"
            label="Add to timeline"
            :disabled="!generatedAsset.r2KeyMaster"
            @click="addGeneratedToTimeline"
          />
          <UButton
            v-if="props.existingVoiceoverCount"
            icon="i-lucide-replace"
            size="xs"
            variant="ghost"
            color="neutral"
            label="Replace"
            :disabled="!generatedAsset.r2KeyMaster"
            @click="replaceExistingVoiceover"
          />
        </div>
        <audio
          v-if="generatedAsset.streamUrl"
          :src="generatedAsset.streamUrl"
          controls
          preload="metadata"
          class="mt-2 w-full"
        />
      </div>
    </div>
  </section>
</template>
