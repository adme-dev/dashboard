<script setup lang="ts">
// CRM AI layer (P4.3) — explainable next-best-action list + a Groq-drafted
// follow-up for an opportunity. Agency-only and hidden unless CRM_AI_ENABLED is
// on (the endpoint returns enabled:false → this renders nothing). Drafts are
// suggestions: the rep edits/copies/dismisses — nothing is ever sent.
const props = defineProps<{ clientId: string, opportunityId: string }>()

const base = inject<string>('crmApiBase', '/api/crm')
const isAgency = base === '/api/crm'
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

interface Suggestion { key: string, title: string, reason: string, priority: 'high' | 'medium' | 'low' }
const query = computed(() => ({ client_id: props.clientId, opportunity_id: props.opportunityId }))
const data = ref<{ enabled: boolean, suggestions: Suggestion[] }>({ enabled: false, suggestions: [] })

async function refreshSuggestions() {
  if (!isAgency) return
  data.value = await apiFetch<{ enabled: boolean, suggestions: Suggestion[] }>(
    '/api/crm/ai/next-best-action',
    { query: query.value },
  )
}

watch(query, () => {
  refreshSuggestions()
}, { immediate: true })
const enabled = computed(() => !!data.value?.enabled)
const suggestions = computed(() => data.value?.suggestions ?? [])
const priorityColor: Record<string, string> = { high: 'error', medium: 'warning', low: 'neutral' }

const toast = useToast()
const drafting = ref(false)
const draftOpen = ref(false)
const draft = ref({ subject: '', body: '' })

async function generateDraft() {
  drafting.value = true
  try {
    const res = await apiFetch<{ draft: { subject: string, body: string } }>('/api/crm/ai/draft-followup', {
      method: 'POST',
      body: { client_id: props.clientId, opportunity_id: props.opportunityId },
    })
    draft.value = res.draft
    draftOpen.value = true
  } catch (e: unknown) {
    toast.add({ title: 'Could not draft follow-up', description: (e as Error)?.message, color: 'error' })
  } finally {
    drafting.value = false
  }
}

async function copyDraft() {
  try {
    await navigator.clipboard.writeText(`Subject: ${draft.value.subject}\n\n${draft.value.body}`)
    toast.add({ title: 'Copied to clipboard', color: 'success' })
  } catch {
    toast.add({ title: 'Copy failed', description: 'Select and copy manually.', color: 'error' })
  }
}
</script>

<template>
  <div v-if="isAgency && enabled">
    <div class="flex items-center justify-between gap-2 mb-3">
      <h3 class="text-sm font-semibold text-highlighted flex items-center gap-1.5">
        <UIcon name="i-lucide-sparkles" class="size-4 text-primary" /> AI suggestions
      </h3>
      <UButton icon="i-lucide-mail" size="xs" variant="ghost" color="neutral" :loading="drafting" @click="generateDraft">
        Draft follow-up
      </UButton>
    </div>

    <div v-if="suggestions.length" class="space-y-2">
      <div v-for="s in suggestions" :key="s.key" class="flex items-start gap-2 rounded-lg border border-default p-2.5">
        <UBadge :color="(priorityColor[s.priority] as any)" variant="subtle" size="sm" class="mt-0.5 shrink-0 capitalize">{{ s.priority }}</UBadge>
        <div class="min-w-0">
          <p class="text-sm font-medium text-highlighted">{{ s.title }}</p>
          <p class="text-xs text-muted">{{ s.reason }}</p>
        </div>
      </div>
    </div>
    <p v-else class="rounded-lg border border-dashed border-default py-3 text-center text-sm text-muted">
      No actions needed — this deal looks on track.
    </p>

    <UModal v-model:open="draftOpen">
      <template #content>
        <div class="p-4 space-y-3">
          <h3 class="text-sm font-semibold text-highlighted">Drafted follow-up</h3>
          <UFormField label="Subject">
            <UInput v-model="draft.subject" class="w-full" />
          </UFormField>
          <UFormField label="Body">
            <UTextarea v-model="draft.body" :rows="9" class="w-full" />
          </UFormField>
          <p class="text-xs text-muted">AI-drafted suggestion — review and edit before sending. Nothing is sent automatically.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" @click="draftOpen = false">Dismiss</UButton>
            <UButton icon="i-lucide-copy" @click="copyDraft">Copy</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
