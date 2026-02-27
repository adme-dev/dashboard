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
          Integrations
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          A reference guide to every platform XeroFlow connects with -- authentication methods, data flows, and capabilities.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">8 integrations</p>

        <!-- Stats Row -->
        <div class="grid grid-cols-3 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">8</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Integrations</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Real-time</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Data Sync</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Edge AI</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Inference</div>
          </div>
        </div>

        <!-- Integration Grid -->
        <div class="flex flex-col gap-8">

          <!-- Xero -->
          <section id="xero" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-[#13B5EA]/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-calculator" class="w-6 h-6 text-[#13B5EA]" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Xero</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Accounting & invoicing</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              XeroFlow's deepest integration. OAuth 2.0 authentication establishes a two-way data flow between your Xero organisation and XeroFlow. Contacts, invoices, expenses, and chart of accounts sync automatically on a configured schedule, with manual resync available at any time. The EOM invoice engine generates draft invoices from XeroFlow data and uploads them directly to Xero as approved invoices.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">OAuth 2.0</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Two-way sync</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Contacts</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Invoices</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Chart of accounts</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">EOM engine</span>
            </div>
          </section>

          <!-- Meta Ads -->
          <section id="meta-ads" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-[#1877F2]/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-megaphone" class="w-6 h-6 text-[#1877F2]" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Meta Ads</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Advertising spend & campaigns</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Connect Meta (Facebook/Instagram) ad accounts via OAuth to pull daily spend data through the Graph API. XeroFlow syncs campaign-level and ad-set-level spend breakdowns, tracks daily and monthly running totals, and compares actual spend against configured budgets. Multiple ad accounts can be linked to a single client for consolidated reporting.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">OAuth connection</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Graph API</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Daily spend sync</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Campaign breakdowns</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Budget alerts</span>
            </div>
          </section>

          <!-- Google Ads -->
          <section id="google-ads" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-[#34A853]/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-bar-chart-3" class="w-6 h-6 text-[#34A853]" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Google Ads</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Search & display advertising</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Google Ads integration uses the REST API to pull performance and spend data. Daily spend totals are synced at the campaign level, with breakdowns available by ad group. Budget management includes configurable alert thresholds and an audit trail that logs every budget change with the user, timestamp, and previous value. Spend data feeds into P&L dashboards and the EOM invoicing engine for automated pass-through billing.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">REST API</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Spend tracking</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Campaign data</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Budget alerts</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Audit trail</span>
            </div>
          </section>

          <!-- Resend -->
          <section id="resend" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-mail" class="w-6 h-6 text-violet-600" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Resend</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Transactional email delivery</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              All outbound email from XeroFlow -- notifications, client portal invitations, approval alerts, and automation-triggered messages -- is delivered through Resend. Email templates are managed within XeroFlow and rendered server-side before sending. Delivery status is tracked per message, and failed deliveries are logged for troubleshooting. Resend also powers the inbound email processing pipeline via Cloudflare Email Routing for email-to-board features.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Transactional email</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Templates</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Delivery tracking</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Inbound processing</span>
            </div>
          </section>

          <!-- Cloudflare -->
          <section id="cloudflare" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-cloud" class="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Cloudflare</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Infrastructure platform</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              XeroFlow runs entirely on the Cloudflare network. <strong class="font-medium text-[#121317] dark:text-white">Pages</strong> hosts the application. <strong class="font-medium text-[#121317] dark:text-white">R2</strong> provides S3-compatible object storage for file uploads, EOM invoice archives, and training data exports. <strong class="font-medium text-[#121317] dark:text-white">Workers</strong> handle edge functions including the email processing worker and AI agent worker. <strong class="font-medium text-[#121317] dark:text-white">Durable Objects</strong> power real-time chat rooms and board event broadcasting. <strong class="font-medium text-[#121317] dark:text-white">KV</strong> serves as a caching layer. <strong class="font-medium text-[#121317] dark:text-white">Workers AI</strong> runs edge inference for intent classification. <strong class="font-medium text-[#121317] dark:text-white">Vectorize</strong> hosts the semantic search index. <strong class="font-medium text-[#121317] dark:text-white">Queues</strong> manage async job processing for embedding, training extraction, and background tasks.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Pages</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">R2 storage</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Workers</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Durable Objects</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">KV</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">AI</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Vectorize</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Queues</span>
            </div>
          </section>

          <!-- Monday.com -->
          <section id="monday" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-kanban" class="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Monday.com</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Board import & migration</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              For agencies migrating from Monday.com, XeroFlow provides a board import tool that maps Monday column types to XeroFlow equivalents. The importer handles status columns, people assignments, date fields, number columns, and text content. Group structure and task hierarchy are preserved during migration. Imported data lands in XeroFlow's modern column system, ready for immediate use across all five board views.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Board import</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Column mapping</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Data migration</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Group preservation</span>
            </div>
          </section>

          <!-- Groq -->
          <section id="groq" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-brain" class="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Groq</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">LLM inference engine</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Groq provides the primary LLM inference for XeroFlow's AI features. The AI chat engine sends user queries along with retrieved context to Groq's API for response generation. Groq also serves as the fallback for intent classification when edge inference produces low-confidence results. Responses stream in real time so users see answers as they are generated. The integration supports LoRA adapter routing for fine-tuned model variants trained on your agency's data.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">LLM inference</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">AI chat</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Streaming responses</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Intent fallback</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">LoRA support</span>
            </div>
          </section>

          <!-- Vectorize -->
          <section id="vectorize" class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-6 md:p-8 scroll-mt-24">
            <div class="flex items-start gap-4 mb-5">
              <div class="w-12 h-12 rounded-xl bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-search" class="w-6 h-6 text-teal-600" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Vectorize</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Semantic search & embeddings</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Cloudflare Vectorize hosts the semantic search index that powers XeroFlow's intelligent search. Tasks, clients, briefs, and knowledge base entries are embedded as vectors using a change-detection system -- only modified items are re-processed, keeping the index current without full reindexing. The composite retrieval scoring system combines semantic similarity, recency, entity importance, intent matching, and diversity penalties to rank results. Vectorize also supports the AI context retrieval pipeline, providing semantically relevant background data for chat conversations.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Semantic search</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Vector embeddings</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Change detection</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Composite scoring</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Knowledge base</span>
            </div>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50/50 border border-blue-100/50 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-plug" class="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">One Connected Platform</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">All 8 integrations feed data into a single system. Financial data from Xero and ad platforms flows into P&L dashboards. AI models from Groq and Vectorize power search and recommendations. Everything stays in sync so your team works from one source of truth.</p>
              </div>
            </div>
          </div>

          <!-- Next Steps -->
          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Related Guides</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">How Xero, Meta Ads, and Google Ads integrations power your finances</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/ai-automation" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">AI & Automation</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">How Groq and Vectorize power AI features</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/work-management" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Work Management Deep Dive</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Boards, real-time SSE, and Monday.com migration</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Experience XeroFlow</h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/auth/xeroflow" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">XeroFlow</NuxtLink>
              <NuxtLink to="/portal/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Client Portal</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
            </div>
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/privacy" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Privacy</NuxtLink>
              <NuxtLink to="/terms" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Terms</NuxtLink>
              <NuxtLink to="/support" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Support</NuxtLink>
            </div>
          </div>
        </div>
        <div class="overflow-hidden mb-10">
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] dark:text-white leading-[0.9] tracking-[-0.04em] select-none">XeroFlow</div>
        </div>
        <div class="pt-6 border-t border-black/[0.06] dark:border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2.5">
            <div class="w-5 h-5 bg-[#121317] dark:bg-white rounded flex items-center justify-center">
              <span class="text-white dark:text-[#121317] text-[8px] font-semibold">XF</span>
            </div>
            <span class="text-[13px] text-[#45474D] dark:text-white/50">ADME Digital</span>
          </div>
          <div class="flex items-center gap-6 text-[13px] text-[#45474D]/60 dark:text-white/40">
            <NuxtLink to="/about" class="hover:text-[#45474D] dark:hover:text-white transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] dark:hover:text-white transition-colors">Terms</NuxtLink>
            <span>&copy; {{ new Date().getFullYear() }}</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Integrations — XeroFlow',
  description: 'XeroFlow integrates with Xero, Meta Ads, Google Ads, Resend, Cloudflare, Monday.com, Groq, and Vectorize for a connected agency platform.',
  ogTitle: 'Integrations — XeroFlow',
  ogDescription: 'XeroFlow integrates with Xero, Meta Ads, Google Ads, Resend, Cloudflare, Monday.com, Groq, and Vectorize for a connected agency platform.',
})
</script>
