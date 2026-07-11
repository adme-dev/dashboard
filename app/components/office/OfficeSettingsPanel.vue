<script setup lang="ts">
import type { OfficeSettingsRow } from '~~/app/types/office'

const props = defineProps<{
  officeId: string
  defaultOpen?: boolean
}>()

const toast = useToast()
const open = ref(props.defaultOpen ?? false)
const saving = ref(false)

const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>
const data = ref<{ settings: OfficeSettingsRow | null }>({ settings: null })
const pending = ref(false)
const error = ref<unknown>(null)

async function refresh() {
  pending.value = true
  error.value = null
  try {
    data.value = await apiFetch<{ settings: OfficeSettingsRow | null }>(`/api/office/${props.officeId}/settings`)
  } catch (err) {
    error.value = err
  } finally {
    pending.value = false
  }
}

await refresh()

const form = reactive({
  guest_access_enabled: true,
  public_lobbies_enabled: true,
  recording_enabled: true,
  public_recording_links_enabled: false,
  ai_notes_enabled: true,
  assistant_enabled: true,
  default_meeting_retention_days: 90,
  default_recording_retention_days: 180,
  require_recording_consent: true
})

const retentionValid = computed(() =>
  form.default_meeting_retention_days >= 1
  && form.default_meeting_retention_days <= 3650
  && form.default_recording_retention_days >= 1
  && form.default_recording_retention_days <= 3650
)
const enabledPolicyCount = computed(() => [
  form.guest_access_enabled,
  form.public_lobbies_enabled,
  form.recording_enabled,
  form.public_recording_links_enabled,
  form.ai_notes_enabled,
  form.assistant_enabled,
  form.require_recording_consent
].filter(Boolean).length)
const policyAlerts = computed(() => [
  form.public_recording_links_enabled ? 'External recording links enabled' : '',
  !form.require_recording_consent ? 'Recording consent not required' : '',
  form.assistant_enabled && !form.ai_notes_enabled ? 'Assistant enabled without AI notes' : '',
  !form.guest_access_enabled && form.public_lobbies_enabled ? 'Public lobbies enabled while guest access is off' : ''
].filter(Boolean))

function syncForm(settings: OfficeSettingsRow | null | undefined) {
  if (!settings) return
  form.guest_access_enabled = settings.guest_access_enabled
  form.public_lobbies_enabled = settings.public_lobbies_enabled
  form.recording_enabled = settings.recording_enabled
  form.public_recording_links_enabled = settings.public_recording_links_enabled
  form.ai_notes_enabled = settings.ai_notes_enabled
  form.assistant_enabled = settings.assistant_enabled
  form.default_meeting_retention_days = settings.default_meeting_retention_days
  form.default_recording_retention_days = settings.default_recording_retention_days
  form.require_recording_consent = settings.require_recording_consent
}

async function saveSettings() {
  if (!retentionValid.value) {
    toast.add({
      title: 'Check retention policy',
      description: 'Retention windows must be between 1 and 3650 days.',
      icon: 'i-lucide-archive-x',
      color: 'error'
    })
    return
  }
  saving.value = true
  try {
    await apiFetch(`/api/office/${props.officeId}/settings`, {
      method: 'PATCH',
      body: form
    })
    toast.add({ title: 'Office settings saved', icon: 'i-lucide-shield-check', color: 'success', duration: 1600 })
    await refresh()
  } catch (err: unknown) {
    const message = err && typeof err === 'object' && 'data' in err
      ? (err as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({ title: 'Could not save settings', description: message || 'Try again in a moment.', color: 'error' })
  } finally {
    saving.value = false
  }
}

watch(() => data.value?.settings, syncForm, { immediate: true })
watch(() => props.officeId, () => {
  void refresh()
})
</script>

<template>
  <section class="mb-3 overflow-hidden rounded-lg border border-white/[0.08] bg-[#0f1218]/85 text-white shadow-[0_18px_55px_-44px_rgba(0,0,0,0.95)] backdrop-blur-xl">
    <button
      type="button"
      class="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      @click="open = !open"
    >
      <span class="flex min-w-0 items-center gap-2">
        <span class="flex size-7 items-center justify-center rounded-lg bg-white/[0.06] ring-1 ring-white/[0.08]">
          <UIcon name="i-lucide-shield-check" class="size-3.5 text-sky-300" />
        </span>
        <span class="min-w-0">
          <span class="block text-sm font-semibold">Office controls</span>
          <span class="block truncate text-xs text-white/40">Guest access, retention, recordings, and assistant policies</span>
        </span>
      </span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-white/45" />
    </button>

    <form v-if="open" class="border-t border-white/[0.06] p-3" @submit.prevent="saveSettings">
      <div
        v-if="pending"
        class="flex items-center justify-center rounded-lg bg-white/[0.035] px-3 py-8 ring-1 ring-white/[0.05]"
      >
        <XfLoader size="sm" />
      </div>

      <div
        v-else-if="error"
        class="rounded-lg bg-red-400/[0.07] px-3 py-3 text-sm text-red-50/80 ring-1 ring-red-300/15"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <div class="font-medium text-red-50">
              Could not load office controls
            </div>
            <div class="mt-1 text-xs text-red-50/55">
              Check your office admin access or retry the request.
            </div>
          </div>
          <button
            type="button"
            class="rounded-md bg-white/[0.06] px-2 py-1 text-xs font-medium text-white/70 ring-1 ring-white/[0.08] transition hover:bg-white/[0.1]"
            @click="() => refresh()"
          >
            Retry
          </button>
        </div>
      </div>

      <div v-else class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div class="space-y-3">
          <div class="grid gap-2 sm:grid-cols-3">
            <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
                Enabled
              </div>
              <div class="mt-1 text-sm font-semibold text-white/75">
                {{ enabledPolicyCount }}/7 controls
              </div>
            </div>
            <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
                Meeting retention
              </div>
              <div class="mt-1 text-sm font-semibold text-white/75">
                {{ form.default_meeting_retention_days }} days
              </div>
            </div>
            <div class="rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <div class="text-[10px] uppercase tracking-[0.12em] text-white/30">
                Policy alerts
              </div>
              <div
                class="mt-1 text-sm font-semibold"
                :class="policyAlerts.length ? 'text-amber-100' : 'text-emerald-100'"
              >
                {{ policyAlerts.length || 'Clear' }}
              </div>
            </div>
          </div>

          <div
            v-if="policyAlerts.length"
            class="rounded-lg bg-amber-300/[0.055] px-3 py-2 text-xs leading-5 text-amber-50/75 ring-1 ring-amber-200/12"
          >
            <div class="mb-1 flex items-center gap-1.5 font-semibold text-amber-100">
              <UIcon name="i-lucide-triangle-alert" class="size-3.5" />
              Review before saving
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="alert in policyAlerts"
                :key="alert"
                class="rounded-md bg-black/10 px-1.5 py-0.5 ring-1 ring-amber-100/10"
              >
                {{ alert }}
              </span>
            </div>
          </div>

          <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Guest access</span>
              <input v-model="form.guest_access_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Public lobbies</span>
              <input v-model="form.public_lobbies_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Recordings</span>
              <input v-model="form.recording_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Public recording links</span>
              <input v-model="form.public_recording_links_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">AI notes</span>
              <input v-model="form.ai_notes_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Assistant automation</span>
              <input v-model="form.assistant_enabled" type="checkbox" class="size-4 accent-sky-400">
            </label>
            <label class="flex items-center justify-between gap-3 rounded-lg bg-white/[0.035] px-3 py-2 ring-1 ring-white/[0.05]">
              <span class="text-xs text-white/75">Recording consent</span>
              <input v-model="form.require_recording_consent" type="checkbox" class="size-4 accent-sky-400">
            </label>
          </div>
        </div>

        <div class="space-y-2">
          <label class="block">
            <span class="mb-1 block text-[11px] text-white/40">Meeting retention days</span>
            <input
              v-model.number="form.default_meeting_retention_days"
              type="number"
              min="1"
              max="3650"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
            >
          </label>
          <label class="block">
            <span class="mb-1 block text-[11px] text-white/40">Recording retention days</span>
            <input
              v-model.number="form.default_recording_retention_days"
              type="number"
              min="1"
              max="3650"
              class="h-9 w-full rounded-md border border-white/[0.08] bg-white/[0.04] px-2 text-xs text-white outline-none focus:border-white/25"
            >
          </label>
          <p
            v-if="!retentionValid"
            class="rounded-md bg-red-400/10 px-2 py-1.5 text-[11px] leading-4 text-red-100 ring-1 ring-red-300/15"
          >
            Retention windows must be between 1 and 3650 days.
          </p>
          <button
            type="submit"
            class="h-9 w-full rounded-md bg-sky-400/15 text-xs font-semibold text-sky-100 ring-1 ring-sky-300/20 transition hover:bg-sky-400/20 disabled:cursor-wait disabled:opacity-60"
            :disabled="saving || !retentionValid"
          >
            Save controls
          </button>
        </div>
      </div>
    </form>
  </section>
</template>
