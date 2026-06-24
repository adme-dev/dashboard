<script setup lang="ts">
import type { DateValue } from '@internationalized/date'
import { isoToScheduleParts, partsToIso } from '~/utils/socialSchedule'
import { insertAtCaret } from '~/utils/insertAtCaret'
import type { SocialAccount, SocialPublishPlatform } from '~/types'
import { syncComposerAccountIds, useSocialComposer, type ScheduleMode } from '~/composables/useSocialComposer'

const { state, setOverride, resolved } = useSocialComposer()

const props = defineProps<{
  clientId: string | null
  accounts: SocialAccount[]
  accountsLoading?: boolean
}>()

const PLATFORM_OPTIONS: { value: SocialPublishPlatform; label: string; icon: string; limit: number }[] = [
  { value: 'facebook', label: 'Facebook', icon: 'i-lucide-facebook', limit: 63206 },
  { value: 'instagram', label: 'Instagram', icon: 'i-lucide-instagram', limit: 2200 },
  { value: 'linkedin', label: 'LinkedIn', icon: 'i-lucide-linkedin', limit: 3000 },
  { value: 'tiktok', label: 'TikTok', icon: 'i-lucide-music', limit: 2200 },
  { value: 'youtube', label: 'YouTube', icon: 'i-lucide-youtube', limit: 5000 },
  { value: 'google-business', label: 'Google Business', icon: 'i-lucide-store', limit: 1500 },
]
const labelFor = (p: string) => PLATFORM_OPTIONS.find(o => o.value === p)?.label ?? p

const activeAccounts = computed(() => props.accounts.filter(account => account.is_active && !account.last_error))

function accountsFor(platform: SocialPublishPlatform) {
  return activeAccounts.value.filter(account => account.platform === platform)
}

function accountOptionsFor(platform: SocialPublishPlatform) {
  return accountsFor(platform).map(account => ({
    label: account.account_name || account.platform_account_id,
    value: account.id,
  }))
}

function selectedAccountFor(platform: SocialPublishPlatform): string | null {
  const selected = activeAccounts.value.find(account =>
    account.platform === platform && state.value.accountIds.includes(account.id))
  return selected?.id ?? null
}

function setPlatformAccount(platform: SocialPublishPlatform, accountId: string | null) {
  const otherAccountIds = state.value.accountIds.filter((id) => {
    const account = activeAccounts.value.find(item => item.id === id)
    return account && account.platform !== platform
  })
  state.value.accountIds = accountId ? [...otherAccountIds, accountId] : otherAccountIds
}

const accountsRoute = computed(() => props.clientId
  ? { path: '/agency/social/publishing/accounts', query: { client: props.clientId } }
  : '/agency/social/publishing/accounts')

watch(
  () => [state.value.platforms, props.accounts] as const,
  () => {
    const next = syncComposerAccountIds(state.value.platforms, state.value.accountIds, props.accounts)
    if (next.join('|') !== state.value.accountIds.join('|')) state.value.accountIds = next
  },
  { deep: true, immediate: true },
)

// tightest character limit across selected networks, for the base counter
const tightestLimit = computed(() => {
  const limits = state.value.platforms.map(p => PLATFORM_OPTIONS.find(o => o.value === p)?.limit ?? 99999)
  return limits.length ? Math.min(...limits) : 0
})
const overBase = computed(() => tightestLimit.value > 0 && state.value.content.length > tightestLimit.value)

// comma-separated <-> array bridges for hashtags / tags
function csvModel(key: 'hashtags' | 'tags') {
  return computed<string>({
    get: () => state.value[key].join(', '),
    set: (v) => { state.value[key] = v.split(',').map(s => s.trim()).filter(Boolean) },
  })
}
const hashtagsModel = csvModel('hashtags')
const tagsModel = csvModel('tags')

// media URLs
const newMediaUrl = ref('')
function addMedia() {
  const url = newMediaUrl.value.trim()
  if (url && !state.value.mediaUrls.includes(url)) state.value.mediaUrls.push(url)
  newMediaUrl.value = ''
}
function removeMedia(url: string) {
  state.value.mediaUrls = state.value.mediaUrls.filter(u => u !== url)
}

// Banner Studio creative picker
interface BannerCreative { id: string; url: string; projectName: string; formatKey: string; width: number; height: number }
const bannerOpen = ref(false)
const bannerLoading = ref(false)
const bannerCreatives = ref<BannerCreative[]>([])
const bannerByProject = computed(() => {
  const groups: Record<string, BannerCreative[]> = {}
  for (const c of bannerCreatives.value) (groups[c.projectName] ??= []).push(c)
  return groups
})
async function openBanner() {
  bannerOpen.value = true
  if (bannerCreatives.value.length) return
  bannerLoading.value = true
  try {
    bannerCreatives.value = await $fetch<BannerCreative[]>('/api/agency/banner-studio/published/with-projects')
  } catch {
    bannerCreatives.value = []
  } finally {
    bannerLoading.value = false
  }
}
function pickCreative(c: BannerCreative) {
  if (!state.value.mediaUrls.includes(c.url)) state.value.mediaUrls.push(c.url)
  state.value.creativeId = c.id
  bannerOpen.value = false
}

const toast = useToast()

// AI caption
// Emoji picker for the base post content — reuses the shared ChatEmojiPicker and
// inserts at the textarea caret (replacing any selection), falling back to append.
const showEmoji = ref(false)
const contentField = ref<{ $el?: HTMLElement } | null>(null)
function contentTextarea(): HTMLTextAreaElement | null {
  const root = contentField.value?.$el
  if (!root) return null
  return (root.tagName === 'TEXTAREA' ? root : root.querySelector('textarea')) as HTMLTextAreaElement | null
}
function insertEmoji(emoji: string) {
  const el = contentTextarea()
  const text = state.value.content || ''
  const start = el ? el.selectionStart : text.length
  const end = el ? el.selectionEnd : text.length
  const { text: next, caret } = insertAtCaret(text, emoji, start, end)
  state.value.content = next
  showEmoji.value = false
  nextTick(() => {
    if (!el) return
    el.focus()
    el.setSelectionRange(caret, caret)
  })
}

const aiOpen = ref(false)
const aiBrief = ref('')
const aiTone = ref('friendly')
const aiLoading = ref(false)
const TONES = ['friendly', 'professional', 'playful', 'bold', 'informative']
async function generateCaption() {
  const topic = aiBrief.value.trim() || state.value.content.trim()
  if (!topic) { toast.add({ title: 'Add a brief or some copy first', color: 'warning' }); return }
  aiLoading.value = true
  try {
    const { caption } = await $fetch<{ caption: string }>('/api/agency/social/publishing/ai/generate-caption', {
      method: 'POST',
      body: { topic, platform: state.value.platforms[0] ?? 'facebook', tone: aiTone.value },
    })
    state.value.content = caption
    aiOpen.value = false
    aiBrief.value = ''
  } catch (e: any) {
    toast.add({ title: 'Caption generation failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    aiLoading.value = false
  }
}

// AI image (reuses the Banner Studio image generator → R2 url)
const aiImgOpen = ref(false)
const aiImgPrompt = ref('')
const aiImgLoading = ref(false)
async function generateImage() {
  const prompt = aiImgPrompt.value.trim()
  if (!prompt) { toast.add({ title: 'Describe the image first', color: 'warning' }); return }
  aiImgLoading.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/agency/banner-studio/ai/generate-image', {
      method: 'POST',
      body: { prompt },
    })
    if (url && !state.value.mediaUrls.includes(url)) state.value.mediaUrls.push(url)
    aiImgOpen.value = false
    aiImgPrompt.value = ''
  } catch (e: any) {
    toast.add({ title: 'Image generation failed', description: e?.data?.statusMessage, color: 'error' })
  } finally {
    aiImgLoading.value = false
  }
}

// Half-hour time options (HH:MM)
const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`)

// The post timezone backs BOTH directions of the schedule date/time bridge.
// Deriving the calendar date and the time-of-day in the same zone keeps the
// ISO <-> controls round-trip a stable fixed point — deriving the date in UTC
// while the time came from the post tz used to make it drift a day per cycle,
// looping the watches below forever and blanking compose (see socialSchedule.ts).
const scheduleTz = () => state.value.timezone || 'Australia/Sydney'

const initialParts = isoToScheduleParts(state.value.scheduledAt, scheduleTz())
const scheduleDate = ref<DateValue | null>(initialParts.date)
const scheduleTime = ref(initialParts.time)

// Combine the chosen calendar date + time into an instant in the post's timezone.
function recomputeScheduledAt() {
  state.value.scheduledAt = partsToIso(scheduleDate.value, scheduleTime.value, scheduleTz())
}
watch([scheduleDate, scheduleTime], recomputeScheduledAt)

// Re-sync the local date/time controls if the post is (re)loaded externally
// (e.g. ?edit, or a calendar "+" deep-link that pre-sets scheduledAt).
watch(() => state.value.scheduledAt, (iso) => {
  const { date, time } = isoToScheduleParts(iso, scheduleTz())
  if (date?.toString() !== scheduleDate.value?.toString()) scheduleDate.value = date
  if (time !== scheduleTime.value) scheduleTime.value = time
})

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
const scheduleLabel = computed(() => scheduleDate.value
  ? dateFmt.format(new Date(state.value.scheduledAt || Date.now()))
  : 'Pick a date')

const scheduleModes: { value: ScheduleMode; label: string; icon: string }[] = [
  { value: 'now', label: 'Publish now', icon: 'i-lucide-send' },
  { value: 'schedule', label: 'Schedule', icon: 'i-lucide-calendar-clock' },
  { value: 'queue', label: 'Add to queue', icon: 'i-lucide-list-plus' },
]
</script>

<template>
  <div class="space-y-6">
    <!-- Networks -->
    <UFormField label="Networks" help="Pick which connected accounts this post goes to.">
      <USelectMenu
        v-model="state.platforms"
        :items="PLATFORM_OPTIONS"
        value-key="value"
        label-key="label"
        multiple
        placeholder="Select networks"
        icon="i-lucide-share-2"
        class="w-full"
      />
    </UFormField>

    <!-- Connected accounts -->
    <div
      v-if="state.platforms.length"
      class="rounded-lg border border-default p-4 space-y-3"
    >
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="text-sm font-medium">
            Publishing accounts
          </div>
          <div class="text-xs text-muted">
            {{ props.clientId ? 'Choose the Page or profile for each selected network.' : 'Select a client first.' }}
          </div>
        </div>
        <UButton
          v-if="props.clientId"
          :to="accountsRoute"
          size="xs"
          variant="ghost"
          icon="i-lucide-link"
        >
          Manage
        </UButton>
      </div>

      <div
        v-for="platform in state.platforms"
        :key="platform"
        class="flex flex-wrap items-center gap-3 rounded-md bg-elevated/40 px-3 py-2"
      >
        <div class="flex min-w-36 items-center gap-2 text-sm font-medium">
          <UIcon :name="PLATFORM_OPTIONS.find(item => item.value === platform)?.icon || 'i-lucide-share-2'" class="size-4 text-muted" />
          {{ labelFor(platform) }}
        </div>
        <USelectMenu
          v-if="accountOptionsFor(platform).length"
          :model-value="selectedAccountFor(platform)"
          :items="accountOptionsFor(platform)"
          value-key="value"
          label-key="label"
          :loading="props.accountsLoading"
          class="min-w-56 flex-1"
          placeholder="Select account"
          @update:model-value="(value: string | null) => setPlatformAccount(platform, value)"
        />
        <div
          v-else
          class="flex flex-1 flex-wrap items-center gap-2 text-xs text-muted"
        >
          <span>No connected {{ labelFor(platform) }} account.</span>
          <UButton
            v-if="platform === 'facebook'"
            :to="accountsRoute"
            size="xs"
            variant="subtle"
            icon="i-lucide-plus"
          >
            Connect
          </UButton>
        </div>
      </div>
    </div>

    <!-- Base content -->
    <UFormField label="Post content">
      <template #hint>
        <div class="flex items-center gap-1">
          <UPopover v-model:open="showEmoji">
            <UTooltip text="Emoji">
              <UButton
                size="xs" variant="ghost" color="neutral" icon="i-lucide-smile"
                aria-label="Insert emoji"
              />
            </UTooltip>
            <template #content>
              <ChatEmojiPicker @select="insertEmoji" />
            </template>
          </UPopover>
          <UButton size="xs" variant="ghost" color="primary" icon="i-lucide-sparkles" @click="aiOpen = true">
            Write with AI
          </UButton>
        </div>
      </template>
      <UTextarea
        ref="contentField"
        v-model="state.content"
        :rows="6"
        autoresize
        placeholder="What do you want to share?"
        class="w-full"
      />
      <template #help>
        <span :class="overBase ? 'text-error' : 'text-muted'">
          {{ state.content.length }}<span v-if="tightestLimit"> / {{ tightestLimit }}</span> characters
          <span v-if="overBase"> — over the limit for {{ labelFor(state.platforms[0]) }}</span>
        </span>
      </template>
    </UFormField>

    <!-- Per-network customization -->
    <div class="rounded-lg border border-default p-4 space-y-4">
      <UCheckbox
        v-model="state.customizePerNetwork"
        label="Customize per network"
        :description="state.platforms.length ? 'Override the copy or media for specific networks. Blank tabs inherit the base post.' : 'Select networks first.'"
        :disabled="!state.platforms.length"
      />
      <UTabs
        v-if="state.customizePerNetwork && state.platforms.length"
        :items="state.platforms.map(p => ({ label: labelFor(p), value: p, slot: 'panel' }))"
      >
        <template #panel="{ item }">
          <div class="pt-3 space-y-2">
            <UTextarea
              :model-value="state.platformOverrides[item.value]?.content ?? ''"
              :rows="4"
              autoresize
              :placeholder="`Custom copy for ${item.label} (blank = use base post)`"
              class="w-full"
              @update:model-value="(v: string) => setOverride(item.value, { content: v })"
            />
            <p class="text-xs text-muted">
              Preview shows: “{{ resolved(item.value).content.slice(0, 80) || '—' }}”
            </p>
          </div>
        </template>
      </UTabs>
    </div>

    <!-- Link + media -->
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Link (optional)" help="UTM params are added per network on publish.">
        <UInput v-model="state.linkUrl" placeholder="https://…" class="w-full" />
      </UFormField>
      <UFormField label="First comment (optional)">
        <UInput v-model="state.firstComment" placeholder="Posted as the first comment" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Media" help="Pick a Banner Studio creative, or add an image URL (R2 / external).">
      <div class="flex gap-2">
        <UButton icon="i-lucide-image" color="neutral" variant="subtle" @click="openBanner">Banner Studio</UButton>
        <UButton icon="i-lucide-sparkles" color="primary" variant="subtle" @click="aiImgOpen = true">AI image</UButton>
        <UInput v-model="newMediaUrl" placeholder="https://…/image.jpg" class="flex-1" @keydown.enter.prevent="addMedia" />
        <UButton icon="i-lucide-plus" color="neutral" variant="subtle" @click="addMedia">Add</UButton>
      </div>
      <div v-if="state.mediaUrls.length" class="mt-2 flex flex-wrap gap-2">
        <div v-for="url in state.mediaUrls" :key="url" class="relative group/media">
          <img :src="url" alt="" class="h-16 w-16 rounded-md object-cover border border-default">
          <UButton
            icon="i-lucide-x" size="xs" color="neutral" variant="solid"
            class="absolute -top-1.5 -right-1.5 opacity-0 group-hover/media:opacity-100 transition-opacity rounded-full"
            @click="removeMedia(url)"
          />
        </div>
      </div>
    </UFormField>

    <!-- Banner Studio picker -->
    <UModal v-model:open="bannerOpen" :ui="{ content: 'max-w-3xl' }">
      <template #content>
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">Pick a Banner Studio creative</h3>
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" @click="bannerOpen = false" />
          </div>
          <div v-if="bannerLoading" class="py-10 text-center text-sm text-muted">Loading creatives…</div>
          <div v-else-if="!bannerCreatives.length" class="py-10 text-center text-sm text-muted">
            No published Banner Studio creatives found.
          </div>
          <div v-else class="max-h-[60vh] overflow-y-auto space-y-5">
            <div v-for="(items, project) in bannerByProject" :key="project">
              <div class="text-xs font-medium uppercase tracking-wide text-muted mb-2">{{ project }}</div>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                <button
                  v-for="c in items" :key="c.id" type="button"
                  class="group/c rounded-lg border border-default overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                  @click="pickCreative(c)"
                >
                  <img :src="c.url" :alt="c.formatKey" class="w-full aspect-square object-cover bg-elevated">
                  <div class="px-2 py-1 text-[11px] text-muted truncate">{{ c.formatKey }}</div>
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- AI caption -->
    <UModal v-model:open="aiOpen">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2"><UIcon name="i-lucide-sparkles" class="size-4 text-primary" /> Write with AI</h3>
          <UFormField label="What's the post about?" help="Leave blank to rewrite your current draft.">
            <UTextarea v-model="aiBrief" :rows="3" placeholder="e.g. launch of our new winter range, 20% off this weekend" class="w-full" />
          </UFormField>
          <UFormField label="Tone">
            <USelectMenu v-model="aiTone" :items="TONES" class="w-44" />
          </UFormField>
          <p class="text-xs text-muted">Tuned for {{ labelFor(state.platforms[0]) || 'Facebook' }} (your first selected network).</p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="aiOpen = false">Cancel</UButton>
            <UButton color="primary" icon="i-lucide-sparkles" :loading="aiLoading" @click="generateCaption">Generate</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- AI image -->
    <UModal v-model:open="aiImgOpen">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2"><UIcon name="i-lucide-sparkles" class="size-4 text-primary" /> Generate an image</h3>
          <UFormField label="Describe the image" help="Generated via the Banner Studio image engine and added to your media.">
            <UTextarea v-model="aiImgPrompt" :rows="3" placeholder="e.g. cosy winter scene, knitted jumper flatlay, warm tones" class="w-full" />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="aiImgOpen = false">Cancel</UButton>
            <UButton color="primary" icon="i-lucide-sparkles" :loading="aiImgLoading" @click="generateImage">Generate</UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Tags + hashtags -->
    <div class="grid grid-cols-2 gap-4">
      <UFormField label="Hashtags" help="Comma-separated.">
        <UInput v-model="hashtagsModel" placeholder="launch, sale" class="w-full" />
      </UFormField>
      <UFormField label="Tags" help="Internal — used by reporting & inbox later.">
        <UInput v-model="tagsModel" placeholder="campaign-q3, evergreen" class="w-full" />
      </UFormField>
    </div>

    <!-- Schedule -->
    <UFormField label="When">
      <div class="flex flex-wrap items-center gap-3">
        <USelectMenu
          v-model="state.scheduleMode"
          :items="scheduleModes"
          value-key="value"
          label-key="label"
          class="w-44"
        />
        <template v-if="state.scheduleMode === 'schedule'">
          <UPopover>
            <UButton icon="i-lucide-calendar" color="neutral" variant="subtle">{{ scheduleLabel }}</UButton>
            <template #content>
              <UCalendar
                :model-value="(scheduleDate ?? undefined) as any"
                class="p-2"
                @update:model-value="(v: any) => scheduleDate = v"
              />
            </template>
          </UPopover>
          <USelectMenu
            v-model="scheduleTime"
            :items="TIME_OPTIONS"
            icon="i-lucide-clock"
            class="w-28"
          />
          <span class="text-xs text-muted">{{ state.timezone }}</span>
        </template>
        <span v-else-if="state.scheduleMode === 'queue'" class="text-sm text-muted">
          Drops into the next free posting slot.
        </span>
      </div>
    </UFormField>
  </div>
</template>
