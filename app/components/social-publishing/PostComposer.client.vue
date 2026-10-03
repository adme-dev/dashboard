<script setup lang="ts">
import { isVideoMediaUrl } from '~/utils/social/videoMedia'
import type { DateValue } from '@internationalized/date'
import { isoToScheduleParts, partsToIso } from '~/utils/socialSchedule'
import { insertAtCaret } from '~/utils/insertAtCaret'
import {
  LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS,
  socialPublishingPlatformIcon,
  socialPublishingPlatformLabel,
  socialPublishingPlatformLimit
} from '~/utils/socialPublishingPlatforms'
import type { SocialAccount, SocialPublishPlatform } from '~/types'
import { syncComposerAccountIds, useSocialComposer, type ScheduleMode } from '~/composables/useSocialComposer'
import { useComposerCampaigns } from '~/composables/useComposerCampaigns'
import type { SocialImagePreview } from '~~/shared/social/imageRecomposition'

const { state, setOverride, resolved } = useSocialComposer()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const props = defineProps<{
  clientId: string | null
  accounts: SocialAccount[]
  accountsLoading?: boolean
  imageEditingAllowed?: boolean
}>()

const PLATFORM_OPTIONS = LIVE_SOCIAL_PUBLISHING_PLATFORM_OPTIONS
const campaignId = computed({
  get: () => state.value.campaignId,
  set: (value: string | null) => { state.value.campaignId = value }
})
const { campaigns, loading: campaignsLoading, failed: campaignsFailed, reload: reloadCampaigns } = useComposerCampaigns(
  () => props.clientId, campaignId, useSocialPlanner().listCampaigns
)
const campaignOptions = computed(() => [
  { label: 'No campaign', value: '__none__' },
  ...campaigns.value.filter(c => c.status !== 'archived' || c.id === campaignId.value).map(c => ({ label: c.name, value: c.id }))
])
const campaignSelection = computed({
  get: () => campaignId.value ?? '__none__',
  set: (value: string) => { campaignId.value = value === '__none__' ? null : value }
})
const labelFor = socialPublishingPlatformLabel

const activeAccounts = computed(() => props.accounts.filter(account => account.is_active && !account.last_error))

function accountsFor(platform: SocialPublishPlatform) {
  return activeAccounts.value.filter(account => account.platform === platform)
}

function accountOptionsFor(platform: SocialPublishPlatform) {
  return accountsFor(platform).map(account => ({
    label: account.account_name || account.platform_account_id,
    value: account.id
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
  { deep: true, immediate: true }
)

// tightest character limit across selected networks, for the base counter
const tightestLimit = computed(() => {
  const limits = state.value.platforms.map(platform => socialPublishingPlatformLimit(platform))
  return limits.length ? Math.min(...limits) : 0
})
const overBase = computed(() => tightestLimit.value > 0 && state.value.content.length > tightestLimit.value)

// comma-separated <-> array bridges for hashtags / tags
function csvModel(key: 'hashtags' | 'tags') {
  return computed<string>({
    get: () => state.value[key].join(', '),
    set: (v) => { state.value[key] = v.split(',').map(s => s.trim()).filter(Boolean) }
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

const resizeOpen = ref(false)
const resizeSource = ref('')
const resizePostId = ref<string | null>(null)
const resizeClientId = ref<string | null>(null)
function openResize(url: string) {
  resizeSource.value = url
  resizePostId.value = state.value.id
  resizeClientId.value = props.clientId
  resizeOpen.value = true
}
function imageHistory(): SocialImagePreview[] {
  const history = state.value.metadata.imageRecompositions
  return Array.isArray(history) ? history.filter(item => typeof item?.sourceUrl === 'string' && typeof item?.url === 'string') : []
}
function applyResize(preview: SocialImagePreview) {
  if (state.value.id !== resizePostId.value || props.clientId !== resizeClientId.value) return
  const index = state.value.mediaUrls.indexOf(preview.sourceUrl)
  if (index < 0) return
  state.value.mediaUrls[index] = preview.url
  state.value.creativeId = null
  state.value.metadata = { ...state.value.metadata, imageRecompositions: [...imageHistory(), preview] }
  toast.add({ title: 'Preview added to draft', description: 'Save your changes and review the updated artwork before publishing.', color: 'success' })
}
function restoreImage(url: string) {
  const previous = imageHistory().findLast(item => item.url === url)
  if (!previous) return
  state.value.mediaUrls = state.value.mediaUrls.map(item => item === url ? previous.sourceUrl : item)
  state.value.creativeId = null
}
watch(() => [props.clientId, state.value.id], () => {
  resizeOpen.value = false
})

// Banner Studio creative picker
interface BannerCreative { id: string, url: string, projectName: string, formatKey: string, width: number, height: number }
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
    bannerCreatives.value = await apiFetch<BannerCreative[]>('/api/agency/banner-studio/published/with-projects')
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
  if (!topic) {
    toast.add({ title: 'Add a brief or some copy first', color: 'warning' })
    return
  }
  aiLoading.value = true
  try {
    const { caption } = await apiFetch<{ caption: string }>('/api/agency/social/publishing/ai/generate-caption', {
      method: 'POST',
      body: { topic, platform: state.value.platforms[0] ?? 'facebook', tone: aiTone.value }
    })
    state.value.content = caption
    aiOpen.value = false
    aiBrief.value = ''
  } catch (e: unknown) {
    toast.add({ title: 'Caption generation failed', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
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
  if (!prompt) {
    toast.add({ title: 'Describe the image first', color: 'warning' })
    return
  }
  aiImgLoading.value = true
  try {
    const { url } = await apiFetch<{ url: string }>('/api/agency/banner-studio/ai/generate-image', {
      method: 'POST',
      body: { prompt }
    })
    if (url && !state.value.mediaUrls.includes(url)) state.value.mediaUrls.push(url)
    aiImgOpen.value = false
    aiImgPrompt.value = ''
  } catch (e: unknown) {
    toast.add({ title: 'Image generation failed', description: (e as { data?: { statusMessage?: string } })?.data?.statusMessage, color: 'error' })
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
  state.value.scheduledAt = partsToIso(scheduleDate.value as DateValue | null, scheduleTime.value, scheduleTz())
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

const scheduleModes: { value: ScheduleMode, label: string, icon: string }[] = [
  { value: 'now', label: 'Review now', icon: 'i-lucide-send' },
  { value: 'schedule', label: 'Schedule', icon: 'i-lucide-calendar-clock' },
  { value: 'queue', label: 'Add to queue', icon: 'i-lucide-list-plus' }
]
</script>

<template>
  <div class="space-y-5">
    <section aria-labelledby="publishing-destination" class="rounded-xl border border-default bg-default p-4 sm:p-5 space-y-5">
      <div>
        <h2 id="publishing-destination" class="text-base font-semibold">
          Destination
        </h2>
        <p class="mt-1 text-sm text-muted">
          Choose the campaign, networks and accounts for this client.
        </p>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <UFormField label="Campaign" help="Optional. Group this post with a campaign in the client's Planner.">
          <USelectMenu
            v-model="campaignSelection"
            size="lg"
            :items="campaignOptions"
            value-key="value"
            label-key="label"
            :loading="campaignsLoading"
            :disabled="!props.clientId || campaignsLoading || campaignsFailed"
            class="w-full"
          />
          <div v-if="campaignsFailed" class="mt-2 flex items-center gap-2 text-xs text-muted">
            Campaigns could not be loaded.
            <UButton
              label="Retry"
              size="xs"
              variant="ghost"
              @click="reloadCampaigns"
            />
          </div>
        </UFormField>
        <!-- Networks -->
        <UFormField label="Networks" help="Pick which connected accounts this post goes to.">
          <USelectMenu
            v-model="state.platforms"
            size="lg"
            :items="PLATFORM_OPTIONS"
            value-key="value"
            label-key="label"
            multiple
            placeholder="Select networks"
            icon="i-lucide-share-2"
            class="w-full"
          />
        </UFormField>
      </div>
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
            <UIcon :name="socialPublishingPlatformIcon(platform)" class="size-4 text-muted" />
            {{ labelFor(platform) }}
          </div>
          <USelectMenu
            v-if="accountOptionsFor(platform).length"
            size="lg"
            :model-value="selectedAccountFor(platform)"
            :items="accountOptionsFor(platform)"
            value-key="value"
            label-key="label"
            :loading="props.accountsLoading"
            class="w-full sm:min-w-48 sm:flex-1"
            placeholder="Select account"
            @update:model-value="(value: string | null) => setPlatformAccount(platform, value)"
          />
          <div
            v-else
            class="flex flex-1 flex-wrap items-center gap-2 text-xs text-muted"
          >
            <span>No connected {{ labelFor(platform) }} account.</span>
            <UButton
              v-if="['facebook', 'instagram', 'google-business'].includes(platform)"
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
    </section>
    <section aria-labelledby="publishing-content" class="rounded-xl border border-default bg-default p-4 sm:p-5 space-y-5">
      <div>
        <h2 id="publishing-content" class="text-base font-semibold">
          Content &amp; media
        </h2>
        <p class="mt-1 text-sm text-muted">
          Prepare the copy and artwork your audience will see.
        </p>
      </div>
      <UAlert
        v-if="state.metadata.captionGenerationFailed === true && !state.content.trim()"
        title="Add your caption"
        description="AI could not create usable copy. Your video is attached; write your approved caption below."
        color="warning"
        icon="i-lucide-pencil-line"
      />
      <!-- Base content -->
      <UFormField label="Post content">
        <template #hint>
          <div class="flex items-center gap-1">
            <UPopover v-model:open="showEmoji">
              <UTooltip text="Emoji">
                <UButton
                  size="xs"
                  variant="ghost"
                  color="neutral"
                  icon="i-lucide-smile"
                  aria-label="Insert emoji"
                />
              </UTooltip>
              <template #content>
                <ChatEmojiPicker @select="insertEmoji" />
              </template>
            </UPopover>
            <UButton
              size="xs"
              variant="ghost"
              color="primary"
              icon="i-lucide-sparkles"
              @click="aiOpen = true"
            >
              Write with AI
            </UButton>
          </div>
        </template>
        <UTextarea
          ref="contentField"
          v-model="state.content"
          :rows="8"
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
      <UFormField label="Media" help="Use a Banner Studio creative or an image/video link. Video Studio can attach an uploaded video directly.">
        <div class="flex flex-wrap gap-2">
          <UButton
            icon="i-lucide-image"
            color="neutral"
            variant="subtle"
            @click="openBanner"
          >
            Banner Studio
          </UButton>
          <UButton
            icon="i-lucide-sparkles"
            color="primary"
            variant="subtle"
            @click="aiImgOpen = true"
          >
            AI image
          </UButton>
          <UInput
            v-model="newMediaUrl"
            size="lg"
            placeholder="https://…/image.jpg or video.mp4"
            class="w-full sm:min-w-48 sm:flex-1"
            @keydown.enter.prevent="addMedia"
          />
          <UButton
            icon="i-lucide-plus"
            color="neutral"
            variant="subtle"
            @click="addMedia"
          >
            Add
          </UButton>
        </div>
        <div v-if="state.mediaUrls.length" class="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div v-for="url in state.mediaUrls" :key="url" class="relative rounded-lg border border-default bg-elevated/40 p-2">
            <video
              v-if="isVideoMediaUrl(url)"
              :src="url"
              controls
              playsinline
              preload="metadata"
              class="max-h-72 w-full rounded-md object-contain"
              aria-label="Attached video preview"
            />
            <img
              v-else
              :src="url"
              alt="Attached image"
              class="h-40 w-full rounded-md object-contain"
            >
            <UButton
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="solid"
              class="absolute top-2 right-2 rounded-full"
              aria-label="Remove attached media"
              @click="removeMedia(url)"
            />
            <div v-if="!isVideoMediaUrl(url)" class="mt-2 flex flex-wrap items-center gap-2">
              <UButton
                icon="i-lucide-scan"
                size="sm"
                color="neutral"
                variant="subtle"
                :disabled="!state.id || imageEditingAllowed === false"
                @click="openResize(url)"
              >
                Resize with AI
              </UButton>
              <UButton
                v-if="imageHistory().some(item => item.url === url)"
                size="sm"
                color="neutral"
                variant="ghost"
                :disabled="imageEditingAllowed === false"
                @click="restoreImage(url)"
              >
                Restore original
              </UButton>
              <span v-if="!state.id" class="text-xs text-muted">Save the draft first.</span>
            </div>
          </div>
        </div>
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
      <UAccordion :items="[{ label: 'Links, hashtags & internal tags', slot: 'details' }]">
        <template #details>
          <div class="space-y-4 pt-2 pb-3">
            <!-- Link + media -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Link (optional)" help="UTM params are added per network on publish.">
                <UInput
                  v-model="state.linkUrl"
                  size="lg"
                  placeholder="https://…"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="First comment (optional)">
                <UInput
                  v-model="state.firstComment"
                  size="lg"
                  placeholder="Posted as the first comment"
                  class="w-full"
                />
              </UFormField>
            </div>
            <!-- Tags + hashtags -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <UFormField label="Hashtags" help="Comma-separated.">
                <UInput
                  v-model="hashtagsModel"
                  size="lg"
                  placeholder="launch, sale"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Tags" help="Internal — used by reporting & inbox later.">
                <UInput
                  v-model="tagsModel"
                  size="lg"
                  placeholder="campaign-q3, evergreen"
                  class="w-full"
                />
              </UFormField>
            </div>
          </div>
        </template>
      </UAccordion>
    </section>
    <section aria-labelledby="publishing-timing" class="rounded-xl border border-default bg-default p-4 sm:p-5 space-y-5">
      <div>
        <h2 id="publishing-timing" class="text-base font-semibold">
          Timing
        </h2>
        <p class="mt-1 text-sm text-muted">
          Choose the posting time. Approval is required before publishing.
        </p>
      </div>
      <!-- Schedule -->
      <UFormField label="When">
        <div class="flex flex-wrap items-center gap-3">
          <USelectMenu
            v-model="state.scheduleMode"
            size="lg"
            :items="scheduleModes"
            value-key="value"
            label-key="label"
            class="w-full sm:w-44"
          />
          <template v-if="state.scheduleMode === 'schedule'">
            <UPopover>
              <UButton icon="i-lucide-calendar" color="neutral" variant="subtle">
                {{ scheduleLabel }}
              </UButton>
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
              size="lg"
              :items="TIME_OPTIONS"
              icon="i-lucide-clock"
              class="w-full sm:w-28"
            />
            <span class="text-xs text-muted">{{ state.timezone }}</span>
          </template>
          <span v-else-if="state.scheduleMode === 'queue'" class="text-sm text-muted">
            Save this draft, then arrange posting slots in the Queue.
          </span>
        </div>
      </UFormField>
    </section>
    <!-- Banner Studio picker -->
    <UModal v-model:open="bannerOpen" :ui="{ content: 'max-w-3xl' }">
      <template #content>
        <div class="p-5">
          <div class="flex items-center justify-between mb-4">
            <h3 class="font-semibold">
              Pick a Banner Studio creative
            </h3>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              @click="bannerOpen = false"
            />
          </div>
          <div v-if="bannerLoading" class="py-10 text-center text-sm text-muted">
            Loading creatives…
          </div>
          <div v-else-if="!bannerCreatives.length" class="py-10 text-center text-sm text-muted">
            No published Banner Studio creatives found.
          </div>
          <div v-else class="max-h-[60vh] overflow-y-auto space-y-5">
            <div v-for="(items, project) in bannerByProject" :key="project">
              <div class="text-xs font-medium uppercase tracking-wide text-muted mb-2">
                {{ project }}
              </div>
              <div class="grid grid-cols-3 sm:grid-cols-4 gap-3">
                <button
                  v-for="c in items"
                  :key="c.id"
                  type="button"
                  class="group/c rounded-lg border border-default overflow-hidden hover:ring-2 hover:ring-primary transition-all text-left"
                  @click="pickCreative(c)"
                >
                  <img :src="c.url" :alt="c.formatKey" class="w-full aspect-square object-cover bg-elevated">
                  <div class="px-2 py-1 text-[11px] text-muted truncate">
                    {{ c.formatKey }}
                  </div>
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
          <h3 class="font-semibold flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-4 text-primary" /> Write with AI
          </h3>
          <UFormField label="What's the post about?" help="Leave blank to rewrite your current draft.">
            <UTextarea
              v-model="aiBrief"
              :rows="3"
              placeholder="e.g. launch of our new winter range, 20% off this weekend"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Tone">
            <USelectMenu
              v-model="aiTone"
              :items="TONES"
              size="lg"
              class="w-full"
            />
          </UFormField>
          <p class="text-xs text-muted">
            Tuned for {{ labelFor(state.platforms[0]) || 'Facebook' }} (your first selected network).
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="aiOpen = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-sparkles"
              :loading="aiLoading"
              @click="generateCaption"
            >
              Generate
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <!-- AI image -->
    <SocialPublishingImageRecomposeModal
      v-model:open="resizeOpen"
      :client-id="clientId"
      :post-id="state.id"
      :source-url="resizeSource"
      @apply="applyResize"
    />

    <UModal v-model:open="aiImgOpen">
      <template #content>
        <div class="p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2">
            <UIcon name="i-lucide-sparkles" class="size-4 text-primary" /> Generate an image
          </h3>
          <UFormField label="Describe the image" help="Generated via the Banner Studio image engine and added to your media.">
            <UTextarea
              v-model="aiImgPrompt"
              :rows="3"
              placeholder="e.g. cosy winter scene, knitted jumper flatlay, warm tones"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="aiImgOpen = false">
              Cancel
            </UButton>
            <UButton
              color="primary"
              icon="i-lucide-sparkles"
              :loading="aiImgLoading"
              @click="generateImage"
            >
              Generate
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
