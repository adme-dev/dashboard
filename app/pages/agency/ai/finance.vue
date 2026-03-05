<script setup lang="ts">
definePageMeta({ layout: 'agency' })

const { user } = useAuth()
const toast = useToast()
const isAdmin = computed(() => user.value?.role === 'owner' || user.value?.role === 'admin')

const {
  conversations, activeConversation, messages,
  loading, sending,
  fetchConversations, createConversation, loadConversation,
  sendMessage, archiveConversation, togglePin,
} = useAiChat()

// Fetch conversations on mount + load shared conversation from URL
onMounted(async () => {
  await fetchConversations()
  const convId = useRoute().query.conv as string
  if (convId) {
    try { await loadConversation(convId) } catch { /* not found — ignore */ }
  }
})

const activeTab = ref('chat')
const tabs = computed(() => {
  const base = [
    { label: 'Chat', value: 'chat', icon: 'i-lucide-message-circle' },
    { label: 'Advisor', value: 'advisor', icon: 'i-lucide-brain' },
  ]
  if (isAdmin.value) {
    base.push({ label: 'Embeddings', value: 'embeddings', icon: 'i-lucide-database' })
  }
  return base
})

// ─── Chat ───
const chatInput = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

const quickPrompts = [
  { label: 'Cash position', icon: 'i-lucide-banknote', prompt: 'What is our current cash position and risk level?' },
  { label: 'Overdue invoices', icon: 'i-lucide-alert-triangle', prompt: 'Which invoices are overdue and by how much?' },
  { label: 'Expense trends', icon: 'i-lucide-trending-up', prompt: 'How have our expenses changed compared to last month? Show a chart comparing the top expense categories.' },
  { label: 'P&L summary', icon: 'i-lucide-calculator', prompt: 'Give me a P&L summary for the current period with a breakdown chart.' },
  { label: 'Client balances', icon: 'i-lucide-users', prompt: 'Which clients have the most outstanding balance? Include a chart.' },
  { label: 'Subscriptions', icon: 'i-lucide-repeat', prompt: 'What are our top subscription costs this month? Show a donut chart breakdown.' },
]

async function handleSend(prompt?: string) {
  const text = prompt || chatInput.value.trim()
  if (!text || sending.value) return
  chatInput.value = ''

  if (!activeConversation.value) {
    await createConversation(text.slice(0, 60))
  }
  try {
    await sendMessage(text)
    await nextTick()
    scrollToBottom()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed to get response', color: 'error' })
  }
}

async function startNewChat() {
  await createConversation()
}

async function selectConversation(id: string) {
  if (activeConversation.value?.id === id) return
  await loadConversation(id)
  await nextTick()
  scrollToBottom()
}

function scrollToBottom() {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Filter conversations: show financial-topic ones + recent
const pinnedConversations = computed(() => conversations.value.filter(c => c.isPinned))
const unpinnedConversations = computed(() => conversations.value.filter(c => !c.isPinned).slice(0, 25))

async function handlePin(id: string) {
  try {
    await togglePin(id)
  } catch {
    toast.add({ title: 'Error', description: 'Failed to pin conversation', color: 'error' })
  }
}

async function handleShare(id: string) {
  const url = `${window.location.origin}/agency/ai/finance?conv=${id}`
  try {
    await navigator.clipboard.writeText(url)
    toast.add({ title: 'Link copied', description: 'Share this link with team members', color: 'success' })
  } catch {
    // Fallback for non-HTTPS
    toast.add({ title: 'Share link', description: url, color: 'info' })
  }
}

// (shared conversation loaded in the single onMounted above)

// ─── Chart Parsing ───
// Parse ```chart blocks from AI responses and split into text + chart segments
type ContentSegment = { type: 'text', content: string } | { type: 'chart', spec: any }

const VALID_CHART_TYPES = ['bar', 'line', 'donut', 'stacked-bar']

function isValidChartSpec(obj: any): boolean {
  if (!obj || typeof obj.type !== 'string') return false
  if (!VALID_CHART_TYPES.includes(obj.type)) return false
  if (!Array.isArray(obj.data) || obj.data.length === 0 || obj.data.length > 50) return false
  // Line and donut need at least 2 data points to be meaningful
  if ((obj.type === 'line' || obj.type === 'donut') && obj.data.length < 2) return false
  return true
}

function parseContentSegments(text: string): ContentSegment[] {
  const segments: ContentSegment[] = []
  const chartBlockRegex = /```chart\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match

  while ((match = chartBlockRegex.exec(text)) !== null) {
    // Text before chart
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    // Chart block — try to parse JSON, with fixup for common AI mistakes
    try {
      let raw = match[1].trim()
      // Fix common AI JSON errors: $42,500.00 → 42500.00
      raw = raw.replace(/\$(\d[\d,]*\.?\d*)/g, (_m, num) => num.replace(/,/g, ''))
      const spec = JSON.parse(raw)
      if (isValidChartSpec(spec)) {
        segments.push({ type: 'chart', spec })
      } else {
        segments.push({ type: 'text', content: match[0] })
      }
    } catch {
      segments.push({ type: 'text', content: match[0] })
    }
    lastIndex = match.index + match[0].length
  }
  // Remaining text
  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }
  return segments.length ? segments : [{ type: 'text', content: text }]
}

// Safe markdown renderer — escapes HTML first, then applies safe markdown transforms
function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  // Bold, italic, code
  html = html
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code class="px-1 py-0.5 rounded bg-[var(--ui-bg)] text-xs">$1</code>')
  // Links (only internal paths)
  html = html.replace(/\[(.+?)\]\((\/.+?)\)/g, '<a href="$2" class="text-[var(--ui-primary)] underline">$1</a>')
  // Headings
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-base font-semibold mt-3 mb-1">$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-lg font-semibold mt-4 mb-2">$1</h2>')
  // Tables (markdown pipe tables → HTML tables)
  html = html.replace(/^(\|.+\|)\n(\|[-| :]+\|)\n((?:\|.+\|\n?)+)/gm, (_match, headerRow, _separator, bodyRows) => {
    const headers = headerRow.split('|').filter((c: string) => c.trim()).map((c: string) => `<th class="px-3 py-1.5 text-left text-xs font-medium text-[var(--ui-text-muted)] border-b border-[var(--ui-border-accented)]">${c.trim()}</th>`)
    const rows = bodyRows.trim().split('\n').map((row: string) => {
      const cells = row.split('|').filter((c: string) => c.trim()).map((c: string) => `<td class="px-3 py-1.5 text-sm border-b border-[var(--ui-border-accented)]">${c.trim()}</td>`)
      return `<tr>${cells.join('')}</tr>`
    })
    return `<div class="overflow-x-auto my-3"><table class="min-w-full"><thead><tr>${headers.join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`
  })
  // Lists
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 list-disc">$1</li>')
  html = html.replace(/^\d+\. (.+)$/gm, '<li class="ml-4 list-decimal">$1</li>')
  html = html.replace(/(<li class="ml-4 list-disc">.*?<\/li>\n?)+/g, (m) => `<ul class="my-2">${m}</ul>`)
  html = html.replace(/(<li class="ml-4 list-decimal">.*?<\/li>\n?)+/g, (m) => `<ol class="my-2">${m}</ol>`)
  // Paragraphs
  html = html.replace(/\n\n/g, '<br><br>')
  html = html.replace(/\n/g, '<br>')
  return html
}

// Detect if a message contains financial numbers (for visual emphasis)
function hasFinancialData(content: string): boolean {
  return /\$[\d,]+/.test(content) || /\d+\.?\d*%/.test(content)
}

// ─── Financial Advisor Tab (AI-Driven) ───
// Advisor is fully self-contained — uses its own conversation, doesn't pollute the Chat tab
const advisorMessages = ref<Array<{ role: string; content: string }>>([])
const advisorLoading = ref(false)
const advisorConvId = ref<string | null>(null)

const advisorPrompts = [
  { label: 'Full Financial Review', icon: 'i-lucide-clipboard-check', prompt: 'Run a comprehensive financial health check. Review our cash position, outstanding invoices, expense trends, P&L margins, and subscription costs. Provide specific recommendations and highlight any risks. Include charts for expense breakdown and revenue vs expenses trend.' },
  { label: 'Cash Flow Forecast', icon: 'i-lucide-trending-up', prompt: 'Analyze our cash position and forecast the next 30 days. Consider outstanding receivables, upcoming expenses, and payment patterns. Include a chart showing projected cash flow.' },
  { label: 'Cost Optimization', icon: 'i-lucide-scissors', prompt: 'Review all our expenses and identify cost optimization opportunities. Look at subscription costs, vendor concentration, fixed vs variable expenses, and any unusual spending patterns. Show expense breakdown as a donut chart.' },
  { label: 'Client Profitability', icon: 'i-lucide-users', prompt: 'Analyze client profitability. Compare revenue from each client against their associated ad spend and any outstanding invoices. Identify our most and least profitable clients. Include a comparison chart.' },
  { label: 'Overdue Collections', icon: 'i-lucide-alert-triangle', prompt: 'Review all overdue invoices and create a collections priority list. Include aging analysis, total exposure, and recommended actions for each overdue client. Show aging breakdown as a bar chart.' },
  { label: 'Monthly Comparison', icon: 'i-lucide-bar-chart-3', prompt: 'Compare this month\'s financial performance against last month. Cover revenue, expenses, net profit, margins, and cash position. Use charts to visualize the trends.' },
]

let _advisorConvCreating: Promise<string> | null = null

async function runAdvisor(prompt: string) {
  if (advisorLoading.value) return
  advisorLoading.value = true
  advisorMessages.value.push({ role: 'user', content: prompt })

  try {
    // Create a dedicated advisor conversation if we don't have one (guard against concurrent calls)
    if (!advisorConvId.value) {
      if (!_advisorConvCreating) {
        _advisorConvCreating = $fetch<any>('/api/agency/ai/chat/conversations', {
          method: 'POST',
          body: { title: 'Financial Advisor' },
        }).then(c => c.id)
      }
      advisorConvId.value = await _advisorConvCreating
      _advisorConvCreating = null
    }

    // Send directly via API — bypasses useAiChat shared state
    const result = await $fetch<any>(
      `/api/agency/ai/chat/conversations/${advisorConvId.value}/messages`,
      { method: 'POST', body: { content: prompt } }
    )

    if (result?.message?.content) {
      advisorMessages.value.push({ role: 'assistant', content: result.message.content })
    }
  } catch (err: any) {
    advisorMessages.value.push({ role: 'assistant', content: 'Failed to generate analysis. Please try again.' })
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Advisor failed', color: 'error' })
  } finally {
    advisorLoading.value = false
  }
}

// ─── Advisor Chat Input ───
const advisorInput = ref('')

function handleAdvisorSend() {
  const text = advisorInput.value.trim()
  if (!text || advisorLoading.value) return
  advisorInput.value = ''
  runAdvisor(text)
}

// ─── Embeddings Tab (admin) ───
const { data: embedStatus, refresh: refreshEmbedStatus } = useFetch('/api/ai/finance/status', { lazy: true })
const reembedding = ref(false)
const reembedType = ref<string | null>(null)

async function reembedAll() {
  reembedding.value = true
  try {
    const result = await $fetch<any>('/api/ai/finance/embed', { method: 'POST' })
    toast.add({ title: 'Done', description: `${result.processed} embedded, ${result.skipped} skipped, ${result.errors} errors`, color: 'success' })
    refreshEmbedStatus()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed', color: 'error' })
  } finally { reembedding.value = false }
}

async function reembedSingle(type: string) {
  reembedType.value = type
  try {
    const result = await $fetch<any>('/api/ai/finance/embed', { method: 'POST', body: { types: [type] } })
    toast.add({ title: `${type} embedded`, description: result.details?.[0] || 'Done', color: 'success' })
    refreshEmbedStatus()
  } catch (err: any) {
    toast.add({ title: 'Error', description: err.data?.statusMessage || 'Failed', color: 'error' })
  } finally { reembedType.value = null }
}

const embedTypes = [
  { key: 'expenses', label: 'Expenses', icon: 'i-lucide-credit-card' },
  { key: 'invoices', label: 'Invoices', icon: 'i-lucide-receipt' },
  { key: 'pnl', label: 'P&L', icon: 'i-lucide-pie-chart' },
  { key: 'cash', label: 'Cash Position', icon: 'i-lucide-banknote' },
  { key: 'clients', label: 'Client Profiles', icon: 'i-lucide-users' },
]

function getEmbedTypeInfo(typeKey: string) {
  const types = (embedStatus.value as any)?.types || []
  return types.find((t: any) => t.type === `fin-${typeKey}`) || null
}

function fmtAUD(n: number) { return '$' + Math.round(n).toLocaleString('en-AU') }
</script>

<template>
  <div class="flex-1 min-w-0">
    <UDashboardPanel>
      <UDashboardNavbar title="Finance AI">
        <template #right>
          <UTabs v-model="activeTab" :items="tabs" size="sm" />
        </template>
      </UDashboardNavbar>

      <!-- ═══ Chat Tab — Two Column Layout ═══ -->
      <div v-if="activeTab === 'chat'" class="flex flex-1 overflow-hidden" style="height: calc(100vh - 64px)">

        <!-- Left Sidebar: Conversation History -->
        <div class="w-64 shrink-0 border-r border-[var(--ui-border-accented)] flex flex-col bg-[var(--ui-bg)]">
          <div class="p-3 border-b border-[var(--ui-border-accented)]">
            <UButton label="New Chat" icon="i-lucide-plus" block size="sm" @click="startNewChat" />
          </div>
          <div class="flex-1 overflow-y-auto">
            <div v-if="loading && !conversations.length" class="p-3 text-sm text-[var(--ui-text-muted)]">Loading...</div>

            <!-- Pinned section -->
            <template v-if="pinnedConversations.length">
              <div class="px-3 pt-3 pb-1 text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wider flex items-center gap-1.5">
                <UIcon name="i-lucide-pin" class="text-[10px]" />
                Pinned
              </div>
              <div
                v-for="conv in pinnedConversations"
                :key="conv.id"
                class="px-3 py-2 cursor-pointer border-b border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-colors group"
                :class="{ 'bg-[var(--ui-bg-elevated)]': activeConversation?.id === conv.id }"
                @click="selectConversation(conv.id)"
              >
                <div class="flex items-center justify-between gap-1">
                  <div class="text-sm font-medium truncate flex-1">{{ conv.title || 'New chat' }}</div>
                  <div class="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <UButton icon="i-lucide-share-2" size="2xs" variant="ghost" color="neutral" @click.stop="handleShare(conv.id)" />
                    <UButton icon="i-lucide-pin-off" size="2xs" variant="ghost" color="neutral" @click.stop="handlePin(conv.id)" />
                    <UButton icon="i-lucide-trash-2" size="2xs" variant="ghost" color="neutral" @click.stop="archiveConversation(conv.id)" />
                  </div>
                </div>
                <div class="text-xs text-[var(--ui-text-muted)] mt-0.5">{{ conv.messageCount }} messages</div>
              </div>
            </template>

            <!-- Recent section -->
            <div v-if="pinnedConversations.length && unpinnedConversations.length" class="px-3 pt-3 pb-1 text-xs font-medium text-[var(--ui-text-muted)] uppercase tracking-wider">
              Recent
            </div>
            <div
              v-for="conv in unpinnedConversations"
              :key="conv.id"
              class="px-3 py-2 cursor-pointer border-b border-[var(--ui-border-accented)] hover:bg-[var(--ui-bg-elevated)] transition-colors group"
              :class="{ 'bg-[var(--ui-bg-elevated)]': activeConversation?.id === conv.id }"
              @click="selectConversation(conv.id)"
            >
              <div class="flex items-center justify-between gap-1">
                <div class="text-sm font-medium truncate flex-1">{{ conv.title || 'New chat' }}</div>
                <div class="flex items-center shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <UButton icon="i-lucide-share-2" size="2xs" variant="ghost" color="neutral" @click.stop="handleShare(conv.id)" />
                  <UButton icon="i-lucide-pin" size="2xs" variant="ghost" color="neutral" @click.stop="handlePin(conv.id)" />
                  <UButton icon="i-lucide-trash-2" size="2xs" variant="ghost" color="neutral" @click.stop="archiveConversation(conv.id)" />
                </div>
              </div>
              <div class="text-xs text-[var(--ui-text-muted)] mt-0.5">{{ conv.messageCount }} messages</div>
            </div>

            <div v-if="!loading && !conversations.length" class="p-3 text-sm text-[var(--ui-text-muted)]">
              No conversations yet
            </div>
          </div>
        </div>

        <!-- Right: Main Chat Area -->
        <div class="flex-1 flex flex-col min-w-0">
          <!-- Messages -->
          <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
            <!-- Empty state: show quick prompts -->
            <div v-if="!messages.length && !sending" class="flex flex-col items-center justify-center h-full">
              <UIcon name="i-lucide-brain" class="text-4xl text-[var(--ui-text-muted)] mb-4" />
              <h2 class="text-lg font-semibold mb-1">Finance AI</h2>
              <p class="text-sm text-[var(--ui-text-muted)] mb-6 text-center max-w-md">
                Ask questions about expenses, invoices, cash flow, P&amp;L, and more. Powered by your live Xero data.
              </p>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl">
                <button
                  v-for="qp in quickPrompts"
                  :key="qp.prompt"
                  class="flex items-center gap-2 p-3 rounded-lg border border-[var(--ui-border-accented)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-primary)] transition-colors text-left"
                  @click="handleSend(qp.prompt)"
                >
                  <UIcon :name="qp.icon" class="text-[var(--ui-text-muted)] shrink-0" />
                  <span class="text-sm">{{ qp.label }}</span>
                </button>
              </div>
            </div>

            <!-- Messages list -->
            <template v-for="msg in messages" :key="msg.id">
              <!-- User message -->
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-[var(--ui-primary)] text-white">
                  <div class="text-sm whitespace-pre-wrap">{{ msg.content }}</div>
                </div>
              </div>
              <!-- Assistant message with chart support -->
              <div v-else class="flex gap-3">
                <div class="w-7 h-7 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] flex items-center justify-center shrink-0 mt-0.5">
                  <UIcon name="i-lucide-brain" class="text-xs" />
                </div>
                <div class="flex-1 min-w-0">
                  <template v-for="(segment, sIdx) in parseContentSegments(msg.content)" :key="sIdx">
                    <!-- Text segment -->
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div
                      v-if="segment.type === 'text'"
                      class="prose prose-sm dark:prose-invert max-w-none text-sm"
                      :class="{ 'bg-[var(--ui-bg-elevated)] rounded-lg p-3 border border-[var(--ui-border-accented)]': hasFinancialData(segment.content) && sIdx === 0 }"
                      v-html="renderMarkdown(segment.content)"
                    />
                    <!-- Chart segment -->
                    <FinanceInlineChart
                      v-else-if="segment.type === 'chart'"
                      :spec="segment.spec"
                    />
                  </template>
                  <div v-if="msg.latencyMs" class="text-xs text-[var(--ui-text-muted)] mt-1">
                    {{ (msg.latencyMs / 1000).toFixed(1) }}s · {{ msg.model || 'AI' }}
                  </div>
                </div>
              </div>
            </template>

            <!-- Sending indicator -->
            <div v-if="sending" class="flex gap-3">
              <div class="w-7 h-7 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-brain" class="text-xs animate-pulse" />
              </div>
              <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
                <div class="flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 0ms" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 150ms" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 300ms" />
                </div>
                Analyzing your financial data...
              </div>
            </div>
          </div>

          <!-- ChatGPT-style Input -->
          <div class="border-t border-[var(--ui-border-accented)] p-4">
            <div class="max-w-3xl mx-auto relative">
              <div class="flex items-end gap-2 bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] rounded-2xl px-4 py-2.5 focus-within:border-[var(--ui-primary)] transition-colors">
                <textarea
                  v-model="chatInput"
                  rows="1"
                  placeholder="Ask about expenses, invoices, cash flow, P&L..."
                  class="flex-1 bg-transparent resize-none outline-none text-sm max-h-32 leading-relaxed"
                  @keydown.enter.exact.prevent="handleSend()"
                  @input="(e: Event) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px' }"
                />
                <UButton
                  icon="i-lucide-arrow-up"
                  size="sm"
                  :loading="sending"
                  :disabled="!chatInput.trim()"
                  class="rounded-full shrink-0"
                  @click="handleSend()"
                />
              </div>
              <div class="text-center mt-2 text-xs text-[var(--ui-text-muted)]">
                Finance AI uses your live Xero data and embedded financial history
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Advisor Tab — AI-Driven Analysis with Chat ═══ -->
      <div v-else-if="activeTab === 'advisor'" class="flex-1 flex flex-col" style="height: calc(100vh - 64px)">
        <!-- Scrollable content area -->
        <div class="flex-1 overflow-y-auto p-4 sm:p-6">
          <div class="max-w-4xl mx-auto space-y-6">

            <!-- Quick analysis cards (always shown, compact when results exist) -->
            <div>
              <div v-if="!advisorMessages.length" class="text-center mb-6">
                <UIcon name="i-lucide-brain" class="text-3xl text-[var(--ui-text-muted)] mb-2" />
                <h2 class="text-lg font-semibold">Financial Advisor</h2>
                <p class="text-sm text-[var(--ui-text-muted)] mt-1">
                  Select an analysis type or ask a question. The AI will review your live financial data and provide insights with charts.
                </p>
              </div>

              <div :class="advisorMessages.length ? 'flex flex-wrap gap-2' : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3'">
                <button
                  v-for="ap in advisorPrompts"
                  :key="ap.label"
                  :disabled="advisorLoading"
                  :class="advisorMessages.length
                    ? 'flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--ui-border-accented)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-primary)] transition-all text-xs disabled:opacity-50'
                    : 'flex items-start gap-3 p-4 rounded-xl border border-[var(--ui-border-accented)] bg-[var(--ui-bg-elevated)] hover:border-[var(--ui-primary)] hover:shadow-sm transition-all text-left disabled:opacity-50'"
                  @click="runAdvisor(ap.prompt)"
                >
                  <UIcon :name="ap.icon" :class="advisorMessages.length ? 'text-sm text-[var(--ui-primary)]' : 'text-lg text-[var(--ui-primary)] mt-0.5 shrink-0'" />
                  <span :class="advisorMessages.length ? '' : 'text-sm font-medium'">{{ ap.label }}</span>
                </button>
              </div>
            </div>

            <!-- Advisor conversation -->
            <template v-for="(msg, mIdx) in advisorMessages" :key="mIdx">
              <div v-if="msg.role === 'user'" class="flex justify-end">
                <div class="max-w-[75%] px-4 py-2.5 rounded-2xl rounded-br-md bg-[var(--ui-primary)] text-white">
                  <div class="text-sm whitespace-pre-wrap">{{ msg.content }}</div>
                </div>
              </div>
              <div v-else class="flex gap-3">
                <div class="w-7 h-7 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] flex items-center justify-center shrink-0 mt-0.5">
                  <UIcon name="i-lucide-brain" class="text-xs" />
                </div>
                <div class="flex-1 min-w-0">
                  <template v-for="(segment, sIdx) in parseContentSegments(msg.content)" :key="sIdx">
                    <!-- eslint-disable-next-line vue/no-v-html -->
                    <div
                      v-if="segment.type === 'text'"
                      class="prose prose-sm dark:prose-invert max-w-none text-sm"
                      :class="{ 'bg-[var(--ui-bg-elevated)] rounded-lg p-3 border border-[var(--ui-border-accented)]': hasFinancialData(segment.content) && sIdx === 0 }"
                      v-html="renderMarkdown(segment.content)"
                    />
                    <FinanceInlineChart
                      v-else-if="segment.type === 'chart'"
                      :spec="segment.spec"
                    />
                  </template>
                </div>
              </div>
            </template>

            <!-- Loading indicator -->
            <div v-if="advisorLoading" class="flex gap-3">
              <div class="w-7 h-7 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-brain" class="text-xs animate-pulse" />
              </div>
              <div class="flex items-center gap-2 text-sm text-[var(--ui-text-muted)]">
                <div class="flex gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 0ms" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 150ms" />
                  <span class="w-1.5 h-1.5 rounded-full bg-current animate-bounce" style="animation-delay: 300ms" />
                </div>
                Running financial analysis...
              </div>
            </div>
          </div>
        </div>

        <!-- Advisor chat input -->
        <div class="border-t border-[var(--ui-border-accented)] p-4">
          <div class="max-w-3xl mx-auto relative">
            <div class="flex items-end gap-2 bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)] rounded-2xl px-4 py-2.5 focus-within:border-[var(--ui-primary)] transition-colors">
              <textarea
                v-model="advisorInput"
                rows="1"
                placeholder="Ask a follow-up question or request a specific analysis..."
                class="flex-1 bg-transparent resize-none outline-none text-sm max-h-32 leading-relaxed"
                @keydown.enter.exact.prevent="handleAdvisorSend()"
                @input="(e: Event) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 128) + 'px' }"
              />
              <UButton
                icon="i-lucide-arrow-up"
                size="sm"
                :loading="advisorLoading"
                :disabled="!advisorInput.trim()"
                class="rounded-full shrink-0"
                @click="handleAdvisorSend()"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ═══ Embeddings Tab ═══ -->
      <div v-else-if="activeTab === 'embeddings'" class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-lg font-semibold">Financial Embedding Status</h3>
            <p class="text-sm text-[var(--ui-text-muted)]">{{ (embedStatus as any)?.totalVectors || 0 }} total vectors</p>
          </div>
          <UButton label="Re-embed All" icon="i-lucide-refresh-cw" :loading="reembedding" @click="reembedAll" />
        </div>
        <div class="space-y-2">
          <div v-for="et in embedTypes" :key="et.key" class="flex items-center justify-between p-3 rounded-lg bg-[var(--ui-bg-elevated)] border border-[var(--ui-border-accented)]">
            <div class="flex items-center gap-3">
              <UIcon :name="et.icon" class="text-[var(--ui-text-muted)]" />
              <div>
                <div class="font-medium">{{ et.label }}</div>
                <div class="text-sm text-[var(--ui-text-muted)]">
                  <template v-if="getEmbedTypeInfo(et.key)">{{ getEmbedTypeInfo(et.key).count }} vectors · Last: {{ new Date(getEmbedTypeInfo(et.key).last_embedded).toLocaleDateString() }}</template>
                  <template v-else>No embeddings yet</template>
                </div>
              </div>
            </div>
            <UButton size="sm" variant="soft" icon="i-lucide-refresh-cw" :loading="reembedType === et.key" @click="reembedSingle(et.key)" />
          </div>
        </div>
      </div>
    </UDashboardPanel>
  </div>
</template>
