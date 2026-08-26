<script setup lang="ts">
import { createAiChatSubmissionBody, postAiChatSubmission } from '~/utils/aiChatTransport'
import { idempotencyKey } from '~/utils/idempotencyKey'
/**
 * Office co-pilot dock (virtual-office Mode A). Embeds the agency co-pilot in the office, room-scoped:
 * each turn passes the current `room` (officeId + who's present) to /api/agency/ai/chat so the engine
 * enriches the prompt with room context (membership-gated server-side). Reuses the existing tool loop —
 * no media path. Gated by the public aiToolsEnabled mirror (the server flag + RBAC are the real boundary).
 */
const props = defineProps<{
  officeId: string | null
  meetingId?: string | null
  presentUserIds?: string[]
}>()

interface ChatMsg { role: 'user' | 'assistant', content: string }
interface SendResponse { message: { content: string }, proposedAction?: { proposalId: string, resolved: any, toolName?: string } | null }

const { public: pub } = useRuntimeConfig()
const enabled = computed(() => !!(pub as any).aiToolsEnabled)

const open = ref(false)
const sending = ref(false)
const draft = ref('')
const conversationId = ref<string | null>(null)
const messages = ref<ChatMsg[]>([])
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown, headers?: Record<string, string> }
) => Promise<T>

const suggestions = [
  'Who’s around right now?',
  'Make a task from what we just discussed',
  'Pull up this client’s pacing',
]

async function ensureConversation(): Promise<string> {
  if (conversationId.value) return conversationId.value
  const conv = await apiFetch<{ id: string }>('/api/agency/ai/chat/conversations', {
    method: 'POST',
    body: { title: 'Office assistant' },
    headers: { 'Idempotency-Key': idempotencyKey('ai-conversation-create') }
  })
  conversationId.value = conv.id
  return conv.id
}

async function send(text?: string) {
  const content = (text ?? draft.value).trim()
  if (!content || sending.value || !props.officeId) return
  draft.value = ''
  messages.value.push({ role: 'user', content })
  sending.value = true
  try {
    const id = await ensureConversation()
    const body = createAiChatSubmissionBody({
      content,
      room: {
        officeId: props.officeId,
        meetingId: props.meetingId || undefined,
        presentUserIds: props.presentUserIds?.length ? props.presentUserIds : undefined,
      }
    })
    const res = await postAiChatSubmission<SendResponse>(
      apiFetch,
      `/api/agency/ai/chat/conversations/${id}/messages`,
      body
    )
    messages.value.push({ role: 'assistant', content: res.message?.content || 'Done.' })
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: 'Sorry — I couldn’t answer that just now. Please try again.' })
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div v-if="enabled && officeId">
    <UButton
      v-if="!open"
      icon="i-lucide-sparkles"
      size="lg"
      class="fixed bottom-5 right-5 z-40 rounded-full shadow-lg"
      @click="() => { open = true }"
    >
      Assistant
    </UButton>

    <USlideover v-model:open="open" title="Office Assistant" description="Ask about this room, your work, or act on what was just discussed.">
      <template #body>
        <div class="flex h-full flex-col">
          <div class="flex-1 space-y-3 overflow-y-auto">
            <div v-if="!messages.length" class="py-6">
              <p class="text-sm text-muted">I know this room. Try:</p>
              <div class="mt-3 flex flex-col gap-2">
                <UButton
                  v-for="s in suggestions" :key="s"
                  variant="soft" color="neutral" size="sm" class="justify-start"
                  @click="send(s)"
                >
                  {{ s }}
                </UButton>
              </div>
            </div>

            <div
              v-for="(m, i) in messages" :key="i"
              class="flex" :class="m.role === 'user' ? 'justify-end' : 'justify-start'"
            >
              <div
                class="max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm"
                :class="m.role === 'user' ? 'bg-primary text-inverted' : 'bg-elevated text-default'"
              >
                {{ m.content }}
              </div>
            </div>

            <div v-if="sending" class="flex justify-start">
              <div class="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">…</div>
            </div>
          </div>

          <form class="mt-3 flex items-end gap-2 border-t border-default pt-3" @submit.prevent="send()">
            <UTextarea
              v-model="draft"
              :rows="1" autoresize
              placeholder="Ask the office assistant…"
              class="flex-1"
              :disabled="sending"
              @keydown.enter.exact.prevent="send()"
            />
            <UButton type="submit" icon="i-lucide-send" :loading="sending" :disabled="!draft.trim()" />
          </form>
        </div>
      </template>
    </USlideover>
  </div>
</template>
