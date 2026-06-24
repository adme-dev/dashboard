<script setup lang="ts">
import { CalendarDate, parseDate, type DateValue } from '@internationalized/date'
import { useSocialPlanner } from '~/composables/useSocialPlanner'
import type { SocialCampaignWithCounts, SocialGeneratedDraft, SocialPublishPlatform } from '~/types'

/**
 * AI content-calendar generation. Brief + knobs → a grid of editable draft
 * suggestions → accept writes them as DRAFTS only (never scheduled/published).
 * The review grid is the safety gate.
 */
const props = defineProps<{ clientId: string }>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{ created: [number] }>()

const planner = useSocialPlanner()
const toast = useToast()

const PLATFORMS: { value: SocialPublishPlatform; label: string }[] = [
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' }, { value: 'google-business', label: 'Google Business' },
]
const TONES = [
  { value: 'professional', label: 'Professional' }, { value: 'friendly', label: 'Friendly' },
  { value: 'bold', label: 'Bold' }, { value: 'playful', label: 'Playful' },
]

const campaigns = ref<SocialCampaignWithCounts[]>([])
const step = ref<'input' | 'review'>('input')
const generating = ref(false)
const accepting = ref(false)

const form = ref({
  campaignId: 'none', brief: '', count: 5,
  dateFrom: '', dateTo: '', tone: 'friendly',
  platforms: ['facebook', 'instagram'] as SocialPublishPlatform[],
})
const drafts = ref<SocialGeneratedDraft[]>([])

// pure date ↔ CalendarDate
function toCalendarDate(iso: string): DateValue | null {
  if (!iso) return null
  try { return parseDate(iso.length > 10 ? iso.slice(0, 10) : iso) } catch { return null }
}
const fromModel = computed({ get: () => toCalendarDate(form.value.dateFrom), set: v => { form.value.dateFrom = v ? v.toString() : '' } })
const toModel = computed({ get: () => toCalendarDate(form.value.dateTo), set: v => { form.value.dateTo = v ? v.toString() : '' } })
const dfmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
function fmtDate(iso: string): string {
  const cd = toCalendarDate(iso) as CalendarDate | null
  return cd ? dfmt.format(new Date(cd.year, cd.month - 1, cd.day)) : 'Pick a date'
}
const sfmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const fmtSuggested = (iso: string | null) => (iso ? sfmt.format(new Date(iso)) : 'No date')

const campaignItems = computed(() => [
  { label: 'No campaign', value: 'none' },
  ...campaigns.value.map(c => ({ label: c.name, value: c.id })),
])

watch(open, async (v) => {
  if (!v) return
  // reset + load campaigns each open
  step.value = 'input'; drafts.value = []
  if (props.clientId) campaigns.value = await planner.listCampaigns(props.clientId)
})

// Prefill brief from the chosen campaign (only when brief is empty — don't clobber typed text).
watch(() => form.value.campaignId, (id) => {
  if (id === 'none' || form.value.brief.trim()) return
  const c = campaigns.value.find(x => x.id === id)
  if (c?.brief) form.value.brief = c.brief
})

function genBody(count: number) {
  return {
    clientId: props.clientId,
    campaignId: form.value.campaignId === 'none' ? undefined : form.value.campaignId,
    brief: form.value.brief.trim(),
    count,
    dateFrom: form.value.dateFrom || undefined,
    dateTo: form.value.dateTo || form.value.dateFrom || undefined,
    tone: form.value.tone,
    platforms: form.value.platforms,
  }
}

async function generate() {
  if (!form.value.brief.trim()) { toast.add({ title: 'Add a brief first', color: 'error' }); return }
  if (!form.value.platforms.length) { toast.add({ title: 'Pick at least one network', color: 'error' }); return }
  generating.value = true
  try {
    const { posts } = await planner.generatePlan(genBody(form.value.count))
    if (!posts.length) { toast.add({ title: 'No drafts came back — try a clearer brief', color: 'neutral' }); return }
    drafts.value = posts
    step.value = 'review'
  } catch (e: any) {
    toast.add({ title: 'Generation failed', description: e?.data?.statusMessage, color: 'error' })
  } finally { generating.value = false }
}

async function regenerate(i: number) {
  try {
    const { posts } = await planner.generatePlan(genBody(1))
    if (posts[0]) drafts.value.splice(i, 1, posts[0])
  } catch (e: any) {
    toast.add({ title: 'Could not regenerate', description: e?.data?.statusMessage, color: 'error' })
  }
}
function discard(i: number) { drafts.value.splice(i, 1) }

function variantPlatforms(d: SocialGeneratedDraft) { return Object.keys(d.platform_overrides) }

async function acceptAll() {
  if (!drafts.value.length) return
  accepting.value = true
  let n = 0
  try {
    for (const d of drafts.value) {
      await planner.acceptDraft({
        clientId: props.clientId,
        campaignId: form.value.campaignId === 'none' ? undefined : form.value.campaignId,
        content: d.content,
        platforms: d.platforms,
        platformOverrides: d.platform_overrides,
        hashtags: d.hashtags,
        scheduledAt: d.suggested_scheduled_at,
        status: 'draft', // HARD: drafts only — never schedule/publish here
      })
      n++
    }
    toast.add({ title: `Added ${n} draft${n === 1 ? '' : 's'}`, description: 'Find them in the Draft lane.', color: 'success' })
    open.value = false
    emit('created', n)
  } catch (e: any) {
    toast.add({ title: `Stopped after ${n} draft${n === 1 ? '' : 's'}`, description: e?.data?.statusMessage, color: 'error' })
    if (n) emit('created', n)
  } finally { accepting.value = false }
}
</script>

<template>
  <UModal v-model:open="open" :title="step === 'input' ? 'Generate a content plan' : `Review ${drafts.length} draft${drafts.length === 1 ? '' : 's'}`" :ui="{ content: 'max-w-2xl' }">
    <template #body>
      <!-- Step 1: inputs -->
      <div v-if="step === 'input'" class="space-y-4">
        <UFormField label="Campaign">
          <USelectMenu v-model="form.campaignId" :items="campaignItems" value-key="value" label-key="label" class="w-full" />
        </UFormField>
        <UFormField label="Brief" required help="What should this run of posts be about?">
          <UTextarea v-model="form.brief" :rows="4" placeholder="e.g. Launch week for our new winter range — highlight features, social proof, and a limited-time offer." class="w-full" />
        </UFormField>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="How many posts">
            <UInput v-model.number="form.count" type="number" min="1" max="14" class="w-full" />
          </UFormField>
          <UFormField label="Tone">
            <USelectMenu v-model="form.tone" :items="TONES" value-key="value" label-key="label" class="w-full" />
          </UFormField>
        </div>
        <div class="grid grid-cols-2 gap-4">
          <UFormField label="From">
            <UPopover>
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start">{{ fmtDate(form.dateFrom) }}</UButton>
              <template #content><UCalendar v-model="fromModel" class="p-2" /></template>
            </UPopover>
          </UFormField>
          <UFormField label="To">
            <UPopover>
              <UButton color="neutral" variant="outline" icon="i-lucide-calendar" class="w-full justify-start">{{ fmtDate(form.dateTo) }}</UButton>
              <template #content><UCalendar v-model="toModel" class="p-2" /></template>
            </UPopover>
          </UFormField>
        </div>
        <UFormField label="Networks">
          <USelectMenu v-model="form.platforms" :items="PLATFORMS" value-key="value" label-key="label" multiple class="w-full" />
        </UFormField>
        <div class="flex justify-end">
          <UButton icon="i-lucide-sparkles" :loading="generating" @click="generate">Generate</UButton>
        </div>
      </div>

      <!-- Step 2: review grid -->
      <div v-else class="space-y-3 max-h-[60vh] overflow-y-auto">
        <UAlert icon="i-lucide-info" color="neutral" variant="subtle" title="These save as drafts" description="Edit anything, then add them. Nothing schedules or publishes until you do it yourself." />
        <div v-for="(d, i) in drafts" :key="i" class="rounded-lg border border-default p-3 space-y-2">
          <div class="flex items-center gap-2">
            <UBadge v-for="pl in d.platforms" :key="pl" size="xs" color="neutral" variant="subtle">{{ pl }}</UBadge>
            <span class="text-xs text-muted ml-auto">{{ fmtSuggested(d.suggested_scheduled_at) }}</span>
            <UButton icon="i-lucide-refresh-cw" size="xs" variant="ghost" color="neutral" @click="regenerate(i)" />
            <UButton icon="i-lucide-x" size="xs" variant="ghost" color="error" @click="discard(i)" />
          </div>
          <UTextarea v-model="d.content" :rows="3" class="w-full" />
          <UAccordion v-if="variantPlatforms(d).length" :items="[{ label: 'Per-network variants', slot: 'variants' }]">
            <template #variants>
              <div class="space-y-2 pt-1">
                <UFormField v-for="pl in variantPlatforms(d)" :key="pl" :label="pl">
                  <UTextarea v-model="d.platform_overrides[pl].content" :rows="2" class="w-full" />
                </UFormField>
              </div>
            </template>
          </UAccordion>
          <div v-if="d.hashtags.length" class="flex gap-1 flex-wrap">
            <UBadge v-for="h in d.hashtags" :key="h" size="xs" color="primary" variant="subtle">#{{ h.replace(/^#/, '') }}</UBadge>
          </div>
        </div>
        <p v-if="!drafts.length" class="text-sm text-muted text-center py-6">All drafts discarded.</p>
      </div>
    </template>

    <template #footer>
      <div v-if="step === 'review'" class="flex justify-between w-full">
        <UButton color="neutral" variant="ghost" icon="i-lucide-arrow-left" @click="step = 'input'">Back</UButton>
        <UButton icon="i-lucide-plus" :loading="accepting" :disabled="!drafts.length" @click="acceptAll">
          Add {{ drafts.length }} draft{{ drafts.length === 1 ? '' : 's' }}
        </UButton>
      </div>
    </template>
  </UModal>
</template>
