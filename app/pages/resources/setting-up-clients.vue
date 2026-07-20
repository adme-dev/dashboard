<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <!-- Article -->
    <article class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-16 md:pb-24">

        <!-- Breadcrumb -->
        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[14px] text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <!-- Hero -->
        <div class="mb-16">
          <div class="flex items-center gap-3 mb-6">
            <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-building-2" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">7 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Setting Up Clients
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            Clients are central to everything in XeroFlow -- projects, invoices, ad spend, and portal access all tie back to a client record. This guide covers creating clients, linking them to Xero, and configuring their portal experience.
          </p>
        </div>

        <!-- Feature Grid: Client Features -->
        <div class="grid sm:grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-globe" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Client Portal</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Give clients governed access to CRM, campaign analytics, leads, shared work, and billing.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-file-text" class="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Briefs & Projects</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Organize work with structured briefs that link directly to board tasks.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-receipt" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Billing & Invoices</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Link Xero contacts for auto-synced invoices and profitability tracking.</p>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Creating a client record</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Navigate to the Clients section from your sidebar and click "New Client." Enter the client's company name, primary contact details, and any notes that help your team understand the relationship. The client name is how they will appear across boards, invoices, and reports, so keep it consistent with how your team refers to them.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can also add the client's industry, website, and physical address. While these fields are optional, they become useful for AI-powered insights and reporting later -- for example, the AI can group performance data by industry or flag trends specific to certain client types.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Linking Xero contacts</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              If you have connected Xero (see the Connecting Xero guide), you can link each client to their corresponding Xero contact. On the client detail page, click "Link Xero Contact" and search for the matching contact in your Xero organization. The search matches on company name, contact name, and email.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Once linked, invoices from Xero automatically appear in the client's financial tab, and the end-of-month invoicing engine can generate new invoices directly to this contact. Revenue, expenses, and profitability metrics also start flowing into the client's dashboard card. This link is the foundation of XeroFlow's financial reporting at the client level.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Configuring portal access</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The client portal gives each client a dedicated workspace for CRM, campaign analytics, leads, measurement, projects, briefs, approvals, meetings, shared assets, social workflows, and billing. To enable portal access for a client, go to their client detail page and open the "Portal" tab.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              From here, you can invite client contacts by email. Each contact receives a separate login and can be assigned individual permissions:
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-folder-open" class="w-4 h-4 text-blue-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">View Projects</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">See project status, tasks, and timelines</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Approve Work</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Review and approve or request changes on deliverables</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-receipt" class="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">View Invoices</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Access billing history and current invoices</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-message-square" class="w-4 h-4 text-violet-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Add Comments</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Leave feedback on tasks and deliverables</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-chart-no-axes-combined" class="w-4 h-4 text-cyan-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">View Analytics</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">See campaign performance, lead volume, outcomes, and trends</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-file-plus-2" class="w-4 h-4 text-rose-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Submit Requests</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Create briefs, job requests, and support items</span>
                </div>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Permissions are per-contact, so one client might have a marketing manager with analytics, leads, approvals, and request access while a CFO only sees invoices. You can change permissions at any time without interrupting the client's session.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-amber-50 to-orange-50/50 dark:from-amber-500/10 dark:to-orange-500/5 border border-amber-100/50 dark:border-amber-500/20 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lightbulb" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Portal Permissions Are Per-Contact</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Each person at a client company can have different portal permissions. Give the marketing manager full project access while limiting the CFO to invoice viewing only. This granular control means you never overshare sensitive project details.</p>
              </div>
            </div>
          </div>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Setting up billing and retainers</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The "Billing" tab on each client record lets you configure how you charge this client. You can set a monthly retainer amount, hourly rate, or mark the client as project-based billing. This information feeds into the end-of-month invoicing engine and helps XeroFlow calculate profitability.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              For retainer clients, set the monthly amount and any rollover rules (whether unused hours carry forward). For hourly clients, set the default rate -- individual team members can have different rates configured in the Time section. The EOM engine uses these rates when auto-generating invoice line items.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Connecting ad accounts</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              If you manage digital advertising for a client, you can link their Meta Ads and Google Ads accounts to their client record. This lets XeroFlow pull in daily spend data, campaign breakdowns, and performance metrics that appear on the client's dashboard and feed into budget management.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              On the client detail page, open the "Ad Accounts" tab and connect the relevant platform accounts. Once connected, spend data syncs daily and you can set budget caps that trigger alerts when campaigns approach their limits. This data also powers the AI anomaly detection system, which flags unusual spend patterns.
            </p>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Start managing clients today</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[400px] mx-auto">Create your first client record, link Xero, and give them portal access in minutes.</p>
            <NuxtLink to="/auth/login" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Get Started
            </NuxtLink>
          </div>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              With your clients configured, explore these guides to connect the financial and automation layers.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/resources/connecting-xero"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-teal-50 dark:bg-teal-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-link" class="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Connecting Xero</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">OAuth setup and two-way sync</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/first-automation"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-zap" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Your First Automation</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Automate client notifications and updates</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/board-basics"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                    <UIcon name="i-lucide-kanban" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Board Basics</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Create boards for client work</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </article>

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
  title: 'Setting Up Clients — XeroFlow',
  description: 'Configure client profiles in XeroFlow. Link Xero contacts and ad accounts, manage billing, and set up portal access for CRM, analytics, leads, work, and approvals.',
  ogTitle: 'Setting Up Clients — XeroFlow',
  ogDescription: 'Create the client record that connects CRM, campaigns, leads, portal access, project delivery, and billing.',
})
</script>
