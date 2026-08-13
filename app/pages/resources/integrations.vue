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
              Connect Meta (Facebook/Instagram) ad accounts via OAuth to pull daily spend data through the Graph API. XeroFlow syncs campaign-level and ad-set-level spend breakdowns, tracks daily and monthly running totals, and compares actual spend against configured budgets. Multiple ad accounts can be linked to a single client for consolidated reporting. For vehicle inventory, XeroFlow checks the permissions Meta actually granted, discovers business-owned or shared catalogues, attaches a server-derived scheduled feed, requests an import, and stores provider-readback evidence. Meta app review and business-role requirements remain explicit operator gates.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">OAuth connection</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Graph API</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Daily spend sync</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Campaign breakdowns</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Budget alerts</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Meta catalogue delivery</span>
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
                <UIcon name="i-lucide-mail" class="w-6 h-6 text-violet-600 dark:text-violet-400" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Resend</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Campaign and fallback email delivery</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              Resend continues to deliver campaign mail, notifications, approval alerts, and automation-triggered messages. It also provides a bounded fallback for client portal authentication while Cloudflare Email Sending remains in beta. Email templates are managed within XeroFlow and rendered server-side before delivery, and Resend lifecycle webhooks continue to power campaign tracking and suppression handling.
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
                <UIcon name="i-lucide-cloud" class="w-6 h-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Cloudflare</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Infrastructure platform</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              XeroFlow runs entirely on the Cloudflare network. <strong class="font-medium text-[#121317] dark:text-white">Pages</strong> hosts the application. <strong class="font-medium text-[#121317] dark:text-white">Email Service</strong> sends client portal magic links and invitations through a private, sender-restricted Worker, while Email Routing handles inbound workflows. Its lifecycle events can flow through Queues to Workers for delivery automation and operational monitoring. <strong class="font-medium text-[#121317] dark:text-white">R2</strong> provides S3-compatible object storage for file uploads, EOM invoice archives, and training data exports. <strong class="font-medium text-[#121317] dark:text-white">Workers</strong> handle edge functions including email processing and AI agents. <strong class="font-medium text-[#121317] dark:text-white">Durable Objects</strong> power real-time chat rooms and board event broadcasting. <strong class="font-medium text-[#121317] dark:text-white">KV</strong> serves as a caching layer. <strong class="font-medium text-[#121317] dark:text-white">Workers AI</strong> supports controlled inference. The <strong class="font-medium text-[#121317] dark:text-white">dedicated CRM Vectorize index</strong> is reserved for controlled CRM semantic assistance after authorized indexing; other XeroFlow features use separate Vectorize indexes for their own bounded purposes. <strong class="font-medium text-[#121317] dark:text-white">Queues</strong> manage asynchronous work, including the dedicated CRM indexing path when that off-by-default capability is enabled.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Pages</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">R2 storage</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Workers</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Email Service</span>
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
                <UIcon name="i-lucide-kanban" class="w-6 h-6 text-rose-600 dark:text-rose-400" />
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
                <UIcon name="i-lucide-brain" class="w-6 h-6 text-amber-600 dark:text-amber-400" />
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
                <UIcon name="i-lucide-search" class="w-6 h-6 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h2 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Vectorize</h2>
                <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Controlled CRM retrieval infrastructure</p>
              </div>
            </div>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-5">
              The dedicated CRM Vectorize path is used only for controlled CRM semantic assistance in approved agency-assistant contexts; other XeroFlow features use their own separate Vectorize paths. The CRM capability is off by default. Authorized indexing covers people, companies, and opportunities; it is asynchronous, and a record is eligible only after its current revision reaches confirmed index state. Visible and portal CRM ranking remains keyword-based.
            </p>
            <div class="flex flex-wrap gap-2">
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Controlled CRM assist</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Authorized indexing</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Confirmed state</span>
              <span class="text-[12px] text-[#45474D]/70 dark:text-white/40 px-2.5 py-1 rounded-full bg-[#f4f5f7] dark:bg-white/[0.06]">Off by default</span>
            </div>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-blue-50 to-sky-50/50 dark:from-blue-500/10 dark:to-sky-500/5 border border-blue-100/50 dark:border-blue-500/20 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-plug" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">One Connected Platform</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Each integration has its own bounded purpose. Financial data from Xero and ad platforms flows into P&amp;L dashboards; controlled CRM semantic assistance uses Workers AI and Vectorize only after its separate rollout and indexing checks pass.</p>
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
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">How AI features and controlled CRM retrieval are bounded</p>
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
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Integrations — XeroFlow',
  description: 'XeroFlow integrations, including off-by-default Vectorize infrastructure for authorized, confirmed CRM indexing and controlled agency-assistant retrieval.',
  ogTitle: 'Integrations — XeroFlow',
  ogDescription: 'XeroFlow integrations, including off-by-default Vectorize infrastructure for authorized, confirmed CRM indexing and controlled agency-assistant retrieval.',
})
</script>
