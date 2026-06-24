<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { useSocialPublishingClient } from '~/composables/useSocialPublishingClient'
import type { SocialSlot, SocialPublishPlatform } from '~/types'

definePageMeta({ layout: 'agency', middleware: ['role-creative'] })

const api = useSocialPublishing()
const toast = useToast()

const { clientId } = useSocialPublishingClient()

const slots = ref<SocialSlot[]>([])
const loading = ref(false)

const DOW = [
  { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
]
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 ? '30' : '00'
  return `${h}:${m}`
})
const PLATFORMS: { value: SocialPublishPlatform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' }, { value: 'google-business', label: 'Google Business' },
]

const form = ref({ dayOfWeek: 1, timeOfDay: '09:00', platforms: [] as SocialPublishPlatform[] })

async function load() {
  if (!clientId.value) return
  loading.value = true
  try { slots.value = await api.listSlots(clientId.value) } finally { loading.value = false }
}
watch(clientId, load, { immediate: true })

async function addSlot() {
  if (!clientId.value) return
  try {
    await api.createSlot({ clientId: clientId.value, dayOfWeek: form.value.dayOfWeek, timeOfDay: form.value.timeOfDay, platforms: form.value.platforms })
    toast.add({ title: 'Slot added', color: 'success' })
    form.value.platforms = []
    await load()
  } catch (e: any) { toast.add({ title: 'Failed', description: e?.data?.statusMessage, color: 'error' }) }
}
const dowLabel = (v: number) => DOW.find(d => d.value === v)?.label ?? v

async function toggleSlot(s: SocialSlot) {
  const prev = s.enabled
  s.enabled = !s.enabled // optimistic
  try {
    await api.updateSlot(s.id, { enabled: s.enabled })
  } catch (e: any) {
    s.enabled = prev
    toast.add({ title: 'Could not update slot', description: e?.data?.statusMessage, color: 'error' })
  }
}

const deleteTarget = ref<SocialSlot | null>(null)
async function confirmDelete() {
  const s = deleteTarget.value
  if (!s) return
  try {
    await api.deleteSlot(s.id)
    deleteTarget.value = null
    toast.add({ title: 'Slot removed', color: 'success' })
    await load()
  } catch (e: any) {
    toast.add({ title: 'Could not remove slot', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <SocialPublishingShell
    title="Planner"
    subtitle="Define recurring posting slots. Queued posts fill the next free slot automatically."
  >
    <div class="rounded-lg border border-default p-4 mb-6">
      <h2 class="text-sm font-medium mb-3">Add a posting slot</h2>
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <UFormField label="Day">
          <USelectMenu v-model="form.dayOfWeek" :items="DOW" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Time">
          <USelectMenu v-model="form.timeOfDay" :items="TIMES" class="w-full" />
        </UFormField>
        <UButton icon="i-lucide-plus" @click="addSlot">Add slot</UButton>
      </div>
      <UFormField label="Networks (optional)" class="mt-4">
        <USelectMenu v-model="form.platforms" :items="PLATFORMS" value-key="value" label-key="label" multiple placeholder="All networks" class="w-full" />
      </UFormField>
    </div>

    <UAlert
      icon="i-lucide-sparkles" color="neutral" variant="subtle" class="mb-5"
      title="AI week planner — coming soon"
      description="Auto-generating a week of posts from slots + brand context is a fast-follow on this slice."
    />

    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!slots.length" class="rounded-lg border border-default p-10 text-center text-muted">No slots yet.</div>
    <div v-else class="space-y-2">
      <div
        v-for="s in slots" :key="s.id"
        class="flex items-center gap-3 rounded-lg border border-default p-3 transition-opacity"
        :class="s.enabled === false ? 'opacity-60' : ''"
      >
        <UIcon name="i-lucide-clock" class="size-4 text-muted" />
        <div class="flex-1">
          <span class="text-sm font-medium">{{ dowLabel(s.day_of_week) }} · {{ s.time_of_day?.slice(0, 5) }}</span>
          <span class="text-xs text-muted ml-2">{{ s.timezone }}</span>
        </div>
        <div class="flex gap-1">
          <UBadge v-for="pl in (s.platforms || [])" :key="pl" size="xs" color="neutral" variant="subtle">{{ pl }}</UBadge>
          <UBadge v-if="!s.platforms?.length" size="xs" color="neutral" variant="subtle">all</UBadge>
        </div>
        <UTooltip :text="s.enabled === false ? 'Slot paused' : 'Slot active'">
          <USwitch :model-value="s.enabled !== false" @update:model-value="toggleSlot(s)" />
        </UTooltip>
        <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="deleteTarget = s" />
      </div>
    </div>

    <UModal :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold">Remove posting slot?</h3>
          <p class="text-sm text-muted">
            {{ deleteTarget ? dowLabel(deleteTarget.day_of_week) + ' · ' + deleteTarget.time_of_day?.slice(0, 5) : '' }}
            will no longer auto-fill from the queue.
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="deleteTarget = null">Cancel</UButton>
            <UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">Remove</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </SocialPublishingShell>
</template>
