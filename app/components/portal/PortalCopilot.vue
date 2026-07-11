<script setup lang="ts">
/**
 * Portal Assistant — the docked customer co-pilot (portal-agent spec §8). A floating launcher opens a
 * slideover chat over /api/portal/ai/chat (Tier 1 read-only; Tier 2 confirm cards when writes are on).
 * Gated by the public aiPortalEnabled mirror — the server endpoints are the real boundary (they 404
 * when off). Neutral "Portal Assistant" branding for v1 (per the locked product decision).
 */
interface ChatMsg { role: 'user' | 'assistant', content: string }
interface ProposedAction { proposalId: string, resolved: any, toolName: string }
interface ChatResponse { conversationId: string, reply: string, proposedAction?: ProposedAction | null }

const { public: pub } = useRuntimeConfig()
const enabled = computed(() => !!(pub as any).aiPortalEnabled)

const open = ref(false)
const sending = ref(false)
const draft = ref('')
const conversationId = ref<string | null>(null)
const messages = ref<ChatMsg[]>([])
const pending = ref<ProposedAction | null>(null)
const confirming = ref(false)
const toast = useToast()
const apiFetch = $fetch as <T = unknown>(
  request: string,
  options?: { method?: string, body?: unknown }
) => Promise<T>

const suggestions = [
  'What needs my approval?',
  'How are my projects going?',
  'Show my latest invoices',
  'How did my social do last month?',
]

async function send(text?: string) {
  const content = (text ?? draft.value).trim()
  if (!content || sending.value) return
  draft.value = ''
  messages.value.push({ role: 'user', content })
  pending.value = null
  sending.value = true
  try {
    const res = await apiFetch<ChatResponse>('/api/portal/ai/chat', {
      method: 'POST',
      body: { content, conversationId: conversationId.value },
    })
    conversationId.value = res.conversationId
    messages.value.push({ role: 'assistant', content: res.reply })
    pending.value = res.proposedAction ?? null
  } catch (e: any) {
    messages.value.push({ role: 'assistant', content: 'Sorry — I couldn’t answer that just now. Please try again.' })
  } finally {
    sending.value = false
  }
}

async function confirmAction() {
  if (!pending.value || confirming.value) return
  confirming.value = true
  try {
    const res = await apiFetch<{ ok: boolean, summary?: string, error?: string }>('/api/portal/ai/confirm-action', {
      method: 'POST',
      body: { proposalId: pending.value.proposalId },
    })
    if (res.ok) {
      messages.value.push({ role: 'assistant', content: res.summary || '✅ Done.' })
      pending.value = null
    } else {
      toast.add({ title: 'Couldn’t complete that', description: res.error || 'Try again.', color: 'error' })
    }
  } catch (e: any) {
    toast.add({ title: 'Couldn’t complete that', description: e?.data?.statusMessage || 'Try again.', color: 'error' })
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div v-if="enabled">
    <!-- Launcher -->
    <UButton
      v-if="!open"
      icon="i-lucide-sparkles"
      size="lg"
      class="fixed bottom-5 right-5 z-40 rounded-full shadow-lg"
      @click="open = true"
    >
      Assistant
    </UButton>

    <USlideover v-model:open="open" title="Portal Assistant" description="Ask about your projects, approvals, invoices and results.">
      <template #body>
        <div class="flex h-full flex-col">
          <!-- Conversation -->
          <div class="flex-1 space-y-3 overflow-y-auto">
            <!-- Empty state — an invitation to act -->
            <div v-if="!messages.length" class="py-6">
              <p class="text-sm text-muted">Hi! I can help you understand your portal. Try:</p>
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

            <!-- Tier-2 confirm card -->
            <div v-if="pending" class="rounded-lg border border-warning/40 bg-warning/5 p-3">
              <p class="text-sm font-medium text-highlighted">Confirm this action</p>
              <p class="mt-0.5 text-xs text-muted">{{ pending.resolved?.title ? `${pending.resolved.action} — ${pending.resolved.title}` : 'Please review and confirm.' }}</p>
              <div class="mt-2 flex gap-2">
                <UButton size="xs" color="primary" :loading="confirming" @click="confirmAction">Confirm</UButton>
                <UButton size="xs" color="neutral" variant="ghost" :disabled="confirming" @click="pending = null">Dismiss</UButton>
              </div>
            </div>

            <div v-if="sending" class="flex justify-start">
              <div class="rounded-lg bg-elevated px-3 py-2 text-sm text-muted">…</div>
            </div>
          </div>

          <!-- Composer -->
          <form class="mt-3 flex items-end gap-2 border-t border-default pt-3" @submit.prevent="send()">
            <UTextarea
              v-model="draft"
              :rows="1" autoresize
              placeholder="Ask your assistant…"
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
