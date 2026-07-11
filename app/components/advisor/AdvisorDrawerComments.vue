<script setup lang="ts">
// Discussion section for the advisor drawer. Renders a flat comment
// list + compose textarea. Edit/delete are author-only (or owner/admin
// — server enforces the override). Failures toast and revert.

type Comment = {
  id: string
  recommendation_id: string
  author_id: string | null
  author_name: string | null
  author_avatar_url: string | null
  body: string
  created_at: string
  updated_at: string
}

const props = defineProps<{
  recommendationId: string
  comments: Comment[]
  currentUserId: string | null
  canPrivilegedEdit: boolean
}>()

const emit = defineEmits<{
  (e: 'changed'): void
}>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string; body?: unknown }) => Promise<T>

const draft = ref('')
const submitting = ref(false)
const editingId = ref<string | null>(null)
const editDraft = ref('')

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function canModify(c: Comment): boolean {
  return props.canPrivilegedEdit || (!!c.author_id && c.author_id === props.currentUserId)
}

async function submit() {
  const body = draft.value.trim()
  if (!body || submitting.value) return
  submitting.value = true
  try {
    await apiFetch(
      `/api/advisor/recommendations/${props.recommendationId}/comments`,
      { method: 'POST', body: { body } }
    )
    draft.value = ''
    emit('changed')
  } catch (err: any) {
    toast.add({
      title: 'Comment failed',
      description: err?.data?.statusMessage ?? err?.message,
      color: 'error',
    })
  } finally {
    submitting.value = false
  }
}

function startEdit(c: Comment) {
  editingId.value = c.id
  editDraft.value = c.body
}

function cancelEdit() {
  editingId.value = null
  editDraft.value = ''
}

async function saveEdit(c: Comment) {
  const body = editDraft.value.trim()
  if (!body) return
  try {
    await apiFetch(
      `/api/advisor/recommendations/${props.recommendationId}/comments/${c.id}`,
      { method: 'PATCH', body: { body } }
    )
    editingId.value = null
    editDraft.value = ''
    emit('changed')
  } catch (err: any) {
    toast.add({
      title: 'Edit failed',
      description: err?.data?.statusMessage ?? err?.message,
      color: 'error',
    })
  }
}

const confirmDeleteId = ref<string | null>(null)

function askDelete(c: Comment) {
  confirmDeleteId.value = c.id
}

async function confirmDelete(c: Comment) {
  try {
    await apiFetch(
      `/api/advisor/recommendations/${props.recommendationId}/comments/${c.id}`,
      { method: 'DELETE' }
    )
    confirmDeleteId.value = null
    emit('changed')
  } catch (err: any) {
    toast.add({
      title: 'Delete failed',
      description: err?.data?.statusMessage ?? err?.message,
      color: 'error',
    })
  }
}
</script>

<template>
  <div>
    <p class="text-[10px] uppercase text-muted font-semibold tracking-wider mb-2">
      Discussion
      <span v-if="comments.length" class="text-muted normal-case font-normal">({{ comments.length }})</span>
    </p>

    <div v-if="!comments.length" class="text-xs text-muted italic mb-3">
      No comments yet — start the discussion.
    </div>

    <div v-else class="space-y-3 mb-3">
      <div v-for="c in comments" :key="c.id" class="flex gap-2">
        <UAvatar
          v-if="c.author_name"
          :alt="c.author_name"
          :src="c.author_avatar_url ?? undefined"
          size="xs"
        />
        <UIcon v-else name="i-lucide-user" class="size-5 mt-0.5 text-muted" />

        <div class="flex-1 min-w-0">
          <div class="flex items-baseline gap-2">
            <p class="text-xs font-medium">{{ c.author_name ?? 'Unknown' }}</p>
            <p class="text-[10px] text-muted">{{ formatWhen(c.created_at) }}</p>
            <p
              v-if="c.updated_at && c.updated_at !== c.created_at"
              class="text-[10px] text-muted italic"
            >edited</p>
          </div>

          <!-- Edit mode -->
          <div v-if="editingId === c.id" class="mt-1 space-y-1.5">
            <UTextarea v-model="editDraft" :rows="3" size="sm" autofocus />
            <div class="flex justify-end gap-1.5">
              <UButton size="xs" variant="ghost" color="neutral" @click="cancelEdit">Cancel</UButton>
              <UButton
                size="xs"
                :disabled="!editDraft.trim() || editDraft.trim() === c.body"
                @click="saveEdit(c)"
              >Save</UButton>
            </div>
          </div>

          <!-- Display mode -->
          <p v-else class="text-sm whitespace-pre-wrap break-words mt-0.5">{{ c.body }}</p>

          <!-- Affordance row (author/admin only) -->
          <div
            v-if="editingId !== c.id && canModify(c)"
            class="flex items-center gap-2 mt-1 opacity-60 hover:opacity-100 transition-opacity"
          >
            <button class="text-[10px] text-muted hover:text-default" @click="startEdit(c)">Edit</button>
            <span class="text-muted">·</span>
            <button class="text-[10px] text-muted hover:text-red-500" @click="askDelete(c)">Delete</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Compose -->
    <div>
      <UTextarea
        v-model="draft"
        :rows="3"
        size="sm"
        placeholder="Add a comment…"
      />
      <div class="flex justify-end mt-1.5">
        <UButton
          size="xs"
          :loading="submitting"
          :disabled="!draft.trim() || submitting"
          @click="submit"
        >Comment</UButton>
      </div>
    </div>

    <!-- Delete confirmation modal -->
    <UModal :open="confirmDeleteId !== null" :ui="{ content: 'max-w-sm' }" @update:open="(v: boolean) => v || (confirmDeleteId = null)">
      <template #content>
        <div class="p-5 space-y-3">
          <h3 class="font-semibold">Delete this comment?</h3>
          <p class="text-sm text-muted">This will hide it from the discussion. The audit log keeps the reference.</p>
          <div class="flex justify-end gap-2">
            <UButton variant="ghost" color="neutral" size="sm" @click="confirmDeleteId = null">Cancel</UButton>
            <UButton
              color="error"
              size="sm"
              @click="() => {
                const c = comments.find(x => x.id === confirmDeleteId)
                if (c) confirmDelete(c)
              }"
            >Delete</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
