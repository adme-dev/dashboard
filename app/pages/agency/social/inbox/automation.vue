<script setup lang="ts">
import type { SocialAutomationRule } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const { data: clientsData } = await useFetch('/api/agency/clients', { query: { limit: 200 } })
const clients = computed<any[]>(() => {
  const d = clientsData.value as any
  return Array.isArray(d) ? d : (d?.clients ?? [])
})
const clientOptions = computed(() => clients.value.map(c => ({ label: c.name, value: c.id })))
const clientId = ref<string | null>(clients.value[0]?.id ?? null)

const { data: rules, refresh, pending } = await useFetch<SocialAutomationRule[]>(
  '/api/agency/social/inbox/automation-rules',
  { query: { clientId }, default: () => [], watch: [clientId] },
)

const toast = useToast()
const editorOpen = ref(false)
// Editor allows the '__all__' sentinel for platform/channel (mapped back to null on save).
type RuleEditor = Omit<Partial<SocialAutomationRule>, 'platform' | 'channel_type'>
  & { platform?: string | null; channel_type?: string | null }
const editing = ref<RuleEditor | null>(null)

const MODES = [
  { value: 'off', label: 'Off — manual only' },
  { value: 'suggest', label: 'Suggest — AI drafts, human sends' },
  { value: 'approval', label: 'Approval — AI drafts, human approves' },
  { value: 'autopilot', label: 'Autopilot — AI sends (guardrailed)' },
]
const PLATFORMS = [
  { value: '__all__', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' }, { value: 'google-business', label: 'Google Business' },
]
const CHANNELS = [
  { value: '__all__', label: 'All channels' },
  { value: 'comment', label: 'Comments' }, { value: 'review', label: 'Reviews' },
]
const APPROVERS = [
  { value: 'staff', label: 'Staff' }, { value: 'client', label: 'Client (portal)' }, { value: 'none', label: 'No one (auto)' },
]

function openEditor(base: Partial<SocialAutomationRule>) {
  const e: any = JSON.parse(JSON.stringify(base))
  e.platform = e.platform ?? '__all__'
  e.channel_type = e.channel_type ?? '__all__'
  e.action = e.action ?? {}
  editing.value = e
  editorOpen.value = true
}
function newRule() {
  openEditor({
    client_id: clientId.value!, name: '', platform: null, channel_type: null, mode: 'suggest',
    conditions: {}, action: {}, approval_by: 'staff', rate_limit: 0, confidence_floor: 0.7,
    business_hours: null, priority: 100, enabled: true,
  })
}
function editRule(r: SocialAutomationRule) { openEditor(r) }

async function save() {
  const e = editing.value!
  if (!e.name?.trim()) { toast.add({ title: 'Name required', color: 'error' }); return }
  const payload = {
    ...e,
    client_id: e.client_id ?? clientId.value,
    platform: e.platform === '__all__' ? null : e.platform,
    channel_type: e.channel_type === '__all__' ? null : e.channel_type,
  }
  try {
    if (e.id) await $fetch(`/api/agency/social/inbox/automation-rules/${e.id}`, { method: 'PATCH', body: payload })
    else await $fetch('/api/agency/social/inbox/automation-rules', { method: 'POST', body: payload })
    editorOpen.value = false
    await refresh()
    toast.add({ title: 'Saved', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Save failed', description: err?.data?.statusMessage, color: 'error' })
  }
}
async function toggleEnabled(r: SocialAutomationRule) {
  await $fetch(`/api/agency/social/inbox/automation-rules/${r.id}`, { method: 'PATCH', body: { client_id: r.client_id, enabled: !r.enabled } })
  await refresh()
}
async function remove(r: SocialAutomationRule) {
  await $fetch(`/api/agency/social/inbox/automation-rules/${r.id}`, { method: 'DELETE', query: { clientId: r.client_id } })
  await refresh()
}
const modeColor = (m: string) => (({ off: 'neutral', suggest: 'info', approval: 'warning', autopilot: 'success' } as Record<string, string>)[m] || 'neutral')
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="text-xl font-semibold">Reply Automation</h1>
        <p class="text-sm text-muted">AI-assisted replies for comments and reviews. Autopilot stays dormant until enabled by an operator.</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <USelectMenu v-model="clientId" :items="clientOptions" value-key="value" placeholder="Select client" class="w-56 max-w-full" />
        <UButton icon="i-lucide-plus" label="New rule" :disabled="!clientId" @click="newRule" />
      </div>
    </div>

    <SocialSuiteSectionNav />

    <UAlert v-if="!clientId" color="warning" variant="subtle" title="Select a client"
      description="Choose a client to manage its automation rules." icon="i-lucide-info" />

    <div v-else-if="pending" class="text-sm text-muted">Loading…</div>

    <div v-else-if="!rules.length" class="rounded-lg border border-dashed border-default p-10 text-center text-muted">
      No automation rules yet. Create one to start drafting AI replies.
    </div>

    <div v-else class="space-y-3">
      <UCard v-for="r in rules" :key="r.id">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ r.name }}</span>
              <UBadge :color="modeColor(r.mode) as any" variant="subtle" size="sm">{{ r.mode }}</UBadge>
              <UBadge v-if="!r.enabled" color="neutral" variant="subtle" size="sm">disabled</UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ r.platform || 'all platforms' }} · {{ r.channel_type || 'all channels' }} ·
              priority {{ r.priority }} · approve via {{ r.approval_by }}
              <template v-if="r.mode === 'autopilot'"> · floor {{ r.confidence_floor }} · limit {{ r.rate_limit || '∞' }}/h</template>
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton size="sm" variant="ghost" :icon="r.enabled ? 'i-lucide-pause' : 'i-lucide-play'" @click="toggleEnabled(r)" />
            <UButton size="sm" variant="ghost" icon="i-lucide-pencil" @click="editRule(r)" />
            <UButton size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(r)" />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="editorOpen">
      <template #content>
        <div v-if="editing" class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">{{ editing.id ? 'Edit rule' : 'New rule' }}</h2>
          <UFormField label="Name">
            <UInput v-model="editing.name" placeholder="e.g. Thank 5-star reviews" class="w-full" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Platform">
              <USelect v-model="editing.platform" :items="PLATFORMS" value-key="value" class="w-full" />
            </UFormField>
            <UFormField label="Channel">
              <USelect v-model="editing.channel_type" :items="CHANNELS" value-key="value" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Mode">
            <USelect v-model="editing.mode" :items="MODES" value-key="value" class="w-full" />
          </UFormField>
          <UFormField label="AI instructions (brand voice)" help="Guides the drafted reply. No prices/dates will be invented.">
            <UTextarea v-model="editing.action!.aiPrompt" :rows="3" placeholder="Warm, concise, Aussie tone. Sign off as the team." class="w-full" />
          </UFormField>
          <UFormField v-if="editing.mode === 'approval'" label="Who approves">
            <USelect v-model="editing.approval_by" :items="APPROVERS" value-key="value" class="w-full" />
          </UFormField>
          <div v-if="editing.mode === 'autopilot'" class="grid grid-cols-2 gap-4">
            <UFormField label="Confidence floor" help="0–1. Below this, sends to approval.">
              <UInput v-model.number="editing.confidence_floor" type="number" step="0.05" min="0" max="1" class="w-full" />
            </UFormField>
            <UFormField label="Rate limit / hour" help="0 = unlimited">
              <UInput v-model.number="editing.rate_limit" type="number" min="0" class="w-full" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Priority" help="Lower runs first">
              <UInput v-model.number="editing.priority" type="number" min="1" class="w-full" />
            </UFormField>
            <UFormField label="Enabled">
              <UCheckbox v-model="editing.enabled" label="Active" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="editorOpen = false" />
            <UButton label="Save rule" @click="save" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
