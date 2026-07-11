<script setup lang="ts">
/**
 * Comment pin overlay for a single banner artboard.
 * Renders comment markers at x,y coordinates (in artboard space, scaled by wsScale).
 * In comment mode, clicking creates a new comment.
 */

const props = defineProps<{
  formatKey: string
  projectId: string
  scale: number
}>()

const { state } = useBannerStudio()
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string; body?: unknown; query?: Record<string, unknown> },
) => Promise<T>

const commentMode = inject<Ref<boolean>>('commentMode', ref(false))

// Comments data
const commentsData = ref<any[]>([])

async function refreshComments() {
  commentsData.value = await apiFetch<any[]>('/api/agency/banner-studio/comments', {
    query: { projectId: props.projectId, formatKey: props.formatKey },
  })
}

watch(() => [props.projectId, props.formatKey], () => {
  refreshComments()
}, { immediate: true })

// Only top-level comments (pins)
const pins = computed(() =>
  (commentsData.value || []).filter((c: any) => !c.parentId)
)

// Replies for a given comment
function getReplies(parentId: string) {
  return (commentsData.value || []).filter((c: any) => c.parentId === parentId)
}

// Popover state
const activePin = ref<any>(null)
const showPopover = ref(false)
const newCommentPos = ref<{ x: number; y: number } | null>(null)
const newCommentText = ref('')
const replyText = ref('')
const isSubmitting = ref(false)

function onOverlayClick(e: MouseEvent) {
  if (!commentMode.value) return

  // Calculate artboard coordinates from click position
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) / props.scale)
  const y = Math.round((e.clientY - rect.top) / props.scale)

  newCommentPos.value = { x, y }
  newCommentText.value = ''
  activePin.value = null
  showPopover.value = true
}

function openPin(comment: any) {
  activePin.value = comment
  newCommentPos.value = null
  replyText.value = ''
  showPopover.value = true
}

async function submitComment() {
  if (!newCommentPos.value || !newCommentText.value.trim()) return
  isSubmitting.value = true

  try {
    await apiFetch('/api/agency/banner-studio/comments', {
      method: 'POST',
      body: {
        projectId: props.projectId,
        formatKey: props.formatKey,
        x: newCommentPos.value.x,
        y: newCommentPos.value.y,
        text: newCommentText.value.trim(),
      },
    })
    newCommentText.value = ''
    newCommentPos.value = null
    showPopover.value = false
    await refreshComments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to add comment', color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

async function submitReply() {
  if (!activePin.value || !replyText.value.trim()) return
  isSubmitting.value = true

  try {
    await apiFetch('/api/agency/banner-studio/comments', {
      method: 'POST',
      body: {
        projectId: props.projectId,
        formatKey: props.formatKey,
        x: activePin.value.x,
        y: activePin.value.y,
        text: replyText.value.trim(),
        parentId: activePin.value.id,
      },
    })
    replyText.value = ''
    await refreshComments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to add reply', color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

async function toggleResolve(comment: any) {
  try {
    await apiFetch(`/api/agency/banner-studio/comments/${comment.id}`, {
      method: 'PATCH',
      body: { resolved: !comment.resolved },
    })
    await refreshComments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to update comment', color: 'error' })
  }
}

async function deleteComment(comment: any) {
  try {
    await apiFetch(`/api/agency/banner-studio/comments/${comment.id}`, { method: 'DELETE' })
    if (activePin.value?.id === comment.id) {
      activePin.value = null
      showPopover.value = false
    }
    await refreshComments()
  } catch {
    toast.add({ title: 'Error', description: 'Failed to delete comment', color: 'error' })
  }
}

function formatTime(d: string) {
  if (!d) return ''
  const date = new Date(d)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
}

// Close popover on escape
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showPopover.value = false
    activePin.value = null
    newCommentPos.value = null
  }
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onUnmounted(() => document.removeEventListener('keydown', onKeydown))

// Expose refresh for parent
defineExpose({ refreshComments })
</script>

<template>
  <div
    class="absolute inset-0 z-50"
    :class="commentMode ? 'cursor-crosshair' : 'pointer-events-none'"
    @click.stop="onOverlayClick"
  >
    <!-- Comment mode active indicator -->
    <div
      v-if="commentMode"
      class="absolute top-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#4a8fe8] text-white text-[10px] font-semibold uppercase tracking-wider shadow-lg pointer-events-none select-none"
    >
      <UIcon name="i-lucide-message-circle" class="w-3 h-3" />
      <span>Click to comment</span>
    </div>
    <!-- Comment pins -->
    <div
      v-for="pin in pins"
      :key="pin.id"
      class="absolute cursor-pointer group"
      :class="commentMode ? 'pointer-events-auto' : 'pointer-events-none'"
      :style="{
        left: `${pin.x * scale}px`,
        top: `${pin.y * scale}px`,
        transform: 'translate(-50%, -100%)',
      }"
      @click.stop="openPin(pin)"
    >
      <!-- Pin marker -->
      <div
        class="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shadow-md transition-transform group-hover:scale-110"
        :class="pin.resolved
          ? 'bg-green-500/80 text-white'
          : 'bg-(--ui-primary) text-white'"
      >
        <UIcon v-if="pin.resolved" name="i-lucide-check" class="w-3.5 h-3.5" />
        <UIcon v-else name="i-lucide-message-circle" class="w-3.5 h-3.5" />
      </div>
    </div>

    <!-- New comment marker (while placing) -->
    <div
      v-if="newCommentPos && showPopover"
      class="absolute pointer-events-none"
      :style="{
        left: `${newCommentPos.x * scale}px`,
        top: `${newCommentPos.y * scale}px`,
        transform: 'translate(-50%, -100%)',
      }"
    >
      <div class="w-6 h-6 rounded-full bg-(--ui-primary) flex items-center justify-center shadow-md animate-pulse">
        <UIcon name="i-lucide-plus" class="w-3.5 h-3.5 text-white" />
      </div>
    </div>

    <!-- Comment popover (new comment) -->
    <div
      v-if="showPopover && newCommentPos"
      class="absolute pointer-events-auto z-50 w-64 bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg shadow-xl p-3 space-y-2"
      :style="{
        left: `${Math.min(newCommentPos.x * scale + 20, 200)}px`,
        top: `${newCommentPos.y * scale}px`,
      }"
      @click.stop
    >
      <div class="text-xs font-semibold">Add Comment</div>
      <UTextarea
        v-model="newCommentText"
        :rows="3"
        size="sm"
        placeholder="Type your comment..."
        autofocus
        @keydown.meta.enter="submitComment"
      />
      <div class="flex justify-end gap-1.5">
        <UButton label="Cancel" variant="ghost" size="xs" @click="showPopover = false; newCommentPos = null" />
        <UButton
          label="Comment"
          size="xs"
          :loading="isSubmitting"
          :disabled="!newCommentText.trim()"
          @click="submitComment"
        />
      </div>
    </div>

    <!-- Comment popover (existing pin) -->
    <div
      v-if="showPopover && activePin"
      class="absolute pointer-events-auto z-50 w-72 bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg shadow-xl overflow-hidden"
      :style="{
        left: `${Math.min(activePin.x * scale + 20, 200)}px`,
        top: `${activePin.y * scale}px`,
      }"
      @click.stop
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-3 py-2 border-b border-(--ui-border)">
        <div class="flex items-center gap-1.5">
          <UAvatar v-if="activePin.userAvatar" :src="activePin.userAvatar" size="2xs" />
          <span class="text-xs font-semibold">{{ activePin.userName || activePin.reviewerName || 'User' }}</span>
          <span class="text-[10px] text-(--ui-text-muted)">{{ formatTime(activePin.createdAt) }}</span>
        </div>
        <div class="flex gap-0.5">
          <UButton
            :icon="activePin.resolved ? 'i-lucide-circle-check' : 'i-lucide-check'"
            variant="ghost"
            size="xs"
            :color="activePin.resolved ? 'success' : undefined"
            :title="activePin.resolved ? 'Unresolve' : 'Resolve'"
            @click="toggleResolve(activePin)"
          />
          <UButton
            icon="i-lucide-trash-2"
            variant="ghost"
            size="xs"
            color="error"
            @click="deleteComment(activePin)"
          />
          <UButton
            icon="i-lucide-x"
            variant="ghost"
            size="xs"
            @click="showPopover = false; activePin = null"
          />
        </div>
      </div>

      <!-- Comment text -->
      <div class="px-3 py-2">
        <p class="text-xs text-(--ui-text)">{{ activePin.text }}</p>
      </div>

      <!-- Replies -->
      <div v-if="getReplies(activePin.id).length" class="border-t border-(--ui-border)">
        <div
          v-for="reply in getReplies(activePin.id)"
          :key="reply.id"
          class="px-3 py-2 border-b border-(--ui-border)/50 last:border-b-0"
        >
          <div class="flex items-center gap-1.5 mb-0.5">
            <span class="text-[11px] font-medium">{{ reply.userName || reply.reviewerName || 'User' }}</span>
            <span class="text-[10px] text-(--ui-text-muted)">{{ formatTime(reply.createdAt) }}</span>
          </div>
          <p class="text-xs text-(--ui-text-muted)">{{ reply.text }}</p>
        </div>
      </div>

      <!-- Reply input -->
      <div class="px-3 py-2 border-t border-(--ui-border)">
        <div class="flex gap-1.5">
          <UInput
            v-model="replyText"
            size="xs"
            class="flex-1"
            placeholder="Reply..."
            @keydown.enter="submitReply"
          />
          <UButton
            icon="i-lucide-send"
            size="xs"
            :loading="isSubmitting"
            :disabled="!replyText.trim()"
            @click="submitReply"
          />
        </div>
      </div>
    </div>
  </div>
</template>
