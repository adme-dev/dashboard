<script setup lang="ts">
import type { AudioAsset } from '~/types'

const emit = defineEmits<{ generated: [asset: AudioAsset] }>()
const { generating, generateMusic, fetchMusicStatus } = useAudioStudio()
const toast = useToast()

const prompt = ref('')
const title = ref('')
const isInstrumental = ref(true)
const lyrics = ref('')
const format = ref<'mp3' | 'wav'>('mp3')
const channels = ref<string[]>([])

const channelOptions = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Meta', value: 'meta' },
  { label: 'Radio', value: 'radio' }
]
const formatOptions = [
  { label: 'MP3', value: 'mp3' },
  { label: 'WAV', value: 'wav' }
]

const PROMPT_MAX = 2000
const LYRICS_MAX = 3500
const promptLeft = computed(() => PROMPT_MAX - prompt.value.length)
const canSubmit = computed(() => prompt.value.trim().length >= 2 && prompt.value.length <= PROMPT_MAX && !generating.value && !jobStatus.value)

// Live async job state (queued → processing → done|failed), null when idle.
const jobStatus = ref<AudioAsset['status'] | null>(null)
const statusLabel = computed(() => {
  switch (jobStatus.value) {
    case 'queued': return 'Queued…'
    case 'processing': return 'Composing your track…'
    default: return ''
  }
})

let cancelled = false
onBeforeUnmount(() => {
  cancelled = true
})

async function pollUntilDone(assetId: string) {
  // ~2 min ceiling at 3s intervals — music gen is slow but bounded.
  for (let i = 0; i < 40 && !cancelled; i++) {
    await new Promise(r => setTimeout(r, 3000))
    let res
    try {
      res = await fetchMusicStatus(assetId)
    } catch {
      continue // transient — keep polling
    }
    jobStatus.value = res.status
    if (res.status === 'done') {
      toast.add({ title: 'Track ready', color: 'success' })
      emit('generated', res.asset)
      reset()
      return
    }
    if (res.status === 'failed') {
      toast.add({ title: 'Generation failed', description: res.error ?? 'Try a different brief', color: 'error' })
      jobStatus.value = null
      return
    }
  }
  if (!cancelled) {
    toast.add({ title: 'Still working', description: 'Your track is taking a while — check the library shortly.', color: 'info' })
    jobStatus.value = null
  }
}

function reset() {
  prompt.value = ''
  title.value = ''
  lyrics.value = ''
  channels.value = []
  isInstrumental.value = true
  jobStatus.value = null
}

async function submit() {
  if (!canSubmit.value) return
  const asset = await generateMusic({
    prompt: prompt.value.trim(),
    title: title.value.trim() || undefined,
    isInstrumental: isInstrumental.value,
    lyrics: isInstrumental.value ? null : (lyrics.value.trim() || null),
    format: format.value,
    channels: channels.value
  })
  if (asset) {
    jobStatus.value = asset.status ?? 'queued'
    pollUntilDone(asset.id)
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-4">
      <UFormField label="Title" help="Optional — for finding it later in the library">
        <UInput v-model="title" placeholder="Summer sale bed" class="w-full" />
      </UFormField>

      <UFormField label="Brief" required help="Describe the style, mood and scenario — not a named artist">
        <UTextarea
          v-model="prompt"
          :rows="5"
          autoresize
          :maxlength="PROMPT_MAX"
          placeholder="Warm, upbeat acoustic pop with a confident, summery feel; light percussion, ~110 bpm"
          class="w-full"
        />
        <template #hint>
          <span class="text-xs tabular-nums" :class="promptLeft < 0 ? 'text-error' : 'text-muted'">
            {{ promptLeft }}
          </span>
        </template>
      </UFormField>

      <div class="flex items-center justify-between rounded-lg border border-default px-3 py-2.5">
        <div>
          <p class="text-sm font-medium">
            Instrumental
          </p>
          <p class="text-xs text-muted">
            Turn off to provide your own lyrics
          </p>
        </div>
        <USwitch v-model="isInstrumental" />
      </div>

      <UFormField v-if="!isInstrumental" label="Lyrics" help="One line per phrase">
        <UTextarea
          v-model="lyrics"
          :rows="5"
          autoresize
          :maxlength="LYRICS_MAX"
          placeholder="Sun's out, doors open wide&#10;Summer sale, come inside"
          class="w-full"
        />
      </UFormField>

      <div class="grid grid-cols-2 gap-4">
        <UFormField label="Format">
          <USelectMenu
            v-model="format"
            :items="formatOptions"
            value-key="value"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Target channels" help="Where it'll run">
          <USelectMenu
            v-model="channels"
            multiple
            :items="channelOptions"
            value-key="value"
            placeholder="Select channels"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="flex items-center justify-between pt-1">
        <p v-if="jobStatus" class="flex items-center gap-2 text-xs text-muted">
          <UIcon name="i-lucide-loader-circle" class="animate-spin" />
          {{ statusLabel }}
        </p>
        <p v-else class="text-xs text-muted">
          Owned audio — legal across radio, TikTok &amp; Meta.
        </p>
        <UButton
          :loading="generating || !!jobStatus"
          :disabled="!canSubmit"
          icon="i-lucide-music"
          @click="submit"
        >
          Generate music
        </UButton>
      </div>
    </div>
  </UCard>
</template>
