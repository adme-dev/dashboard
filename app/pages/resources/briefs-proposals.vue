<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="resources" />

    <div class="pt-[52px]">
      <div class="max-w-[720px] mx-auto px-6 pt-24 md:pt-36 pb-20 md:pb-32">

        <NuxtLink to="/resources" class="inline-flex items-center gap-1.5 text-[13px] text-[#45474D]/60 dark:text-white/40 hover:text-[#121317] dark:hover:text-white transition-colors mb-8">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          Back to Resources
        </NuxtLink>

        <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-[#121317] dark:text-white leading-[1.1] tracking-[-0.02em] mb-4">
          Briefs &amp; Proposals
        </h1>
        <p class="text-lg text-[#45474D] dark:text-white/60 leading-relaxed mb-3">
          Build structured intake templates, leverage AI-powered tools, and convert approved briefs into Xero quotes automatically.
        </p>
        <p class="text-[13px] text-[#45474D]/50 dark:text-white/40 mb-14">12 min read</p>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-14">
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">30+</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Field Types</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">AI</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Scoring &amp; Gen</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Auto</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Quote Generation</div>
          </div>
          <div class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-4 text-center">
            <div class="text-[24px] font-[450] text-[#121317] dark:text-white tracking-tight">Xero</div>
            <div class="text-[13px] text-[#45474D]/60 dark:text-white/40 mt-1">Quote &rarr; Invoice</div>
          </div>
        </div>

        <div class="flex flex-col gap-12">

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Creating Templates</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Brief templates define the structure of information you collect for each project type. Navigate to <strong class="font-medium text-[#121317] dark:text-white">Briefs &rarr; Templates</strong> to create a new template. The visual builder lets you add fields, organise them into sections, and set validation rules &mdash; all without writing code.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Choose from 30+ field types: rich text, dropdowns, multi-select, file uploads, date pickers, currency fields, sliders, and more. Mark critical fields as required so incomplete briefs cannot be submitted. Group related fields into collapsible sections with descriptive headers to keep long templates scannable.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Filling Out Briefs</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Team members and clients create briefs by selecting a template and filling in the fields. Required fields are enforced before submission &mdash; the form highlights missing information and prevents submission until everything is complete.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Default values and prefills save time for fields that commonly have the same value. When a new brief is created, sensible defaults are pre-populated so the creator only needs to change what differs from the norm. Briefs can be saved as drafts and returned to later before final submission.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">AI-Powered Tools</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              XeroFlow's AI assists at every stage of brief creation. <strong class="font-medium text-[#121317] dark:text-white">Field suggestions</strong> appear as you type, recommending values based on context and past briefs. <strong class="font-medium text-[#121317] dark:text-white">Completeness scoring</strong> rates each brief on required fields (40%), optional fields (20%), and content quality (40%), updating in real time as you edit.
            </p>
            <div class="rounded-2xl bg-gradient-to-br from-orange-50 to-amber-50/50 dark:from-orange-500/10 dark:to-amber-500/5 border border-orange-100/50 dark:border-orange-500/20 p-6">
              <div class="flex items-start gap-4">
                <div class="w-10 h-10 rounded-xl bg-orange-100 dark:bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">AI Brief Generator</p>
                  <p class="text-[14px] text-[#45474D] dark:text-white/60 leading-relaxed">Provide a one-paragraph project description and AI populates every template field. Review each suggestion individually &mdash; accept, edit, or reject &mdash; to build a complete brief in minutes instead of hours.</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Brief-to-Quote Pipeline</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              When a brief is approved and its template has quoting enabled, a quote is automatically generated. The system extracts deliverables from brief field values and matches each to your rate card using fuzzy matching. Line items are created with quantities, rates, and descriptions pulled directly from the brief.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Push the quote to Xero as a DRAFT with one click &mdash; client contact matching, chart of accounts mapping, and tax treatment are handled automatically. Once the client accepts the quote in Xero, convert it to a DRAFT invoice with a single action. This completes the full cycle: <strong class="font-medium text-[#121317] dark:text-white">brief &rarr; approval &rarr; quote &rarr; acceptance &rarr; invoice</strong>.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Bulk Operations</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              Multi-select briefs from the list view to perform bulk actions. A floating action bar appears at the bottom showing the selection count and available operations: status changes, reassignment, duplication, and CSV export.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Move 20 briefs from Draft to In Review in one action. Duplicate a set of briefs to create a new campaign batch. Export selected briefs to CSV with all field values, metadata, and timeline data for reporting or external sharing.
            </p>
          </section>

          <section>
            <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">Analytics Dashboard</h2>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed mb-4">
              The brief analytics dashboard shows cycle time funnels, completion rates, template performance comparisons, and aggregate metrics. Visualize how long briefs spend in each stage and identify bottlenecks where they stall.
            </p>
            <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
              Compare templates against each other &mdash; which produce the highest quality briefs, which have the fastest turnaround, and which generate the most revisions. Use these insights to refine your templates over time, removing friction from your best-performing workflows.
            </p>
          </section>

          <section class="mt-4 pt-10 border-t border-[#121317]/[0.06] dark:border-white/[0.06]">
            <h2 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-5">Next Steps</h2>
            <div class="flex flex-col gap-3">
              <NuxtLink to="/resources/roles-permissions" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Roles &amp; Permissions</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Custom roles and RBAC enforcement</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/time-tracking" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Time Tracking &amp; Timesheets</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Time logging, approvals, and team utilisation</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
              <NuxtLink to="/resources/financial-operations" class="flex items-center justify-between p-4 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors group">
                <div>
                  <p class="text-[15px] font-medium text-[#121317] dark:text-white">Financial Operations</p>
                  <p class="text-[13px] text-[#45474D]/60 dark:text-white/40">Xero sync, invoicing, and ad spend tracking</p>
                </div>
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4 text-[#45474D]/40 dark:text-white/30 group-hover:text-[#121317] dark:group-hover:text-white transition-colors" />
              </NuxtLink>
            </div>
          </section>

        </div>
      </div>
    </div>

    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Briefs & Proposals — XeroFlow',
  description: 'Build structured brief templates with 30+ field types, use AI-powered scoring and generation, and convert approved briefs into Xero quotes automatically.',
  ogTitle: 'Briefs & Proposals — XeroFlow',
  ogDescription: 'Build structured brief templates with 30+ field types, use AI-powered scoring and generation, and convert approved briefs into Xero quotes automatically.',
})
</script>
