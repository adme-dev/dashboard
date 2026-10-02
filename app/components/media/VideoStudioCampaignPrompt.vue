<script setup lang="ts">
import { computed, onScopeDispose, ref } from 'vue'
import type { CampaignPrompt } from '~~/server/utils/audio/timelineSchema'
import { prepareCampaignVideoPrompt } from '~~/app/utils/video/campaignPrompt'

const props = defineProps<{
  clientId: string
  brandName?: string
  templatePrompt?: string
  styleGuide?: string
  savedDraft?: CampaignPrompt
  saveDraft: (draft: CampaignPrompt) => Promise<void>
}>()
const emit = defineEmits<{ apply: [prompt: string] }>()
const open = ref(false)
const brief = ref('')
const guideRules = ref('')
const prompt = ref('')
const error = ref<string | null>(null)
const saving = ref(false)
const toast = useToast()
let active = true
onScopeDispose(() => {
  active = false
})
const saved = computed(() => props.savedDraft?.clientId === props.clientId ? props.savedDraft : undefined)
function edit() {
  brief.value = saved.value?.brief ?? ''
  guideRules.value = saved.value?.guideRules ?? ''
  prompt.value = saved.value?.prompt ?? ''
  error.value = null
  open.value = true
}
function prepare() {
  const result = prepareCampaignVideoPrompt({ brief: brief.value, guideRules: guideRules.value, brandName: props.brandName, templatePrompt: props.templatePrompt })
  error.value = result.error
  prompt.value = result.prompt ?? ''
}
async function save() {
  if (!brief.value.trim() || !prompt.value.trim() || prompt.value.length > 2000) {
    error.value = 'Add a brief and a reviewed prompt of up to 2,000 characters.'
    return
  }
  const clientId = props.clientId
  saving.value = true
  error.value = null
  try {
    await props.saveDraft({ clientId, brief: brief.value.trim(), guideRules: guideRules.value, prompt: prompt.value.trim() })
    if (!active || props.clientId !== clientId) return
    emit('apply', prompt.value.trim())
    open.value = false
    toast.add({ title: 'Campaign prompt saved and applied', description: 'Choose your source image, model and duration before generating.', color: 'success' })
  } catch {
    error.value = 'Could not save the campaign prompt. Your text is still here; try again.'
  } finally { saving.value = false }
}
</script>

<template>
  <div class="space-y-2">
    <UButton
      label="Prepare campaign prompt"
      icon="i-lucide-file-pen-line"
      size="xs"
      variant="soft"
      @click="edit"
    />
    <p v-if="saved" class="text-xs text-muted">
      Campaign brief and reviewed prompt saved to this project.
    </p>
    <UModal
      v-model:open="open"
      title="Prepare campaign prompt"
      :description="`Use ${brandName || 'this client'}'s preset and reviewed guide rules. Preparation is free; generation is a separate step.`"
      :dismissible="!saving"
      :ui="{ content: 'max-w-2xl' }"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField label="Campaign brief" help="Audience, purpose, approved message and call to action for this video." required>
            <UTextarea
              v-model="brief"
              :rows="3"
              :maxlength="600"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>
          <details v-if="styleGuide" class="text-sm">
            <summary class="cursor-pointer text-muted">
              Read the client style guide
            </summary>
            <p class="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed">
              {{ styleGuide }}
            </p>
          </details>
          <UFormField label="Guide rules for this video" help="Copy the relevant rules from the guide. These are included with the client motion preset.">
            <UTextarea
              v-model="guideRules"
              :rows="3"
              :maxlength="600"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>
          <UButton
            label="Prepare editable prompt"
            icon="i-lucide-wand-sparkles"
            color="neutral"
            variant="soft"
            :disabled="saving"
            @click="prepare"
          />
          <UFormField label="Reviewed video prompt" :help="`${prompt.length.toLocaleString()} / 2,000 characters. Saved separately from the permanent client preset.`" required>
            <UTextarea
              v-model="prompt"
              :rows="7"
              :disabled="saving"
              class="w-full"
            />
          </UFormField>
          <UAlert v-if="error" color="error" :title="error" />
        </div>
      </template>
      <template #footer>
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          label="Save and apply prompt"
          :loading="saving"
          :disabled="!brief.trim() || !prompt.trim() || prompt.length > 2000"
          @click="save"
        />
      </template>
    </UModal>
  </div>
</template>
