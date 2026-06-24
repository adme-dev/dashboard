<script setup lang="ts">
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'
import { useSocialPlanner } from '~/composables/useSocialPlanner'
import type { SocialCampaignWithCounts, SocialCampaignStatus } from '~/types'

/**
 * Campaign create / edit / delete, surfaced as a slideover from the Planner
 * header. Campaigns group board posts and are the target of AI generation.
 * Emits `changed` after any mutation so the board reloads its rollups.
 */
const props = defineProps<{ clientId: string | null }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ changed: [] }>()

const planner = useSocialPlanner()
const toast = useToast()

const campaigns = ref<SocialCampaignWithCounts[]>([])
const loading = ref(false)
const saving = ref(false)

const SWATCHES = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4', '#64748b']
const STATUSES: { value: SocialCampaignStatus; label: string }[] = [
  { value: 'active', label: 'Active' }, { value: 'planning', label: 'Planning' }, { value: 'archived', label: 'Archived' },
]

const blank = () => ({ name: '', color: '#6366f1', status: 'active' as SocialCampaignStatus, startDate: '', endDate: '', brief: '', goalPostCount: null as number | null })
const editingId = ref<string | null>(null)
const showForm = ref(false)
const form = ref(blank())

// ISO YYYY-MM-DD ↔ CalendarDate (pure dates — no time component, no tz drift).
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try { return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso) } catch { return null }
}
const startModel = computed({ get: () => toCalendarDate(form.value.startDate), set: v => { form.value.startDate = v ? v.toString() : '' } })
const endModel = computed({ get: () => toCalendarDate(form.value.endDate), set: v => { form.value.endDate = v ? v.toString() : '' } })
const fmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function fmtDate(iso: string): string {
  const cd = toCalendarDate(iso) as CalendarDate | null
  return cd ? fmt.format(new Date(cd.year, cd.month - 1, cd.day)) : 'Pick a date'
}

async function load() {
  if (!props.clientId) { campaigns.value = []; return }
  loading.value = true
  try { campaigns.value = await planner.listCampaigns(props.clientId) } finally { loading.value = false }
}
watch([open, () => props.clientId], () => { if (open.value) load() }, { immediate: true })

function startCreate() { editingId.value = null; form.value = blank(); showForm.value = true }
function startEdit(c: SocialCampaignWithCounts) {
  editingId.value = c.id
  form.value = {
    name: c.name, color: c.color, status: c.status,
    startDate: c.start_date ?? '', endDate: c.end_date ?? '',
    brief: c.brief ?? '', goalPostCount: c.goal_post_count,
  }
  showForm.value = true
}

async function save() {
  if (!props.clientId || !form.value.name.trim()) {
    toast.add({ title: 'Name is required', color: 'error' }); return
  }
  saving.value = true
  const body = {
    name: form.value.name.trim(), color: form.value.color, status: form.value.status,
    startDate: form.value.startDate || null, endDate: form.value.endDate || null,
    brief: form.value.brief || null, goalPostCount: form.value.goalPostCount,
  }
  try {
    if (editingId.value) await planner.updateCampaign(editingId.value, body)
    else await planner.createCampaign({ clientId: props.clientId, ...body })
    toast.add({ title: editingId.value ? 'Campaign updated' : 'Campaign created', color: 'success' })
    showForm.value = false
    await load(); emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Could not save campaign', description: e?.data?.statusMessage, color: 'error' })
  } finally { saving.value = false }
}

const deleteTarget = ref<SocialCampaignWithCounts | null>(null)
async function confirmDelete() {
  const c = deleteTarget.value
  if (!c) return
  try {
    await planner.deleteCampaign(c.id)
    deleteTarget.value = null
    toast.add({ title: 'Campaign deleted', color: 'success' })
    await load(); emit('changed')
  } catch (e: any) {
    toast.add({ title: 'Could not delete campaign', description: e?.data?.statusMessage, color: 'error' })
  }
}
</script>

<template>
  <USlideover v-model:open="open" title="Campaigns" description="Group posts into launches and themes. AI can draft a whole campaign at once.">
    <template #body>
      <div class="space-y-4">
        <UButton v-if="!showForm" icon="i-lucide-plus" block @click="startCreate">New campaign</UButton>

        <!-- Inline create/edit form -->
        <div v-if="showForm" class="rounded-lg border border-default p-4 space-y-4">
          <UFormField label="Name" required>
            <UInput v-model="form.name" placeholder="e.g. June Product Launch" class="w-full" />
          </UFormField>

          <UFormField label="Colour">
            <div class="flex items-center gap-2 flex-wrap">
              <button
                v-for="s in SWATCHES" :key="s" type="button"
                class="size-6 rounded-full ring-offset-2 ring-offset-default transition"
                :class="form.color === s ? 'ring-2 ring-primary' : 'ring-1 ring-default'"
                :style="{ backgroundColor: s }" @click="form.color = s"
              />
              <UInput v-model="form.color" size="xs" class="w-24" placeholder="#6366f1" />
            </div>
          </UFormField>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Status">
              <USelectMenu v-model="form.status" :items="STATUSES" value-key="value" label-key="label" class="w-full" />
            </UFormField>
            <UFormField label="Goal posts">
              <UInput v-model.number="form.goalPostCount" type="number" min="0" placeholder="optional" class="w-full" />
            </UFormField>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Starts">
              <UPopover>
                <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start">
                  {{ fmtDate(form.startDate) }}
                </UButton>
                <template #content>
                  <UCalendar v-model="startModel" class="p-2" />
                  <div class="p-2 pt-0 flex justify-end">
                    <UButton size="xs" variant="ghost" color="neutral" @click="form.startDate = ''">Clear</UButton>
                  </div>
                </template>
              </UPopover>
            </UFormField>
            <UFormField label="Ends">
              <UPopover>
                <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start">
                  {{ fmtDate(form.endDate) }}
                </UButton>
                <template #content>
                  <UCalendar v-model="endModel" class="p-2" />
                  <div class="p-2 pt-0 flex justify-end">
                    <UButton size="xs" variant="ghost" color="neutral" @click="form.endDate = ''">Clear</UButton>
                  </div>
                </template>
              </UPopover>
            </UFormField>
          </div>

          <UFormField label="Brief" help="Seeds AI generation for this campaign.">
            <UTextarea v-model="form.brief" :rows="4" placeholder="What's this campaign about?" class="w-full" />
          </UFormField>

          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="showForm = false">Cancel</UButton>
            <UButton :loading="saving" @click="save">{{ editingId ? 'Save changes' : 'Create campaign' }}</UButton>
          </div>
        </div>

        <!-- List -->
        <div v-if="loading" class="text-sm text-muted">Loading…</div>
        <div v-else-if="!campaigns.length && !showForm" class="rounded-lg border border-default p-8 text-center text-muted text-sm">
          No campaigns yet. Create one to start planning.
        </div>
        <div v-else class="space-y-2">
          <div v-for="c in campaigns" :key="c.id" class="flex items-center gap-3 rounded-lg border border-default p-3">
            <span class="size-3 rounded-full shrink-0" :style="{ backgroundColor: c.color }" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium truncate">{{ c.name }}</p>
              <p class="text-xs text-muted">
                {{ c.post_count }} post{{ c.post_count === 1 ? '' : 's' }}<span v-if="c.goal_post_count"> · goal {{ c.goal_post_count }}</span>
              </p>
            </div>
            <UBadge size="xs" variant="subtle" :color="c.status === 'active' ? 'primary' : c.status === 'archived' ? 'neutral' : 'info'">{{ c.status }}</UBadge>
            <UButton icon="i-lucide-pencil" size="xs" variant="ghost" color="neutral" @click="startEdit(c)" />
            <UButton icon="i-lucide-trash-2" size="xs" variant="ghost" color="error" @click="deleteTarget = c" />
          </div>
        </div>
      </div>

      <UModal :open="!!deleteTarget" @update:open="(v) => { if (!v) deleteTarget = null }">
        <template #content>
          <div class="p-5 space-y-4">
            <h3 class="font-semibold">Delete campaign?</h3>
            <p class="text-sm text-muted">
              “{{ deleteTarget?.name }}” will be removed. Its {{ deleteTarget?.post_count ?? 0 }} post{{ deleteTarget?.post_count === 1 ? '' : 's' }} stay — they just lose the campaign tag.
            </p>
            <div class="flex justify-end gap-2">
              <UButton color="neutral" variant="ghost" @click="deleteTarget = null">Cancel</UButton>
              <UButton color="error" icon="i-lucide-trash-2" @click="confirmDelete">Delete</UButton>
            </div>
          </div>
        </template>
      </UModal>
    </template>
  </USlideover>
</template>
