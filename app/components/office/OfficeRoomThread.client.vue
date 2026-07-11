<script setup lang="ts">
import type { ChatWsMessage } from '~~/app/composables/useChatWebSocket'
import { safeMediaUrl } from '~~/app/utils/safe-url'

type OfficeRoomThreadChannel = {
  id: string
  name?: string | null
}

type OfficeRoomThreadMessage = {
  id: number | string
  channel_id: string
  user_id: string
  content: string
  metadata?: Record<string, unknown> | null
  created_at: string
  user_name?: string | null
  user_avatar?: string | null
}

const props = defineProps<{
  officeId: string
  zoneId: string
}>()

const toast = useToast()
const router = useRouter()
const { user } = useAuth()
const channel = ref<OfficeRoomThreadChannel | null>(null)
const messages = ref<OfficeRoomThreadMessage[]>([])
const draft = ref('')
const loading = ref(false)
const sending = ref(false)
const errorMessage = ref<string | null>(null)
const bootstrappedZoneId = ref<string | null>(null)
const listEl = ref<HTMLElement | null>(null)
const typingText = ref('')
let refreshTimer: ReturnType<typeof setInterval> | null = null
let wsComposable: ReturnType<typeof useChatWebSocket> | null = null
let removeWsMessageHandler: (() => void) | null = null
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, query?: Record<string, unknown> }
) => Promise<T>

const canSend = computed(() => draft.value.trim().length > 0 && !sending.value)
const liveStatusLabel = computed(() => {
  if (wsComposable?.isConnected.value) return 'Live'
  if (wsComposable?.isConnecting.value) return 'Connecting'
  return 'Polling'
})
const liveStatusClass = computed(() => {
  if (wsComposable?.isConnected.value) return 'bg-emerald-400/10 text-emerald-100 ring-emerald-300/15'
  if (wsComposable?.isConnecting.value) return 'bg-sky-400/10 text-sky-100 ring-sky-300/15'
  return 'bg-white/[0.04] text-white/35 ring-white/[0.06]'
})

function messageAuthor(message: OfficeRoomThreadMessage) {
  return message.user_name?.trim() || 'Team member'
}

function messageTime(message: OfficeRoomThreadMessage) {
  return new Date(message.created_at).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit'
  })
}

async function scrollToLatest() {
  await nextTick()
  if (!listEl.value) return
  listEl.value.scrollTop = listEl.value.scrollHeight
}

function normalizeWsMessage(message: ChatWsMessage, channelId: string): OfficeRoomThreadMessage | null {
  if (message.type !== 'message' || !message.content) return null
  if (message.threadParentId) return null

  return {
    id: `ws:${message.id ?? `${message.userId}:${message.createdAt}`}`,
    channel_id: channelId,
    user_id: message.userId || '',
    content: message.content,
    metadata: message.metadata ?? {},
    created_at: message.createdAt || new Date().toISOString(),
    user_name: message.userName || null,
    user_avatar: message.userAvatar || null
  }
}

function upsertMessage(message: OfficeRoomThreadMessage) {
  const existingIndex = messages.value.findIndex(existing =>
    existing.id === message.id
    || (
      existing.user_id === message.user_id
      && existing.content === message.content
      && Math.abs(new Date(existing.created_at).getTime() - new Date(message.created_at).getTime()) < 3000
    )
  )

  if (existingIndex >= 0) {
    const next = [...messages.value]
    next[existingIndex] = message
    messages.value = next
    return
  }

  messages.value = [...messages.value, message].slice(-20)
}

async function loadMessages(channelId: string, mode: 'replace' | 'append' = 'replace') {
  const lastNumericId = [...messages.value].reverse().find(message => typeof message.id === 'number')?.id
  const after = mode === 'append' ? lastNumericId : null
  const data = await apiFetch<OfficeRoomThreadMessage[]>(`/api/chat/channels/${channelId}/messages`, {
    query: {
      limit: 12,
      ...(after ? { after } : {})
    }
  })

  if (mode === 'append') {
    const knownIds = new Set(messages.value.map(message => message.id))
    messages.value = [
      ...messages.value,
      ...data.filter(message => !knownIds.has(message.id))
    ].slice(-20)
  } else {
    messages.value = data.slice(-20)
  }

  await scrollToLatest()
}

async function quietlyLoadMessages(channelId: string, mode: 'replace' | 'append') {
  try {
    await loadMessages(channelId, mode)
    errorMessage.value = null
  } catch {
    if (!messages.value.length) {
      errorMessage.value = 'Room thread could not be refreshed.'
    }
  }
}

async function ensureThread() {
  if (bootstrappedZoneId.value === props.zoneId && channel.value) return channel.value

  loading.value = true
  errorMessage.value = null

  try {
    const nextChannel = await apiFetch<OfficeRoomThreadChannel>(
      `/api/office/${props.officeId}/zones/${props.zoneId}/thread`,
      { method: 'POST' }
    )

    channel.value = nextChannel
    bootstrappedZoneId.value = props.zoneId
    await loadMessages(nextChannel.id)
    return nextChannel
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    errorMessage.value = message || 'Room thread could not be loaded.'
    return null
  } finally {
    loading.value = false
  }
}

async function refreshThread() {
  const activeChannel = await ensureThread()
  if (!activeChannel) return
  await quietlyLoadMessages(activeChannel.id, messages.value.length ? 'append' : 'replace')
}

function disconnectThreadSocket() {
  removeWsMessageHandler?.()
  removeWsMessageHandler = null
  wsComposable?.disconnect()
  wsComposable = null
  typingText.value = ''
}

function connectThreadSocket(channelId: string) {
  if (typeof window === 'undefined' || !user.value) return

  disconnectThreadSocket()
  wsComposable = useChatWebSocket(channelId)
  removeWsMessageHandler = wsComposable.onMessage((message) => {
    typingText.value = wsComposable?.typingText.value ?? ''
    if (message.type === 'history') return

    const normalized = normalizeWsMessage(message, channelId)
    if (!normalized) return

    upsertMessage(normalized)
    void scrollToLatest()
  })
  wsComposable.connect(user.value.id, user.value.name, safeMediaUrl(user.value.avatar_url))
}

function stopRefreshTimer() {
  if (!refreshTimer) return
  clearInterval(refreshTimer)
  refreshTimer = null
}

function startRefreshTimer() {
  if (refreshTimer || typeof window === 'undefined') return
  refreshTimer = setInterval(() => {
    if (!channel.value || loading.value || sending.value) return
    void quietlyLoadMessages(channel.value.id, messages.value.length ? 'append' : 'replace')
  }, 8000)
}

async function sendMessage() {
  const content = draft.value.trim()
  if (!content) return

  const activeChannel = await ensureThread()
  if (!activeChannel) return

  sending.value = true
  errorMessage.value = null

  try {
    const metadata = {
      source: 'office_room_panel',
      office_id: props.officeId,
      zone_id: props.zoneId
    }

    if (wsComposable?.isConnected.value && wsComposable.sendMessage(content, undefined, metadata)) {
      draft.value = ''
      return
    }

    const message = await apiFetch<OfficeRoomThreadMessage>(`/api/chat/channels/${activeChannel.id}/messages`, {
      method: 'POST',
      body: {
        content,
        metadata
      }
    })
    draft.value = ''
    upsertMessage(message)
    await scrollToLatest()
  } catch (error: unknown) {
    const message = error && typeof error === 'object' && 'data' in error
      ? (error as { data?: { statusMessage?: string } }).data?.statusMessage
      : undefined
    toast.add({
      title: 'Could not send message',
      description: message || 'Try again in a moment.',
      icon: 'i-lucide-message-circle-warning',
      color: 'error'
    })
  } finally {
    sending.value = false
  }
}

async function openFullThread() {
  const activeChannel = await ensureThread()
  if (!activeChannel) return
  await router.push({
    path: '/agency/chat',
    query: { channel: activeChannel.id, source: 'office' }
  })
}

function handleComposerKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.shiftKey) return
  event.preventDefault()
  void sendMessage()
}

watch(
  () => props.zoneId,
  () => {
    channel.value = null
    messages.value = []
    draft.value = ''
    errorMessage.value = null
    void ensureThread()
  },
  { immediate: true }
)

watch(
  () => channel.value?.id,
  (channelId) => {
    if (channelId) {
      startRefreshTimer()
      connectThreadSocket(channelId)
    } else {
      stopRefreshTimer()
      disconnectThreadSocket()
    }
  },
  { immediate: true }
)

onBeforeUnmount(() => {
  stopRefreshTimer()
  disconnectThreadSocket()
})
</script>

<template>
  <section class="border-t border-white/[0.06] px-3 py-3">
    <div class="mb-2 flex items-center justify-between gap-3">
      <div>
        <div class="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          Room thread
        </div>
        <p class="mt-0.5 text-[11px] text-white/35">
          Persistent chat for this room.
        </p>
      </div>
      <div class="flex shrink-0 items-center gap-1.5">
        <span
          class="hidden rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 sm:inline-flex"
          :class="liveStatusClass"
        >
          {{ liveStatusLabel }}
        </span>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-white/35 ring-1 ring-white/[0.06] transition hover:bg-white/[0.06] hover:text-white/75 disabled:cursor-wait disabled:opacity-45"
          :disabled="loading"
          aria-label="Refresh room thread"
          @click="refreshThread"
        >
          <UIcon
            :name="loading ? 'i-lucide-loader-circle' : 'i-lucide-refresh-cw'"
            class="size-3.5"
            :class="loading ? 'animate-spin' : ''"
          />
        </button>
        <button
          type="button"
          class="flex size-7 items-center justify-center rounded-md text-white/35 ring-1 ring-white/[0.06] transition hover:bg-white/[0.06] hover:text-white/75"
          aria-label="Open full room thread"
          @click="openFullThread"
        >
          <UIcon name="i-lucide-external-link" class="size-3.5" />
        </button>
      </div>
    </div>

    <div
      ref="listEl"
      class="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-white/[0.06] bg-white/[0.025] p-2"
    >
      <div
        v-if="loading && !messages.length"
        class="flex h-24 items-center justify-center"
      >
        <XfLoader size="sm" />
      </div>

      <p
        v-else-if="errorMessage"
        class="rounded-md border border-red-300/10 bg-red-400/10 px-3 py-2 text-xs text-red-100"
      >
        {{ errorMessage }}
      </p>

      <p
        v-else-if="!messages.length"
        class="px-2 py-8 text-center text-xs text-white/35"
      >
        No messages in this room yet.
      </p>

      <article
        v-for="message in messages"
        v-else
        :key="message.id"
        class="rounded-lg bg-black/15 px-2.5 py-2 ring-1 ring-white/[0.04]"
      >
        <div class="mb-1 flex items-center justify-between gap-2">
          <span class="truncate text-[11px] font-semibold text-white/65">
            {{ messageAuthor(message) }}
          </span>
          <time class="shrink-0 text-[10px] text-white/30">
            {{ messageTime(message) }}
          </time>
        </div>
        <p class="whitespace-pre-wrap break-words text-xs leading-5 text-white/70">
          {{ message.content }}
        </p>
      </article>
    </div>

    <p
      v-if="typingText"
      class="mt-2 truncate text-[11px] text-emerald-100/60"
    >
      {{ typingText }}
    </p>

    <div class="mt-2 flex gap-2">
      <textarea
        v-model="draft"
        rows="2"
        maxlength="2000"
        placeholder="Message this room"
        class="min-h-10 flex-1 resize-none rounded-lg border border-white/[0.08] bg-white/[0.035] px-3 py-2 text-xs leading-5 text-white outline-none placeholder:text-white/25 focus:border-white/20"
        @input="wsComposable?.sendTyping()"
        @keydown="handleComposerKeydown"
      />
      <button
        type="button"
        class="flex w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-400/12 text-emerald-100 ring-1 ring-emerald-300/20 transition hover:bg-emerald-400/18 disabled:cursor-not-allowed disabled:opacity-45"
        :disabled="!canSend"
        aria-label="Send room message"
        @click="sendMessage"
      >
        <UIcon
          :name="sending ? 'i-lucide-loader-circle' : 'i-lucide-send'"
          class="size-4"
          :class="sending ? 'animate-spin' : ''"
        />
      </button>
    </div>
  </section>
</template>
