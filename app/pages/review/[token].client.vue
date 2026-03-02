<script setup lang="ts">
/**
 * Public review page for external reviewers.
 * No auth required — uses token from URL.
 */
import { FORMATS, PLATFORM_META } from '~/utils/banner-constants'

definePageMeta({ layout: 'default', auth: false })

const route = useRoute()
const toast = useToast()
const token = computed(() => route.params.token as string)

// Fetch project data via public API
const { data, error, refresh } = await useFetch<any>(
  () => `/api/public/banner-review/${token.value}`,
  { default: () => null },
)

const project = computed(() => data.value?.project)
const comments = computed<any[]>(() => data.value?.comments || [])
const canvasData = computed(() => {
  try {
    return typeof project.value?.canvasData === 'string'
      ? JSON.parse(project.value.canvasData)
      : project.value?.canvasData || {}
  } catch { return {} }
})

const sets = computed(() => canvasData.value?.sets || {})
const setKeys = computed<string[]>(() => canvasData.value?.setKeys || Object.keys(sets.value))

// Reviewer info
const reviewerName = ref('')
const reviewerEmail = ref('')
const hasIdentified = ref(false)

function identify() {
  if (!reviewerName.value.trim()) return
  hasIdentified.value = true
}

// Comment mode
const commentMode = ref(false)
const activeFormat = ref<string>('')
const newCommentPos = ref<{ x: number; y: number } | null>(null)
const newCommentText = ref('')
const isSubmitting = ref(false)
const activeComment = ref<any>(null)

// Set first format as active
watch(setKeys, (keys) => {
  if (keys.length && !activeFormat.value) activeFormat.value = keys[0]
}, { immediate: true })

function pinsForFormat(fk: string) {
  return comments.value.filter(c => c.formatKey === fk && !c.parentId)
}

function getReplies(parentId: string) {
  return comments.value.filter(c => c.parentId === parentId)
}

function onArtboardClick(e: MouseEvent, fk: string, scale: number) {
  if (!commentMode.value || !hasIdentified.value) return
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const x = Math.round((e.clientX - rect.left) / scale)
  const y = Math.round((e.clientY - rect.top) / scale)

  activeFormat.value = fk
  newCommentPos.value = { x, y }
  newCommentText.value = ''
  activeComment.value = null
}

async function submitComment() {
  if (!newCommentPos.value || !newCommentText.value.trim() || !activeFormat.value) return
  isSubmitting.value = true

  try {
    await $fetch(`/api/public/banner-review/${token.value}/comments`, {
      method: 'POST',
      body: {
        formatKey: activeFormat.value,
        x: newCommentPos.value.x,
        y: newCommentPos.value.y,
        text: newCommentText.value.trim(),
        name: reviewerName.value,
        email: reviewerEmail.value || undefined,
      },
    })
    newCommentText.value = ''
    newCommentPos.value = null
    await refresh()
    toast.add({ title: 'Comment added', color: 'success' })
  } catch {
    toast.add({ title: 'Error', description: 'Failed to add comment', color: 'error' })
  } finally {
    isSubmitting.value = false
  }
}

function artboardScale(key: string): number {
  const fmt = FORMATS[key]
  if (!fmt) return 0.3
  const maxW = 500
  const maxH = 500
  return Math.min(maxW / fmt.w, maxH / fmt.h, 0.5)
}

function formatTime(d: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}
</script>

<template>
  <div class="min-h-screen bg-(--ui-bg) p-6">
    <!-- Error state -->
    <div v-if="error" class="max-w-lg mx-auto text-center py-20">
      <UIcon name="i-lucide-link-2-off" class="w-12 h-12 text-(--ui-text-muted) mx-auto mb-4" />
      <h2 class="text-xl font-bold mb-2">Review Link Invalid</h2>
      <p class="text-sm text-(--ui-text-muted)">{{ error.data?.statusMessage || 'This link may have expired or been revoked.' }}</p>
    </div>

    <div v-else-if="project" class="max-w-6xl mx-auto">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">{{ project.name }}</h1>
          <p class="text-sm text-(--ui-text-muted) mt-1">Banner Review</p>
        </div>
        <div class="flex items-center gap-2">
          <UBadge variant="subtle" :color="project.reviewStatus === 'approved' ? 'success' : 'warning'">
            {{ project.reviewStatus }}
          </UBadge>
          <UButton
            :icon="commentMode ? 'i-lucide-message-circle' : 'i-lucide-message-circle'"
            :label="commentMode ? 'Exit Comment Mode' : 'Add Comments'"
            :variant="commentMode ? 'soft' : 'outline'"
            size="sm"
            :disabled="!hasIdentified"
            @click="commentMode = !commentMode"
          />
        </div>
      </div>

      <!-- Reviewer identification -->
      <div v-if="!hasIdentified" class="max-w-md mx-auto bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg p-5 mb-8">
        <h3 class="text-sm font-semibold mb-3">Before reviewing, please identify yourself</h3>
        <div class="space-y-3">
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">Your Name *</label>
            <UInput v-model="reviewerName" size="sm" placeholder="Jane Smith" />
          </div>
          <div>
            <label class="text-xs text-(--ui-text-muted) block mb-1">Email (optional)</label>
            <UInput v-model="reviewerEmail" size="sm" placeholder="jane@example.com" type="email" />
          </div>
          <UButton label="Start Review" size="sm" :disabled="!reviewerName.trim()" @click="identify" />
        </div>
      </div>

      <!-- Formats grid -->
      <div class="grid gap-6" style="grid-template-columns: repeat(auto-fill, minmax(350px, 1fr))">
        <div
          v-for="key in setKeys"
          :key="key"
          class="flex flex-col items-center gap-3 p-4 rounded-lg border border-(--ui-border) bg-(--ui-bg-elevated)"
        >
          <!-- Format label -->
          <div class="flex items-center gap-2 w-full">
            <span
              class="w-5 h-5 rounded text-[10px] font-bold flex items-center justify-center shrink-0"
              :style="{
                backgroundColor: PLATFORM_META[FORMATS[key]?.platform]?.bg || 'rgba(255,255,255,0.08)',
                color: PLATFORM_META[FORMATS[key]?.platform]?.color || '#888',
              }"
            >{{ FORMATS[key]?.icon || '?' }}</span>
            <span class="text-sm font-medium">{{ FORMATS[key]?.name || key }}</span>
            <UBadge size="xs" variant="subtle" class="ml-auto font-mono">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</UBadge>
          </div>

          <!-- Artboard preview with comment pins -->
          <div
            class="relative rounded overflow-hidden ring-1 ring-(--ui-border)/30"
            :class="commentMode ? 'cursor-crosshair' : ''"
            :style="{
              width: `${(FORMATS[key]?.w || 300) * artboardScale(key)}px`,
              height: `${(FORMATS[key]?.h || 250) * artboardScale(key)}px`,
            }"
            @click="onArtboardClick($event, key, artboardScale(key))"
          >
            <!-- Placeholder for artboard preview (static render) -->
            <div
              class="bg-gray-900 flex items-center justify-center"
              :style="{
                width: `${(FORMATS[key]?.w || 300) * artboardScale(key)}px`,
                height: `${(FORMATS[key]?.h || 250) * artboardScale(key)}px`,
              }"
            >
              <span class="text-xs text-gray-500">{{ FORMATS[key]?.w }}x{{ FORMATS[key]?.h }}</span>
            </div>

            <!-- Comment pins -->
            <div
              v-for="pin in pinsForFormat(key)"
              :key="pin.id"
              class="absolute cursor-pointer"
              :style="{
                left: `${pin.x * artboardScale(key)}px`,
                top: `${pin.y * artboardScale(key)}px`,
                transform: 'translate(-50%, -100%)',
              }"
              @click.stop="activeComment = pin"
            >
              <div
                class="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shadow-md"
                :class="pin.resolved ? 'bg-green-500 text-white' : 'bg-blue-500 text-white'"
              >
                <UIcon v-if="pin.resolved" name="i-lucide-check" class="w-3 h-3" />
                <UIcon v-else name="i-lucide-message-circle" class="w-3 h-3" />
              </div>
            </div>
          </div>

          <!-- Comment count -->
          <div class="text-xs text-(--ui-text-muted)">
            {{ pinsForFormat(key).length }} comment{{ pinsForFormat(key).length !== 1 ? 's' : '' }}
          </div>
        </div>
      </div>

      <!-- New comment input (floating) -->
      <div
        v-if="newCommentPos"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 w-80 bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg shadow-xl p-3 z-50"
      >
        <div class="text-xs font-semibold mb-2">Add Comment</div>
        <UTextarea
          v-model="newCommentText"
          :rows="3"
          size="sm"
          placeholder="Type your feedback..."
          autofocus
        />
        <div class="flex justify-end gap-1.5 mt-2">
          <UButton label="Cancel" variant="ghost" size="xs" @click="newCommentPos = null" />
          <UButton
            label="Post Comment"
            size="xs"
            :loading="isSubmitting"
            :disabled="!newCommentText.trim()"
            @click="submitComment"
          />
        </div>
      </div>

      <!-- Active comment detail -->
      <div
        v-if="activeComment"
        class="fixed bottom-6 right-6 w-80 bg-(--ui-bg-elevated) border border-(--ui-border) rounded-lg shadow-xl overflow-hidden z-50"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-(--ui-border)">
          <div class="flex items-center gap-1.5">
            <span class="text-xs font-semibold">{{ activeComment.userName || activeComment.reviewerName || 'User' }}</span>
            <span class="text-[10px] text-(--ui-text-muted)">{{ formatTime(activeComment.createdAt) }}</span>
          </div>
          <UButton icon="i-lucide-x" variant="ghost" size="xs" @click="activeComment = null" />
        </div>
        <div class="px-3 py-2">
          <p class="text-xs">{{ activeComment.text }}</p>
        </div>
        <div v-if="getReplies(activeComment.id).length" class="border-t border-(--ui-border)">
          <div
            v-for="reply in getReplies(activeComment.id)"
            :key="reply.id"
            class="px-3 py-2 border-b border-(--ui-border)/50 last:border-b-0"
          >
            <div class="flex items-center gap-1 mb-0.5">
              <span class="text-[11px] font-medium">{{ reply.userName || reply.reviewerName }}</span>
              <span class="text-[10px] text-(--ui-text-muted)">{{ formatTime(reply.createdAt) }}</span>
            </div>
            <p class="text-xs text-(--ui-text-muted)">{{ reply.text }}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
