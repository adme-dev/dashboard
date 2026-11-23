<script setup lang="ts">
type Option = { id: string, formatKey: string, revision: string, title: string, createdAt: string, duration: number, previewUrl: string }
const props = defineProps<{ projectId: string }>()
const emit = defineEmits<{ 'needs-video': [value: boolean], 'updated': [] }>()
const options = ref<Option[]>([])
const required = ref(false)
const ready = ref(false)
const selected = ref('')
const busy = ref(false)
const error = ref('')
const chosen = computed(() => options.value.find(option => option.id === selected.value))
const items = computed(() => options.value.map(option => ({ value: option.id, label: `${option.duration.toFixed(2)}s · ${new Date(option.createdAt).toLocaleString('en-AU')} · ${option.formatKey.replace('custom_', '')}` })))
const endpoint = `/api/agency/banner-studio/projects/${props.projectId}/proof-video`
async function refresh() {
  emit('needs-video', true)
  try {
    const result = await $fetch<{ options: Option[], required: boolean, ready: boolean }>(endpoint)
    options.value = result.options
    required.value = result.required
    ready.value = result.ready
    selected.value = options.value[0]?.id || ''
    emit('needs-video', required.value && !ready.value)
  } catch {
    error.value = 'Could not check the proof video. Reopen sharing to try again.'
  }
}
async function useVideo() {
  if (!chosen.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await $fetch(endpoint, { method: 'POST', body: { id: chosen.value.id, revision: chosen.value.revision }, timeout: 60000, retry: false })
    await refresh()
    emit('updated')
  } catch (cause) {
    error.value = (cause as { data?: { statusMessage?: string } }).data?.statusMessage || 'Could not attach the rendered video. Try again.'
  } finally {
    busy.value = false
  }
}
onMounted(refresh)
</script>

<template>
  <section v-if="required || error" class="space-y-3 rounded-lg border border-default p-4">
    <h3 class="text-sm font-semibold">
      Full-length proof video
    </h3>
    <p class="text-sm text-muted">
      {{ ready ? 'The completed Video Studio video is ready for client proofs. New banner edits require a new proof video.' : 'Use a completed Video Studio render for artwork longer than 30 seconds. Review the video before attaching it to this saved artwork.' }}
    </p>
    <template v-if="!ready && options.length">
      <UFormField label="Completed video">
        <USelect
          v-model="selected"
          :items="items"
          class="w-full"
          :disabled="busy"
        />
      </UFormField>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-if="chosen"
          :to="chosen.previewUrl"
          target="_blank"
          color="neutral"
          variant="outline"
          label="Review video"
          icon="i-lucide-play"
        />
        <UButton
          :disabled="!chosen || busy"
          :loading="busy"
          label="Use rendered video"
          @click="useVideo"
        />
      </div>
    </template>
    <p v-else-if="!ready" class="text-sm text-muted">
      Render the current edit in its linked Video Studio project, then reopen sharing.
    </p>
    <UAlert
      v-if="error"
      color="error"
      title="Proof video unavailable"
      :description="error"
    />
  </section>
</template>
