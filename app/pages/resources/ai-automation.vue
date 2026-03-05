<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Article Content -->
    <div class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-20 md:pb-32">

        <!-- Breadcrumb -->
        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[13px] text-[#45474D]/60 dark:text-white/40 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <!-- Hero -->
        <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
          AI & Automation
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          How XeroFlow uses AI chat, anomaly detection, semantic search, and automation recipes to keep your agency running smarter.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">11 min read</p>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">8</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Analyzers</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">&lt;50ms</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Classification</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">5-signal</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Scoring</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Edge AI</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Inference</div>
          </div>
        </div>

        <!-- Content Sections -->
        <div class="flex flex-col gap-12">

          <!-- Feature Grid -->
          <section>
            <div class="grid sm:grid-cols-3 gap-4">
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-message-square" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">AI Chat</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Natural language queries grounded in your agency data.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-shield-alert" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Anomaly Detection</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">8 analyzers surface spend spikes, deadline risks, and bottlenecks.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-search" class="w-4 h-4 text-violet-600 dark:text-violet-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Semantic Search</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Meaning-based search powered by Cloudflare Vectorize.</p>
              </div>
            </div>
          </section>

          <!-- Section 1 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">AI Chat with @Entity Mentions</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow includes a conversational AI assistant powered by Groq that understands your agency's data. Ask questions in natural language -- "What did we spend on Meta Ads for Acme Corp last month?" or "Show me overdue tasks on the Q1 Campaign board" -- and the AI fetches the relevant context from your tasks, clients, projects, and financial records.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Use <strong class="font-medium text-[#121317] dark:text-white">@mentions</strong> to pin specific entities into the conversation context. Type <code class="text-[13px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">@Acme Corp</code> to reference a client, <code class="text-[13px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">@Website Redesign</code> for a project, or <code class="text-[13px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">@Homepage Mockup</code> for a specific task. Mentioned entities are fetched and placed at the top of the AI context window, so responses are grounded in real data rather than generic advice. Conversations can be pinned for quick access later.
            </p>

            <!-- Highlight Callout -->
            <div class="rounded-2xl bg-gradient-to-br from-violet-50 to-purple-50/50 dark:from-violet-500/10 dark:to-purple-500/5 border border-violet-100/50 dark:border-violet-500/20 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-at-sign" class="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">@Mentions Ground Every Response</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">When you @mention a client, project, or task, the AI fetches that entity's real data and pins it to the top of the context window. Responses are always grounded in facts, not guesswork.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Anomaly Detection: 8 Specialized Analyzers</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The proactive AI agent runs eight independent analyzers in the background, each focused on a specific risk area. These analyzers scan your data on a schedule and surface findings before you need to ask. The eight analyzers cover <strong class="font-medium text-[#121317] dark:text-white">spend anomalies</strong> (unusual daily or weekly spend spikes), <strong class="font-medium text-[#121317] dark:text-white">budget thresholds</strong> (approaching or exceeding limits), <strong class="font-medium text-[#121317] dark:text-white">deadline risks</strong> (tasks likely to miss their due dates), and <strong class="font-medium text-[#121317] dark:text-white">workload imbalances</strong> (team members with disproportionate assignments).
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Additional analyzers monitor <strong class="font-medium text-[#121317] dark:text-white">invoice aging</strong> (overdue client payments), <strong class="font-medium text-[#121317] dark:text-white">campaign performance degradation</strong> (declining metrics over time), <strong class="font-medium text-[#121317] dark:text-white">stale tasks</strong> (items with no updates for an extended period), and <strong class="font-medium text-[#121317] dark:text-white">approval bottlenecks</strong> (client approvals stuck waiting). Each finding includes a severity level, supporting evidence, and a recommended action.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Semantic Search with Vectorize</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Traditional keyword search misses results when people use different terminology. XeroFlow's semantic search uses Cloudflare Vectorize to understand the <em>meaning</em> behind your queries, not just the exact words. When you search for "logo project for the coffee brand," it finds tasks related to branding deliverables for your cafe client, even if no task contains those exact words.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Behind the scenes, tasks, clients, briefs, and knowledge base entries are embedded as vectors using a change-detection system. Only modified items are re-embedded, keeping the index fresh without reprocessing your entire dataset. The search combines semantic similarity with recency scoring, entity importance weighting, and diversity penalties to return the most relevant and varied results.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Intent Classification</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every query to the AI system first passes through an intent classifier that determines what kind of question is being asked. The classifier distinguishes between financial queries, process questions, task searches, time tracking inquiries, and general knowledge requests. Each intent type triggers a different retrieval strategy optimised for that data domain.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Classification runs on the edge using Cloudflare Workers AI for sub-50ms latency, with a Groq fallback for ambiguous cases. The system also supports LoRA adapter routing, meaning you can fine-tune classification accuracy over time using your own agency's conversation data without retraining the base model.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Automation Recipes</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Automations in XeroFlow follow a <strong class="font-medium text-[#121317] dark:text-white">trigger → action</strong> model. A trigger is an event that happens on a board -- a status changes to "Done," a due date arrives, a person is assigned, or a new task is created. An action is what happens in response -- send a notification, post a message in a chat channel, update another column, move the task to a different group, or send an email via Resend.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You build recipes visually by selecting a trigger type, configuring its conditions, and chaining one or more actions. Recipes are scoped to a specific board and can be toggled on or off individually. Common patterns include notifying an account manager when a task is marked for review, emailing a client when a proof is uploaded, and archiving tasks automatically when their status reaches "Completed."
            </p>
          </section>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Proactive Recommendations</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The AI agent does not wait to be asked. Based on the anomaly detectors and your team's activity patterns, it generates actionable recommendations that appear in the Activity Hub. These suggestions range from "Consider redistributing 4 tasks from Sarah to Tom this week" to "Acme Corp's Meta spend is trending 18% above budget -- review campaign targeting."
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Recommendations are scored by relevance and urgency, then delivered through the "For You" tab in the Activity Hub. The system learns from your interactions -- if you consistently dismiss a certain type of recommendation, it reduces the frequency. If you act on recommendations, it surfaces similar insights more prominently.
            </p>
          </section>

          <!-- Next Steps -->
          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/work-management" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Work Management Deep Dive</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Boards, columns, views, and real-time collaboration</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Xero sync, invoicing, and ad spend management</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/integrations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Integrations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Groq, Vectorize, and 6 more platform integrations</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

    <!-- Footer -->
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'AI & Automation — XeroFlow',
  description: 'How XeroFlow uses AI chat, anomaly detection, semantic search, and automation recipes to keep your agency running smarter.',
  ogTitle: 'AI & Automation — XeroFlow',
  ogDescription: 'How XeroFlow uses AI chat, anomaly detection, semantic search, and automation recipes to keep your agency running smarter.',
})
</script>
