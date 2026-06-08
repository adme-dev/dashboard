<script setup lang="ts">
// MediaMediaPicker.vue — USlideover to upload footage (video) or a still (image) into the
// AV editor. Calls the injected `uploader` (the composable's uploadMedia) and emits
// uploaded({ r2Key, durationSec, baseSource }) so the page can add the clip at the playhead.
import { ref } from 'vue'

const props = defineProps<{
  open: boolean
  /** the editor composable's uploadMedia(file, kind) */
  uploader: (file: File, kind: 'footage' | 'still') => Promise<{ r2Key: string; url: string; durationSec: number }>
}>()
const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'uploaded', payload: { r2Key: string; durationSec: number; baseSource: 'uploaded_footage' | 'still_kenburns' }): void
}>()

const kind = ref<'footage' | 'still'>('footage')
const uploading = ref(false)
const error = ref<string | null>(null)
const toast = useToast()
const fileInput = ref<HTMLInputElement | null>(null)

const KIND_OPTIONS = [
  { label: 'Footage (video)', value: 'footage' },
  { label: 'Still (image)', value: 'still' }
]

function pickFile() { fileInput.value?.click() }

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || !props.uploader) return
  uploading.value = true; error.value = null
  try {
    const res = await props.uploader(file, kind.value)
    emit('uploaded', { r2Key: res.r2Key, durationSec: res.durationSec, baseSource: kind.value === 'footage' ? 'uploaded_footage' : 'still_kenburns' })
    toast.add({ title: 'Media added', color: 'success' })
    emit('update:open', false)
  } catch (e: any) {
    error.value = e?.data?.statusMessage ?? 'Upload failed'
    toast.add({ title: 'Upload failed', description: error.value ?? '', color: 'error' })
  } finally {
    uploading.value = false
  }
}

function accept() { return kind.value === 'footage' ? 'video/mp4,video/webm,video/quicktime' : 'image/jpeg,image/png,image/webp' }
</script>

<template>
  <USlideover :open="open" title="Add footage or still" description="Upload a video clip or an image (ken-burns) to the timeline." @update:open="emit('update:open', $event)">
    <template #body>
      <div class="flex flex-col gap-4">
        <UFormField label="Media type">
          <USelect v-model="kind" :items="KIND_OPTIONS" value-key="value" />
        </UFormField>

        <UButton
          icon="i-lucide-upload"
          :label="uploading ? 'Uploading…' : (kind === 'footage' ? 'Choose a video file' : 'Choose an image file')"
          color="primary"
          block
          :loading="uploading"
          @click="pickFile"
        />
        <input ref="fileInput" type="file" class="hidden" :accept="accept()" @change="onFile" >

        <p class="text-xs text-muted">
          {{ kind === 'footage' ? 'MP4, WebM or MOV up to 500MB.' : 'JPEG, PNG or WebP up to 50MB. Stills animate with a ken-burns move.' }}
        </p>

        <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-triangle-alert" :title="error" />
      </div>
    </template>
  </USlideover>
</template>
