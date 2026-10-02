<script setup lang="ts">
import type { VideoClientProfile } from '~~/server/utils/video-generation/clientProfile'

const props = defineProps<{ projectId: string, clientId?: string | null, profile?: VideoClientProfile | null, canManage?: boolean, spentCents?: number }>()
const emit = defineEmits<{ saved: [], preset: [prompt: string] }>()
const open = ref(false)
const saving = ref(false)
const toast = useToast()
const defaultSettings = (): VideoClientProfile => ({ enabled: false, monthlyCapCents: 2000, allowedModelIds: ['aigateway/seedance-25-i2v'], brandName: '', brandWebsite: '', styleGuide: '', templatePrompt: '', socialBrief: '' })
const settings = ref<VideoClientProfile>(defaultSettings())
watch(() => [props.clientId, props.projectId, props.profile] as const, () => {
  settings.value = props.profile ? JSON.parse(JSON.stringify(props.profile)) : defaultSettings()
  open.value = false
}, { immediate: true })
const monthlyBudget = computed({ get: () => settings.value.monthlyCapCents / 100, set: (v: number) => {
  settings.value.monthlyCapCents = Math.round(Number(v) * 100)
} })
async function save() {
  saving.value = true
  try {
    await $fetch('/api/agency/video/client-profile', { method: 'PUT', body: { projectId: props.projectId, profile: settings.value } })
    toast.add({ title: 'Client video settings saved', color: 'success' })
    open.value = false
    emit('saved')
  } catch {
    toast.add({ title: 'Could not save client settings', description: 'Check the required fields and your client permissions.', color: 'error' })
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-3 rounded-lg border border-default p-3">
    <div class="flex flex-wrap items-center gap-2">
      <div class="min-w-0 flex-1">
        <p class="text-sm font-medium">
          {{ profile?.brandName || 'Client campaign preset' }}
        </p>
        <p class="text-xs text-muted">
          {{ clientId ? 'Saved guidance for this client. Review each video before scheduling.' : 'Assign a client above to use its branding and budget.' }}
        </p>
      </div>
      <UButton
        v-if="canManage && clientId"
        label="Brand settings"
        icon="i-lucide-settings-2"
        size="xs"
        color="neutral"
        variant="soft"
        @click="() => { open = !open }"
      />
    </div>
    <template v-if="profile">
      <p class="text-xs text-muted">
        Generation {{ profile.enabled ? 'enabled' : 'disabled' }} · ${{ ((spentCents || 0) / 100).toFixed(2) }} of ${{ (profile.monthlyCapCents / 100).toFixed(2) }} monthly estimate budget (USD)
      </p>
      <UButton
        v-if="profile.templatePrompt"
        label="Use client prompt"
        size="xs"
        variant="soft"
        @click="emit('preset', profile.templatePrompt)"
      />
      <details class="text-xs">
        <summary class="cursor-pointer text-muted">
          View style guide
        </summary><p class="mt-2 whitespace-pre-wrap leading-relaxed">
          {{ profile.styleGuide }}
        </p>
      </details>
    </template>
    <div v-if="open" class="space-y-3">
      <UFormField label="Brand name" required>
        <UInput v-model="settings.brandName" class="w-full" />
      </UFormField>
      <UFormField label="Website">
        <UInput v-model="settings.brandWebsite" placeholder="https://example.com" class="w-full" />
      </UFormField>
      <UFormField label="Style guide" help="Brand colours, logo rules, composition and review checks.">
        <UTextarea v-model="settings.styleGuide" :rows="6" class="w-full" />
      </UFormField>
      <UFormField label="Default motion prompt" help="Describe movement; keep permanent titles and logos in the editor.">
        <UTextarea v-model="settings.templatePrompt" :rows="5" class="w-full" />
      </UFormField>
      <UFormField label="Social caption brief" help="Used when handing a generated video to Compose.">
        <UTextarea v-model="settings.socialBrief" :rows="4" class="w-full" />
      </UFormField>
      <UFormField label="Monthly generation budget (USD)">
        <UInput
          v-model="monthlyBudget"
          type="number"
          min="0"
          max="1000"
          step="1"
          class="w-full"
        />
      </UFormField>
      <USwitch v-model="settings.enabled" label="Enable client video generation" />
      <p class="text-xs text-muted">
        New presets use Seedance 2.5. Charges are estimates; existing model permissions are retained.
      </p>
      <UButton label="Save client settings" :loading="saving" @click="save" />
    </div>
  </div>
</template>
