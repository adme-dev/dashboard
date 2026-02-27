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
            <div class="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <UIcon name="i-lucide-link" class="w-5 h-5 text-teal-600" />
            </div>
            <span class="text-[13px] text-[#45474D]/60 dark:text-white/40 font-medium">9 min read</span>
          </div>
          <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
            Connecting Xero
          </h1>
          <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed">
            XeroFlow's Xero integration is the backbone of its financial features. This guide walks you through the OAuth connection process, what data syncs, how two-way flow works, and how to troubleshoot common issues.
          </p>
        </div>

        <!-- Stats Row -->
        <div class="grid grid-cols-3 gap-4 mb-16">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">2-Click</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">OAuth Setup</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Auto</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Continuous Sync</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">2-Way</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Data Flow</div>
          </div>
        </div>

        <!-- Content -->
        <div class="flex flex-col gap-14">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">The authorization flow</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              XeroFlow connects to Xero using OAuth 2.0, the industry-standard authorization protocol. To begin, go to Settings, then Integrations, and click "Connect Xero." You will be redirected to Xero's website where you sign in (if not already) and grant XeroFlow permission to access your organization.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              You will need to be an Admin or Owner in your Xero organization to authorize the connection. The permissions XeroFlow requests include reading and writing invoices, contacts, accounts, and expense claims. XeroFlow does not access payroll or employee data.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              After granting access, you are redirected back to XeroFlow and the connection is established. The authorization token refreshes automatically, so you should not need to reconnect unless you explicitly revoke access in Xero's settings.
            </p>
          </section>

          <!-- Highlight Callout -->
          <div class="rounded-2xl bg-gradient-to-br from-teal-50 to-cyan-50/50 border border-teal-100/50 p-6">
            <div class="flex items-start gap-4">
              <div class="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center flex-shrink-0">
                <UIcon name="i-lucide-lock" class="w-5 h-5 text-teal-600" />
              </div>
              <div>
                <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Secure OAuth 2.0</p>
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">XeroFlow never sees or stores your Xero password. The OAuth 2.0 protocol grants a secure token that refreshes automatically. You can revoke access at any time from your Xero settings, and your client links and data mapping will be preserved for when you reconnect.</p>
              </div>
            </div>
          </div>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">What data syncs</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Once connected, XeroFlow performs an initial sync that pulls in your existing Xero data. This typically takes a few minutes depending on the size of your organization. The following data is synchronized:
            </p>
            <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] divide-y divide-[#121317]/[0.06] dark:divide-white/[0.06] mb-4">
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-book-open" class="w-4 h-4 text-blue-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Chart of Accounts</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Revenue, expense, and asset accounts used for categorization</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-users" class="w-4 h-4 text-violet-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Contacts</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Customers and suppliers, available for client linking</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-file-text" class="w-4 h-4 text-emerald-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Invoices</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Sales invoices with line items, amounts, and payment status</span>
                </div>
              </div>
              <div class="flex items-center gap-3 p-4">
                <UIcon name="i-lucide-credit-card" class="w-4 h-4 text-amber-500 flex-shrink-0" />
                <div>
                  <span class="text-[15px] font-medium text-[#121317] dark:text-white">Expenses</span>
                  <span class="text-[14px] text-[#45474D]/70 dark:text-white/40 ml-2">Expense claims and bills for profitability calculations</span>
                </div>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              After the initial sync, data is kept in sync continuously. Changes made in Xero (new invoices, updated contacts, payment status changes) appear in XeroFlow within minutes. The sync status is visible in Settings under the Xero integration panel.
            </p>
          </section>

          <!-- Feature Grid: Synced Data -->
          <div class="grid sm:grid-cols-3 gap-4">
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
              <div class="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center mb-3">
                <UIcon name="i-lucide-book-open" class="w-4 h-4 text-blue-600" />
              </div>
              <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Accounts & Contacts</p>
              <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Chart of accounts and customer contacts for categorization and linking.</p>
            </div>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
              <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center mb-3">
                <UIcon name="i-lucide-file-text" class="w-4 h-4 text-emerald-600" />
              </div>
              <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Invoices & Bills</p>
              <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Sales invoices with line items, amounts, and real-time payment status.</p>
            </div>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
              <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center mb-3">
                <UIcon name="i-lucide-trending-up" class="w-4 h-4 text-amber-600" />
              </div>
              <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">P&L Reports</p>
              <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Revenue and expense data powering profitability dashboards.</p>
            </div>
          </div>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Two-way data flow</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The Xero integration is not one-directional. XeroFlow can also push data back to Xero. The most important example is the end-of-month (EOM) invoicing engine, which generates invoices within XeroFlow and uploads them directly to Xero as draft invoices.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              When the EOM engine generates an invoice, it creates the invoice in Xero with the correct contact, line items, tax rates, and account codes. The invoice is created as a draft so you can review it in Xero before approving and sending it to the client. Once approved in Xero, the status update flows back to XeroFlow so your dashboards reflect the latest state.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Invoice import and matching</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              All invoices from your connected Xero organization are imported and associated with XeroFlow clients based on the contact link. If a client has a linked Xero contact, their invoices automatically appear in the client's financial tab -- no manual matching required.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              For invoices associated with Xero contacts that have not been linked to a XeroFlow client, they will appear in the Finance section's unmatched queue. From there, you can either link the contact to an existing client or create a new client record. This ensures no invoice data falls through the cracks during initial setup.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Troubleshooting connection issues</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              If the Xero connection shows as disconnected, the most common cause is a token expiration that failed to refresh. This can happen if Xero's servers were temporarily unavailable during the refresh window. To fix it, simply click "Reconnect Xero" in Settings -- you will go through the OAuth flow again and the connection will be restored. Your data mapping and client links are preserved.
            </p>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              If specific data is not syncing (for example, a new invoice does not appear), check the sync status indicator in Settings. It shows the last successful sync time and any errors. Common issues include:
            </p>
            <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 space-y-3 mb-4">
              <div class="flex items-start gap-2.5">
                <UIcon name="i-lucide-alert-circle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed"><strong class="text-[#121317] dark:text-white">Rate limiting</strong> -- Xero limits API calls. If your organization has many invoices, the initial sync may take longer. Subsequent syncs are incremental and much faster.</p>
              </div>
              <div class="flex items-start gap-2.5">
                <UIcon name="i-lucide-alert-circle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed"><strong class="text-[#121317] dark:text-white">Permission changes</strong> -- If your Xero user role was downgraded, the connection may lose write access. Ensure the authorizing user remains an Admin or Advisor in Xero.</p>
              </div>
              <div class="flex items-start gap-2.5">
                <UIcon name="i-lucide-alert-circle" class="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed"><strong class="text-[#121317] dark:text-white">Multi-org access</strong> -- If your Xero account has access to multiple organizations, make sure you authorized the correct one during the OAuth flow.</p>
              </div>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed">
              If you continue to experience issues, contact support with the error details from the sync status panel. We can investigate the Xero API response and resolve the issue quickly.
            </p>
          </section>

          <!-- Next Steps -->
          <section>
            <h2 class="text-[clamp(22px,3vw,28px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Next steps</h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              With Xero connected, you can now set up clients with billing data and explore automation.
            </p>
            <div class="flex flex-col gap-3">
              <NuxtLink
                to="/resources/setting-up-clients"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                    <UIcon name="i-lucide-building-2" class="w-4 h-4 text-amber-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Setting Up Clients</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Link Xero contacts and configure billing</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/first-automation"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-rose-50 flex items-center justify-center">
                    <UIcon name="i-lucide-zap" class="w-4 h-4 text-rose-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Your First Automation</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Automate invoice reminders and status updates</p>
                  </div>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#121317]/30 dark:text-white/20 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink
                to="/resources/quick-start"
                class="flex items-center justify-between p-4 rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] hover:border-[#121317]/15 dark:hover:border-white/15 hover:bg-[#f4f5f7]/50 dark:hover:bg-white/[0.03] transition-all group"
              >
                <div class="flex items-center gap-3">
                  <div class="w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                    <UIcon name="i-lucide-rocket" class="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <span class="text-[15px] font-medium text-[#121317] dark:text-white">Quick Start Guide</span>
                    <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Full setup walkthrough in 10 minutes</p>
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
  title: 'Connecting Xero — XeroFlow',
  description: 'Connect your Xero account to XeroFlow. Step-by-step OAuth setup, automatic syncing, and financial feature activation.',
  ogTitle: 'Connecting Xero — XeroFlow',
  ogDescription: 'Connect your Xero account to XeroFlow. Step-by-step OAuth setup, automatic syncing, and financial feature activation.',
})
</script>
