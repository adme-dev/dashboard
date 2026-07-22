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
          Client Portal Administration
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          Set up client access, configure permissions, and govern CRM, campaign reporting, shared work, approvals, and billing.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">9 min read</p>

        <!-- Feature Grid -->
        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-contact-round" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">CRM &amp; Leads</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Share scoped contacts, opportunities, leads, and follow-up outcomes.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-chart-no-axes-combined" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Campaigns &amp; Measurement</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Expose approved performance, lead, and measurement evidence.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-folder-check" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Work &amp; Reviews</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Coordinate jobs, briefs, meetings, files, and approval history.</p>
          </div>
          <div class="rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4">
            <div class="w-9 h-9 rounded-lg bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center mb-3">
              <UIcon name="i-lucide-shield-check" class="w-4 h-4 text-rose-600 dark:text-rose-400" />
            </div>
            <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-1">Billing &amp; Access</p>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40">Control invoices, analytics, approvals, requests, and access per contact.</p>
          </div>
        </div>

        <!-- Content Sections -->
        <div class="flex flex-col gap-12">

          <!-- Section 1 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Setting Up Client Logins</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The Client Portal uses a separate authentication system from your internal staff login. Clients authenticate via cookie-based sessions rather than JWT tokens, and their access is automatically scoped to their own client record -- they can never see another client's data.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              To create a client login, navigate to the client's record in XeroFlow and open the Portal Access section. Enter the client contact's email address and send an invitation. The recipient receives an email with a secure link to set their password and access the portal. You can invite multiple contacts per client, each with their own login credentials and individual permission sets.
            </p>
          </section>

          <!-- Section 2 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Configuring Permissions</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Each client portal user has granular permissions that control exactly what they can see and do. Core controls include:
            </p>
            <ul class="list-none flex flex-col gap-3 mb-4">
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-folder-open" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canViewProjects</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Controls access to client-visible projects, status, tasks, timelines, and shared deliverables.</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-receipt" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canViewInvoices</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Allows the client user to view their invoices and billing history in the portal. When disabled, the Invoices section is hidden entirely from their navigation.</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-check-circle" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canApproveWork</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Grants the ability to approve or request revisions on deliverables submitted for review. Without this permission, the user can view approval items but cannot take action on them.</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-message-square" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canAddComments</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Enables the user to leave comments on projects, approvals, and deliverables. This is useful for client contacts who need to provide feedback but should not have approval authority.</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-chart-no-axes-combined" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canViewAnalytics</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Shows campaign performance, lead volume, outcome trends, and approved exports for the client account.</p>
                </div>
              </li>
              <li class="flex items-start gap-3">
                <div class="w-6 h-6 rounded-md bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5">
                  <UIcon name="i-lucide-file-plus-2" class="w-3.5 h-3.5 text-[#121317] dark:text-white" />
                </div>
                <div>
                  <p class="text-[15px] text-[#121317] dark:text-white font-medium">canSubmitRequests</p>
                  <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">Allows the contact to submit structured briefs, job requests, and support items from the portal.</p>
                </div>
              </li>
            </ul>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Permissions are set per user, not per client, so you can give a marketing director full access while limiting a junior contact to view-only. Changes take effect immediately -- no logout required.
            </p>

            <!-- Highlight Callout -->
            <div class="rounded-2xl bg-gradient-to-br from-rose-50 to-pink-50/50 dark:from-rose-500/10 dark:to-pink-500/5 border border-rose-100/50 dark:border-rose-500/20 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-shield" class="w-5 h-5 text-rose-600 dark:text-rose-400" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">Per-User Permission Control</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Each contact gets their own permission set. A marketing director can access analytics, leads, briefs, and approvals while a finance contact sees billing only -- all managed from one screen with instant effect.</p>
                </div>
              </div>
            </div>
          </section>

          <!-- Section 3 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Managing Approval Workflows</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The approval system lets you submit deliverables -- design mockups, ad creatives, copy documents, or any file -- to a client for review. When you create an approval request, you select the client, attach the deliverable files, and add a description of what needs to be reviewed.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The client sees the approval in their portal with a clear status: <strong class="font-medium text-[#121317] dark:text-white">Pending</strong>, <strong class="font-medium text-[#121317] dark:text-white">Approved</strong>, or <strong class="font-medium text-[#121317] dark:text-white">Revision Requested</strong>. When a client requests revisions, they can add comments explaining what needs to change. Your team receives a notification, makes the updates, and resubmits. The full history of submissions, comments, and status changes is tracked, creating an auditable record of the approval process.
            </p>
          </section>

          <!-- Section 4 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Customising the Portal Experience</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The portal layout adapts based on permissions. If a client user does not have invoice access, the Invoices tab disappears from their sidebar entirely -- they never see it. The same applies to approvals and other permission-gated sections. This means each client contact sees a clean, relevant interface tailored to their role.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              The portal can bring together CRM and leads, campaign analytics, measurement health, projects, briefs, requests, meetings, video reviews, shared assets, social workflows, approvals, and invoices. Only client-scoped records and enabled actions are returned, while notifications surface the updates that need attention.
            </p>
          </section>

          <!-- Section 5 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Inviting Clients</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The invitation flow is designed to be frictionless. When you send an invite, the client receives a branded email from your agency with a link to accept the invitation, set a password, and access their portal. Invitations expire after 7 days but can be resent at any time.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              You can track invitation status from the client record -- see whether an invite was sent, accepted, or is still pending. If a client user forgets their password, they can reset it through the portal login page without needing to contact your team. Session management uses secure httpOnly cookies, and sessions are scoped to the portal domain to prevent any overlap with staff authentication.
            </p>
          </section>

          <!-- Section 6 -->
          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Security and Data Isolation</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Every portal API endpoint enforces data isolation at the query level. When a client user makes a request, the server automatically scopes all database queries to their <code class="text-[13px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">clientId</code>. There is no parameter the client can manipulate to access another organisation's data -- the scoping happens server-side based on the authenticated session.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Staff and client authentication systems are entirely separate. The global auth middleware skips all <code class="text-[13px] bg-[#f4f5f7] dark:bg-white/[0.06] px-1.5 py-0.5 rounded">/portal</code> routes, and portal middleware only applies to portal pages. This dual-auth architecture ensures that a compromised client session cannot escalate to staff-level access.
            </p>
          </section>

          <!-- Dark CTA Card -->
          <div class="rounded-2xl bg-[#0a0b0e] p-8 md:p-12 text-center">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-4">
              <span class="text-white text-xs font-semibold">XF</span>
            </div>
            <h3 class="text-[22px] font-[450] text-white tracking-[-0.02em] mb-3">Give clients their own portal</h3>
            <p class="text-[15px] text-white/60 mb-6 max-w-[440px] mx-auto">A governed workspace for relationships, campaign outcomes, delivery, collaboration, and billing.</p>
            <NuxtLink to="/contact" class="inline-flex items-center gap-2 px-6 py-2.5 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors">
              Get Started
            </NuxtLink>
          </div>

          <!-- Next Steps -->
          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Invoicing, Xero sync, and ad spend tracking</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/ai-automation" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">AI & Automation</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">AI chat, anomaly detection, and automation recipes</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/work-management" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Work Management Deep Dive</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Boards, columns, views, and collaboration</p>
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
  title: 'Client Portal Administration — XeroFlow',
  description: 'Set up and manage the XeroFlow client portal. Configure access for CRM, leads, campaign analytics, measurement, work, approvals, meetings, shared files, and billing.',
  ogTitle: 'Client Portal Administration — XeroFlow',
  ogDescription: 'Configure a secure, client-scoped workspace for relationships, campaign outcomes, delivery, collaboration, and billing.',
})
</script>
