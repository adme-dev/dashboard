<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="features" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span class="text-[13px] text-white/60 font-medium">Everything you need</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          One platform for<br class="hidden sm:block">your entire agency
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          From boards and briefs to invoices and AI — every tool your team needs, connected.
        </p>
      </div>
    </section>

    <!-- Feature Categories -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div
          v-for="category in categories"
          :key="category.title"
          class="mb-24 last:mb-0"
        >
          <!-- Category header -->
          <div class="flex items-center gap-3 mb-10">
            <div class="w-10 h-10 rounded-xl flex items-center justify-center" :class="category.iconBg">
              <UIcon :name="category.icon" class="w-5 h-5" :class="category.iconColor" />
            </div>
            <div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">
                {{ category.title }}
              </h2>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40">
                {{ category.subtitle }}
              </p>
            </div>
          </div>

          <!-- Feature grid -->
          <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <NuxtLink
              v-for="feature in category.features"
              :key="feature.title"
              :to="`/features/${feature.slug}`"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-6 flex flex-col gap-4 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.06] transition-colors"
              :class="category.features.length === 1 ? 'sm:flex-row sm:items-center sm:gap-6 lg:col-span-3' : ''"
            >
              <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
                <UIcon :name="feature.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ feature.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ feature.description }}</p>
              </div>
            </NuxtLink>
          </div>
        </div>
      </div>
    </section>

    <section class="px-6 pb-16 md:pb-24">
      <NuxtLink
        to="/ai-assistants"
        class="group mx-auto flex max-w-[1200px] flex-col justify-between gap-6 rounded-[28px] bg-amber-300 px-7 py-8 text-[#121317] transition-transform hover:-translate-y-0.5 sm:flex-row sm:items-center md:px-10"
      >
        <div>
          <p class="text-[12px] font-medium uppercase tracking-[0.14em] text-[#121317]/55">New AI workforce layer</p>
          <h2 class="mt-2 text-[clamp(24px,3vw,34px)] font-[450] tracking-[-0.025em]">Meet XeroFlow AI Assistants</h2>
          <p class="mt-2 max-w-[660px] text-[14px] leading-relaxed text-[#121317]/65">Personal assistance for each person, with focused specialists for paid media, publishing, finance and operations.</p>
        </div>
        <span class="inline-flex shrink-0 items-center gap-2 text-[14px] font-medium">
          Explore AI Assistants
          <UIcon name="i-lucide-arrow-right" class="size-4 transition-transform group-hover:translate-x-1" />
        </span>
      </NuxtLink>
    </section>

    <!-- CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-10">
            Ready to see it in action?
          </h2>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
import { CRM_SEARCH_MARKETING_COPY } from '~/utils/marketingClaimManifest'

definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Features — XeroFlow',
  description: 'Explore 90+ features across work management, sales & CRM, creative production, financial operations, analytics, communication, AI intelligence, governed people operations, client portals, time tracking, briefs, and administration.',
  ogTitle: 'Features — XeroFlow',
  ogDescription: 'Explore 90+ features across work management, sales & CRM, creative production, financial operations, analytics, communication, AI intelligence, governed people operations, client portals, time tracking, briefs, and administration.'
})

const categories = [
  {
    title: 'Work Management',
    subtitle: 'Boards, tasks, and workflows',
    icon: 'i-lucide-kanban',
    iconBg: 'bg-blue-50 dark:bg-blue-500/10',
    iconColor: 'text-blue-600',
    features: [
      { title: 'Boards', slug: 'boards', icon: 'i-lucide-kanban', description: 'Monday-style boards with 20+ column types — status, people, date, numbers, formulas, and more.' },
      { title: 'Kanban View', slug: 'kanban-view', icon: 'i-lucide-columns-3', description: 'Drag-and-drop Kanban boards grouped by any status column with real-time updates.' },
      { title: 'Timeline View', slug: 'timeline-view', icon: 'i-lucide-gantt-chart', description: 'Gantt-style timeline with date range bars, drag-to-reschedule, and dependency tracking.' },
      { title: 'Calendar View', slug: 'calendar-view', icon: 'i-lucide-calendar', description: 'Monthly calendar with task cards, drag-to-reschedule, and date-based filtering.' },
      { title: 'Gallery View', slug: 'gallery-view', icon: 'i-lucide-layout-grid', description: 'Visual grid of tasks with file previews — perfect for creative review workflows.' },
      { title: 'Table View', slug: 'table-view', icon: 'i-lucide-table', description: 'Spreadsheet-style table with sortable columns, inline editing, and bulk actions.' },
      { title: 'Groups & Subtasks', slug: 'groups-subtasks', icon: 'i-lucide-list-tree', description: 'Organize tasks into collapsible groups with nested subtasks for complex projects.' },
      { title: 'Templates', slug: 'templates', icon: 'i-lucide-copy', description: 'Save board configurations as templates. Spin up new projects in seconds.' },
      { title: 'Real-Time Updates', slug: 'real-time-sse', icon: 'i-lucide-radio', description: 'Live updates via SSE and Durable Objects — see changes from teammates instantly.' }
    ]
  },
  {
    title: 'Sales & CRM',
    subtitle: 'Contacts, pipeline, scoring, and quotes',
    icon: 'i-lucide-handshake',
    iconBg: 'bg-teal-50 dark:bg-teal-500/10',
    iconColor: 'text-teal-600',
    features: [
      { title: 'Contacts & Companies', slug: 'crm-contacts', icon: 'i-lucide-contact-round', description: 'A full contact and company database with linked relationships, a complete activity timeline, attached documents, and a logged history of every email, call, and note.' },
      { title: 'Sales Pipeline', slug: 'crm-pipeline', icon: 'i-lucide-square-kanban', description: 'Track opportunities through customisable stages on a drag-and-drop board, with weighted, stage-based revenue forecasting that shows what is likely to close.' },
      { title: 'Activities & Tasks', slug: 'crm-activities', icon: 'i-lucide-list-checks', description: 'Assign tasks with due dates and reminders against any contact or deal. A unified activity timeline captures every touchpoint automatically.' },
      { title: 'Lead Scoring', slug: 'crm-scoring', icon: 'i-lucide-gauge', description: 'Deterministic lead grading from engagement, recency, and fit signals — so reps always know which leads are hot and which are going cold.' },
      { title: 'Insights & Forecasting', slug: 'crm-insights', icon: 'i-lucide-trending-up', description: 'Pipeline analytics, conversion funnels, weighted revenue forecasts, and a rep leaderboard — the numbers that run your sales review.' },
      { title: 'Saved Views & Export', slug: 'crm-saved-views', icon: 'i-lucide-bookmark', description: 'Save any filtered, sorted view of contacts or deals and switch between them in one click. Export any view to CSV for reporting.' },
      { title: 'Duplicate Detection & Merge', slug: 'crm-dedupe', icon: 'i-lucide-git-merge', description: 'Automatic duplicate detection across contacts and companies, with a safe side-by-side merge that preserves every linked activity and note.' },
      { title: 'Quote Generation', slug: 'crm-quotes', icon: 'i-lucide-file-signature', description: 'Turn an opportunity\'s line items into a quote in one click — atomic, race-safe, sequentially numbered, and ready to push to Xero.' }
    ]
  },
  {
    title: 'Banner Studio',
    subtitle: 'HTML5 ad design, animation, and production',
    icon: 'i-lucide-palette',
    iconBg: 'bg-rose-50 dark:bg-rose-500/10',
    iconColor: 'text-rose-600',
    features: [
      { title: 'Visual Editor', slug: 'banner-editor', icon: 'i-lucide-pen-tool', description: 'Turn uploaded artwork into editable animated banner drafts, with layers, a properties panel, drag-to-position, and multi-format support.' },
      { title: 'Animation & Timeline', slug: 'banner-animation', icon: 'i-lucide-clapperboard', description: 'GSAP-powered keyframe timeline with entry/exit animations, easing curves, and motion paths.' },
      { title: 'Motion Paths', slug: 'motion-paths', icon: 'i-lucide-spline', description: 'SVG-based motion path editor with draggable waypoints, curviness control, and auto-rotate.' },
      { title: 'Static & GIF Export', slug: 'banner-export', icon: 'i-lucide-image', description: 'Export to PNG/JPG at 1x/2x via headless Chromium, or animated GIF with configurable FPS.' },
      { title: 'Video Export', slug: 'video-export', icon: 'i-lucide-film', description: 'MP4 video export with frame-by-frame GSAP capture and ffmpeg encoding.' },
      { title: 'Ad Tags & Publishing', slug: 'ad-tags', icon: 'i-lucide-code', description: 'Publish with stable CDN URLs. Generate iframe, JavaScript, and AMPHTML tags with tracking pixels.' },
      { title: 'Brand Kits', slug: 'brand-kits', icon: 'i-lucide-swatch-book', description: 'Colour roles, heading/body fonts, light & dark logos and guidelines per client. Extract from a website, apply in one click, enforce at export.' },
      { title: 'Template Marketplace', slug: 'template-marketplace', icon: 'i-lucide-store', description: 'Save designs as templates. Browse a categorised gallery with search, tags, and usage tracking.' },
      { title: 'Data Feeds & DCO', slug: 'data-feeds-dco', icon: 'i-lucide-database', description: 'Upload CSV/JSON feeds, bind columns to layers, and auto-generate per-row banner variants at scale.' },
      { title: 'Design Precision', slug: 'design-precision', icon: 'i-lucide-grid-3x3', description: 'Google Fonts, custom font upload, pixel grid, snap-to-grid, smart guides, and layer alignment tools.' },
      { title: 'AI Creative Assistant', slug: 'ai-creative-assistant', icon: 'i-lucide-sparkles', description: 'AI text-to-image generation, layer editing & decomposition, copy suggestions, URL-to-banner, auto-resize, and image recommendations.' },
      { title: 'Real-Time Collaboration', slug: 'banner-collaboration', icon: 'i-lucide-users', description: 'Multi-user editing with live cursors, soft layer locking, presence indicators, and version history.' }
    ]
  },
  {
    title: 'Social Publishing',
    subtitle: 'Plan, compose, and publish organic social',
    icon: 'i-lucide-share-2',
    iconBg: 'bg-sky-50 dark:bg-sky-500/10',
    iconColor: 'text-sky-600',
    features: [
      { title: 'Content Calendar', slug: 'social-calendar', icon: 'i-lucide-calendar-days', description: 'A single calendar hub for every organic post — colour-coded by status, click any day to compose.' },
      { title: 'Campaign Planner & AI Calendar', slug: 'social-planner', icon: 'i-lucide-folder-kanban', description: 'Group posts into campaigns on a production-pipeline board, then let AI draft a whole week of content from a brief — every draft editable, nothing publishes without you.' },
      { title: 'Client News Intelligence', slug: 'social-news-intelligence', icon: 'i-lucide-newspaper', description: 'Filter an aggregated industry news feed by client fit, rewrite with AI, and route selected stories into approval-safe publishing — informed only by reviewed client guidance.' },
      { title: 'Multi-Network Composer', slug: 'social-composer', icon: 'i-lucide-pen-square', description: 'Author once, customise per network. Publish to Facebook, Instagram, LinkedIn, TikTok, YouTube, and Google Business with live per-network previews.' },
      { title: 'Scheduling & Queue', slug: 'social-scheduling', icon: 'i-lucide-calendar-clock', description: 'Publish now, schedule for later, or drop into recurring optimal posting slots — dispatched reliably with idempotent, partial-success-aware publishing.' },
      { title: 'Approvals', slug: 'social-approvals', icon: 'i-lucide-clipboard-check', description: 'Request → approve/reject workflow with notifications, so nothing goes out without sign-off.' },
      { title: 'Engagement Inbox', slug: 'social-inbox', icon: 'i-lucide-messages-square', description: 'Every comment, mention, and message across your networks in one unified inbox — read, triage, and reply without leaving the dashboard.' },
      { title: 'Reviews', slug: 'social-reviews', icon: 'i-lucide-star', description: 'Track and respond to Google Business and Facebook reviews in one place, with ratings at a glance.' },
      { title: 'Reply Automation', slug: 'social-automation', icon: 'i-lucide-bot', description: 'AI drafts replies to comments and reviews — suggest, approve, or autopilot, with hard safety guardrails and a global kill-switch.' }
    ]
  },
  {
    title: 'Creative Production',
    subtitle: 'Ad previews, export, and publishing at scale',
    icon: 'i-lucide-rocket',
    iconBg: 'bg-rose-50 dark:bg-rose-500/10',
    iconColor: 'text-rose-600',
    features: [
      { title: 'Page Studio', slug: 'page-studio', icon: 'i-lucide-panels-top-left', description: 'Build multi-page client websites with nested pages, reusable sections, responsive previews, governed drafts, releases, and domains.' },
      { title: 'Bulk Ad Launch', slug: 'bulk-ad-launch', icon: 'i-lucide-rocket', description: 'Select creatives from Banner Studio and launch dozens of ads to Meta in one click.' },
      { title: 'Ad Platform Export', slug: 'ad-platform-export', icon: 'i-lucide-download', description: 'Export HTML5 banners for 14 ad platforms with automatic clickTag injection and compliance validation.' },
      { title: 'Ad Previews', slug: 'ad-previews', icon: 'i-lucide-monitor-smartphone', description: 'Preview banners in 8 platform mockups — Meta Feed, Stories, Reels, LinkedIn, and more.' },
      { title: 'Safe Zone Overlays', slug: 'safe-zones', icon: 'i-lucide-scan', description: 'Platform-specific safe zone guides for 11 ad platforms to ensure text and logos stay visible.' },
      { title: 'Meta Upload Wizard', slug: 'meta-upload-wizard', icon: 'i-lucide-upload', description: 'Five-step wizard to publish directly to Meta — select account, campaign, ad set, creatives, and go live.' },
      { title: 'Dealer Inventory Feeds', slug: 'dealer-inventory-feeds', icon: 'i-lucide-boxes', description: 'Map database-backed vehicle inventory to a client, verify Meta catalogue access, reuse an existing Meta product feed by ID, and retain provider-readback evidence inside XeroFlow.' },
      { title: 'Audio Studio', slug: 'audio-studio', icon: 'i-lucide-mic', description: 'Generate owned AI voiceover and music that run legally across radio, TikTok and Meta — no clearance, no takedowns. Drops straight into Banner Studio audio layers.' },
      { title: 'Video Studio', slug: 'video-studio', icon: 'i-lucide-clapperboard', description: 'Assemble social video in the browser — footage, stills, overlays from Banner Studio, AI clips, voiceover and music on one docked timeline, then render Reels, Square and YouTube cuts in a single pass.' },
      { title: 'Media Studio Editor', slug: 'media-studio-editor', icon: 'i-lucide-film', description: 'Browser-based multitrack audio editor — drag, trim, slice, and layer clips on a pixel-accurate timeline with undo/redo, autosave, and named version snapshots.' },
      { title: 'AI Video Generation', slug: 'ai-video-generation', icon: 'i-lucide-video', description: 'Animate an approved product still into motion or generate short B-roll from a prompt — owned, brand-safe clips with per-client budget caps that drop straight into your video timeline.' }
    ]
  },
  {
    title: 'Financial Operations',
    subtitle: 'Invoicing, expenses, and ad spend',
    icon: 'i-lucide-calculator',
    iconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    iconColor: 'text-emerald-600',
    features: [
      { title: 'Lead Capture & Routing', slug: 'lead-capture-routing', icon: 'i-lucide-inbox', description: 'Signed gateways, native ad forms, and dedicated inbound email that securely captures each client\'s CRM conversation — with safe tests and exact automotive routing into one real-time inbox.' },
      { title: 'Xero Integration', slug: 'xero-integration', icon: 'i-lucide-link', description: 'Two-way sync with Xero for invoices, expenses, contacts, project allocations, and chart of accounts. Reconcile Agency Gross Income and unallocated-source reconciliation in one place.' },
      { title: 'EOM Engine', slug: 'eom-engine', icon: 'i-lucide-file-spreadsheet', description: 'End-of-month invoice generation with configurable line items, tax, and auto-upload to Xero.' },
  { title: 'Meta Ads Tracking', slug: 'meta-ads-tracking', icon: 'i-lucide-megaphone', description: 'OAuth-connected Meta Ads spend syncing with policy issues, ad-set learning state, frequency, CPM, daily breakdowns, and campaign budgets.' },
  { title: 'Google Ads Control & Tracking', slug: 'google-ads-tracking', icon: 'i-lucide-bar-chart-3', description: 'Default-on client measurement enrolment, secure multi-account reporting, and governed campaign and conversion controls through XeroFlow\'s Google Ads MCP.' },
  { title: 'Google Tag Manager', slug: 'google-tag-manager', icon: 'i-lucide-container', description: 'Connect GTM, monitor account and binding health in Admin, publish isolated versions, verify live tags, roll back safely, and expose audited owner MCP operations.' },
  { title: 'Google AI Max Readiness', slug: 'google-ai-max-readiness', icon: 'i-lucide-scan-search', description: 'A read-only portfolio audit for Google Search campaigns affected by the AI Max migration, with effective-control evidence, change history, and action-ready exports.' },
  { title: 'Governed Google PMax Launches', slug: 'governed-google-pmax-launches', icon: 'i-lucide-shield-check', description: 'Turn approved vehicle briefs into exact paused Google PMax campaigns, then require independent evidence and approval before activation can begin spend.' },
      { title: 'Profit & Loss', slug: 'profit-loss', icon: 'i-lucide-trending-up', description: 'Real-time P&L dashboards with revenue, expenses, and margin analysis per client.' },
      { title: 'Budget Management', slug: 'budget-management', icon: 'i-lucide-wallet', description: 'Set monthly budgets per client and campaign. Get alerts when spend approaches limits.' },
      { title: 'Rate Cards', slug: 'rate-cards', icon: 'i-lucide-credit-card', description: 'Define service pricing with rate cards. Fuzzy match to Xero accounts, variance dashboards, and AI integration.' },
      { title: 'Quotes & Proposals', slug: 'quotes-proposals', icon: 'i-lucide-file-check', description: 'Generate quotes from briefs with rate card pricing. Push to Xero, sync status, and convert to invoices.' }
    ]
  },
  {
    title: 'Analytics & Reporting',
    subtitle: 'Cross-platform insights and performance data',
    icon: 'i-lucide-chart-area',
    iconBg: 'bg-cyan-50 dark:bg-cyan-500/10',
    iconColor: 'text-cyan-600',
    features: [
      { title: 'Search Authority & AI Trust', slug: 'search-authority-ai-trust', icon: 'i-lucide-search-check', description: 'Turn Search Console and technical evidence into approved guides, safe menu discovery, attributable outcomes, governed tasks, and transparent client reporting.' },
      { title: 'Measurement Control Plane', slug: 'measurement-control-plane', icon: 'i-lucide-route', description: 'Start new clients desired on, then resolve the right account, consent, mapping, evidence, and freshness before live delivery.' },
      { title: 'Cross-Platform Dashboard', slug: 'cross-platform-dashboard', icon: 'i-lucide-layout-dashboard', description: 'Aggregated performance across Meta, Google, and other ad platforms in a unified view. Ads Manager–style campaign columns with a saveable layout, one-click Meta Ads preset, and per-campaign health scores that flag what to scale or cut against each client\'s own KPI targets.' },
      { title: 'Hourly Breakdowns', slug: 'hourly-breakdowns', icon: 'i-lucide-clock-4', description: 'Granular hourly performance data with spend, impressions, and conversion trends throughout the day.' },
      { title: 'Campaign Alerts', slug: 'campaign-alerts', icon: 'i-lucide-bell-ring', description: 'Detects ad-spend pacing problems and keeps campaign review available for every synced Meta and Google campaign — including on-demand AI analysis that proposes a daily budget beside the rule-based number.' },
      { title: 'Platform Comparison', slug: 'platform-comparison', icon: 'i-lucide-git-compare', description: 'Side-by-side platform performance with unified metrics, normalised for cross-channel analysis.' },
      { title: 'On-Demand Sync', slug: 'on-demand-sync', icon: 'i-lucide-refresh-cw', description: 'Pull the latest data from ad platforms on demand — no waiting for scheduled syncs.' },
      { title: 'Export & Reporting', slug: 'export-reporting', icon: 'i-lucide-file-down', description: 'Export analytics to CSV with date ranges, breakdowns, and AI-generated summaries.' },
      { title: 'GA4 Funnel & Website Analytics', slug: 'ga4-funnel', icon: 'i-lucide-filter', description: 'Connect Google Analytics 4 and see the full funnel — ad spend through sessions, on-site conversions, and captured leads, attributed by channel.' },
      { title: 'Dynamic QR Codes', slug: 'qr-codes', icon: 'i-lucide-qr-code', description: 'Print-ready SVG QR codes with editable destinations and per-scan analytics — change the link, never reprint.' },
      { title: 'Website Audience Intelligence', slug: 'website-audience-intelligence', icon: 'i-lucide-radio-tower', description: 'Connect client-owned audience evidence to a non-exhaustive list of up to 20 nearby dealerships, with human approval required before monitoring public competitor changes.' },
      { title: 'Ask Your Data', slug: 'analytics-ask', icon: 'i-lucide-sparkles', description: 'Ask a plain-English question about any client\'s performance and get an answer grounded only in your real numbers — with the per-channel figures it used one click away.' },
      { title: 'Portfolio Benchmarks', slug: 'analytics-benchmarks', icon: 'i-lucide-gauge', description: 'See exactly where a client sits against the rest of your book — engagement, conversion rate, CPL and CPA as percentile rankings, plus an agency-wide leaderboard.' },
      { title: 'Blend Presets', slug: 'analytics-presets', icon: 'i-lucide-sliders-horizontal', description: 'One-click views over the blended cross-channel table — paid mix, last-click, blended ROAS, organic vs paid — so the right metrics are always one selection away.' },
      { title: 'Analytics Export API', slug: 'analytics-export-api', icon: 'i-lucide-database', description: 'Mint scoped bearer tokens to pull the canonical analytics fact into a warehouse or share with a client — agency-wide or locked to a single client, revocable anytime.' }
    ]
  },
  {
    title: 'Communication',
    subtitle: 'Chat, notifications, email, and automations',
    icon: 'i-lucide-message-circle',
    iconBg: 'bg-violet-50 dark:bg-violet-500/10',
    iconColor: 'text-violet-600',
    features: [
      { title: 'Real-Time Chat', slug: 'real-time-chat', icon: 'i-lucide-message-circle', description: 'Channels, DMs, group messages, threads, and file sharing — built on Durable Objects.' },
      { title: 'Board-Linked Channels', slug: 'board-linked-channels', icon: 'i-lucide-link-2', description: 'Auto-created channels for boards and tasks. Board events post directly to chat.' },
      { title: 'Rich Messages', slug: 'rich-messages', icon: 'i-lucide-image', description: 'File attachments, emoji reactions, message pinning, quoting, and forwarding.' },
      { title: 'Read Receipts', slug: 'read-receipts', icon: 'i-lucide-check-check', description: 'See who has read your messages with avatar indicators and reader lists.' },
      { title: 'Link Previews', slug: 'link-previews', icon: 'i-lucide-external-link', description: 'Automatic OG unfurl for shared URLs — rich preview cards with title, image, and description.' },
      { title: 'Message Forwarding', slug: 'message-forwarding', icon: 'i-lucide-forward', description: 'Forward messages to any channel or DM with full attribution and context.' },
      { title: 'Activity Hub', slug: 'activity-hub', icon: 'i-lucide-activity', description: 'Unified notification centre with live feed, For You tab, and keyboard shortcuts for quick access.' },
      { title: 'Smart Watch', slug: 'smart-watch', icon: 'i-lucide-bell-ring', description: 'AI-scored inbox, daily digest narrative, snooze, quiet hours, and semantic keyword subscriptions across every board.' },
      { title: 'Email Templates', slug: 'email-templates', icon: 'i-lucide-mail', description: 'Resend-powered email templates for notifications, invites, and client communications.' },
      { title: 'Email Campaigns', slug: 'email-campaigns', icon: 'i-lucide-send', description: 'Design, target, and send marketing email campaigns to subscriber lists — with merge tags, delivery tracking, and one-click unsubscribe built in.' },
      { title: 'Email Builder', slug: 'email-builder', icon: 'i-lucide-layout-template', description: 'Visual section-based email editor — drop in pre-designed sections, edit text right on the canvas, launch from a gallery of 12 starter templates, save your own sections as reusable custom modules, and render to bulletproof email HTML.' },
      { title: 'Subscriber Lists', slug: 'email-lists', icon: 'i-lucide-users', description: 'Build lists, import via CSV, and grow them with public subscribe forms — double opt-in, preference centre, and RFC 8058 compliant unsubscribe.' },
      { title: 'Automations', slug: 'automations', icon: 'i-lucide-zap', description: 'Trigger → action recipes. Auto-notify on status changes, assignments, and due dates.' }
    ]
  },
  {
    title: 'AI & Intelligence',
    subtitle: 'Chat, analysis, training, and recommendations',
    icon: 'i-lucide-brain',
    iconBg: 'bg-amber-50 dark:bg-amber-500/10',
    iconColor: 'text-amber-600',
    features: [
      { title: 'AI Chat', slug: 'ai-chat', icon: 'i-lucide-bot', description: 'Conversational AI that pulls live agency data on demand — finance, ad-spend, client profitability, retainer burn, revenue forecasting, tasks, and more — with @entity mentions, role-focused assistants, and propose-then-confirm actions that never change anything without your click.' },
      { title: 'Owner God Mode', slug: 'owner-god-mode', icon: 'i-lucide-crown', description: 'Always-on access to every registered application and MCP capability for active owners, including audited Banner Studio creation and staged Google Tag Manager publishing. Authentication, isolation and emergency controls remain enforced.' },
      { title: 'Voice AI', slug: 'voice-ai', icon: 'i-lucide-mic', description: 'Talk to your AI assistant. Speech-to-text transcription and text-to-speech responses powered by Workers AI.' },
      { title: 'Anomaly Detection', slug: 'anomaly-detection', icon: 'i-lucide-alert-triangle', description: '10 specialised analysers that proactively flag anomalies across profit, revenue, expenses, cashflow, receivables, budget, ad-spend pacing/delivery health and per-client risk — surfaced in the daily digest, push, and in-app.' },
      { title: CRM_SEARCH_MARKETING_COPY.featureTitle, slug: 'semantic-search', icon: 'i-lucide-search', description: CRM_SEARCH_MARKETING_COPY.featureCardDescription },
      { title: 'Intent Classification', slug: 'intent-classification', icon: 'i-lucide-target', description: 'Edge-first intent classifier routes queries to the right data sources automatically.' },
      { title: 'Composite Scoring', slug: 'composite-scoring', icon: 'i-lucide-blend', description: 'Five-signal retrieval formula — semantic, recency, importance, intent match, and entity overlap.' },
      { title: 'AI Reports', slug: 'ai-reports', icon: 'i-lucide-file-text', description: 'Auto-generated reports with insights, trends, and recommendations for your agency.' },
      { title: 'Advisor Backlog', slug: 'advisor-backlog', icon: 'i-lucide-target', description: 'AI-generated CFO recommendations with categorisation, snooze, comments, bulk triage, and Kanban view. Track impact at 30/60/90 days.' },
      { title: 'AI Training Pipeline', slug: 'ai-training-pipeline', icon: 'i-lucide-graduation-cap', description: 'Extract training data from conversations, upload knowledge entries, and manage training datasets.' },
      { title: 'Knowledge Base', slug: 'knowledge-base', icon: 'i-lucide-book-open', description: 'Curate and approve knowledge entries that enhance AI responses with agency-specific context.' },
      { title: 'LoRA Adapters', slug: 'lora-adapters', icon: 'i-lucide-cpu', description: 'Fine-tune AI models with your agency data. Custom adapters with traffic routing and A/B testing.' },
      { title: 'AI Assistant Connectors', slug: 'ai-connectors', icon: 'i-lucide-plug', description: 'Give Claude, Cursor, or ChatGPT governed Godmode access to live operations and a mixed creative model fleet — with explicit freshness, current creative-source discovery, standalone action audit, audio, video, and separate vision-inspection controls.' },
    ]
  },
  {
    title: 'Client Portal',
    subtitle: 'CRM, campaigns, jobs, billing, approvals, and shared work',
    icon: 'i-lucide-briefcase',
    iconBg: 'bg-pink-50 dark:bg-pink-500/10',
    iconColor: 'text-pink-600',
    features: [
      { title: 'Passwordless Login', slug: 'dedicated-login', icon: 'i-lucide-lock', description: 'Single-use email links create secure, client-scoped sessions without passwords.' },
      { title: 'Project Visibility', slug: 'project-visibility', icon: 'i-lucide-folder-open', description: 'Clients see their projects, progress, and a deliberately linked client board — no internal data leaks.' },
      { title: 'Approval Workflows', slug: 'approval-workflows', icon: 'i-lucide-check-circle', description: 'Upload deliverables for client review. Approve, revise, or comment — all tracked.' },
      { title: 'Invoice Access', slug: 'invoice-access', icon: 'i-lucide-receipt', description: 'Give clients a clear payment view and separate agency services from media and supplier investment.' },
      { title: 'Creative Gallery', slug: 'creative-gallery', icon: 'i-lucide-image', description: 'Browse all delivered assets in a visual gallery with download and preview.' },
      { title: 'Notifications', slug: 'notifications', icon: 'i-lucide-bell', description: 'Clients get notified when new deliverables, invoices, or updates are ready.' },
      { title: 'CRM & Lead Management', slug: 'portal-crm-leads', icon: 'i-lucide-contact-round', description: 'Give clients a scoped CRM for contacts, companies, opportunities, and portal-visible leads — with follow-up status and outcome tracking.' },
      { title: 'Campaign Analytics', slug: 'portal-campaign-analytics', icon: 'i-lucide-chart-no-axes-combined', description: 'Share permission-gated campaign performance, spend, platform trends, leads, outcomes, and exports without exposing internal agency data.' },
      { title: 'Measurement Health', slug: 'portal-measurement', icon: 'i-lucide-activity', description: 'Show clients how browser events, server delivery, and CRM outcomes contribute to measurement — with ownership and evidence kept distinct.' },
      { title: 'Meetings & Video Reviews', slug: 'portal-meetings-reviews', icon: 'i-lucide-video', description: 'Share upcoming meetings, recordings, and review-ready video so decisions and feedback stay attached to the client relationship.' },
      { title: 'Briefs & Social Workspace', slug: 'portal-briefs-social', icon: 'i-lucide-panels-top-left', description: 'Let clients submit structured briefs and access approved social inbox, listening, reporting, and news workflows from the same portal.' },
      { title: 'Page Studio Workspace', slug: 'page-studio', icon: 'i-lucide-panels-top-left', description: 'Give each client a scoped view of only the websites assigned to their portal account, with release status and agency-managed governance.' }
    ]
  },
  {
    title: 'Time & Capacity',
    subtitle: 'Tracking, timesheets, and utilisation',
    icon: 'i-lucide-timer',
    iconBg: 'bg-indigo-50 dark:bg-indigo-500/10',
    iconColor: 'text-indigo-600',
    features: [
      { title: 'Time Tracking', slug: 'time-tracking', icon: 'i-lucide-clock', description: 'Log time against projects and tasks. Start/stop timers or enter manually.' },
      { title: 'Weekly Timesheets', slug: 'weekly-timesheets', icon: 'i-lucide-calendar-days', description: 'Weekly grid view with submit, approval, and rejection workflows.' },
      { title: 'Manager Approvals', slug: 'manager-approvals', icon: 'i-lucide-shield-check', description: 'Review and approve team timesheets. Bulk approve, reject with reason, and lock entries.' },
      { title: 'Task-Level Logging', slug: 'task-level-logging', icon: 'i-lucide-list-checks', description: 'Link time entries to specific tasks. See time spent per task with progress bars.' }
    ]
  },
  {
    title: 'Briefs & Proposals',
    subtitle: 'Templates, approvals, and AI-powered briefs',
    icon: 'i-lucide-file-text',
    iconBg: 'bg-orange-50 dark:bg-orange-500/10',
    iconColor: 'text-orange-600',
    features: [
      { title: 'Brief Templates', slug: 'brief-templates', icon: 'i-lucide-file-plus', description: 'A ready-made library spanning paid media, creative, print, web, email, and direct response — built from 30+ field types with structured offer, compliance, and sign-off fields and drag-and-drop ordering.' },
      { title: 'Template Builder', slug: 'template-builder', icon: 'i-lucide-blocks', description: 'Visual template editor with field configuration, required/optional toggles, section grouping, and default values.' },
      { title: 'AI Brief Tools', slug: 'ai-brief-tools', icon: 'i-lucide-sparkles', description: 'AI-powered field suggestions, brief scoring (completeness + quality), and full brief generation from minimal input.' },
      { title: 'Brief-to-Quote', slug: 'brief-to-quote', icon: 'i-lucide-receipt', description: 'Auto-generate quotes from approved briefs. Rate card matching, Xero push, and quote-to-invoice conversion.' },
      { title: 'Bulk Operations', slug: 'bulk-brief-operations', icon: 'i-lucide-layers', description: 'Multi-select briefs for bulk status changes, assignment, duplication, and export. Floating action bar for fast ops.' },
      { title: 'Brief Analytics', slug: 'brief-analytics', icon: 'i-lucide-bar-chart-2', description: 'Cycle time funnels, completion rates, and aggregate analytics across all briefs and templates.' }
    ]
  },
  {
    title: 'People Operations',
    subtitle: 'Role clarity, evidence-aware reviews, and human governance',
    icon: 'i-lucide-users-round',
    iconBg: 'bg-cyan-50 dark:bg-cyan-500/10',
    iconColor: 'text-cyan-600',
    features: [
      { title: 'HR & People Operations', slug: 'hr-people-operations', icon: 'i-lucide-shield-check', description: 'Run role-governed business reviews with private workspaces, evidence thresholds, employee correction rights, responsibility mapping, contract controls, and human approval gates.' }
    ]
  },
  {
    title: 'Administration',
    subtitle: 'Roles, permissions, and team management',
    icon: 'i-lucide-shield',
    iconBg: 'bg-slate-50 dark:bg-slate-500/10',
    iconColor: 'text-slate-600',
    features: [
      { title: 'Custom Roles', slug: 'custom-roles', icon: 'i-lucide-user-cog', description: 'Create custom roles beyond the 15 built-in levels. Define granular permissions for each role to match your org structure.' },
      { title: 'Permission System', slug: 'permission-system', icon: 'i-lucide-lock', description: 'Fine-grained RBAC with 15+ permission areas — finance, creative, media, clients, admin, and more. Server-enforced.' },
      { title: 'Admin Dashboard', slug: 'admin-dashboard', icon: 'i-lucide-settings', description: 'Central admin panel with user management, role assignment, permission matrix, and audit controls.' }
    ]
  }
]
</script>
