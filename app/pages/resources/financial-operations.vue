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
          Financial Operations
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          Everything your finance team needs: Xero sync, end-of-month invoicing, ad spend tracking, and real-time P&L dashboards.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">10 min read</p>

        <!-- Stats Row -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Minutes</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Sync Time</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">2</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Ad Platforms</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Auto</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">EOM Invoicing</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">90 days</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Cashflow Forecast</div>
          </div>
        </div>

        <!-- Content Sections -->
        <div class="flex flex-col gap-12">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Xero Sync Setup</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow connects to your Xero organisation through OAuth 2.0. Once authorised, the platform establishes a two-way sync that keeps contacts, invoices, chart of accounts, and expense data in lockstep between both systems. The initial sync imports your existing Xero contacts and maps them to XeroFlow client records automatically.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can trigger a manual resync at any time, or let the scheduled sync run on its configured interval. Conflicts are handled with a last-write-wins policy, and a detailed sync log shows exactly what changed, when, and in which direction. If the Xero connection token expires, the system prompts for reauthorisation without losing any queued changes.
            </p>
          </section>

          <!-- Feature Grid -->
          <section>
            <div class="grid sm:grid-cols-3 gap-4">
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-refresh-cw" class="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Xero Sync</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Two-way sync for contacts, invoices, expenses, and chart of accounts.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-file-text" class="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">EOM Engine</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Auto-generate monthly invoices from retainers, hours, and ad spend.</p>
              </div>
              <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
                <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
                  <UIcon name="i-lucide-trending-up" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
                </div>
                <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Ad Spend Tracking</p>
                <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Daily Meta and Google Ads spend with budget alerts and audit trails.</p>
              </div>
            </div>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">End-of-Month Invoice Generation</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The EOM engine automates your monthly billing cycle. At the end of each month, it aggregates billable items -- retainer fees, ad spend pass-throughs, project hours, and one-off charges -- into draft invoices per client. Each line item includes a description, quantity, unit price, tax code, and account mapping that aligns with your Xero chart of accounts.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Before any invoice is sent, you review the drafts in a dedicated EOM dashboard. Adjust line items, add notes, or exclude specific charges. Once approved, invoices are uploaded directly to Xero as approved invoices with the correct contact, due date, and reference number. An archived PDF copy is stored in R2 for your records.
            </p>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Ad Spend Tracking: Meta & Google</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow connects to both <strong class="font-medium text-[#121317] dark:text-white">Meta Ads</strong> (via OAuth and the Graph API) and <strong class="font-medium text-[#121317] dark:text-white">Google Ads</strong> (via the REST API) to pull daily spend data automatically. Each connection is configured per ad account, and you can link multiple ad accounts to a single XeroFlow client.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Spend data is broken down by campaign, ad set, and day. The system tracks daily totals, running monthly totals, and compares actual spend against configured budgets. When spend approaches a budget threshold, alerts are sent to the assigned media buyer and account manager. All budget changes are recorded in an audit trail so you can trace who adjusted a limit and when.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Profit & Loss Dashboards</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The P&L dashboard pulls revenue from Xero invoices and expenses from both Xero and ad platform spend data to calculate margins per client, per project, and agency-wide. Revenue and cost figures update as new invoices are synced and new spend data arrives, giving you a near-real-time view of profitability.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Filter by date range, client, or project to drill into specific periods. The dashboard highlights clients with declining margins, projects that have exceeded their budget, and months where overall profitability has shifted. Charts visualise trends over time so you can spot patterns before they become problems.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Budget Management & Alerts</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Set monthly budgets at the client level, the campaign level, or both. Budgets are configured with a dollar amount and optional alert thresholds -- for example, notify at 80% and again at 95% of the limit. Alerts are delivered as in-app notifications and can optionally trigger email notifications through Resend.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Every budget adjustment is logged with the user, timestamp, previous value, and new value. This audit trail is visible in the client's financial history and can be exported for reporting. Budget data also feeds into the AI anomaly detection system, which can flag unusual spending patterns even before a hard threshold is breached.
            </p>
          </section>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Cashflow Forecasting</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow projects your upcoming cashflow based on outstanding invoices, scheduled retainer payments, known ad spend commitments, and recurring expenses. The forecast looks 30, 60, and 90 days ahead, showing expected inflows and outflows on a weekly or monthly basis.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Invoice aging data from Xero highlights overdue payments and their impact on projected cash positions. You can model scenarios by adjusting expected payment dates or adding anticipated new business, giving your finance team a practical tool for planning hiring, large purchases, or investment decisions.
            </p>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Take control of agency finances</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[400px] mx-auto">Automate invoicing, track ad spend, and see profitability in real time.</p>
            <NuxtLink to="/auth/login" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Get Started
            </NuxtLink>
          </div>

          <!-- Next Steps -->
          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/work-management" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Work Management Deep Dive</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Boards, views, columns, and real-time collaboration</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/client-portal-admin" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Client Portal Administration</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Client logins, permissions, and approval workflows</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/integrations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Integrations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Xero, Meta Ads, Google Ads, and more</p>
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
  title: 'Financial Operations — XeroFlow',
  description: 'Manage agency finances with XeroFlow. Xero integration, EOM invoicing, ad spend tracking, P&L dashboards, and budget management.',
  ogTitle: 'Financial Operations — XeroFlow',
  ogDescription: 'Manage agency finances with XeroFlow. Xero integration, EOM invoicing, ad spend tracking, P&L dashboards, and budget management.',
})
</script>
