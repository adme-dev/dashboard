<script setup lang="ts">
import { bannerPosterTime } from '~~/shared/bannerPosterTime'

const open = defineModel<boolean>('open', { default: false })
const { state, setProofPosterTime, saveProject } = useBannerStudio()
const toast = useToast()
const time = ref(bannerPosterTime(state.duration, state.sets[state.activeKey]?.posterTime))
const busy = ref(false)
const error = ref('')
const { canWrite } = useAuth()
function choose(value: string | number) {
  const next = Number(value)
  if (value !== '' && Number.isFinite(next)) time.value = bannerPosterTime(state.duration, next)
}
async function save(automatic = false) {
  if (busy.value || !canWrite.value) return
  busy.value = true
  error.value = ''
  try {
    setProofPosterTime(automatic ? undefined : time.value)
    await saveProject()
    toast.add({ title: 'Client poster saved', color: 'success' })
    open.value = false
  } catch {
    error.value = 'Could not save the poster choice. Your local change is retained; retry saving.'
  } finally { busy.value = false }
}
</script>

<template>
  <UModal v-model:open="open" title="Client proof poster" :dismissible="!busy">
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Choose a settled frame so the offer and legal copy are visible before playback.
          {{ state.layoutView === 'all' ? 'Applies to all layouts.' : 'Applies to this layout.' }}
        </p>
        <UFormField label="Poster frame (seconds)" help="Measured from the start of the animation.">
          <UInput
            :model-value="time"
            type="number"
            :min="0"
            :max="state.duration"
            :step="0.1"
            class="w-full"
            :disabled="busy || !canWrite"
            @update:model-value="choose"
          />
        </UFormField>
        <UButton
          label="Use playhead"
          color="neutral"
          variant="outline"
          :disabled="busy || !canWrite"
          @click="choose(state.currentTime)"
        />
        <UAlert v-if="error" color="error" :title="error" />
      </div>
    </template>
    <template #footer>
      <UButton
        label="Automatic frame"
        color="neutral"
        variant="ghost"
        :disabled="busy || !canWrite"
        @click="save(true)"
      />
      <UButton
        label="Save poster"
        :loading="busy"
        :disabled="!canWrite"
        @click="save()"
      />
    </template>
  </UModal>
</template>
