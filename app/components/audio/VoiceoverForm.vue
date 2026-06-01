<script setup lang="ts">
import type { AudioAsset } from '~/types'

const emit = defineEmits<{ generated: [asset: AudioAsset] }>()
const { generating, generateVoiceover } = useAudioStudio()

const text = ref('')
const title = ref('')
const channels = ref<string[]>([])

const channelOptions = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Meta', value: 'meta' },
  { label: 'Radio', value: 'radio' }
]

const MAX = 2000
const remaining = computed(() => MAX - text.value.length)
const canSubmit = computed(() => text.value.trim().length >= 2 && text.value.length <= MAX)

async function submit() {
  if (!canSubmit.value) return
  const asset = await generateVoiceover({
    text: text.value.trim(),
    title: title.value.trim() || undefined,
    channels: channels.value
  })
  if (asset) {
    emit('generated', asset)
    text.value = ''
    title.value = ''
    channels.value = []
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-4">
      <UFormField label="Title" help="Optional — for finding it later in the library">
        <UInput v-model="title" placeholder="Summer sale promo" class="w-full" />
      </UFormField>

      <UFormField label="Script" required help="What the voice should say">
        <UTextarea
          v-model="text"
          :rows="5"
          autoresize
          :maxlength="MAX"
          placeholder="Welcome to our summer sale, now on…"
          class="w-full"
        />
        <template #hint>
          <span class="text-xs tabular-nums" :class="remaining < 0 ? 'text-error' : 'text-muted'">
            {{ remaining }}
          </span>
        </template>
      </UFormField>

      <UFormField label="Target channels" help="Where this voiceover will be used">
        <USelectMenu
          v-model="channels"
          multiple
          :items="channelOptions"
          value-key="value"
          placeholder="Select channels"
          class="w-full"
        />
      </UFormField>

      <div class="flex items-center justify-between pt-1">
        <p class="text-xs text-muted">
          Owned audio — legal across radio, TikTok &amp; Meta.
        </p>
        <UButton
          :loading="generating"
          :disabled="!canSubmit"
          icon="i-lucide-mic"
          @click="submit"
        >
          Generate voiceover
        </UButton>
      </div>
    </div>
  </UCard>
</template>
