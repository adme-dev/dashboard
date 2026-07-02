<script setup lang="ts">
import { useSocialPublishing } from '~/composables/useSocialPublishing'
import { LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS } from '~/utils/socialPublishingPlatforms'
import type { SocialSlot, SocialPublishPlatform } from '~/types'

/**
 * Recurring posting-slot manager. Relocated here (from the Planner page) so the
 * Queue owns cadence — queued posts auto-fill the next free slot. Self-contained:
 * takes the active clientId and drives the slots/* API directly.
 */
const props = defineProps<{ clientId: string | null }>()

const api = useSocialPublishing()
const toast = useToast()

const slots = ref<SocialSlot[]>([])
const loading = ref(false)
const open = ref(true)

const DOW = [
  { label: 'Sunday', value: 0 }, { label: 'Monday', value: 1 }, { label: 'Tuesday', value: 2 },
  { label: 'Wednesday', value: 3 }, { label: 'Thursday', value: 4 }, { label: 'Friday', value: 5 }, { label: 'Saturday', value: 6 },
]
const TIMES = Array.from({ length: 48 }, (_, i) => {
  const h = String(Math.floor(i / 2)).padStart(2, '0')
  const m = i % 2 ? '30' : '00'
  return `${h}:${m}`
})
const PLATFORMS = LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS.map(({ value, label }) => ({ value, label }))

const form = ref({ dayOfWeek: 1, timeOfDay: '09:00', platforms: [] as SocialPublishPlatform[] })

async function load() {
  if (!props.clientId) return
  loading.value = true
  try { slots.value = await api.listSlots(props.clientId) } finally { loading.value = false }
}
watch(() => props.clientId, load, { immediate: true })

async function addSlot() {
  if (!props.clientId) return
  try {
    await api.createSlot({ clientId: props.clientId, dayOfWeek: form.value.dayOfWeek, timeOfDay: form.value.timeOfDay, platforms: form.value.platforms })
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
  <div class="rounded-lg border border-default mb-6">
    <button
      type="button"
      class="w-full flex items-center gap-2 px-4 py-3 text-left"
      @click="open = !open"
    >
      <UIcon name="i-lucide-calendar-clock" class="size-4 text-muted" />
      <span class="text-sm font-medium">Posting slots</span>
      <UBadge v-if="slots.length" size="xs" color="neutral" variant="subtle">{{ slots.length }}</UBadge>
      <span class="text-xs text-muted">Queued posts fill the next free slot</span>
      <UIcon :name="open ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'" class="size-4 text-muted ml-auto" />
    </button>

    <div v-if="open" class="px-4 pb-4 border-t border-default pt-4">
      <div class="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-end">
        <UFormField label="Day">
          <USelectMenu v-model="form.dayOfWeek" :items="DOW" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Time">
          <USelectMenu v-model="form.timeOfDay" :items="TIMES" class="w-full" />
        </UFormField>
        <UButton icon="i-lucide-plus" :disabled="!clientId" @click="addSlot">Add slot</UButton>
      </div>
      <UFormField label="Networks (optional)" class="mt-4">
        <USelectMenu v-model="form.platforms" :items="PLATFORMS" value-key="value" label-key="label" multiple placeholder="All networks" class="w-full" />
      </UFormField>

      <div v-if="loading" class="text-sm text-muted mt-4">Loading…</div>
      <div v-else-if="!slots.length" class="rounded-lg border border-default p-6 text-center text-muted text-sm mt-4">
        No slots yet — add one to start auto-filling the queue.
      </div>
      <div v-else class="space-y-2 mt-4">
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
  </div>
</template>
