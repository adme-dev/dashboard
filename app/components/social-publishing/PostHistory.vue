<script setup lang="ts">
import type { SocialWallPost } from '~/types'

const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ post: SocialWallPost | null }>()
interface HistoryEvent {
  id: string
  action: string
  created_at: string
  actor_id: string | null
  actor_name: string | null
  account_name: string | null
  platform: string | null
  details: { source?: string, status?: string, fields?: string[], approvalReset?: boolean }
}
const events = ref<HistoryEvent[]>([])
const busy = ref(false)
const error = ref('')
const nextOffset = ref<number | null>(null)
let request = 0
const labels: Record<string, string> = {
  post_created: 'Draft created', post_updated: 'Draft updated', approval_requested: 'Approval requested',
  post_approved: 'Approved', post_rejected: 'Changes requested', post_scheduled: 'Scheduled',
  post_published: 'Publishing result', client_approval_approved: 'Client approved',
  client_approval_rejected: 'Client declined', client_approval_revision_requested: 'Client requested changes'
}
function date(value: string) {
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'long' })
}
async function load(offset = 0) {
  const post = props.post
  if (!post || !open.value) return
  const version = ++request
  busy.value = true
  error.value = ''
  try {
    const data = await $fetch<{ events: HistoryEvent[], nextOffset: number | null }>(`/api/agency/social/publishing/posts/${post.id}/history`, { query: { offset } })
    if (version !== request) return
    events.value = offset ? [...events.value, ...data.events] : data.events
    nextOffset.value = data.nextOffset
  } catch {
    if (version === request) error.value = 'Could not load the publishing history. Try again.'
  } finally {
    if (version === request) busy.value = false
  }
}
watch(() => [props.post?.id, props.post?.client_id, open.value], () => {
  request++
  events.value = []
  nextOffset.value = null
  error.value = ''
  busy.value = false
  if (open.value) void load()
})
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Publishing history"
    description="Recorded actions, people and delivery results for this post."
    :ui="{ content: 'sm:max-w-xl' }"
  >
    <template #body>
      <div v-if="post" class="space-y-6">
        <div class="space-y-3 rounded-md border border-default p-4">
          <p class="whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">
            {{ post.content }}
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="account in post.accounts"
              :key="account.id"
              color="neutral"
              variant="subtle"
            >
              {{ account.platform }} · {{ account.account_name || account.platform_account_id }}
            </UBadge>
          </div>
          <p class="text-xs text-muted">
            Created {{ date(post.created_at) }} · {{ post.status.replaceAll('_', ' ') }}
          </p>
        </div>
        <UAlert
          v-if="error"
          color="error"
          variant="soft"
          title="History unavailable"
          :description="error"
        />
        <UButton
          v-if="error"
          color="neutral"
          variant="outline"
          @click="load(nextOffset || 0)"
        >
          Try again
        </UButton>
        <div v-if="busy && !events.length" class="space-y-4">
          <USkeleton v-for="i in 3" :key="i" class="h-20" />
        </div>
        <p v-else-if="!events.length && !error" class="text-sm text-muted">
          No audit events were recorded for this post. Older activity may predate the publishing archive.
        </p>
        <ol v-else class="space-y-0 border-l border-default ml-2">
          <li v-for="item in events" :key="item.id" class="relative pb-6 pl-5 last:pb-0">
            <span class="absolute -left-1.5 top-1 size-3 rounded-full border-2 border-default bg-primary" aria-hidden="true" />
            <div class="flex flex-wrap items-start justify-between gap-2">
              <h3 class="text-sm font-semibold">
                {{ labels[item.action] || item.action.replaceAll('_', ' ') }}
              </h3>
              <UBadge
                v-if="item.details.status"
                color="neutral"
                variant="subtle"
                size="xs"
              >
                {{ item.details.status.replaceAll('_', ' ') }}
              </UBadge>
            </div>
            <p class="mt-1 text-sm">
              {{ item.actor_name || (item.actor_id ? 'Recorded actor (name unavailable)' : 'XeroFlow automation') }}
            </p>
            <time :datetime="item.created_at" class="mt-1 block text-xs text-muted">{{ date(item.created_at) }}</time>
            <p v-if="item.account_name" class="mt-2 text-xs">
              {{ item.platform }} · {{ item.account_name }}
            </p>
            <p v-if="item.details.source" class="mt-1 text-xs text-muted">
              {{ item.details.source === 'manual' ? 'Manual action' : item.details.source }}
            </p>
            <p v-if="item.details.fields?.length" class="mt-2 text-xs text-muted [overflow-wrap:anywhere]">
              Updated: {{ item.details.fields.join(', ') }}
            </p>
            <p v-if="item.details.approvalReset" class="mt-1 text-xs text-warning">
              Changes required a new approval.
            </p>
          </li>
        </ol>
        <UButton
          v-if="nextOffset !== null && !error"
          color="neutral"
          variant="outline"
          :loading="busy"
          @click="load(nextOffset)"
        >
          Load earlier activity
        </UButton>
      </div>
    </template>
  </USlideover>
</template>
