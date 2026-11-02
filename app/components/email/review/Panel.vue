<!-- app/components/email/review/Panel.vue -->
<!-- M06 review sidebar for saved template/campaign content: block comment
     threads (anchored to stable block IDs + the content fingerprint they were
     written against), draft → in review → approved, and recovery of actions
     whose outcome is unknown. Approval always binds the server's fingerprint. -->
<script setup lang="ts">
import {
  buildReviewCommand,
  classifyReviewError,
  commentThreads,
  describeReviewError,
  pendingAction,
  shortDigest,
  type PendingReviewAction,
  type ReviewCommandDetails,
  type ReviewKind,
  type ReviewView
} from '~~/app/utils/emailReviewClient'

const props = defineProps<{
  kind: ReviewKind
  targetId: string
  /** Scope the caller believes it is viewing; mismatches are treated as absent. */
  clientId?: string | null
}>()
const emit = defineEmits<{ changed: [view: ReviewView] }>()

const toast = useToast()
const apiFetch = $fetch as <T = unknown>(request: string, options?: { method?: string, body?: unknown, query?: Record<string, string> }) => Promise<T>

const view = ref<ReviewView | null>(null)
const loading = ref(false)
const loadError = ref<string | null>(null)
const pending = ref<PendingReviewAction | null>(null)
const selectedBlock = ref<string | null>(null)
const draftComment = ref('')
const replyTo = ref<string | null>(null)
const showChanges = ref(false)
const changesNote = ref('')

const basePath = computed(() => `/api/email/review/${props.kind}/${props.targetId}`)

async function load() {
  loading.value = true
  loadError.value = null
  try {
    const query = props.clientId === undefined ? undefined : { clientId: props.clientId ?? 'none' }
    view.value = await apiFetch<ReviewView>(basePath.value, query ? { query } : undefined)
    emit('changed', view.value)
  } catch (error) {
    const { code } = classifyReviewError(error)
    loadError.value = code === 'not_found' ? 'The review workflow is not enabled.' : describeReviewError(code, 'Could not load review.')
  } finally {
    loading.value = false
  }
}

watch(() => [props.kind, props.targetId], () => {
  pending.value = null
  selectedBlock.value = null
  void load()
}, { immediate: true })

const STEPS = [
  { value: 'draft', label: 'Draft' },
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' }
] as const
const stepIndex = computed(() => STEPS.findIndex(step => step.value === view.value?.state))
const frozen = computed(() => props.kind === 'campaign' && !!view.value?.status && view.value.status !== 'draft')
const busy = computed(() => pending.value?.phase === 'sending')

const threads = computed(() => commentThreads(view.value?.comments ?? []))
const blockThreads = computed(() => threads.value.filter(thread => !thread.orphaned && thread.blockId === selectedBlock.value))
const orphanThreads = computed(() => threads.value.filter(thread => thread.orphaned))
const commentCounts = computed(() => {
  const counts = new Map<string | null, number>()
  for (const thread of threads.value) {
    if (thread.orphaned || thread.resolvedAt) continue
    counts.set(thread.blockId, (counts.get(thread.blockId) ?? 0) + 1)
  }
  return counts
})
const selectedLabel = computed(() => {
  if (selectedBlock.value === null) return 'Whole email'
  const block = view.value?.blocks.find(item => item.id === selectedBlock.value)
  return block ? (block.label || block.type) : 'Block'
})

const ACTION_LABELS: Record<ReviewCommandDetails['command'], string> = {
  comment: 'Add comment',
  resolve_comment: 'Resolve comment',
  submit: 'Submit for review',
  approve: 'Approve',
  request_changes: 'Request changes',
  require_review: 'Require review'
}

async function send(action: PendingReviewAction) {
  action.phase = 'sending'
  action.message = null
  pending.value = action
  try {
    await apiFetch(`/api/email/review/${action.kind}/${action.targetId}/commands`, { method: 'POST', body: action.body })
    pending.value = null
    // Only clear the composer if it still holds exactly what was sent; newer
    // local typing after a failed attempt is never discarded.
    if (action.body.command === 'comment' && draftComment.value.trim() === action.body.body) {
      draftComment.value = ''
      replyTo.value = null
    }
    toast.add({ title: ACTION_LABELS[action.body.command], description: 'Saved.', color: 'success' })
    await load()
  } catch (error) {
    const { kind, code } = classifyReviewError(error)
    action.phase = kind
    action.message = kind === 'unknown'
      ? 'We could not confirm whether this was saved. Retrying sends the same request and cannot apply it twice.'
      : describeReviewError(code, 'This action was not applied.')
    pending.value = { ...action }
  }
}

function act(details: ReviewCommandDetails) {
  if (!view.value || pending.value) return
  void send(pendingAction(props.kind, props.targetId, buildReviewCommand(view.value, details)))
}

function retryPending() {
  if (pending.value) void send({ ...pending.value })
}

async function checkPending() {
  const action = pending.value
  if (!action) return
  try {
    await apiFetch(`/api/email/review/operations/${action.body.operationId}`)
    pending.value = null
    toast.add({ title: ACTION_LABELS[action.body.command], description: 'It was saved.', color: 'success' })
    await load()
  } catch (error) {
    const { kind } = classifyReviewError(error)
    pending.value = {
      ...action,
      message: kind === 'rejected'
        ? 'Not saved yet. Retrying is safe.'
        : 'Still unable to confirm. Try again shortly.'
    }
  }
}

function discardPending() {
  pending.value = null
}

function submitComment() {
  const body = draftComment.value.trim()
  if (!body) return
  act({ command: 'comment', blockId: selectedBlock.value, parentId: replyTo.value, body })
}

function requestChanges() {
  const note = changesNote.value.trim()
  if (!note) return
  showChanges.value = false
  act({ command: 'request_changes', note })
  changesNote.value = ''
}

function formatDate(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col gap-4 @container">
    <div v-if="loading && !view" class="text-sm text-muted">
      Loading review…
    </div>
    <UAlert
      v-else-if="loadError"
      color="neutral"
      variant="subtle"
      icon="i-lucide-info"
      :description="loadError"
    />

    <template v-if="view">
      <section aria-label="Review status" class="space-y-3">
        <ol class="grid grid-cols-3 gap-1">
          <li
            v-for="(step, index) in STEPS"
            :key="step.value"
            class="border-t-2 pt-2 text-sm"
            :class="index <= stepIndex ? (view.state === 'approved' ? 'border-success text-default' : 'border-primary text-default') : 'border-default text-muted'"
            :aria-current="index === stepIndex ? 'step' : undefined"
          >
            <span class="font-medium">{{ step.label }}</span>
          </li>
        </ol>
        <p class="text-sm text-muted">
          Content fingerprint
          <code class="rounded bg-elevated px-1 text-default">{{ shortDigest(view.contentDigest) }}</code>
          <template v-if="view.state === 'approved'">
            — approval {{ view.approvalCurrent ? 'covers this exact version' : 'no longer matches this content' }}.
          </template>
        </p>
        <UAlert
          v-if="view.note && view.state === 'draft'"
          color="warning"
          variant="subtle"
          icon="i-lucide-message-square-warning"
          title="Changes requested"
          :description="view.note"
        />
        <UAlert
          v-if="kind === 'campaign' && view.reviewRequired && !view.approvalCurrent && !frozen"
          color="info"
          variant="subtle"
          icon="i-lucide-shield-check"
          description="This campaign can only be scheduled or sent after this exact content is approved."
        />
        <UAlert
          v-if="frozen"
          color="neutral"
          variant="subtle"
          icon="i-lucide-lock"
          :description="`This campaign is ${view.status}; its content and review decision are frozen.`"
        />

        <div v-if="!frozen" class="flex flex-wrap gap-2">
          <UButton
            v-if="view.state === 'draft'"
            icon="i-lucide-send-horizontal"
            label="Submit for review"
            :loading="busy && pending?.body.command === 'submit'"
            :disabled="!!pending"
            @click="act({ command: 'submit' })"
          />
          <template v-if="view.canReview && view.state === 'in_review'">
            <UButton
              icon="i-lucide-badge-check"
              color="success"
              label="Approve this version"
              :loading="busy && pending?.body.command === 'approve'"
              :disabled="!!pending"
              @click="act({ command: 'approve' })"
            />
            <UButton
              icon="i-lucide-undo-2"
              color="neutral"
              variant="outline"
              label="Request changes"
              :disabled="!!pending"
              @click="showChanges = true"
            />
          </template>
          <UButton
            v-if="view.canReview && view.state === 'approved'"
            icon="i-lucide-undo-2"
            color="neutral"
            variant="ghost"
            label="Withdraw approval"
            :disabled="!!pending"
            @click="showChanges = true"
          />
          <UButton
            v-if="kind === 'campaign' && !view.reviewRequired"
            icon="i-lucide-shield-plus"
            color="neutral"
            variant="outline"
            label="Require review before sending"
            :disabled="!!pending"
            @click="act({ command: 'require_review' })"
          />
        </div>
        <p v-if="!view.canReview && view.state === 'in_review'" class="text-sm text-muted">
          Waiting for an agency creative lead to approve.
        </p>
      </section>

      <UAlert
        v-if="pending && pending.phase !== 'sending'"
        :color="pending.phase === 'unknown' ? 'warning' : 'error'"
        variant="subtle"
        icon="i-lucide-circle-alert"
        :title="`${ACTION_LABELS[pending.body.command]}: ${pending.phase === 'unknown' ? 'outcome unknown' : 'not applied'}`"
        :description="pending.message ?? undefined"
      >
        <template #actions>
          <UButton
            v-if="pending.phase === 'unknown'"
            size="xs"
            label="Retry same request"
            @click="retryPending"
          />
          <UButton
            v-if="pending.phase === 'unknown'"
            size="xs"
            color="neutral"
            variant="outline"
            label="Check status"
            @click="checkPending"
          />
          <UButton
            v-if="pending.phase === 'conflict'"
            size="xs"
            color="neutral"
            variant="outline"
            label="Reload"
            @click="load"
          />
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            label="Discard"
            @click="discardPending"
          />
        </template>
      </UAlert>

      <section aria-label="Comments" class="grid min-h-0 flex-1 grid-cols-1 gap-4 @2xl:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <nav aria-label="Email blocks" class="min-h-0 overflow-auto rounded-md border border-default">
          <UButton
            block
            color="neutral"
            :variant="selectedBlock === null ? 'soft' : 'ghost'"
            class="justify-between rounded-none"
            @click="selectedBlock = null; replyTo = null"
          >
            <span class="truncate">Whole email</span>
            <UBadge v-if="commentCounts.get(null)" size="sm" variant="subtle">
              {{ commentCounts.get(null) }}
            </UBadge>
          </UButton>
          <UButton
            v-for="block in view.blocks"
            :key="block.id"
            block
            color="neutral"
            :variant="selectedBlock === block.id ? 'soft' : 'ghost'"
            class="justify-between rounded-none"
            :style="{ paddingInlineStart: `${0.75 + Math.min(block.depth - 1, 4) * 0.75}rem` }"
            @click="selectedBlock = block.id; replyTo = null"
          >
            <span class="min-w-0 truncate text-left">
              <span class="text-muted">{{ block.type }}</span>
              <template v-if="block.label">
                {{ block.label }}
              </template>
            </span>
            <UBadge v-if="commentCounts.get(block.id)" size="sm" variant="subtle">
              {{ commentCounts.get(block.id) }}
            </UBadge>
          </UButton>
          <p v-if="!view.blocks.length" class="p-3 text-sm text-muted">
            This saved email has no editable blocks; comment on the whole email.
          </p>
        </nav>

        <div class="flex min-h-0 flex-col gap-3">
          <h3 class="truncate text-sm font-semibold">
            {{ selectedLabel }}
          </h3>
          <div class="min-h-0 flex-1 space-y-3 overflow-auto">
            <p v-if="!blockThreads.length" class="text-sm text-muted">
              No comments here yet.
            </p>
            <article
              v-for="thread in blockThreads"
              :key="thread.id"
              class="space-y-2 rounded-md border border-default p-3"
              :class="thread.resolvedAt ? 'opacity-70' : ''"
            >
              <header class="flex items-center justify-between gap-2 text-xs text-muted">
                <span>{{ thread.authorName || 'Team member' }}, {{ formatDate(thread.createdAt) }}</span>
                <UBadge
                  v-if="thread.outdated"
                  size="sm"
                  color="neutral"
                  variant="outline"
                >
                  Earlier version
                </UBadge>
              </header>
              <p class="whitespace-pre-wrap break-words text-sm">
                {{ thread.body }}
              </p>
              <div v-for="reply in thread.replies" :key="reply.id" class="border-l-2 border-default pl-3">
                <p class="text-xs text-muted">
                  {{ reply.authorName || 'Team member' }}, {{ formatDate(reply.createdAt) }}
                </p>
                <p class="whitespace-pre-wrap break-words text-sm">
                  {{ reply.body }}
                </p>
              </div>
              <div class="flex gap-2">
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  icon="i-lucide-reply"
                  label="Reply"
                  :disabled="!!pending"
                  @click="replyTo = thread.id"
                />
                <UButton
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :icon="thread.resolvedAt ? 'i-lucide-rotate-ccw' : 'i-lucide-check'"
                  :label="thread.resolvedAt ? 'Reopen' : 'Resolve'"
                  :disabled="!!pending"
                  @click="act({ command: 'resolve_comment', commentId: thread.id, resolved: !thread.resolvedAt })"
                />
              </div>
            </article>
          </div>

          <form class="space-y-2" @submit.prevent="submitComment">
            <UFormField
              :label="replyTo ? 'Reply' : 'New comment'"
              :help="`Saved against fingerprint ${shortDigest(view.contentDigest)}. Plain text, up to 2,000 characters.`"
            >
              <UTextarea
                v-model="draftComment"
                :rows="3"
                :maxlength="2000"
                autoresize
                class="w-full"
                placeholder="What should change in this block?"
              />
            </UFormField>
            <div class="flex justify-end gap-2">
              <UButton
                v-if="replyTo"
                size="sm"
                color="neutral"
                variant="ghost"
                label="Cancel reply"
                @click="replyTo = null"
              />
              <UButton
                type="submit"
                size="sm"
                icon="i-lucide-message-square-plus"
                :label="replyTo ? 'Reply' : 'Comment'"
                :loading="busy && pending?.body.command === 'comment'"
                :disabled="!draftComment.trim() || !!pending"
              />
            </div>
          </form>
        </div>
      </section>

      <section v-if="orphanThreads.length" aria-label="Comments on removed blocks" class="space-y-2 rounded-md border border-dashed border-default p-3">
        <h3 class="text-sm font-semibold">
          Comments on removed blocks
        </h3>
        <p class="text-xs text-muted">
          These blocks were deleted from the email. Their comments stay attached to the original block and are never moved.
        </p>
        <article v-for="thread in orphanThreads" :key="thread.id" class="text-sm">
          <p class="text-xs text-muted">
            Block {{ thread.blockId }} — {{ thread.authorName || 'Team member' }}, {{ formatDate(thread.createdAt) }}
          </p>
          <p class="whitespace-pre-wrap break-words">
            {{ thread.body }}
          </p>
        </article>
      </section>
    </template>

    <UModal v-model:open="showChanges" :title="view?.state === 'approved' ? 'Withdraw approval' : 'Request changes'">
      <template #content>
        <form class="space-y-4 p-4" @submit.prevent="requestChanges">
          <UFormField label="What needs to change?" required help="The author sees this note when the email returns to draft.">
            <UTextarea
              v-model="changesNote"
              :rows="5"
              :maxlength="2000"
              class="w-full"
            />
          </UFormField>
          <div class="flex justify-end gap-2">
            <UButton
              color="neutral"
              variant="ghost"
              label="Cancel"
              @click="showChanges = false"
            />
            <UButton type="submit" label="Return to draft" :disabled="!changesNote.trim()" />
          </div>
        </form>
      </template>
    </UModal>
  </div>
</template>
