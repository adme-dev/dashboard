<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Feature Found -->
    <template v-if="feature">
      <!-- Hero with background -->
      <section class="relative bg-[#0a0b0e] pt-[52px]">
        <MarketingHeroBackground theme="feature-detail" />
        <div class="relative">
          <!-- Breadcrumb -->
          <div class="max-w-[1200px] mx-auto px-6 pt-8">
            <NuxtLink to="/features" class="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors">
              <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
              All Features
            </NuxtLink>
          </div>

          <!-- Hero -->
          <div class="max-w-[720px] mx-auto px-6 pt-16 pb-16 md:pt-24 md:pb-20">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-white/[0.06]">
                <UIcon :name="feature.categoryIcon" class="w-5 h-5 text-white/80" />
              </div>
              <span class="text-[14px] text-white/60 font-medium">{{ feature.category }}</span>
            </div>
            <div class="flex items-start gap-5 mb-6">
              <div class="w-14 h-14 rounded-2xl bg-white/[0.06] flex items-center justify-center flex-shrink-0">
                <UIcon :name="feature.icon" class="w-7 h-7 text-white" />
              </div>
              <h1 class="text-[clamp(32px,5vw,48px)] font-[450] text-white leading-[1.1] tracking-[-0.02em]">
                {{ feature.title }}
              </h1>
            </div>
            <p class="text-lg md:text-xl text-white/50 leading-relaxed">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </section>

      <!-- Detail Sections -->
      <section class="pb-20 md:pb-32">
        <div class="max-w-[720px] mx-auto px-6">
          <div class="flex flex-col gap-16">
            <div
              v-for="(detail, i) in feature.details"
              :key="i"
              class="relative"
            >
              <div class="flex items-center gap-3 mb-4">
                <div class="w-8 h-8 rounded-lg bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center text-[14px] font-medium text-[#45474D] dark:text-white/60">
                  {{ String(i + 1).padStart(2, '0') }}
                </div>
                <h2 class="text-[22px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">
                  {{ detail.title }}
                </h2>
              </div>
              <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-[1.75] pl-11">
                {{ detail.content }}
              </p>
            </div>
          </div>
        </div>
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
    </template>

    <!-- 404 — slug not found -->
    <template v-else>
      <div class="pt-[52px]">
        <div class="max-w-[720px] mx-auto px-6 pt-32 pb-40 text-center">
          <div class="w-16 h-16 rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.06] flex items-center justify-center mx-auto mb-6">
            <UIcon name="i-lucide-search-x" class="w-8 h-8 text-[#45474D] dark:text-white/60" />
          </div>
          <h1 class="text-[32px] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">
            Feature not found
          </h1>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 mb-8">
            The feature you're looking for doesn't exist or may have been moved.
          </p>
          <NuxtLink
            to="/features"
            class="inline-flex items-center gap-2 px-6 py-3 bg-[#121317] dark:bg-white text-white dark:text-[#121317] text-[15px] font-medium rounded-full hover:bg-[#2a2b30] dark:hover:bg-white/90 transition-colors"
          >
            <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
            Back to Features
          </NuxtLink>
        </div>
      </div>
    </template>

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

const route = useRoute()
const slug = route.params.slug as string

interface FeatureDetail {
  title: string
  content: string
}

interface Feature {
  title: string
  slug: string
  icon: string
  category: string
  categoryIcon: string
  categoryIconBg: string
  categoryIconColor: string
  description: string
  details: FeatureDetail[]
}

const features: Record<string, Feature> = {
  'measurement-control-plane': {
    title: 'Measurement Control Plane',
    slug: 'measurement-control-plane',
    icon: 'i-lucide-route',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50 dark:bg-cyan-500/10',
    categoryIconColor: 'text-cyan-600 dark:text-cyan-400',
    description: 'Turn website, Google Ads, consent, delivery, call, and freshness evidence into one accountable measurement workflow without blurring what each source proves.',
    details: [
      {
        title: 'The Right Account, Proven',
        content: 'Measurement is desired on when a new client is added, so setup cannot disappear behind a silent disabled state. Live delivery still waits for the right credential, consent, deterministic mapping, fresh configuration, controlled verification, and approval. Existing clients enter review instead of receiving blind bulk activation, and a deliberate client-wide or individual-signal opt-out stays explicit and audited. Dealership aliases, group identities, connected credentials, operating customer IDs, login customer IDs, and account roles are resolved together; ambiguous names stop for operator review.'
      },
      {
        title: 'A Signed Website Evidence Chain',
        content: 'A privacy-minimised, signed dealer-platform contract records capture, consent, destination configuration, delivery, provider acceptance, and reporting evidence as separate stages. Stable event IDs make retries idempotent, diagnostics stay redacted, and browser Google Ads delivery remains observable without silently activating a second server-delivery path.'
      },
      {
        title: 'Calls Kept in Honest Layers',
        content: 'Website phone clicks, Google-hosted call interactions, connected calls, and qualified calls are reported independently. Duration and qualification are shown only when the relevant provider supplies them, while a successful empty Google sync is labelled as no calls returned rather than treated as proof that call tracking works.'
      },
      {
        title: 'Freshness You Can Act On',
        content: 'Spend, campaign conversions, conversion-action inventory, website events, and provider calls each carry their own freshness. Historical syncs expose their requested, covered, and missing date ranges plus job progress, so incomplete conversion totals become an actionable blocker instead of quietly disappearing from a report.'
      }
    ]
  },
  'page-studio': {
    title: 'Page Studio',
    slug: 'page-studio',
    icon: 'i-lucide-panels-top-left',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50 dark:bg-rose-500/10',
    categoryIconColor: 'text-rose-600 dark:text-rose-400',
    description: 'Plan, build, review, and release client websites through one governed workspace shared by the agency and client portal.',
    details: [
      {
        title: 'One Website Workspace, Two Deliberate Views',
        content: 'Agency staff work from a portfolio view protected by explicit Page Studio permissions. Client users see Page Studio inside their existing portal only when a website is assigned to them, and every request remains scoped to that client and membership. Internal provisioning and release controls never leak into the client experience.'
      },
      {
        title: 'A Visual Multi-Page Builder',
        content: 'Build a complete page tree with nested subpages, reusable hero, text, image, and call-to-action sections, responsive desktop, tablet, and mobile previews, page visibility, and per-page SEO. Revision-safe draft saves prevent one editing session from silently overwriting another.'
      },
      {
        title: 'Governed Preview and Publishing',
        content: 'Drafts, editor sessions, checkpoints, review submissions, approvals, and immutable releases are separated so editing does not silently become production. Preview credentials are short-lived and scoped, service-to-service calls remain private, and the release path is designed for auditable promotion and rollback.'
      },
      {
        title: 'Cloudflare Delivery and Domains',
        content: 'The delivery architecture uses Cloudflare Workers and Pages for private build, sandbox, control, and delivery services. Domain registration and custom-domain workflows can be layered into the governed release process as the staged rollout advances, without handing clients unrestricted infrastructure access.'
      }
    ]
  },
  'search-authority-ai-trust': {
    title: 'Search Authority & AI Trust',
    slug: 'search-authority-ai-trust',
    icon: 'i-lucide-search-check',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50 dark:bg-cyan-500/10',
    categoryIconColor: 'text-cyan-600 dark:text-cyan-400',
    description: 'Build durable search authority from verified provider evidence, explainable opportunities, governed delivery, and honest measurement.',
    details: [
      {
        title: 'Search Evidence',
        content: 'Connect Google Search Console with least-privilege access, preserve provider completeness and provisional states, and compare clicks, impressions, click-through rate, and average position without inventing an AI visibility metric.'
      },
      {
        title: 'Technical Trust',
        content: 'Monitor status, robots, canonicals, sitemap evidence, structured-data parity, soft 404s, and image hygiene from bounded owned-site crawls. Mobile performance keeps CrUX field experience separate from Lighthouse lab tests, with unavailable provider evidence labelled honestly instead of shown as zero or passing.'
      },
      {
        title: 'Governed Guides, Without CMS Dependence',
        content: 'Sales-team sources, claims, disclaimers, immutable versions and attributable approvals are kept together. Approved guides can publish on a client-owned XeroFlow content host with server-rendered metadata, structured data, a sitemap and instant manifest rollback. A bounded GTM Menu Agent may add one approved discovery link without editing Dealer Studio or pretending GTM can create an indexable page.'
      },
      {
        title: 'Transparent Outcomes and Provider Evidence',
        content: 'Agency and client views keep first-party guide events, explicit direct or assisted lead attribution, aggregate GA4 evidence and unavailable data separate. PMax output is a review brief, never an automatic Ads change. Optional Google Business Profile metrics stay off until provider access and a healthy client location are proven; private queries, credentials and cross-client comparisons remain protected.'
      }
    ]
  },
  // ─── Sales & CRM ──────────────────────────────────────────────
  'crm-contacts': {
    title: 'Contacts & Companies',
    slug: 'crm-contacts',
    icon: 'i-lucide-contact-round',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'A full contact and company database — people and organisations, the relationships between them, and a complete, automatically captured history of every interaction.',
    details: [
      {
        title: 'People and Companies, Linked',
        content: 'Store every contact and company as a rich record, then link them the way the real world works — people belong to companies, companies have parent and subsidiary relationships, and contacts connect to the deals, tasks, and documents they touch. Open any record and you immediately see who they work with and what is in flight, instead of hunting across spreadsheets and inboxes.'
      },
      {
        title: 'A Complete Activity Timeline',
        content: 'Every email logged, call noted, task completed, stage change, and field edit lands on a single chronological timeline for the contact or company. Reps pick up a relationship mid-conversation without asking "where did we leave this?", and managers can audit the full history of an account at a glance.'
      },
      {
        title: 'Communications Log & Documents',
        content: 'Sent emails and inbound leads flow straight into the contact\'s communications log through the platform\'s comms bridge, so the record stays current without manual data entry. Attach proposals, contracts, and supporting files directly to the record, and they travel with the relationship — and surface in the client portal where you choose to share them.'
      }
    ]
  },
  'crm-pipeline': {
    title: 'Sales Pipeline',
    slug: 'crm-pipeline',
    icon: 'i-lucide-square-kanban',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Track opportunities through customisable stages on a drag-and-drop board, with weighted revenue forecasting that shows what is actually likely to close.',
    details: [
      {
        title: 'Drag-and-Drop Deal Stages',
        content: 'Model your sales process as a set of customisable pipeline stages, then move opportunities through them on a Kanban-style board. Each deal carries its value, owner, expected close date, and linked contact, so the board is both a working view and an honest picture of where revenue sits today.'
      },
      {
        title: 'Weighted Revenue Forecasting',
        content: 'Every stage carries a win probability, so the pipeline rolls up into a weighted forecast rather than a wishful total. See committed versus best-case revenue, filter by owner or close date, and walk into a sales review with numbers you can defend instead of a gut feel.'
      },
      {
        title: 'Stage Automation',
        content: 'Moving a deal between stages can trigger follow-up tasks, score recalculation, and timeline entries automatically — so the next action is never lost when a deal advances. The process runs the rep, not the other way around.'
      },
      {
        title: 'Line Items to Quote',
        content: 'Build an opportunity up from line items, then generate a formatted quote from them in one click — atomic and race-safe, with sequential quote numbering — ready to push to Xero. The path from "interested" to "here is your quote" stays inside one tool.'
      }
    ]
  },
  'crm-activities': {
    title: 'Activities & Tasks',
    slug: 'crm-activities',
    icon: 'i-lucide-list-checks',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Assign tasks with due dates and reminders against any contact or deal, and let a unified activity timeline capture every touchpoint automatically.',
    details: [
      {
        title: 'Tasks Against Any Record',
        content: 'Create a task — a call to make, a proposal to send, a contract to chase — and attach it to the contact, company, or opportunity it belongs to. Assign it to a teammate, set a due date and a reminder, and it shows up in their queue with the full context one click away.'
      },
      {
        title: 'Nothing Goes Cold Silently',
        content: 'Tasks carry due dates and reminders, and overdue work is surfaced rather than buried. The CRM is built so that a deal with no next step, or a reminder that has come due, gets attention — turning those signals into timely nudges instead of letting follow-ups quietly lapse.'
      },
      {
        title: 'Automatic Touchpoint Capture',
        content: 'Logged emails, notes, stage changes, and completed tasks all post to the record\'s activity timeline automatically. Dedicated inbound email securely captures each client\'s CRM conversation, so the history stays trustworthy because it is captured as work happens, not reconstructed afterwards.'
      },
      {
        title: 'A Secure CRM Inbox for Every Client',
        content: 'Agency operators and authorised client CRM administrators can create, rotate, or revoke a client-scoped CRM inbox address from the existing CRM surfaces. The address is shown once when created or rotated, then XeroFlow retains only the data needed to route mail safely; it is never available again from a list or status screen.'
      }
    ]
  },
  'crm-scoring': {
    title: 'Lead Scoring',
    slug: 'crm-scoring',
    icon: 'i-lucide-gauge',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Deterministic lead grading from engagement, recency, and fit signals — so reps always know which leads are hot, and which are quietly going cold.',
    details: [
      {
        title: 'Transparent, Deterministic Scoring',
        content: 'Leads are graded by a deterministic model that combines engagement, recency of activity, and fit — not an opaque black box. Because the formula is explainable, reps trust the score and managers can see exactly why one lead outranks another. The grade is a badge on every record and a sortable column in every view.'
      },
      {
        title: 'Recency That Decays',
        content: 'A lead that was hot last month is not hot today if nothing has happened since. Scores erode as activity goes stale, so the ranking reflects current reality. Hot leads rise to the top of the list and neglected ones visibly cool off — a prompt to act before the opportunity is gone.'
      },
      {
        title: 'Drives Prioritisation Everywhere',
        content: 'The score feeds saved views, the pipeline board, and reporting, so prioritisation is consistent across the whole CRM. Build a "hottest leads" view, sort a stage by score, or surface cooling accounts for a re-engagement push — all from the same honest signal.'
      }
    ]
  },
  'crm-insights': {
    title: 'Insights & Forecasting',
    slug: 'crm-insights',
    icon: 'i-lucide-trending-up',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Pipeline analytics, conversion funnels, weighted revenue forecasts, and a rep leaderboard — the numbers that run your weekly sales review.',
    details: [
      {
        title: 'Pipeline Analytics & Funnels',
        content: 'See how deals move and where they stall: stage-by-stage conversion funnels, win rates, average deal size, and cycle time. Instead of guessing why the quarter is soft, you can point to the exact stage where opportunities leak and fix the process there.'
      },
      {
        title: 'Weighted Revenue Forecast',
        content: 'The forecast rolls every open opportunity up by stage probability into committed and best-case numbers, sliceable by owner and close date. It is the same weighted logic that drives the pipeline board, so the dashboard and the deals always agree.'
      },
      {
        title: 'Rep Leaderboard',
        content: 'A leaderboard ranks the team on the metrics that matter — deals won, revenue closed, activity volume — turning the CRM into a light, motivating scoreboard for the sales floor and a quick read on who needs support.'
      }
    ]
  },
  'crm-saved-views': {
    title: 'Saved Views & Export',
    slug: 'crm-saved-views',
    icon: 'i-lucide-bookmark',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Save any filtered, sorted view of contacts or deals and switch between them in one click — then export any view to CSV for reporting.',
    details: [
      {
        title: 'Your Views, One Click Away',
        content: 'Filter and sort contacts, companies, or opportunities however you work — "my open deals closing this month", "hot leads in retail", "accounts with no activity in 30 days" — then save the view and return to it instantly. Each rep keeps the working set they need without rebuilding filters every morning.'
      },
      {
        title: 'Built for the Whole Team',
        content: 'Saved views make the CRM feel personal at scale. A media buyer, an account manager, and a sales lead each land on the slice of data that matters to them, all reading from the same single source of truth underneath.'
      },
      {
        title: 'Export to CSV',
        content: 'Any view exports to CSV with its current filters and columns intact — drop it into a board report, a spreadsheet model, or a client update without copy-pasting. The data you see is the data you get.'
      }
    ]
  },
  'crm-dedupe': {
    title: 'Duplicate Detection & Merge',
    slug: 'crm-dedupe',
    icon: 'i-lucide-git-merge',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Automatic duplicate detection across contacts and companies, with a safe side-by-side merge that preserves every linked activity, task, and note.',
    details: [
      {
        title: 'Catch Duplicates Automatically',
        content: 'Leads arrive from ad forms, imports, and manual entry, and duplicates are inevitable. The CRM flags likely duplicate contacts and companies so the same person does not end up scattered across three half-complete records — keeping the database clean enough to trust.'
      },
      {
        title: 'Safe, Lossless Merge',
        content: 'Review suspected duplicates side by side, choose the surviving record and which field values to keep, and merge. Every linked activity, task, note, document, and deal is re-pointed to the surviving record — nothing is orphaned and no history is lost.'
      },
      {
        title: 'Honest Data, Honest Metrics',
        content: 'A clean database is the foundation for everything else — accurate scoring, trustworthy forecasts, and a duplicate rate you can actually measure and drive down over time. Dedupe is what keeps the rest of the CRM honest.'
      }
    ]
  },
  'crm-quotes': {
    title: 'Quote Generation',
    slug: 'crm-quotes',
    icon: 'i-lucide-file-signature',
    category: 'Sales & CRM',
    categoryIcon: 'i-lucide-handshake',
    categoryIconBg: 'bg-teal-50',
    categoryIconColor: 'text-teal-600',
    description: 'Turn an opportunity\'s line items into a formatted quote in one click — atomic, race-safe, sequentially numbered, and ready to push to Xero.',
    details: [
      {
        title: 'Opportunity to Quote in One Click',
        content: 'Build a deal up from line items as you scope it, then generate a quote from those items without re-keying anything. The pricing, the contact, and the line detail all carry over, so the quote is an extension of the deal rather than a separate document you maintain by hand.'
      },
      {
        title: 'Atomic and Race-Safe',
        content: 'Quote generation runs as a single atomic operation with sequential quote numbering, so two reps acting at once never collide or skip a number. The result is a clean, correctly numbered quote every time — the kind of reliability finance teams expect from a system of record.'
      },
      {
        title: 'Straight Into Xero',
        content: 'Quotes flow into the platform\'s Xero integration, ready to become invoices when the deal is won — closing the loop from pipeline to revenue inside one connected platform instead of bouncing between disconnected tools.'
      }
    ]
  },

  // ─── Social Publishing ────────────────────────────────────────
  'social-calendar': {
    title: 'Content Calendar',
    slug: 'social-calendar',
    icon: 'i-lucide-calendar-days',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'A single calendar hub for every organic social post across all your clients\' networks — colour-coded by status, with one-click composing from any day.',
    details: [
      {
        title: 'Month-at-a-Glance Planning',
        content: 'Every scheduled, drafted, and published post lands on the calendar on its target day, colour-coded by status — draft, scheduled, publishing, published, partially published, or failed. Navigate between months, jump back to today, and see exactly how a client\'s content cadence looks across every network in one view.'
      },
      {
        title: 'Compose From Any Day',
        content: 'Hover any day and click to start a new post pre-dated to that slot — the composer opens with the client and date already filled in. Click an existing post to jump straight into editing it. The calendar is the hub the whole publishing workflow radiates from.'
      },
      {
        title: 'Built for Agencies',
        content: 'Switch between clients from a single picker without leaving the page. Pending-approval counts surface right in the header so account managers know when something needs sign-off. Timezone-correct throughout, built on @internationalized/date so a Sydney 9am slot always resolves to the right instant.'
      }
    ]
  },
  'social-planner': {
    title: 'Campaign Planner & AI Content Calendar',
    slug: 'social-planner',
    icon: 'i-lucide-folder-kanban',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Plan a client\'s organic social as campaigns on a production-pipeline board, and let AI draft a whole week of content from a brief — every draft reviewed before anything is scheduled.',
    details: [
      {
        title: 'A Production Pipeline, Not Just a Calendar',
        content: 'See every post as a card on a board whose columns are the real stages of your workflow — Draft, Needs approval, Scheduled, Published. Drag a card across lanes to move it through the pipeline; failed posts surface with an attention flag so nothing slips. It is the operational view the calendar and queue can\'t show: at a glance, what needs your attention right now.'
      },
      {
        title: 'Campaigns as First-Class Plans',
        content: 'Group posts into campaigns — a launch, a promotion, an always-on theme — each with its own colour, date window, brief, and goal. Flip on "Group by campaign" to see the board as swimlanes with live rollups (12 posts · 4 scheduled · goal 20), so you always know how a launch is tracking. Campaigns are the connective tissue across Compose, the Calendar, and the Queue.'
      },
      {
        title: 'AI Drafts a Week in One Click',
        content: 'Give the AI a brief, a campaign, a date range, a tone, and your networks, and it returns a grid of draft posts with per-network variants — the differentiator over reused, one-size-fits-all captions. Edit any draft inline, regenerate the ones that miss, discard the rest. Then add them to the board in a single click.'
      },
      {
        title: 'Safe by Design',
        content: 'AI output always lands as drafts in the review lane — nothing schedules or publishes without an explicit human action. The board is the safety gate. Built on the same composer, scheduling, and approval engine as the rest of the suite, so a planned post flows straight into the workflow your team already knows.'
      }
    ]
  },
  'social-news-intelligence': {
    title: 'Client News Intelligence',
    slug: 'social-news-intelligence',
    icon: 'i-lucide-newspaper',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Turn a shared industry news feed into client-specific social opportunities, with explainable relevance, optional AI rewriting, connected-account targeting, and human approval throughout.',
    details: [
      {
        title: 'One Feed, Filtered Per Client',
        content: 'Bring an aggregated MCP news source into a shared inbox, then filter it by each client’s industry, audience, content pillars, included and excluded keywords, brands, and preferred networks. Every relevance score includes the reasons behind it, so account teams can see why a story fits before selecting it.'
      },
      {
        title: 'Rewrite and Route With Control',
        content: 'Cherry-pick a story, keep the source intact or rewrite it in the client’s approved voice, then target specific connected accounts across Facebook, Instagram, LinkedIn, TikTok, YouTube, and Google Business. Save it as a draft, choose an exact time, or use the client’s next available posting slot.'
      },
      {
        title: 'Client Knowledge With a Review Gate',
        content: 'Client briefs, decisions, plans, and performance findings can inform recommendations and rewrites only after they have been approved inside XeroFlow. Mapped Monday plans and discussions can be previewed and imported as pending evidence; they never become AI guidance automatically, and XeroFlow remains the operational source of truth.'
      },
      {
        title: 'Packages Connected to Real Budgets',
        content: 'Versioned content packages capture platform volumes, approval service levels, and overage policy, while commercial value stays linked to the client’s existing project, rate card, and job budget allocation. Usage follows the immutable package assignment without creating a second finance ledger.'
      }
    ]
  },
  'social-composer': {
    title: 'Multi-Network Composer',
    slug: 'social-composer',
    icon: 'i-lucide-pen-square',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Author a post once and tailor it per network — Facebook, Instagram, LinkedIn, TikTok, YouTube, and Google Business — with live per-network previews as you type.',
    details: [
      {
        title: 'Customise Per Network',
        content: 'Write a base post, then flip on per-network customisation to override the copy or media for any specific platform. Blank tabs inherit the base post automatically, so you only customise what actually needs to differ. Character counters warn you against the tightest limit across your selected networks.'
      },
      {
        title: 'Live Previews',
        content: 'See exactly how your post will render on each network as you write — Facebook feed, LinkedIn, TikTok, and YouTube previews update in real time from the resolved content (base plus any per-network override), reusing the same preview engine that powers paid ad mockups.'
      },
      {
        title: 'Creative From Banner Studio',
        content: 'Pull finished creatives straight from Banner Studio, add media from your library, or attach image URLs — the same creative engine your paid ads run on, now feeding organic. Outbound links are automatically UTM-stamped per network so attribution flows into your analytics.'
      },
      {
        title: 'Deep-Linkable',
        content: 'The composer opens pre-filled from anywhere — a calendar day, an existing draft, or a future campaign — via simple query parameters. First comments, hashtag groups, and internal tags round out a post that\'s ready to schedule across every channel at once.'
      }
    ]
  },
  'social-scheduling': {
    title: 'Scheduling & Queue',
    slug: 'social-scheduling',
    icon: 'i-lucide-calendar-clock',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Publish now, schedule for a specific time, or drop posts into recurring optimal slots — dispatched reliably with partial-success handling and no double-posts.',
    details: [
      {
        title: 'Three Ways to Schedule',
        content: 'Publish immediately, pick an exact date and time, or add a post to the queue to fill the next free recurring slot. Define posting slots per weekday and time in the Planner, and queued content flows into them automatically in priority order you control.'
      },
      {
        title: 'Reliable Dispatch',
        content: 'A companion Cloudflare Worker fires the publishing dispatcher every couple of minutes. Each due post is claimed with an idempotent database update, so overlapping runs can never double-publish. Failed attempts are bounded and surfaced — never silently retried into oblivion.'
      },
      {
        title: 'Partial-Success Aware',
        content: 'When a post targets several networks and one fails — an expired token, a platform hiccup — the others still go out. Per-network results are recorded individually, so you can see exactly what published where and retry only what failed, rather than re-blasting every channel.'
      }
    ]
  },
  'social-approvals': {
    title: 'Social Approvals',
    slug: 'social-approvals',
    icon: 'i-lucide-clipboard-check',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Agency and client-portal sign-off with source-aware previews, feedback, and publish-safe approval gates.',
    details: [
      {
        title: 'Built-In Sign-Off',
        content: 'Creatives request approval on a draft; managers approve or send it back with a reason. Approved posts become eligible to schedule or publish, while rejected ones return to draft with the feedback attached — a clean loop that keeps quality control in the workflow rather than in side-channel chat.'
      },
      {
        title: 'Notifications That Reach the Right People',
        content: 'Approval requests fan out to management-permission staff through the same notification system that powers the rest of the dashboard — in-app and web push. Decisions notify the original requester instantly, so approvals never stall waiting on someone to check a separate inbox.'
      },
      {
        title: 'Client-Portal Review',
        content: 'Clients review news-backed social drafts in their own scoped portal, switch between platform-specific versions, verify the original source and target accounts, and approve, reject, or request changes with attributable feedback. Client sign-off remains separate from agency approval, so it can never publish content directly.'
      }
    ]
  },
  'social-inbox': {
    title: 'Engagement Inbox',
    slug: 'social-inbox',
    icon: 'i-lucide-messages-square',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Every comment, mention, and message across your social networks in one unified inbox — read, triage, and reply without leaving the dashboard.',
    details: [
      {
        title: 'One Inbox, Every Network',
        content: 'Comments on the posts you publish, plus mentions and direct messages, flow into a single conversation view across Facebook, Instagram, LinkedIn, TikTok, YouTube, and Google Business. Each thread keeps the full back-and-forth so your team always has context before they reply.'
      },
      {
        title: 'Reply In Place',
        content: 'Respond to a comment or message straight from the dashboard — the reply posts back to the originating network through the same connection that powers publishing. No tab-switching, no copy-paste, no missed replies.'
      },
      {
        title: 'Real-Time, Reliable Ingestion',
        content: 'Webhooks bring Meta comments in the moment they happen, while a steady background sync pulls comments and reviews from the other networks — de-duplicated so nothing shows up twice and nothing slips through.'
      },
      {
        title: 'Built For What’s Next',
        content: 'The inbox is the foundation for AI-assisted replies, automation rules, team assignment, and SLA tracking — rolling out in stages on top of the unified conversation model.'
      }
    ]
  },
  'social-reviews': {
    title: 'Review Management',
    slug: 'social-reviews',
    icon: 'i-lucide-star',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Track and respond to Google Business and Facebook reviews in one place, with ratings and sentiment at a glance.',
    details: [
      {
        title: 'Every Review, One View',
        content: 'Google Business reviews and Facebook recommendations land in a dedicated review surface with the star rating, reviewer, and full text — sorted by recency so the freshest feedback is always on top.'
      },
      {
        title: 'Respond Where It Counts',
        content: 'Reply to a review directly from the dashboard and it posts back to the platform. Average rating and a per-star distribution sit at the top so you can read the room before you respond.'
      },
      {
        title: 'AI Responses On The Roadmap',
        content: 'Review replies plug into the same engine as the engagement inbox, so AI-drafted and rule-based responses (with approval guardrails) layer on as the automation phase ships.'
      }
    ]
  },
  'social-automation': {
    title: 'Reply Automation',
    slug: 'social-automation',
    icon: 'i-lucide-bot',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Let AI draft on-brand replies to comments and reviews — suggested for one-click sending, queued for human approval, or sent automatically under strict guardrails.',
    details: [
      {
        title: 'Four Modes, One Engine',
        content: 'Every automation rule runs in one of four modes: off (manual), suggest (AI drafts, your team sends), approval (AI drafts, a human or the client signs off), or autopilot (sent automatically). Pick the level of control per client, per network, and per channel — comments and reviews each get their own rules.'
      },
      {
        title: 'Guardrails You Can Trust',
        content: 'Autopilot never fires blind. A deterministic safety rule forces any complaint, legal threat, or sensitive message to a human — always. On top of that: a confidence floor, per-rule hourly rate limits, business-hours gating, and exactly-one-reply-per-message idempotency. Every action is written to an auditable queue, and a global kill-switch keeps automation dormant until you turn it on.'
      },
      {
        title: 'On-Brand, Never Invented',
        content: 'Drafts come from your brand voice instructions and the full conversation context, and the model is told never to invent prices, dates, or facts. Low-confidence drafts route to a human automatically, so what goes out always reads like your team wrote it.'
      },
      {
        title: 'Client Approval On The Roadmap',
        content: 'Approval rules can route to the client portal, letting clients sign off on their own replies — building on the same audited queue and guardrails that power staff approvals.'
      }
    ]
  },
  // ─── Creative Production ──────────────────────────────────────
  'audio-studio': {
    title: 'Audio Studio',
    slug: 'audio-studio',
    icon: 'i-lucide-mic',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Generate owned AI voiceover and music you can use across radio, TikTok and Meta — no clearance, no takedown risk — and drop it straight into your ad creatives.',
    details: [
      {
        title: 'Owned Audio That Travels',
        content: 'TikTok\'s Commercial Music Library is TikTok-only and Meta\'s Sound Collection is Facebook/Instagram-only — neither clears for use anywhere else. Audio you generate here is yours: one voiceover or one music track runs on radio, TikTok, and Meta with no licensing, no clearance, and no takedown risk across your whole client roster.'
      },
      {
        title: 'Voiceover And Music From A Brief',
        content: 'Type a script and get an owned voiceover in seconds. Describe a mood — "warm, upbeat acoustic, ~110 bpm" — and get an original instrumental bed, or supply your own lyrics for a full vocal track. Both land in the same reusable, per-client library you can reach for again and again.'
      },
      {
        title: 'Mimicry Guardrail Built In',
        content: 'Meta bans AI audio that imitates a specific copyrighted artist. Every brief passes an artist-mimicry guard — pattern and blocklist first, maintained without a redeploy. Voiceover scripts have the offending phrasing stripped; music briefs that name an artist are rejected outright, so your generated audio stays compliant by default rather than risking an account flag.'
      },
      {
        title: 'Straight Into Banner Studio',
        content: 'Generated voiceovers and music land in a reusable library tagged per client, then appear directly in the Banner Studio asset picker — one click drops a track onto your ad as an audio layer. The same owned-audio engine is built tenant-aware so client self-serve in the portal is a fast-follow.'
      },
      {
        title: 'Channel-Ready Loudness',
        content: 'Every track can be rendered to each channel\'s loudness spec automatically — broadcast/radio at around −24 LKFS, TikTok/Meta at −14 LUFS with a −1 dBTP ceiling, plus social cut-downs. Two-pass loudness normalisation runs on the edge, so the master you generate ships compliant everywhere it runs, with per-channel variants ready to download.'
      }
    ]
  },
  // ─── Video Studio ────────────────────────────────────────────
  'video-studio': {
    title: 'Video Studio',
    slug: 'video-studio',
    icon: 'i-lucide-clapperboard',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'A single-screen video editor for social: footage, stills, Banner Studio overlays, AI-generated clips, voiceover and music on one docked timeline, rendered to every format your media plan needs.',
    details: [
      {
        title: 'One Screen, Every Source',
        content: 'Assets on the left, preview and selected-clip controls in the centre, the inspector on the right, and the timeline docked along the bottom — nothing scrolls away. Drop in uploaded footage and stills, pull overlays straight from Banner Studio, add voiceover and music from Audio Studio, or generate B-roll and image-to-video clips with AI — all from the same command bar.'
      },
      {
        title: 'A Real Editing Timeline',
        content: 'Five colour-coded lanes — video, overlay, captions, voiceover, music — with drag-to-move, edge trimming, split at the playhead, snapping to neighbours and the grid, and waveforms on audio clips. Space plays, arrows nudge, ⌘Z undoes, and the dock resizes to fit the job. Every edit autosaves; named version snapshots let you checkpoint a cut and restore it later.'
      },
      {
        title: 'Per-Clip Look Controls',
        content: 'Select any video clip to set its framing (fit, fill or crop) and stack effect presets — film grain, motion blur, VHS, shake, bloom, fisheye — with the preview approximating what it can and flagging what is render-only. Generated clips carry their prompt and model with them, so you can copy the prompt, duplicate the clip, or publish it directly.'
      },
      {
        title: 'Render Once, Ship Everywhere',
        content: 'Pick Reels 9:16, Square 1:1 and YouTube 16:9 in one render. Finished variants can be downloaded, saved back to the library as reusable assets, sent to the client portal for approval, or handed to Social Publishing to schedule — without leaving the editor. Failed renders explain why and retry in place.'
      }
    ]
  },
  // ─── Media Studio Editor ─────────────────────────────────────
  'media-studio-editor': {
    title: 'Media Studio Editor',
    slug: 'media-studio-editor',
    icon: 'i-lucide-film',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'A browser-based multitrack audio editor that lets you drag, trim, slice, and layer clips on a pixel-accurate timeline — with full undo/redo, debounced autosave, and named version snapshots.',
    details: [
      {
        title: 'Pixel-Accurate Multitrack Timeline',
        content: 'Every clip sits on a lane colour-coded by kind — voiceover, music, SFX. Drag to move across the timeline or across tracks. Trim the start or end of any clip by dragging its handle. A snap system locks clip edges to the grid, the playhead, and neighbouring clip boundaries so your mix stays tight without pixel-hunting.'
      },
      {
        title: 'Non-Destructive Undo and Autosave',
        content: 'Every edit — move, trim, slice, add, delete — is undoable and redoable via a 100-step in-memory stack (Cmd+Z / Cmd+Shift+Z). Edits are also debounced-saved to the server automatically after 1.5 seconds of inactivity, so you never lose work. Named version snapshots let you checkpoint a milestone ("Before final mix") and restore it at any time.'
      },
      {
        title: 'Add Clips From The Audio Library',
        content: 'Click "Add clip" to open the asset picker — a sliding panel listing every voiceover and music track in your library with kind filter, title search, and an inline play button for a quick listen. Selecting a track drops it onto the matching kind\'s lane at the current playhead position, with the presigned URL already wired so the engine resolves it immediately.'
      },
      {
        title: 'Waveform Visualisation And Zoom',
        content: 'Each clip block renders its waveform — a visual fingerprint that makes it easy to see phrase boundaries, silence gaps, and music sections at a glance. Zoom controls adjust pixels-per-second so you can work at the level of the whole mix or zoom into a half-second splice point.'
      }
    ]
  },
  // ─── AI Video Generation ─────────────────────────────────────
  'ai-video-generation': {
    title: 'AI Video Generation',
    slug: 'ai-video-generation',
    icon: 'i-lucide-video',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Turn an approved product still into motion, or generate short B-roll from a prompt — owned, brand-safe video clips that drop straight into your media library and video timeline.',
    details: [
      {
        title: 'Image-To-Video From An Approved Still',
        content: 'Start from a real photo — a car on the forecourt, a product on the shelf — and animate it into a clean, on-brand motion clip: a slow parallax, a subtle reveal, a push-in. Because the motion is generated from your own approved still rather than dreamt up from scratch, the product on screen is the actual product, not an AI hallucination of it. Every image-to-video job is gated to source assets that have been approved and are owned by that client or the agency.'
      },
      {
        title: 'Text-To-Video B-Roll',
        content: 'Describe a scene — "aerial over a coastal highway at golden hour" — and get short B-roll clips for backgrounds, transitions, and establishing shots, without a stock-footage subscription or a shoot. B-roll generation is kept on a separate track from product imagery, so brand-critical visuals always come from an approved source while filler footage stays fast and flexible.'
      },
      {
        title: 'Brand And Budget Guardrails Built In',
        content: 'Every generation passes a compliance check before it runs — a request that needs an approved product still but does not have one is blocked, not quietly faked. Spend is governed too: each client carries a monthly budget cap that is reserved atomically before a job is ever queued, so two big renders firing at once can never quietly blow past the limit. Every clip is costed and tagged to its client.'
      },
      {
        title: 'Owned Output On Your Own Storage',
        content: 'Generation runs on Cloudflare\'s AI network with unified billing and a hard dollar spend-limit as a backstop, and every finished clip lands in your own object storage as an owned asset — not locked inside a third-party tool you have to log back into. The result is a video you control, tagged per client and reusable across every campaign for that brand.'
      },
      {
        title: 'Straight Into Your Video Timeline',
        content: 'A finished clip becomes a reusable video asset in the same per-client library as your voiceover and music, ready to drop onto the timeline alongside them. From there it flows into the composite render pipeline — layered with audio beds and animated banner overlays — and renders out to a finished MP4, so a generated shot goes from prompt to packaged ad without leaving the platform.'
      }
    ]
  },
  // ─── Work Management ──────────────────────────────────────────
  'boards': {
    title: 'Boards',
    slug: 'boards',
    icon: 'i-lucide-kanban',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Monday-style boards with 20+ column types — status, people, date, numbers, formulas, and more. The foundation of every project in XeroFlow.',
    details: [
      {
        title: '20+ Column Types',
        content: 'Go far beyond simple text and status columns. XeroFlow boards support people pickers, date ranges, formulas, file attachments, dependency links, ratings, timelines, dropdown menus, checkboxes, country selectors, and more. Each column type has its own editor, filter logic, and sort behavior — so your boards match exactly how your team thinks about work.'
      },
      {
        title: 'Flexible Grouping',
        content: 'Organize tasks into collapsible groups that represent phases, departments, sprints, or any structure that fits your workflow. Groups can be color-coded, reordered by drag-and-drop, and collapsed to focus on what matters. Combined with subtasks, you get a full hierarchy without the rigidity of traditional project management tools.'
      },
      {
        title: 'Inline Editing',
        content: 'Every cell in your board is editable in place — click a status to change it, pick a person from a dropdown, or type directly into a text cell. No modals, no separate edit screens. Changes are saved instantly and broadcast to everyone viewing the board via real-time Server-Sent Events, so your whole team stays in sync.'
      },
      {
        title: 'Five Connected Views',
        content: 'Each board can be viewed as a table, Kanban, timeline, calendar, or gallery — all reading from the same underlying data. Switch views instantly without losing filters or group state. Your media buyers might prefer Kanban while your project managers live in timeline view, and both see the same tasks.'
      }
    ]
  },
  'kanban-view': {
    title: 'Kanban View',
    slug: 'kanban-view',
    icon: 'i-lucide-columns-3',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Drag-and-drop Kanban boards grouped by any status column with real-time updates. Visualize your workflow as cards flowing through stages.',
    details: [
      {
        title: 'Group by Any Status Column',
        content: 'Unlike rigid Kanban tools that only support a single workflow, XeroFlow lets you group cards by any status-type column on your board. Switch between grouping by approval status, production stage, priority level, or custom workflows. Each grouping creates a fresh Kanban layout while preserving all your card data and metadata.'
      },
      {
        title: 'Drag-and-Drop with Real-Time Sync',
        content: 'Move cards between columns with a simple drag gesture. The status column updates instantly and the change is broadcast to all connected teammates in real time via SSE. No page refresh needed — when your account manager moves a task to "Client Review," your designer sees it happen live on their screen.'
      },
      {
        title: 'Card Previews',
        content: 'Each Kanban card shows a configurable preview of key columns — assignee avatars, due dates, priority badges, and file thumbnails. Hover for a quick summary or click to open the full task panel. Cards with overdue dates are automatically highlighted, so nothing slips through the cracks during a busy production week.'
      },
      {
        title: 'Column Limits and Alerts',
        content: 'Set work-in-progress limits on any Kanban column to prevent bottlenecks. When a column exceeds its limit, it visually highlights so your team knows capacity has been reached. This helps agencies avoid the common trap of starting too many tasks without finishing existing ones, keeping throughput high and cycle times low.'
      }
    ]
  },
  'timeline-view': {
    title: 'Timeline View',
    slug: 'timeline-view',
    icon: 'i-lucide-gantt-chart',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Gantt-style timeline with date range bars, drag-to-reschedule, and dependency tracking. See your entire project schedule at a glance.',
    details: [
      {
        title: 'Visual Date Range Bars',
        content: 'Every task with a start and end date renders as a horizontal bar on the timeline. Bars are color-coded by status or group, and their length directly represents duration. Zoom between day, week, and month granularity to see individual task detail or a bird\'s-eye view of a multi-month campaign plan.'
      },
      {
        title: 'Drag to Reschedule',
        content: 'Grab any bar to move it forward or backward in time, or drag the edges to extend or shorten the duration. The underlying date columns update instantly and sync across all views. When a client pushes a launch date back by two weeks, you can reschedule the entire chain of dependent tasks in seconds rather than editing each one individually.'
      },
      {
        title: 'Dependency Tracking',
        content: 'Link tasks together with finish-to-start dependencies so your team understands the critical path. Dependencies are drawn as connector lines between bars. When a predecessor task slips, downstream tasks are visually flagged, giving project managers early warning about schedule risks before they cascade into missed deadlines.'
      },
      {
        title: 'Milestone Markers',
        content: 'Drop milestone markers on key dates — campaign launches, client presentations, media buy deadlines. Milestones appear as diamond indicators on the timeline and are visible in every zoom level. Use them to anchor your project schedule around the dates that matter most to your clients and stakeholders.'
      }
    ]
  },
  'calendar-view': {
    title: 'Calendar View',
    slug: 'calendar-view',
    icon: 'i-lucide-calendar',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Monthly calendar with task cards, drag-to-reschedule, and date-based filtering. Plan your team\'s capacity and deadlines visually.',
    details: [
      {
        title: 'Monthly Task Layout',
        content: 'Tasks appear as compact cards on their due dates, organized by day. Each card shows the task title, assignee avatar, and a color-coded status indicator. When multiple tasks land on the same day, they stack vertically with an overflow indicator so you can see at a glance which days are overloaded and which have capacity.'
      },
      {
        title: 'Drag-to-Reschedule',
        content: 'Drag any task card from one day to another to change its due date instantly. The underlying date column updates in real time across all views — your team\'s table view and Kanban board reflect the change immediately. This makes weekly capacity planning meetings fast and visual, with the whole team watching changes happen live.'
      },
      {
        title: 'Date-Based Filtering',
        content: 'Filter the calendar by assignee, status, client, or any column to focus on specific slices of work. See only your tasks, only overdue items, or only tasks for a specific client. Filters persist as you navigate between months, so you can scan ahead to see how workload is distributed across upcoming weeks.'
      },
      {
        title: 'Timezone-Aware Scheduling',
        content: 'Built on @internationalized/date for proper timezone handling. Tasks display in each user\'s local timezone, and date calculations account for daylight saving transitions. When your Sydney team and London team look at the same calendar, dates resolve correctly for both — critical for agencies managing global campaigns with hard launch dates.'
      }
    ]
  },
  'gallery-view': {
    title: 'Gallery View',
    slug: 'gallery-view',
    icon: 'i-lucide-layout-grid',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Visual grid of tasks with file previews — perfect for creative review workflows where you need to see the work, not just read about it.',
    details: [
      {
        title: 'File-First Layout',
        content: 'Gallery view prioritizes the visual — each task is rendered as a card with its primary file attachment displayed as a large thumbnail. Images, PDFs, and videos get visual previews. This is purpose-built for creative teams reviewing ad designs, social posts, brand assets, and client deliverables where the visual output is what matters.'
      },
      {
        title: 'Quick Approval Workflow',
        content: 'Each gallery card shows the current approval status and allows one-click status changes. Reviewers can scan through a grid of creative assets, approve the ones that look good, and flag the ones that need revisions — all without opening individual task panels. Combined with client portal access, this becomes a powerful external review tool.'
      },
      {
        title: 'Configurable Card Fields',
        content: 'Choose which columns appear below each gallery thumbnail. Display the assignee, due date, client name, platform tag, or any custom column. Configure different gallery layouts for different workflows — your social team might show platform and post date, while your design team shows file type and revision number.'
      },
      {
        title: 'Lightbox Preview',
        content: 'Click any gallery card to open a full-screen lightbox with the file at maximum resolution. Navigate between items with arrow keys. The lightbox includes file metadata, download options, and the ability to leave comments directly on the preview. Share the direct link with a client for quick ad-hoc reviews outside the portal.'
      }
    ]
  },
  'groups-subtasks': {
    title: 'Groups & Subtasks',
    slug: 'groups-subtasks',
    icon: 'i-lucide-list-tree',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Organize tasks into collapsible groups with nested subtasks for complex projects. Build hierarchies that match how your agency actually works.',
    details: [
      {
        title: 'Collapsible Groups',
        content: 'Create groups within a board to represent phases, departments, sprints, or any logical division of work. Groups are color-coded, reorderable, and collapsible — expand the ones you\'re working on and collapse the rest to reduce visual noise. Each group shows an aggregate summary (task count, completion percentage) even when collapsed.'
      },
      {
        title: 'Nested Subtasks',
        content: 'Break complex tasks into subtasks that inherit the parent board\'s column structure. Subtasks can have their own assignees, dates, statuses, and file attachments. The parent task shows a progress bar based on subtask completion, giving managers a roll-up view without needing to drill into every line item on a busy board.'
      },
      {
        title: 'Drag-and-Drop Reordering',
        content: 'Move tasks between groups or reorder them within a group using drag-and-drop. Subtasks can be promoted to top-level tasks or demoted back. The entire hierarchy is sortable, so you can organize work exactly how your team needs it — whether that\'s by priority, by client, by deadline, or by whoever screams the loudest.'
      },
      {
        title: 'Group-Level Actions',
        content: 'Apply bulk actions at the group level — change all statuses, reassign all tasks, duplicate the entire group, or archive it. When you spin up a new campaign, duplicate an existing group to get a pre-populated task list with all the standard deliverables, then customize from there. Templates on top of templates.'
      }
    ]
  },
  'templates': {
    title: 'Templates',
    slug: 'templates',
    icon: 'i-lucide-copy',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Save board configurations as templates. Spin up new projects in seconds with pre-built column structures, groups, and task lists.',
    details: [
      {
        title: 'Save Any Board as Template',
        content: 'Convert any existing board into a reusable template with one click. The template captures the full column configuration, groups, default values, and optionally the task items themselves. Your best-performing campaign setup becomes the starting point for every new campaign, ensuring consistency and reducing setup time from hours to seconds.'
      },
      {
        title: 'Template Library',
        content: 'Browse your agency\'s template library organized by category — client onboarding, social media campaigns, website builds, SEO audits, ad production. Each template includes a description and a preview of its structure. New team members can spin up properly configured boards without needing to learn the agency\'s conventions from scratch.'
      },
      {
        title: 'Customizable on Creation',
        content: 'When you create a board from a template, you can choose which elements to include — columns, groups, tasks, or just the structure. Override default values, rename groups, and adjust dates relative to a start date. The template is a starting point, not a rigid constraint, so every project can be tailored while still inheriting proven workflows.'
      },
      {
        title: 'Template Versioning',
        content: 'Update your templates as your processes improve. When you refine a workflow, save the updated version without affecting boards that were already created from the old version. This means your agency\'s operational playbook evolves over time, and new projects always get the latest and greatest setup.'
      }
    ]
  },
  'real-time-sse': {
    title: 'Real-Time SSE',
    slug: 'real-time-sse',
    icon: 'i-lucide-radio',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Live updates via Server-Sent Events — see changes from teammates instantly, with WebSocket upgrade and polling fallback for maximum reliability.',
    details: [
      {
        title: 'Instant Change Propagation',
        content: 'When anyone on your team edits a cell, creates a task, moves a Kanban card, or changes a status, the update appears on every other user\'s screen within milliseconds. No manual refresh required. This is essential for agencies where multiple people work on the same boards simultaneously — during production weeks, status meetings, or live campaign launches.'
      },
      {
        title: 'Multi-Layer Connection Strategy',
        content: 'XeroFlow uses a three-tier connection strategy: WebSocket (via Durable Objects) as the primary channel, SSE as the first fallback, and periodic polling as the last resort. The client automatically negotiates the best available connection and seamlessly switches between them without user intervention. Your real-time experience degrades gracefully rather than breaking entirely.'
      },
      {
        title: 'Online Presence Indicators',
        content: 'See which teammates are currently viewing the same board with live presence indicators. User avatars appear in the board header showing who is online. This helps your team coordinate in real time — you know whether to ping someone on chat or just wait for them to see the update, and you avoid conflicting edits on the same tasks.'
      },
      {
        title: 'Event-Driven Architecture',
        content: 'Under the hood, every board change emits a typed event that flows through Cloudflare Durable Objects. This same event system powers chat notifications, board-linked channels, automation triggers, and the activity feed. A single status change can simultaneously update the board, post to a chat channel, send an email notification, and log to the audit trail.'
      }
    ]
  },
  'table-view': {
    title: 'Table View',
    slug: 'table-view',
    icon: 'i-lucide-table',
    category: 'Work Management',
    categoryIcon: 'i-lucide-kanban',
    categoryIconBg: 'bg-blue-50',
    categoryIconColor: 'text-blue-600',
    description: 'Spreadsheet-style table with sortable columns, inline editing, and bulk actions. The power-user view for agencies that think in rows and columns.',
    details: [
      {
        title: 'Spreadsheet-Style Editing',
        content: 'Table view renders your board as a dense, data-rich spreadsheet where every cell is inline-editable. Click any cell to modify it — statuses toggle, dates open pickers, people show assignment dropdowns. Tab between cells like a spreadsheet. For agencies processing high volumes of tasks, this is the fastest way to update data in bulk.'
      },
      {
        title: 'Multi-Column Sorting and Filtering',
        content: 'Sort by any column in ascending or descending order, or apply multi-column sorts (e.g., sort by client first, then by due date within each client). Combine with column filters to create precise views — show only tasks assigned to you, due this week, with a status of "In Progress." Save these filter combinations as named views for quick access.'
      },
      {
        title: 'Bulk Actions',
        content: 'Select multiple rows with checkboxes and apply actions in bulk — change status, reassign, move to a different group, duplicate, or archive. When a client puts a project on hold, select all their tasks and set them to "Paused" in one action instead of editing each one. Bulk actions respect permissions and log to the audit trail.'
      },
      {
        title: 'Column Resizing and Pinning',
        content: 'Drag column borders to resize, and pin important columns to the left so they stay visible when you scroll horizontally. Hide columns you don\'t need for the current workflow. Table view adapts to however wide your board is — whether you\'re using 5 columns or 25 — and remembers your layout preferences per board.'
      }
    ]
  },

  // ─── Financial Operations ─────────────────────────────────────
  'lead-capture-routing': {
    title: 'Lead Capture & Routing',
    slug: 'lead-capture-routing',
    icon: 'i-lucide-inbox',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Signed first-party and provider gateways, native ad-form and dedicated inbound email ingestion, safe end-to-end tests, and exact routing into one real-time inbox.',
    details: [
      {
        title: 'Six ways in, one inbox',
        content: 'Google Ads native webhooks (per-client URL + key, paste into the lead form\'s webhook integration). Meta lead form CRM integration (live verify endpoint; after Meta approves leads_retrieval, each account must reconnect for the expanded scope before ingestion is verified). Dedicated inbound email securely captures each client\'s CRM conversation for marketplaces and websites, with deterministic ADF/provider parsing and optional privacy-approved structured AI fallback. The CRM inbox address is shown once when created or rotated, then cannot be retrieved later. A generic webhook endpoint for Zapier, Make, n8n, partner CRMs, embedded forms, and mobile apps. CSV import for Meta Lead Center exports with column auto-mapping. Manual entry for walk-ins and phone calls. Every source enters the same canonical routing and CRM pipeline; inbound email does not reply to customers.'
      },
      {
        title: 'A universal signed gateway — CRM optional',
        content: 'Websites and form providers can send a versioned lead.submitted.v1 receipt directly to XeroFlow using replay-protected HMAC signatures and copy-once rotating secrets. XeroFlow stores and routes confirmed leads in capture-only mode, so an external CRM is an optional downstream destination rather than a prerequisite.',
      },
      {
        title: 'Contained end-to-end testing',
        content: 'Start a 15-minute, origin-bound test from the setup guide and follow append-only evidence from tracker load through browser correlation to the trusted receipt. Synthetic leads are hidden from default reporting and cannot notify staff, route to live destinations, promote into CRM, or publish normal conversion events.',
      },
      {
        title: 'Exact enquiry-to-conversion mapping',
        content: 'Stock, finance, test-drive, contact, and model/variant enquiries can map to separate provider conversion actions. Typed destinations use exact matching; an unknown type pauses for configuration instead of sending one enquiry to every action.',
      },
      {
        title: 'Real-time, not polled',
        content: 'Native webhooks deliver leads within seconds, not Zapier\'s 1-15 minute polling window. Speed-to-lead matters — contacting a lead within 5 minutes is 21x more likely to convert. Each ingestion path enqueues routing immediately, and the SSE stream pushes new rows to any open inbox tab without a refresh.'
      },
      {
        title: 'Multi-tenant by design',
        content: 'One agency dashboard manages every client\'s lead routing. Each client gets their own webhook URL + secret key, their own form rules, and their own portal view — no Zap duplication, no per-task fees, no separate logins to maintain.'
      },
      {
        title: 'Automotive leads delivered to AutoGate',
        content: 'Add AutoGate as an outgoing destination on an individual form rule—not as a blanket client-wide push. Configure the dealer seller identifier and lead context in XeroFlow, then filter delivery by campaign ID or name, ad ID or name, Facebook Page, vehicle make, model, retailer item ID, or stock number. Prospect, campaign, stock, and vehicle fields are mapped with a stable unique identifier across retries to prevent duplicates; shared AutoGate credentials remain protected in Cloudflare.'
      },
      {
        title: 'Client portal inbox built-in',
        content: 'Add a "portal" destination to any rule and the client sees their leads inside the same XeroFlow portal where they already track invoices and projects. Branded, real-time, no extra login — and the client\'s "Mark contacted" actions sync back to the agency side automatically.'
      },
      {
        title: 'Routing logic that\'s actually useful',
        content: 'Per-destination filters: "AutoGate only for the EV campaign", "AutoGate only when make is Hyundai", "SMS only if budget > $5,000", or "Slack only if utm_source = facebook". Optional delays run from immediate to 24 hours. HMAC-signed outbound webhooks and stable AutoGate identifiers let receivers safely dedupe retries.'
      },
      {
        title: "Senses test data and treats it differently",
        content: 'Google\'s test data and XeroFlow signed test runs are stored as synthetic evidence but excluded from normal side effects. Toggle "Show test leads" when an authorised operator needs to inspect one; staff notifications, routing, CRM promotion, and conversion fan-out remain suppressed.',
      },
      {
        title: 'Marketer-friendly setup',
        content: 'In-product setup guide with platform-specific instructions, a destination-config wizard with one-click presets ("Slack: Lead alert", "Email: Sales notification"), a side panel that lists the actual fields each form has sent so template tokens can be copied without typing them, and a form picker that lists Google Ads lead forms across all connected accounts directly from the API.'
      }
    ]
  },

  'xero-integration': {
    title: 'Xero Integration',
    slug: 'xero-integration',
    icon: 'i-lucide-link',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Two-way sync with Xero for invoices, expenses, contacts, and chart of accounts. Keep your project management and accounting in perfect alignment.',
    details: [
      {
        title: 'OAuth-Connected Sync',
        content: 'Connect your Xero organization with a secure OAuth 2.0 flow. Once linked, XeroFlow syncs contacts, invoices, expense claims, and chart of accounts bidirectionally. New clients created in XeroFlow automatically appear as contacts in Xero, and invoices generated through the EOM engine upload directly to your Xero ledger with correct line items, tax codes, and tracking categories.'
      },
      {
        title: 'Invoice Lifecycle Management',
        content: 'Track invoices from draft to paid without leaving XeroFlow. See payment status, due dates, overdue amounts, and aging reports alongside your project data. When a client\'s invoice is overdue, the information surfaces on their client card and in the AI anomaly detection system, so your account managers can follow up proactively instead of waiting for month-end surprises.'
      },
      {
        title: 'Project Allocations & Reconciliation',
        content: 'Project allocations map Xero revenue lines and Xero supplier lines to projects, while synced Meta and Google Ads spend is treated as pass-through for Agency Gross Income (AGI). Unallocated values remain visible until assigned, with a clear unallocated-source reconciliation: each client total equals project totals plus unallocated amounts. Finance-gated, audited allocation changes keep every adjustment reviewable.'
      },
      {
        title: 'Chart of Accounts Mapping',
        content: 'XeroFlow imports your Xero chart of accounts so that EOM-generated invoices use the correct revenue accounts, tax rates, and tracking categories. Configure mappings once and every future invoice follows your accounting structure automatically. Your finance team reviews clean, correctly categorized invoices in Xero rather than fixing manual entry errors.'
      }
    ]
  },
  'eom-engine': {
    title: 'EOM Engine',
    slug: 'eom-engine',
    icon: 'i-lucide-file-spreadsheet',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'End-of-month invoice generation with configurable line items, tax calculations, and auto-upload to Xero. Turn month-end from a week-long ordeal into a one-click process.',
    details: [
      {
        title: 'Automated Invoice Generation',
        content: 'The EOM engine generates invoices for all active clients based on their retainer agreements, ad spend pass-throughs, and project fees. Configure recurring line items once — monthly retainer, management fees, platform costs — and the engine calculates amounts, applies tax rates, and creates draft invoices ready for review. What used to take your finance team an entire week now happens in minutes.'
      },
      {
        title: 'Ad Spend Pass-Through',
        content: 'Automatically pull actual Meta and Google Ads spend data into invoice line items. The engine calculates management fees as a percentage of spend, adds platform costs, and separates billable spend from agency fees. Each line item references the campaign and date range so clients can reconcile their invoices against their own ad platform dashboards.'
      },
      {
        title: 'Review and Approval Workflow',
        content: 'Generated invoices land in a review queue where your finance team can inspect line items, adjust amounts, add one-off charges, or apply credits before finalizing. Each invoice shows a side-by-side comparison with the previous month so anomalies are easy to spot. Once approved, invoices upload to Xero with a single click and link back to the XeroFlow record for audit purposes.'
      },
      {
        title: 'Archive and Export',
        content: 'Every EOM run is archived to Cloudflare R2 with full line-item detail, calculation breakdowns, and PDF copies. Download historical runs for audits, compare month-over-month trends, or export to CSV for custom analysis. The archive is immutable — once an EOM run is finalized, the record cannot be altered, providing a reliable audit trail for compliance.'
      }
    ]
  },
  'meta-ads-tracking': {
    title: 'Meta Ads Tracking',
    slug: 'meta-ads-tracking',
    icon: 'i-lucide-megaphone',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'OAuth-connected Meta Ads spend and delivery diagnostics with policy issues, ad-set learning state, frequency, CPM, daily breakdowns, and campaign budgets.',
    details: [
      {
        title: 'OAuth-Connected Accounts',
        content: 'Connect your Meta Business accounts through a secure OAuth flow. XeroFlow pulls ad account data, campaign structures, and spend metrics directly from the Meta Graph API. Multiple ad accounts can be mapped to the correct XeroFlow clients, so agencies managing dozens of client accounts see all their spend in one consolidated view without switching between Business Manager tabs.'
      },
      {
        title: 'Delivery and Saturation Evidence',
        content: 'Daily and on-demand reads keep campaign, ad-set, and ad delivery evidence together. See approval issues, exact Meta effective status, learning or learning-limited state, ad-set frequency, CPM, spend, clicks, and delivery dates. Every diagnostic family carries its own collection time and unavailable reason, so missing platform evidence is never presented as a healthy result.'
      },
      {
        title: 'Budget Monitoring and Alerts',
        content: 'Set monthly budgets per client or per campaign and get alerted when spend approaches defined thresholds. Warnings trigger at 80% and 90% of budget, with critical alerts at 100%. Budget data feeds directly into the AI anomaly detection system, which can identify unusual spend patterns — like a sudden spike from a misconfigured ad set — before they blow through the budget.'
      },
      {
        title: 'EOM Integration',
        content: 'Meta spend data flows directly into the EOM invoice engine. Actual spend becomes a line item on client invoices with exact amounts, date ranges, and campaign references. No more copying numbers from spreadsheets or trusting manual entry. The entire chain — from Meta platform to client invoice to Xero ledger — is automated and auditable.'
      }
    ]
  },
  'google-ads-tracking': {
    title: 'Google Ads Control & Tracking',
    slug: 'google-ads-tracking',
    icon: 'i-lucide-bar-chart-3',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Automatically enrol every managed client in measurement, then inspect and safely control Google Ads resources through XeroFlow with typed controls, human approvals, and a complete audit trail.',
    details: [
      {
        title: 'Measurement On by Default',
        content: 'Every newly created or imported client is automatically enrolled in XeroFlow measurement, so setup cannot be missed because nobody opened a configuration screen. Collection and conversion intent start on by default; provider delivery becomes live only after the exact account, conversion destinations, consent policy, validation evidence, and approvals are in place. Explicit client and signal-level opt-outs always win.'
      },
      {
        title: 'Typed QA Across Every Account',
        content: 'Connect multiple Google login identities and manager accounts through OAuth, then inspect campaigns, ad groups, ads, keywords, targeting, assets, conversion actions, and recommendations without sharing credentials or writing raw Google Ads queries. Every result is bounded, tenant-scoped, and tied back to the correct XeroFlow client and connection.'
      },
      {
        title: 'Governed Campaign Control',
        content: 'Plan and apply campaign, budget, ad group, responsive search ad, keyword, location, schedule, device, audience, asset, Performance Max, conversion-goal, and recommendation changes through typed tools. New campaigns start paused, provider validation runs before execution, and immutable creative or structural changes are handled through purpose-built operations instead of unrestricted mutation access.'
      },
      {
        title: 'Approvals, Verification & Audit',
        content: 'High-impact changes show the proposed before-and-after state and wait for an authorized person to confirm them. XeroFlow validates the exact Google Ads request, claims it once, performs the write, and reads the resource back before marking the action complete. Append-only events preserve the actor, policy decision, provider request ID, result, and any drift or recovery evidence.'
      },
      {
        title: 'Safe Automation by Default',
        content: 'Opted-in accounts can automate tightly limited negative-keyword additions, guarded pauses, approved recommendation dismissals, and safe asset detachment. Versioned policies enforce scope, protected terms, thresholds, cooldowns, and atomic daily quotas. Ordinary delete requests pause or archive; permanent Google removal remains separately gated, owner-only, acknowledged, and reasoned.'
      }
    ]
  },
  'google-ai-max-readiness': {
    title: 'Google AI Max Readiness',
    slug: 'google-ai-max-readiness',
    icon: 'i-lucide-scan-search',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    categoryIconColor: 'text-emerald-600 dark:text-emerald-400',
    description: 'Review every Google Search campaign affected by the AI Max migration from one read-only evidence ledger — before legacy settings are consolidated.',
    details: [
      {
        title: 'Portfolio Migration Audit',
        content: 'See eligible, affected, enabled, unknown, and needs-review Search campaigns across connected Google Ads accounts in one operational ledger. Filters for client, account, migration trigger, readiness, and freshness turn a platform-wide change into a bounded review queue, while spreadsheet-safe CSV export supports ownership and follow-up outside the dashboard.'
      },
      {
        title: 'Evidence, Not Guesswork',
        content: 'XeroFlow reads Google Ads API evidence for AI Max, automatically created text assets, campaign broad match, final URL expansion, and ad-group search-term matching exceptions. Every status distinguishes Google-observed facts from XeroFlow’s deterministic derivation, exposes the raw evidence, and records material changes over time.'
      },
      {
        title: 'Read-Only by Design',
        content: 'The readiness workspace cannot enable AI Max or change a campaign. Media buyers review effective controls, risks, and freshness in XeroFlow, then follow a direct link to Google Ads when human action is warranted. Daily scans, tenant-scoped caching, and deduplicated internal alerts add operational discipline without silently changing provider settings.'
      },
      {
        title: 'Measurement Comes Next',
        content: 'Readiness is the first step, not a performance claim. A later measurement release will compare pre- and post-change windows, separate AI Max match sources, and review generated assets and landing pages while accounting for budget, bidding, status, and asset changes as confounders. Those comparisons remain observational and clearly labelled for confidence.'
      }
    ]
  },
  'governed-google-pmax-launches': {
    title: 'Governed Google PMax Launches',
    slug: 'governed-google-pmax-launches',
    icon: 'i-lucide-shield-check',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50 dark:bg-emerald-500/10',
    categoryIconColor: 'text-emerald-600 dark:text-emerald-400',
    description: 'Move an approved vehicle campaign brief through evidence-backed preflight, exact paused creation, and a separately authorised activation — without silent Google spend changes.',
    details: [
      {
        title: 'Approved brief to accountable rollout',
        content: 'A reusable Google PMax template creates the project and task rollout, while the immutable launch plan binds the exact client, Google Ads customer, Merchant Center account, internal vehicle feed, fixed-flight budget, targeting, conversion actions, creative mode, and compliance acknowledgement. Decisions discussed on boards or imported from Monday inform the evidence set, but only approved and version-bound facts can control execution.'
      },
      {
        title: 'Whole-platform preflight',
        content: 'Before approval, XeroFlow reconciles Google Ads and Merchant API readback with the client-owned feed, onboarding attestations, boards and tasks, audience and persona signals, knowledge guidance, spend history, and anomalies. Deterministic checks remain authoritative; a cost-capped Cloudflare AI Gateway advisory can summarise nuance but can never overrule a blocker or execute a provider write.'
      },
      {
        title: 'Paused-only provider safety',
        content: 'The Google Ads mutation creates a retail Performance Max campaign for Vehicle Ads with a campaign total budget, explicit flight dates, exact Merchant Center identity, resolved geo and language criteria, condition-specific listing groups, and an exact custom conversion goal. Campaign and asset group are created paused, read back, and compared with the approved configuration before activation can even be considered.'
      },
      {
        title: 'Activation is a different decision',
        content: 'Creating the campaign and enabling spend require separate administrator approvals and separate Cloudflare environment kill switches. Activation enables the campaign and asset group together, then verifies their live state. Every transition, provider request identifier, approval reason, preflight snapshot, remediation task, and readback result stays in the audit ledger for post-launch accountability.'
      }
    ]
  },
  'google-tag-manager': {
    title: 'Google Tag Manager Management',
    slug: 'google-tag-manager',
    icon: 'i-lucide-container',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Install and govern client tracking through Google Tag Manager without leaving XeroFlow.',
    details: [
      {
        title: 'Secure OAuth Container Discovery',
        content: 'Connect a Google identity that already has access to the client’s Tag Manager account. XeroFlow discovers only the accounts and web containers Google authorises, stores refresh credentials encrypted, and binds one exact container to the client tracking site. No Google Ads connection is guessed or reused implicitly.'
      },
      {
        title: 'Isolated Drafts and Duplicate Detection',
        content: 'XeroFlow reads the live container before making a change. If the first-party tracking tag is already present, the operation finishes without creating a duplicate. Otherwise it creates a dedicated workspace, adds a clearly named Window Loaded trigger and XeroFlow tag, checks workspace conflicts, and compiles a preview before producing a container version.'
      },
      {
        title: 'Explicit Publishing with Live Verification',
        content: 'Publishing is a deliberate owner or administrator action against the exact linked container. XeroFlow records the previous live version, publishes with Google’s version fingerprint, reads the live container back, and only reports success when the expected tracking marker is present. The operation has its own audit trail and does not depend on generic AI or MCP mutation coordination.'
      },
      {
        title: 'Rollback and Quota Protection',
        content: 'Every managed install retains the previously live container version so an authorised operator can restore it quickly. A shared pacing guard keeps provider calls within Google Tag Manager API limits. The Admin control room shows OAuth health, token expiry, client bindings, live verification and recent failures. Active owners can also discover, bind, draft, publish, verify and roll back through the registered MCP suite and its dedicated execution ledger; ordinary administrators continue to use the independent browser manager.'
      }
    ]
  },
  'profit-loss': {
    title: 'Profit & Loss',
    slug: 'profit-loss',
    icon: 'i-lucide-trending-up',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Real-time P&L dashboards with revenue, expenses, and margin analysis per client. Understand exactly which clients are profitable and which are not.',
    details: [
      {
        title: 'Client-Level Profitability',
        content: 'See revenue, direct costs, ad spend, and margin for every client in a single dashboard. Revenue comes from Xero invoices, costs from expense claims, and ad spend from Meta and Google integrations. Each client shows a margin percentage so you can instantly identify which accounts are healthy and which are eroding profitability — before it is too late to course-correct.'
      },
      {
        title: 'Monthly Trend Analysis',
        content: 'Track P&L trends over time with month-over-month comparisons. Spot patterns like seasonal dips, growing costs, or declining margins. The dashboard highlights significant changes — a client whose margin dropped 15% this month versus last — so your leadership team can investigate and act. Data is sourced live from Xero so there is no stale reporting lag.'
      },
      {
        title: 'Expense Categorization',
        content: 'Expenses are categorized by type — platform costs, contractor fees, software subscriptions, production costs — using your Xero chart of accounts. Drill into any category to see individual transactions. This granularity helps you identify which expense categories are growing faster than revenue and where operational efficiencies can be gained.'
      },
      {
        title: 'Forecasting Inputs',
        content: 'P&L data feeds into the cashflow forecasting system, giving you forward-looking projections based on current revenue run rates, contracted retainers, and historical expense patterns. Combined with budget data from ad spend tracking, you get a realistic picture of your agency\'s financial trajectory — not just where you are today, but where you will be in three months.'
      }
    ]
  },
  'budget-management': {
    title: 'Budget Management',
    slug: 'budget-management',
    icon: 'i-lucide-wallet',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Set monthly budgets per client and campaign. Get alerts when spend approaches limits and maintain audit trails for every budget change.',
    details: [
      {
        title: 'Client and Campaign Budgets',
        content: 'Set monthly spending limits at the client level and optionally at the campaign level within each client. Budgets can be configured as hard caps or soft warnings. The system tracks actual spend against budget in real time, pulling from both Meta and Google data sources. At any point you can see the percentage consumed, remaining amount, and projected end-of-month total.'
      },
      {
        title: 'Threshold Alerts',
        content: 'Configure alert thresholds at any percentage — commonly 80%, 90%, and 100%. Alerts can trigger in-app notifications, email messages, or both. When a campaign hits 90% of its monthly budget on the 15th of the month, your media buyers get an immediate notification so they can adjust pacing before overspending occurs. The alert includes current spend, budget limit, and daily run rate.'
      },
      {
        title: 'Full Audit Trail',
        content: 'Every budget creation, modification, and deletion is logged with the user who made the change, the timestamp, and the before/after values. When questions arise about budget decisions — from clients, from management, or during annual reviews — you have a complete, tamper-proof history. This audit trail integrates with the AI system for anomaly detection on budget patterns.'
      },
      {
        title: 'Variance Reporting',
        content: 'Monthly variance reports compare budgeted amounts against actual spend, showing over/under for each client and campaign. Identify clients where you consistently underspend (potential upsell opportunity) or overspend (process or pacing issue). Variance data surfaces in AI reports with recommendations, helping your team turn financial data into actionable strategy adjustments.'
      }
    ]
  },

  // ─── Communication ────────────────────────────────────────────
  'real-time-chat': {
    title: 'Real-Time Chat',
    slug: 'real-time-chat',
    icon: 'i-lucide-message-circle',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Channels, DMs, group messages, threads, and file sharing — built on Cloudflare Durable Objects for true real-time communication within your agency.',
    details: [
      {
        title: 'Channels and Direct Messages',
        content: 'Create public channels for teams (#design, #media-buying, #finance), private channels for sensitive discussions, and direct messages for 1-on-1 conversations. Group DMs support ad-hoc conversations between any combination of team members. Channel discovery lets new team members browse and join relevant channels without needing an invitation for every one.'
      },
      {
        title: 'Threaded Conversations',
        content: 'Reply to any message in a thread to keep discussions organized. Threads prevent the main channel from becoming a wall of back-and-forth. Each thread shows a reply count and the most recent participants, so you can see activity at a glance without reading every message. Threads work in channels, DMs, and group messages — keeping context contained everywhere.'
      },
      {
        title: 'File Sharing and Previews',
        content: 'Drag and drop files directly into any conversation. Images, PDFs, and videos render inline previews. Files are stored in Cloudflare R2 and linked to the conversation context, so you can find them later through search. When your designer shares a mockup in #design, the creative director can review it without downloading, then pin it for the team to reference.'
      },
      {
        title: 'Durable Object Architecture',
        content: 'Chat is powered by Cloudflare Durable Objects — each channel is a persistent, stateful object at the edge. This means messages are delivered with near-zero latency regardless of where your team members are located. The architecture supports hibernatable WebSocket connections for efficient resource usage, and gracefully handles reconnection when network conditions change.'
      }
    ]
  },
  'board-linked-channels': {
    title: 'Board-Linked Channels',
    slug: 'board-linked-channels',
    icon: 'i-lucide-link-2',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Auto-created channels for boards and tasks. Board events post directly to chat, keeping your communication and project management seamlessly connected.',
    details: [
      {
        title: 'Automatic Channel Creation',
        content: 'When a board is created, XeroFlow can automatically create a linked chat channel for that board. Task-specific channels can also be auto-created when a task requires discussion. These channels are pre-populated with the board context — name, description, and a link back to the board — so conversations start with full context rather than requiring someone to explain what they are talking about.'
      },
      {
        title: 'Board Event Feed',
        content: 'Configure which board events post to the linked channel — status changes, new tasks, assignment changes, due date updates, or file uploads. Each event is formatted as a compact message with the relevant details and a direct link to the task. Your team sees project activity flow through chat without needing to watch the board, while the board remains the source of truth for task data.'
      },
      {
        title: 'Configurable Feed Settings',
        content: 'Not every event needs to post to chat. The BoardChatFeedSettings modal lets you fine-tune which event types generate messages. A high-activity production board might only post status changes and new tasks, while a client-facing board might post everything so account managers have a complete activity log in their chat channel.'
      },
      {
        title: 'Bidirectional Context',
        content: 'From the board, open the linked chat channel to see discussions about tasks. From chat, click any task reference to open the board panel. The task slideover includes a chat toggle that opens the relevant channel as an overlay. This bidirectional linking means context is never more than one click away, regardless of whether you started in chat or on the board.'
      }
    ]
  },
  'rich-messages': {
    title: 'Rich Messages',
    slug: 'rich-messages',
    icon: 'i-lucide-image',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'File attachments, emoji reactions, message pinning, quoting, and forwarding. Everything your team needs for expressive, actionable communication.',
    details: [
      {
        title: 'File Attachments and Previews',
        content: 'Attach images, documents, videos, and any file type to messages. Images and PDFs render inline previews directly in the conversation. Files are stored in Cloudflare R2 with CDN delivery for fast access worldwide. Your team can share creative assets, client briefs, or reference documents without leaving the conversation or switching to a separate file sharing tool.'
      },
      {
        title: 'Emoji Reactions',
        content: 'React to any message with emoji to quickly acknowledge, approve, or express feedback without cluttering the conversation with reply messages. Common reactions include thumbs-up for approval, eyes for "I have seen this," and checkmark for "done." Reaction counts are visible on the message, and you can see who reacted by hovering — useful for gauging team sentiment on a proposal.'
      },
      {
        title: 'Message Pinning and Quoting',
        content: 'Pin important messages to the top of any channel so they are easy to find. Pinned items might include project briefs, meeting notes, shared links, or key decisions. Quote any message when replying to preserve context — the original message appears as an embedded block above your response, making it clear exactly what you are responding to in a busy channel.'
      },
      {
        title: 'Formatting and Forwarding',
        content: 'Use a formatting toolbar for bold, italic, code blocks, and inline code. Keyboard shortcuts (Cmd+B, Cmd+I) work for quick formatting. Forward any message to another channel or DM to share relevant information across teams. Forwarded messages include the original sender, timestamp, and channel context so the recipient has full attribution and origin.'
      }
    ]
  },
  'read-receipts': {
    title: 'Read Receipts',
    slug: 'read-receipts',
    icon: 'i-lucide-check-check',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'See who has read your messages with avatar indicators and reader lists. Never wonder again whether your team saw an important update.',
    details: [
      {
        title: 'Avatar Indicators',
        content: 'Below each message, small avatar circles show which team members have read it. Avatars appear in real time as people view the message. This gives senders immediate visibility into whether their message has been seen — critical for time-sensitive communications like campaign launch approvals or urgent client requests that need acknowledgment.'
      },
      {
        title: 'Reader List Detail',
        content: 'Click the read receipt avatars to see a full list of readers with timestamps showing when each person viewed the message. This detailed view is useful for accountability — when you send an important announcement to a channel, you can verify exactly who has seen it and follow up individually with anyone who has not, rather than resending to the entire group.'
      },
      {
        title: 'Unread Indicators',
        content: 'Channels and DMs show unread message counts in the sidebar. Bold text indicates channels with new activity, and a blue dot marks the exact position of your last-read message within a conversation. Jump to the first unread message with a single click, even in channels with hundreds of recent messages — you never have to scroll to find where you left off.'
      },
      {
        title: 'Privacy Controls',
        content: 'Read receipts can be configured at the user level. Team members who prefer not to broadcast their read status can disable receipts for their account. When disabled, their avatars do not appear in read receipt lists, and their activity does not trigger read timestamp updates. This respects individual privacy preferences while maintaining the feature for those who find it useful.'
      }
    ]
  },
  'email-templates': {
    title: 'Email Templates',
    slug: 'email-templates',
    icon: 'i-lucide-mail',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Resend-powered email templates for notifications, invites, and client communications. Consistent, branded emails without the HTML headaches.',
    details: [
      {
        title: 'Template Editor',
        content: 'Create and manage email templates with a visual editor. Templates support dynamic variables — client name, task title, due date, assignee — that are populated automatically when the email is sent. Build templates for common communications: task assignment notifications, deadline reminders, client welcome emails, and delivery confirmations. Each template uses your agency branding for a professional appearance.'
      },
      {
        title: 'Resend Integration',
        content: 'Emails are sent through Resend for reliable delivery with tracking. Every email includes delivery status (sent, delivered, opened, bounced) so you know whether recipients actually received and engaged with your messages. Resend handles SPF, DKIM, and DMARC configuration for your domain, ensuring emails land in inboxes rather than spam folders.'
      },
      {
        title: 'Automation Triggers',
        content: 'Connect email templates to automation triggers so emails send automatically when conditions are met. When a task moves to "Client Review," automatically email the client with the deliverable and approval link. When a deadline is 48 hours away, send a reminder to the assignee. The automation system handles the logic; the template handles the presentation.'
      },
      {
        title: 'Inbound Email Processing',
        content: 'XeroFlow includes a Cloudflare Workers-based email processor that handles inbound emails. Clients can reply to notification emails and their responses are captured, parsed, and attached to the relevant task or conversation. This creates a seamless communication loop where clients can participate in your workflow through their email client without needing to log into any platform.'
      }
    ]
  },
  'email-campaigns': {
    title: 'Email Campaigns',
    slug: 'email-campaigns',
    icon: 'i-lucide-send',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Design, target, and send marketing email campaigns to your subscriber lists — with personalisation, delivery tracking, and one-click unsubscribe built in from the first send.',
    details: [
      {
        title: 'Build and Target',
        content: 'Create a campaign, design its body in the drag-and-drop email builder, and point it at one or more subscriber lists. XeroFlow materialises the recipient set for you — deduplicating people who appear on multiple lists, and automatically excluding anyone who has unsubscribed, hard-bounced, or been suppressed. Merge tags like first name and email personalise each message, so a single campaign reaches everyone with their own details filled in.'
      },
      {
        title: 'Reliable, Paced Sending',
        content: 'Sends go out through the Resend Batch API in paced chunks, with a crash-safe work queue behind them: if a send is interrupted, it resumes exactly where it left off rather than starting over or double-sending. Rate limits are handled with automatic back-off, and the whole pipeline is globally throttled so large campaigns deliver smoothly without tripping provider limits.'
      },
      {
        title: 'Delivery and Engagement Tracking',
        content: 'Every campaign tracks the full lifecycle of each message — sent, delivered, opened, clicked, bounced, and complained — ingested in real time from Resend webhooks. Open and click counts roll up per campaign so you can see what resonated, while hard bounces and spam complaints are automatically added to a global suppression list so you never email a bad or hostile address twice.'
      },
      {
        title: 'Compliant by Default',
        content: 'A campaign cannot send unless its body contains an unsubscribe link — it is enforced in code, not left to memory. Every message ships with RFC 8058 one-click unsubscribe and the matching List-Unsubscribe headers, so recipients can opt out from their inbox in a single click, and mailbox providers reward you with better deliverability.'
      }
    ]
  },
  'email-builder': {
    title: 'Email Builder',
    slug: 'email-builder',
    icon: 'i-lucide-layout-template',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'A visual, section-based email builder — drop in pre-designed sections, launch from a gallery of 12 starter templates, fine-tune every block, and render to bulletproof email HTML that looks right in every inbox.',
    details: [
      {
        title: 'Sections and Building Blocks',
        content: 'Build emails from a rich library of pre-designed sections organised by purpose — Header, Content, Feature, Call to action, E-Commerce, Transactional, and Footer — alongside basic blocks like headings, text, buttons, images, dividers, spacers, columns, and containers. Drop a whole section onto the canvas and you get a polished, on-brand layout in one click instead of assembling it element by element. Reorder, duplicate, or delete with a click, use the insert zones between blocks to slot new content exactly where you want it, and edit headings and body copy directly on the canvas — click the text and type, WYSIWYG.'
      },
      {
        title: 'Live Section Previews',
        content: 'The section palette shows each preset as a live-rendered thumbnail, not a vague icon, so you can see exactly what a section looks like before you add it. Hover any category and a flyout reveals miniature previews of every section inside it — pick the right header, hero, or footer at a glance, then click to drop it in.'
      },
      {
        title: 'Save Your Own Custom Modules',
        content: 'Built a header, footer, or promo block you want to reuse? Select it and save it as a Custom Module — it joins its own category in the palette with a live thumbnail, ready to drop into any email. Saved modules are shared across your team and can be renamed or removed at any time, so your house style becomes a reusable kit instead of something you rebuild every send.'
      },
      {
        title: 'Starter Templates and a Visual Gallery',
        content: 'Skip the blank canvas with a library of 12 curated starter templates — newsletters, promotions, product launches, welcome and onboarding emails, event invites, order confirmations, case-study spotlights, and more — each pre-assembled from coordinated sections and rendered as a live full-email preview, not a flat thumbnail. Filter the gallery by usage (Newsletter, Promotion, Announcement, Welcome, Event, Transactional) and by style (Editorial, Bold, Minimal, Corporate, Retail, Utility), or search by name, and freshly added designs are flagged with a NEW badge. A blank-start card sits alongside the starters, so anyone on the team can launch a properly structured email in a single click and customise from there.'
      },
      {
        title: 'Per-Block Styling and Bulletproof HTML',
        content: 'Select any block to open a rich, grouped inspector — Spacing, Typography (line height, letter spacing, text transform), and Border & effects (border, corner radius, shadow, opacity), plus background colour and image — alongside document-level settings for width, background, and spacing, with every change reflected on the canvas instantly. Behind the friendly editor, a server-side renderer turns your design into table-based, inline-styled HTML that survives Outlook, Gmail, Apple Mail, and everything in between. Flip between Editor, live Preview, and raw HTML at any time, and save any design as a reusable template your team can open, duplicate, rename, and reuse across campaigns.'
      }
    ]
  },
  'email-lists': {
    title: 'Subscriber Lists',
    slug: 'email-lists',
    icon: 'i-lucide-users',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Build and grow audiences the compliant way — named lists, CSV import, public subscribe forms with double opt-in, a preference centre, and signed one-click unsubscribe.',
    details: [
      {
        title: 'Lists and Subscribers',
        content: 'Organise your audience into named lists, each tracking per-member subscription state, and manage subscribers individually or in bulk. Bring existing contacts in with CSV import that parses and de-duplicates by email, so a messy export becomes a clean, deduplicated list ready to send to.'
      },
      {
        title: 'Public Subscribe Forms',
        content: 'Grow lists with a hosted subscribe page you can link from anywhere. Lists can require double opt-in — a confirmation email the new subscriber must click before they receive anything — and the form is protected by Cloudflare Turnstile to keep bots and abuse out without annoying real people.'
      },
      {
        title: 'Preference Centre and Unsubscribe',
        content: 'Every recipient gets a one-click unsubscribe and a preference centre where they can fine-tune which lists they stay on rather than leaving entirely. Links are HMAC-signed, so only the genuine recipient can change their preferences — no one can unsubscribe someone else by guessing an address.'
      },
      {
        title: 'Suppression and Hygiene',
        content: 'A global suppression list is honoured on every send and is the single source of truth for who must never be emailed. Hard bounces and spam complaints feed it automatically, and an explicit opt-out is recorded the moment a recipient unsubscribes — keeping your sender reputation healthy and your audience genuinely opted in.'
      }
    ]
  },
  'automations': {
    title: 'Automations',
    slug: 'automations',
    icon: 'i-lucide-zap',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Trigger-action recipes that automate repetitive workflows. Auto-notify on status changes, assignments, and due dates — so your team focuses on work, not process.',
    details: [
      {
        title: 'Trigger-Action Architecture',
        content: 'Every automation is a simple recipe: when something happens (trigger), do something else (action). Triggers include status changes, date arrivals, task creation, assignment changes, and form submissions. Actions include sending emails, posting to chat, updating task fields, creating subtasks, and notifying team members. Combine these building blocks to automate any repetitive process.'
      },
      {
        title: 'Pre-Built Recipes',
        content: 'Start with common automation recipes: notify assignees when tasks are created, remind about upcoming deadlines, post to a channel when tasks move to a status, auto-assign tasks based on project type, or escalate overdue items to managers. Each recipe can be customized with conditions and filters — only trigger for specific boards, groups, or column values.'
      },
      {
        title: 'Conditional Logic',
        content: 'Add conditions to automations to control when they fire. A notification automation might only trigger for high-priority tasks, or only when the assignee is a specific person, or only for tasks in a particular group. Conditions can reference any column value on the board, giving you fine-grained control over automation behavior without creating separate recipes for every edge case.'
      },
      {
        title: 'Execution Logging',
        content: 'Every automation execution is logged with the trigger event, the conditions evaluated, and the action performed. Review the automation log to verify that your recipes are firing correctly and to troubleshoot unexpected behavior. The log shows successes and failures separately, so you can quickly identify broken automations — like an email template referencing a deleted column.'
      }
    ]
  },

  // ─── AI & Intelligence ────────────────────────────────────────
  'owner-god-mode': {
    title: 'Owner God Mode',
    slug: 'owner-god-mode',
    icon: 'i-lucide-crown',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50 dark:bg-amber-500/10',
    categoryIconColor: 'text-amber-600 dark:text-amber-400',
    description: 'Always-on access to every registered application and MCP capability for active owners, while authentication, tenant isolation, audit and infrastructure safety boundaries remain enforced.',
    details: [
      {
        title: 'Always On for Active Owners',
        content: 'God mode is derived from a freshly verified, active owner role in the database. There is no email allowlist, pilot membership or session toggle. A role downgrade, account deactivation or the infrastructure emergency control removes God mode on the next request.'
      },
      {
        title: 'Every Registered Capability',
        content: 'Active owners can discover and execute registered capabilities across Finance, Marketing, Banners, publishing, media generation, administration and MCP integrations without application rollout, permission, budget or confirmation gates. Registered operations include creating editable Banner Studio drafts and staged Google Tag Manager binding, drafting, publishing, verification and rollback through dedicated execution ledgers. Missing providers, bindings, secrets or unimplemented tools remain real operational failures.'
      },
      {
        title: 'Security Boundaries Stay Enforced',
        content: 'God mode never bypasses authentication or session validation, exact active-owner authority, tenant, client and entity isolation, mandatory append-only audit, emergency disable, provider and secret requirements, database constraints or SSRF protection. It is broad application authority, not arbitrary security bypass.'
      },
      {
        title: 'Employees Remain Governed',
        content: 'Ordinary employees continue to receive role-scoped capabilities through evaluated department packs, pilot membership, release state, permissions, personal settings and confirmation controls. Owner God mode is reported separately so draft, failed, suspended and retired employee releases stay visible and truthful in governance reporting.'
      }
    ]
  },
  'ai-chat': {
    title: 'AI Chat',
    slug: 'ai-chat',
    icon: 'i-lucide-bot',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Conversational AI that answers from your live agency data — finance, ad-spend, tasks, projects, clients and more — with @entity mentions, role-focused assistants, and propose-then-confirm actions. Ask questions in natural language.',
    details: [
      {
        title: 'Natural Language Queries',
        content: 'Ask questions about your agency in plain English. "How much did we spend on Meta for Client X last month?" or "Which tasks are overdue this week?" The AI understands your agency context — clients, projects, tasks, financial data — and retrieves the relevant information using a composite scoring system that combines semantic similarity, recency, importance, and entity matching.'
      },
      {
        title: 'Live Data Lookups & Guarded Actions',
        content: 'Beyond pre-loaded context, the assistant can call dedicated tools to pull live numbers on demand — a finance snapshot, ad-spend pacing, open anomalies, project status, client overviews, social performance, briefs, and the knowledge base — so answers reflect what is true right now, with the exact sources it used one click away. Every tool runs inside your existing permissions, so the assistant can only ever see what you can. For anything that changes data, it follows a strict propose-then-confirm model: it drafts the action — for example, creating a task — and shows it to you for review; nothing is written until you confirm.'
      },
      {
        title: 'Client Profitability & Revenue Forecasting',
        content: 'Ask which clients are most and least profitable — the assistant surfaces Agency Gross Income and delivery margin per client so you can see at a glance where the agency is making and losing money. You can also see how fast each client is burning its monthly retainer, with end-of-month projections so you know which accounts are at risk of over-running before they do. Flag where the agency is over-servicing — labour delivered beyond retainer scope — so account managers can have the right conversation early. And ask for a month-end revenue forecast or 90-day pipeline coverage against target, pulling from live Xero and project data.'
      },
      {
        title: 'Role-Focused Assistants',
        content: 'Pick the assistant that fits the job — Finance, Marketing, Sales, Media Buyer, or Account Management — or stay with the general Agency Assistant. Each persona keeps the same engine but leads with the right focus and narrows to the tools that matter for that role, always within your permissions. Switching is one click in the chat bar, and your choice sticks to the conversation, including on voice.'
      },
      {
        title: 'Owner God Mode, Employee Governance',
        content: 'Active owners receive always-on God mode across every registered application and MCP capability. Authentication, exact active-owner authority, tenant, client and entity isolation, mandatory audit, emergency disable and infrastructure requirements remain enforced. Ordinary employees continue to use evaluation-approved releases, permissions, tool limits and confirmation steps; draft, failed, suspended and retired employee releases stay blocked.'
      },
      {
        title: '@Entity Mentions',
        content: 'Type @ to mention specific clients, tasks, projects, or briefs in your AI conversation. Mentioned entities are pinned to the top of the AI context, ensuring the response is grounded in the exact data you are asking about. The autocomplete supports prefix-matching search across all entity types, so finding the right reference is fast even in agencies with hundreds of active projects.'
      },
      {
        title: 'Conversation Management',
        content: 'Conversations persist across sessions with full history. Pin important conversations (up to 25) to your sidebar for quick access to frequently referenced topics. Start new conversations for fresh context or continue existing ones to build on previous analysis. The AI maintains awareness of the conversation history, so follow-up questions work naturally.'
      },
      {
        title: 'Groq-Powered Performance',
        content: 'The AI chat uses Groq for inference, delivering responses with extremely low latency. Complex queries that involve multiple data lookups and analysis still return in seconds. The system uses edge-first intent classification (via Cloudflare Workers AI) to route queries efficiently, with Groq handling the conversational response generation for the best balance of speed and quality.'
      }
    ]
  },
  'voice-ai': {
    title: 'Voice AI',
    slug: 'voice-ai',
    icon: 'i-lucide-mic',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Talk to your AI assistant with voice. Speech-to-text transcription and text-to-speech responses powered by Cloudflare Workers AI.',
    details: [
      {
        title: 'Voice Input with Live Feedback',
        content: 'Click the mic button and speak naturally. The recorder captures audio with echo cancellation, noise suppression, and automatic gain control. A live volume visualiser shows real-time audio levels while recording, and silence detection automatically stops the recording after 1.5 seconds of quiet — so you never have to remember to press stop.'
      },
      {
        title: 'Speech-to-Text Transcription',
        content: 'Your voice is transcribed using Cloudflare Workers AI at the edge. The transcribed text feeds into the same AI pipeline as typed messages — intent classification, entity context retrieval, and Groq-powered response generation all work identically. Voice messages appear as regular text in your conversation history, so you can reference them later.'
      },
      {
        title: 'Text-to-Speech Responses',
        content: 'AI responses are automatically read back to you using Workers AI text-to-speech. Markdown formatting is stripped before synthesis for natural-sounding audio. Click the volume button to stop playback at any time. If TTS is unavailable, the text response still appears — voice is additive, never blocking.'
      },
      {
        title: 'Zero Setup, Graceful Degradation',
        content: 'Voice AI requires no additional configuration or dependencies — it uses the same Workers AI binding as other AI features. In local development or when the AI binding is unavailable, the mic button simply does not appear. The feature degrades gracefully at every step: if transcription fails you get a helpful error; if TTS fails the text response still shows.'
      }
    ]
  },
  'anomaly-detection': {
    title: 'Anomaly Detection',
    slug: 'anomaly-detection',
    icon: 'i-lucide-alert-triangle',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Ten specialized analyzers that proactively flag spend anomalies, deadline risks, and budget issues before they become problems.',
    details: [
      {
        title: 'Ten Specialized Analyzers',
        content: 'The detection layer runs ten independent analyzers across financial domains: profitability (margin compression and net loss), revenue (period-over-period and year-over-year decline), expenses (category concentration, vendor outliers, statistical spikes), cashflow (overdraft, low reserves, burn rate, projected shortfall), receivables (overdue concentration, slow payers, client concentration), budget (overspend and category-level overruns), ad-spend daily-spend spikes (per-client/platform), ad-spend pacing and delivery health (underspend, overspend, stopped, paused-with-budget, stale-sync, zero-conversion), per-client (scope creep and revenue concentration), and transaction-level outliers. Each analyzer runs in parallel during scheduled and on-demand scans.'
      },
      {
        title: 'Proactive Notifications',
        content: 'Anomalies are surfaced proactively through the Activity Hub and AI chat without requiring anyone to run a report or ask a question. When the spend analyzer detects that a campaign burned through 60% of its monthly budget in the first week, a notification appears immediately with the relevant context and suggested actions. This turns your team from reactive (discovering problems at month-end) to proactive.'
      },
      {
        title: 'Severity Scoring',
        content: 'Each anomaly is scored as critical, warning, or info based on rule-based thresholds matched to financial impact and time sensitivity. Critical anomalies (e.g. a net-loss period or a projected cash shortfall) trigger Smart Watch + email notifications immediately. Warning and info findings appear on the Anomalies page and in the daily digest, but do not page anyone overnight.'
      },
      {
        title: 'Incident Workflow',
        content: 'Each detected anomaly becomes a persistent incident with status (open / acknowledged / snoozed / resolved / dismissed) and a full audit trail. Snoozing buys time without losing the signal — when the snooze expires, the row flips back to open if the underlying issue is still detected. Resolved-and-recurring anomalies create new incidents rather than reopening old ones, preserving incident history. Correlated findings (for example a low-margin month with margin compression and revenue decline) collapse under a single parent incident card.'
      }
    ]
  },
  'semantic-search': {
    title: CRM_SEARCH_MARKETING_COPY.featureTitle,
    slug: 'semantic-search',
    icon: 'i-lucide-search',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: CRM_SEARCH_MARKETING_COPY.featureDescription,
    details: CRM_SEARCH_MARKETING_COPY.featureDetails.map(detail => ({ ...detail }))
  },
  'intent-classification': {
    title: 'Intent Classification',
    slug: 'intent-classification',
    icon: 'i-lucide-target',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Edge-first intent classifier that routes queries to the right data sources automatically. The AI traffic controller that makes everything faster and smarter.',
    details: [
      {
        title: 'Edge-First Classification',
        content: 'The intent classifier runs on Cloudflare Workers AI at the edge, classifying user queries in single-digit milliseconds before the main AI model even starts processing. This pre-classification step determines which data sources to query — financial data for spend questions, task data for project questions, knowledge base for process questions — so the AI retrieval system fetches exactly the right context.'
      },
      {
        title: 'Intent Categories',
        content: 'The classifier recognizes multiple intent types: financial queries, project status, search requests, process questions, client information, time tracking queries, and general conversation. Each intent type has a tailored scoring profile that adjusts the weights for semantic similarity, recency, importance, and entity matching in the retrieval pipeline. A financial query prioritizes recency; a process query prioritizes semantic accuracy.'
      },
      {
        title: 'LoRA-First Classification',
        content: 'When a LoRA adapter trained on your agency\'s data is available, the classifier uses it as the primary classification model. Agency-specific language patterns, custom terminology, and domain jargon are understood natively rather than requiring generic model interpretation. The system falls back to the base model when no adapter is available, ensuring consistent functionality.'
      },
      {
        title: 'Continuous Improvement',
        content: 'Classification accuracy improves over time through the feedback loop. When users indicate that a response was not helpful, the system logs the original intent classification for review. Patterns of misclassification inform retraining priorities and LoRA adapter updates. The goal is a classifier that understands your agency\'s language as well as your team does.'
      }
    ]
  },
  'ai-reports': {
    title: 'AI Reports',
    slug: 'ai-reports',
    icon: 'i-lucide-file-text',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Auto-generated reports with insights, trends, and recommendations. Turn raw data into actionable intelligence for your agency leadership.',
    details: [
      {
        title: 'Automated Report Generation',
        content: 'The AI generates reports on demand or on a schedule — weekly performance summaries, monthly client health reports, or ad-hoc analysis of specific topics. Reports combine data from multiple sources (boards, financial data, ad spend, time tracking) and present them with narrative explanations, not just raw numbers. Your leadership team gets insights without needing to build dashboards or run queries.'
      },
      {
        title: 'Trend Analysis',
        content: 'Reports include trend analysis that compares current metrics against historical baselines. Month-over-month revenue growth, week-over-week ad spend efficiency, rolling average task completion rates — the AI identifies whether your metrics are improving, declining, or stable and highlights the most significant changes. Trends that deviate from normal patterns are flagged for attention.'
      },
      {
        title: 'Actionable Recommendations',
        content: 'Every report includes specific, actionable recommendations based on the data. Not generic advice like "improve efficiency" but specific suggestions like "Client X\'s Google Ads CPA increased 34% this month — consider reviewing the keyword targeting for Campaign Y." Recommendations are prioritized by potential impact and include links to the relevant tasks, clients, or campaigns for immediate follow-up.'
      },
      {
        title: 'Export and Sharing',
        content: 'Reports can be exported as PDF, shared via chat channel, or emailed to stakeholders. The format is clean and professional — suitable for client presentations or board meetings. Scheduled reports are automatically delivered to configured channels or email addresses, so your Monday morning starts with fresh insights rather than a scramble to compile last week\'s numbers.'
      }
    ]
  },
  'advisor-backlog': {
    title: 'Advisor Backlog',
    slug: 'advisor-backlog',
    icon: 'i-lucide-target',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'AI-generated CFO recommendations as a managed backlog. Categorise, snooze, comment, bulk-triage, and switch between table and Kanban views — with measured impact at 30/60/90 days after action.',
    details: [
      {
        title: 'AI Recommendations With Categorisation',
        content: 'Every Financial Advisor report writes its recommendations to a managed backlog at /advisor. Each rec is automatically classified by Groq into one of nine categories: cashflow, collections, pricing, margin, cost-control, growth, staffing, tax-compliance, or risk. Filter the backlog by category chip to focus on a single theme — "show me all the cashflow items across every client" — or by client, period, assignee, priority, or source (AI vs manual). Categorisation drives reporting too: see which themes dominate this quarter, and where the agency is gaining or losing ground.'
      },
      {
        title: 'Triage Like Real Work',
        content: 'Treat advisor output as a real backlog, not an inbox. Each recommendation has status (open / in-progress / done / dismissed), priority, due date, and an assignable team member. Snooze a rec until a specific date — it disappears from the active view and reappears automatically when the date passes. Comment on recs with a flat discussion thread; comments persist as soft-deleted history so the audit trail is intact. Multi-select rows and bulk-set status, priority, category, assignee, or snooze date in one action — useful for closing out a quarter or assigning a wave of work to a new team member.'
      },
      {
        title: 'Add Your Own Observations',
        content: 'The AI is fast at spotting patterns; humans are better at context. Click "+ New" to add your own recommendation alongside the AI\'s. The form is progressive — title and action are required, with an advanced section for impact, effort sizing, target metric and direction, due date, and assignee. Manual recs carry a "Manual" badge and creator avatar so the audit trail shows who flagged what. They feed into the same backlog, the same categorisation, and the same impact tracking as AI-generated ones.'
      },
      {
        title: 'Two Views, One Source of Truth',
        content: 'Switch between the dense table view (filterable, sortable, multi-select for bulk actions) and a four-column Kanban board (Open / In progress / Done / Dismissed). Drag a card across columns to change status — the API call is pessimistic and snaps back if the update fails. The view choice persists per user via localStorage. In the detail drawer, every action shows up in an activity log, with consecutive bulk actions from the same person collapsed into a single "Paul updated 12 items" line so the timeline stays readable.'
      },
      {
        title: 'Measured Impact, Not Vague Outcomes',
        content: 'Each recommendation can target a specific metric (debtor days, MRR, net margin, top-3 client share, and 11 others). When the rec is marked done, a nightly cron re-measures that metric at 30, 60, and 90 days after action and records the delta. The drawer surfaces the baseline → outcome with a colour-coded "✓ target direction" or "✗ wrong direction" annotation, so you can see at a glance whether your advisory work moved the needle. Over time this builds a defensible record of advisor ROI in actual dollars.'
      }
    ]
  },
  'lora-adapters': {
    title: 'LoRA Adapters',
    slug: 'lora-adapters',
    icon: 'i-lucide-cpu',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Fine-tune AI models with your agency data. Custom LoRA adapters with traffic routing and A/B testing for continuously improving AI performance.',
    details: [
      {
        title: 'Training Data Pipeline',
        content: 'XeroFlow extracts training data from your agency\'s actual usage — chat conversations, intent classifications, knowledge base entries, and AI interaction patterns. Five extractors produce different dataset types: QA pairs, intent examples, RAG chunks, knowledge entries, and combined sets. Data is automatically anonymized to remove PII before being used for training. Datasets export as JSONL and archive to R2.'
      },
      {
        title: 'Adapter Management',
        content: 'Upload, activate, and retire LoRA adapters through the admin UI. Each adapter has metadata — training dataset, base model, creation date, and performance metrics. The system supports multiple active adapters simultaneously with weighted traffic routing, so you can gradually shift traffic from the base model to a new adapter as confidence in its performance grows.'
      },
      {
        title: 'A/B Testing with Traffic Routing',
        content: 'Route a percentage of AI requests to different adapters to compare performance. Start a new adapter at 10% traffic, monitor quality metrics, and gradually increase to 100% as results validate. If an adapter underperforms, roll back instantly by adjusting traffic weights. This approach eliminates the risk of deploying a poorly trained adapter to your entire team.'
      },
      {
        title: 'Performance Metrics',
        content: 'Track adapter performance with metrics collected from every AI interaction — response helpfulness ratings, intent classification accuracy, response latency, and user feedback scores. Compare adapter performance against the base model and against each other. The metrics dashboard shows trends over time so you can see whether your latest training run actually improved the model for your agency\'s specific use cases.'
      }
    ]
  },
  'ai-connectors': {
    title: 'AI Assistant Connectors',
    slug: 'ai-connectors',
    icon: 'i-lucide-plug',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Connect Claude, Cursor, or ChatGPT to a governed Godmode view of XeroFlow. Operational answers carry coverage, fresh/stale/mixed status and attribution; creative workflows can discover current approved source assets before choosing source-bound video, static, transform or audio models, while owners can query the immutable action ledger directly.',
    details: [
      {
        title: 'Campaign and Creative Godmode',
        content: 'Add one connector URL and ask which campaigns are lagging, which live ads show fatigue, what artwork is attached, when it was delivered, or where the design team has capacity. Campaign and ad views include status, first and last delivery, honest no-baseline date comparisons, attributable leads and CPL, freshness classified as fresh, stale or mixed, creative links, and continuation cursors across the full portfolio. Current Monday item and update assets are resolved at read time with usable source URLs, screenshot filtering, and deduplicated client IDs.'
      },
      {
        title: 'Numbers That Explain Their Trustworthiness',
        content: 'Every operational response distinguishes populated, partial, not configured, and unavailable data, with coverage counts, source period, and last sync time. Missing budgets never masquerade as underpacing; unattributed ad-account spend is separated from client totals; an empty anomaly list or a zero-capacity schedule says whether the underlying system was actually configured. A standalone action-log tool lets owners filter the immutable Godmode ledger by client, actor, tool, outcome, and date.'
      },
      {
        title: 'Capability-Driven Creative Samples',
        content: 'The connector inspects the governed model catalogue and lists approved project source assets before planning a sample. Seedance 2.0 keeps vehicle video tied to an approved start image and can add native audio; Vidu Q3 can land on an approved offer-card end frame; Recraft is restricted to non-vehicle statics; and Pruna upscales only approved source assets. Missing-source and unsupported-parameter responses are structured so the assistant can recover instead of guessing.'
      },
      {
        title: 'Vision Evidence Before Human Sign-Off',
        content: 'Every generated or transformed Banner Studio image can be checked by Qwen 3.6 vision in JSON mode against up to four approved references. Inspection has its own governance mode and higher read-like rate ceiling, separate from billed asset creation. The append-only verdict records vehicle and badge match, OCR disclaimer and price, logo distortion, visual artefacts, confidence and notes; final approval remains with the human reviewer.'
      }
    ]
  },

  // ─── Client Portal ────────────────────────────────────────────
  'dedicated-login': {
    title: 'Passwordless Client Login',
    slug: 'dedicated-login',
    icon: 'i-lucide-lock',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Single-use email links give clients a separate, secure login experience that is completely scoped to their data and permissions.',
    details: [
      {
        title: 'Separate Auth System',
        content: 'The client portal uses an entirely separate authentication system from the staff dashboard. Clients request a single-use email link, confirm the browser, and receive an httpOnly client session cookie. Every API request remains scoped to that user\'s client ID at the server layer, not just hidden in the interface.'
      },
      {
        title: 'Invitation-Based Onboarding',
        content: 'Invite clients to the portal by email. The branded invitation activates access directly after the recipient confirms it, with no password setup. The invitation specifies invoice, approval, comment, analytics, CRM, and other permissions so each contact starts with the correct access.'
      },
      {
        title: 'Short-Lived, One-Time Links',
        content: 'Sign-in links expire after 15 minutes, are stored only as SHA-256 digests, and can be consumed once. The credential stays in the browser URL fragment rather than request logs, and an explicit confirmation prevents ordinary email-security scanners from using it before the client does.'
      },
      {
        title: 'Granular Permissions',
        content: 'Each client user is assigned a set of permissions: canViewInvoices, canApproveWork, canAddComments, and more. Permissions are evaluated on every API request and used to conditionally render navigation items and page content. A client\'s marketing manager might have full access, while their CEO only sees invoices and high-level project status — same client account, different permission sets.'
      },
      {
        title: 'Branded Experience',
        content: 'The client portal uses a clean, dedicated layout separate from the agency dashboard. Clients see only the sections relevant to them — CRM, leads, campaign analytics, measurement, meetings, briefs, social workflows, projects, approvals, shared files, invoices, and notifications. No internal tools, no other client data, no agency operations. The experience is professional and purpose-built for external stakeholders.'
      }
    ]
  },
  'project-visibility': {
    title: 'Project Visibility',
    slug: 'project-visibility',
    icon: 'i-lucide-folder-open',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Clients see their projects, tasks, and progress without internal data leaks. Transparent project tracking that builds trust and reduces status update requests.',
    details: [
      {
        title: 'Scoped Project Views',
        content: 'Clients see only their own projects and tasks — automatically scoped by client ID at the API layer. Agency staff can link one XeroFlow board to the client profile, giving portal users a dedicated read-only board view whose task query still requires both the linked board and the authenticated client. Each project shows meaningful progress without exposing another client or internal-only board data.'
      },
      {
        title: 'Task Progress Tracking',
        content: 'Clients can drill into individual tasks to see status, assignee, due dates, and progress. Subtask completion rolls up into percentage bars so clients understand how complex deliverables are progressing. This self-service access to project status dramatically reduces the volume of "where is this?" emails and calls that consume your account managers\' time.'
      },
      {
        title: 'Activity Timeline',
        content: 'Each project includes a filtered activity timeline showing client-relevant updates — status changes, file uploads, deadline updates, and comments. Internal activities (reassignments between staff, internal notes, budget discussions) are filtered out. The timeline gives clients a chronological narrative of project progress without exposing your team\'s internal workflow.'
      },
      {
        title: 'Dashboard Overview',
        content: 'The client dashboard shows a consolidated view of all active projects, pending approvals, recent invoices, and new notifications. Clients get a single-page summary of their relationship with your agency — what is active, what needs their attention, and what has been delivered recently. This high-level view is often the only page clients need to visit for routine check-ins.'
      }
    ]
  },
  'approval-workflows': {
    title: 'Approval Workflows',
    slug: 'approval-workflows',
    icon: 'i-lucide-check-circle',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Upload deliverables for client review. Approve, revise, or comment — all tracked with full audit history and notification triggers.',
    details: [
      {
        title: 'Multi-Step Approval Process',
        content: 'Configure approval workflows with multiple review steps — internal review, client review, final sign-off. Each step can require specific approvers and optionally include automated notifications when the deliverable is ready for review. The workflow tracks which steps are complete, which are pending, and who needs to take action, providing clear accountability at every stage.'
      },
      {
        title: 'Client Review Interface',
        content: 'Clients see deliverables in a dedicated approval interface with the file preview, project context, and action buttons. They can approve with a single click, request revisions with a comment explaining what needs to change, or add general feedback. The interface is intentionally simple — clients should not need training to use it — while capturing all the information your team needs to act on their response.'
      },
      {
        title: 'Revision Tracking',
        content: 'When a client requests revisions, the system tracks the revision history — original version, client feedback, revised version, and final approval. Each revision cycle is timestamped and attributed so there is a complete record of what was requested, what was changed, and when it was approved. This history is invaluable for managing scope creep and clarifying expectations on future projects.'
      },
      {
        title: 'Automated Notifications',
        content: 'Both sides receive automated notifications at each step. When your team uploads a deliverable for review, the client gets an email with a direct link to the approval page. When the client approves or requests revisions, your team gets notified in chat and via email. The notification system ensures no approval sits waiting because someone did not know it was their turn to act.'
      }
    ]
  },
  'invoice-access': {
    title: 'Invoice Access',
    slug: 'invoice-access',
    icon: 'i-lucide-receipt',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Permission-gated invoice viewing with clear payment status and an honest breakdown of agency services, media, suppliers, tax, and adjustments.',
    details: [
      {
        title: 'Permission-Gated Access',
        content: 'Invoice viewing requires the canViewInvoices permission, which is set when inviting client users. Not all client contacts need to see financial information — your day-to-day marketing contact might only need project access, while the finance contact needs invoice access. Permissions are granular so you control exactly who sees billing data for each client account.'
      },
      {
        title: 'Invoice List and Detail Views',
        content: 'Clients see a list of all their invoices with status, dates, and amounts. Click any invoice to see full line-item detail, credits, tax, and totals. The detail view matches the synced Xero record so clients can reconcile against their own records without requesting a breakdown from your finance team.'
      },
      {
        title: 'Payment Status, Without Inflated Revenue Claims',
        content: 'Invoice status syncs from Xero, including cash payments and credits applied. The portal leads with the amount currently due, overdue invoices, upcoming due dates, and the last payment. It avoids presenting gross billings or pass-through media spend as though it were agency income.'
      },
      {
        title: 'Marketing Investment Breakdown',
        content: 'Clients can switch between the current Australian financial year, the last 90 days, and all time. XeroFlow uses synced Xero account codes and invoice lines to separate agency services from media and external suppliers, GST, and adjustments, with channels such as Google, Meta, Carsales, displays, printing, and SMS shown separately. If allocation data is incomplete, the portal says so and leaves the difference unclassified instead of inventing a split.'
      }
    ]
  },
  'creative-gallery': {
    title: 'Creative Gallery',
    slug: 'creative-gallery',
    icon: 'i-lucide-image',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Browse all delivered assets in a visual gallery with download and preview. A permanent library of everything your agency has created for each client.',
    details: [
      {
        title: 'Visual Asset Library',
        content: 'The creative gallery shows all files delivered to the client as a visual grid — images, PDFs, videos, and documents with thumbnail previews. Assets are organized by project and date, creating a permanent, searchable library of everything your agency has produced for the client. No more digging through email attachments or shared drives to find last quarter\'s ad creative.'
      },
      {
        title: 'Full-Resolution Preview',
        content: 'Click any asset to open it at full resolution in a lightbox viewer. Images display at native quality, PDFs render inline, and videos play directly in the browser. Navigate between assets with keyboard arrows. The preview includes file metadata — name, size, upload date, and associated project — so clients have full context for every asset.'
      },
      {
        title: 'Download and Share',
        content: 'Download individual assets or select multiple for bulk download as a zip file. Each download is logged so your team can see which assets clients are actively using. The gallery also supports direct sharing links — useful when a client\'s marketing coordinator needs to share a specific asset with their internal team or an external partner.'
      },
      {
        title: 'Organized by Project',
        content: 'Assets are automatically grouped by the project they belong to, with the most recent deliveries appearing first. Clients can filter by project, file type, or date range to find specific assets quickly. For long-running client relationships with hundreds of delivered assets, the organization and filtering make the gallery practical rather than overwhelming.'
      }
    ]
  },
  'notifications': {
    title: 'Notifications',
    slug: 'notifications',
    icon: 'i-lucide-bell',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Clients get notified when new deliverables, invoices, or updates are ready. Timely, relevant notifications that keep clients engaged without overwhelming them.',
    details: [
      {
        title: 'In-Portal Notifications',
        content: 'A notification center in the client portal shows all recent activity relevant to the client — new deliverables ready for review, invoice status changes, project updates, and approval requests. Notifications are marked as read when viewed and persist for historical reference. The notification badge in the sidebar shows unread count, so clients know at a glance whether something needs their attention.'
      },
      {
        title: 'Email Notifications',
        content: 'Critical updates are also delivered via email using Resend. New approval requests, invoice reminders, and important project milestones trigger email notifications with direct links to the relevant portal page. Email notifications are formatted with your agency branding and include just enough context for the client to decide whether to click through or acknowledge from their inbox.'
      },
      {
        title: 'Notification Preferences',
        content: 'Clients can configure which notifications they receive and through which channels. Some clients want email for everything; others prefer to check the portal at their own pace and only want email for urgent items like approval requests. Preferences are per-user, so different contacts within the same client account can have different notification settings based on their role and involvement.'
      },
      {
        title: 'Agency-Controlled Triggers',
        content: 'Your agency controls which events trigger client notifications. Configure whether clients are notified about status changes, file uploads, comment replies, or only explicit approval requests. This gives you editorial control over the client experience — you decide when clients hear about activity and what level of detail they see, keeping communication intentional rather than noisy.'
      }
    ]
  },
  'portal-crm-leads': {
    title: 'CRM & Lead Management',
    slug: 'portal-crm-leads',
    icon: 'i-lucide-contact-round',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Give clients a scoped CRM for contacts, companies, opportunities, and portal-visible leads — with follow-up status and outcome tracking built in.',
    details: [
      {
        title: 'A CRM Scoped to the Client Relationship',
        content: 'The portal CRM uses the same relationship model as the agency workspace while routing every request through the client-scoped portal API. Clients can work with the contacts, companies, activities, and opportunities you deliberately expose without gaining access to another client record or internal agency data.'
      },
      {
        title: 'Shared Lead Follow-Up',
        content: 'Portal-visible leads arrive in a dedicated inbox with contact state, notes, response timing, and outcome context. Clients can see what needs attention, mark follow-up progress, and keep the agency aligned on contacted, qualified, and won outcomes without a separate spreadsheet.'
      },
      {
        title: 'Permission and Audit Boundaries',
        content: 'Portal sessions and agency access remain distinct. The server derives client ownership from the authenticated session, enforces permissions at the endpoint, and records agency preview access so collaborative CRM work remains accountable.'
      }
    ]
  },
  'portal-campaign-analytics': {
    title: 'Campaign Analytics',
    slug: 'portal-campaign-analytics',
    icon: 'i-lucide-chart-no-axes-combined',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Share permission-gated campaign performance, spend, platform trends, leads, outcomes, and exports without exposing internal agency data.',
    details: [
      {
        title: 'Campaign and Platform Performance',
        content: 'Clients can review campaign totals, platform breakdowns, spend, impressions, clicks, conversions, and lead performance from a portal-specific analytics view. Trend charts and campaign tables provide useful detail without exposing the rest of the agency portfolio.'
      },
      {
        title: 'Leads Connected to Outcomes',
        content: 'Campaign reporting includes portal-visible lead volume, contacted and uncontacted states, won outcomes, response time, and cost-per-lead context. This keeps media delivery and commercial follow-up in the same client conversation.'
      },
      {
        title: 'Access-Controlled Reporting',
        content: 'Analytics navigation, reports, and exports appear only for client users with analytics permission. The same permission is rechecked by the server, so hiding a menu item is never the only access control.'
      }
    ]
  },
  'portal-measurement': {
    title: 'Measurement Health',
    slug: 'portal-measurement',
    icon: 'i-lucide-activity',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Show clients how browser events, server delivery, and CRM outcomes contribute to measurement — with ownership and evidence kept distinct.',
    details: [
      {
        title: 'Evidence, Not a Blended Status Light',
        content: 'The measurement view separates browser signals, server delivery, and CRM outcomes so one healthy layer cannot conceal a gap in another. Clients can understand which evidence exists, where it originated, and who owns the next action.'
      },
      {
        title: 'Outcome and Delivery Context',
        content: 'Portal reporting connects campaign outcomes with delivery health while preserving the difference between shared website event IDs and lead- or CRM-only lifecycle changes. That distinction makes the reporting more useful and harder to misread.'
      },
      {
        title: 'Client-Safe Operational Detail',
        content: 'Clients receive enough diagnostic context to have an informed measurement conversation without access to internal credentials, unrelated accounts, or implementation controls. The agency retains the operational control plane.'
      }
    ]
  },
  'portal-meetings-reviews': {
    title: 'Meetings & Video Reviews',
    slug: 'portal-meetings-reviews',
    icon: 'i-lucide-video',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Share upcoming meetings, recordings, and review-ready video so decisions and feedback stay attached to the client relationship.',
    details: [
      {
        title: 'Upcoming and Completed Meetings',
        content: 'Clients can see upcoming sessions, completed meetings, and the shared artifacts associated with each one. This creates a durable meeting history instead of scattering invites, recordings, and follow-up across inboxes.'
      },
      {
        title: 'Review Video in Context',
        content: 'Video review pages give clients a focused place to watch shared work and provide feedback. Review activity stays connected to the relevant client and project context rather than becoming an untraceable email thread.'
      },
      {
        title: 'Controlled Sharing',
        content: 'Only portal-visible meetings, recordings, and review items are returned to the client session. Agency-only notes and unrelated client artifacts remain outside the portal boundary.'
      }
    ]
  },
  'portal-briefs-social': {
    title: 'Briefs & Social Workspace',
    slug: 'portal-briefs-social',
    icon: 'i-lucide-panels-top-left',
    category: 'Client Portal',
    categoryIcon: 'i-lucide-briefcase',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Let clients submit structured briefs and access approved social inbox, listening, reporting, and news workflows from the same portal.',
    details: [
      {
        title: 'Structured Brief Submission',
        content: 'Clients can choose an approved template, complete the required fields, submit a brief, and follow its status from the portal. The agency receives structured information that can move directly into delivery instead of reconstructing requirements from email.'
      },
      {
        title: 'Shared Social Operations',
        content: 'Permissioned portal routes bring together the social inbox, listening, reporting, and approved news workflows. Clients can participate in the parts of social delivery that require their context while the agency keeps publishing controls and internal operations separate.'
      },
      {
        title: 'One Relationship Record',
        content: 'Briefs, files, social activity, jobs, approvals, and meetings live alongside CRM and campaign context. The result is a single client workspace with fewer handoffs and less duplicated reporting.'
      }
    ]
  },

  // ─── Time & Capacity ──────────────────────────────────────────
  'time-tracking': {
    title: 'Time Tracking',
    slug: 'time-tracking',
    icon: 'i-lucide-clock',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Log time against projects and tasks with start/stop timers or manual entry. Accurate time data for billing, capacity planning, and profitability analysis.',
    details: [
      {
        title: 'Timer and Manual Entry',
        content: 'Start a timer when you begin working and stop it when you are done — the entry is created automatically with the exact duration. Prefer manual entry? Log time after the fact with a project, task, date, duration, and optional description. Both methods feed into the same system, so your team uses whichever approach fits their workflow. Timers persist across page navigations so you do not lose a running timer by switching tabs.'
      },
      {
        title: 'Project and Task Association',
        content: 'Every time entry is linked to a project, and optionally to a specific task within that project. The project selector cascades — pick a project first, then the task list filters to show only tasks in that project. This association is what powers task-level time reporting, project profitability analysis, and the comparison between estimated hours and actual hours spent.'
      },
      {
        title: 'Weekly Grid View',
        content: 'The weekly grid shows all your time entries laid out by day, with row totals and column totals giving you a clear picture of how your week is shaping up. Each row represents a project-task combination, and cells show the hours logged for each day. The grid is editable — click any cell to adjust the time. Daily and weekly totals update in real time as you enter data.'
      },
      {
        title: 'Integration with Board Tasks',
        content: 'Time entries surface directly on board tasks. The task slideover includes a Time tab showing total time logged, a progress bar (if an estimate was set), and the ability to start a timer or log time without leaving the board context. Project managers can see time spent alongside task status, helping them understand whether a task is on track from both a progress and an effort perspective.'
      }
    ]
  },
  'weekly-timesheets': {
    title: 'Weekly Timesheets',
    slug: 'weekly-timesheets',
    icon: 'i-lucide-calendar-days',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Weekly grid view with submit, approval, and rejection workflows. Structured time reporting that flows into billing and capacity planning.',
    details: [
      {
        title: 'Weekly Submit Workflow',
        content: 'At the end of each week, team members review their time entries in the weekly grid and submit them for approval. The submit action locks entries for that week — no further edits are possible until a manager returns them. A confirmation modal shows the total hours and a breakdown by project before submission, giving the team member a final check before committing their timesheet.'
      },
      {
        title: 'Status Tracking',
        content: 'Each weekly timesheet has a status: Draft (still being filled), Submitted (awaiting manager review), Approved (locked and ready for billing), or Rejected (returned with feedback). Status badges are visible in the timesheet UI so team members always know where their submission stands. The status flows through a clear lifecycle with no ambiguity about the current state.'
      },
      {
        title: 'Entry Locking',
        content: 'Submitted and approved time entries are locked and cannot be edited by the team member. This prevents accidental or intentional changes to time data that has already been reviewed or billed. If a correction is needed after submission, the manager must reject the timesheet with a reason, which returns it to Draft status and unlocks the entries for editing.'
      },
      {
        title: 'Rejection with Reason',
        content: 'When a manager rejects a timesheet, they must provide a reason — missing entries, incorrect project allocation, excessive hours on a task, or any other concern. The rejection reason appears as a banner on the team member\'s timesheet so they know exactly what needs to be corrected. This structured feedback loop replaces back-and-forth messages about timesheet issues.'
      }
    ]
  },
  'manager-approvals': {
    title: 'Manager Approvals',
    slug: 'manager-approvals',
    icon: 'i-lucide-shield-check',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Review and approve team timesheets with bulk approve, reject with reason, and locked entry enforcement. The manager\'s control center for time data quality.',
    details: [
      {
        title: 'Approval Dashboard',
        content: 'The manager approvals page shows all submitted timesheets in a filterable list with tabs for Pending, Approved, and Rejected. Each entry shows the team member, week, total hours, and a breakdown by project. Managers can scan the list quickly to identify timesheets that need attention, with pending items prominently displayed at the top. Filter by team member or week to focus on specific submissions.'
      },
      {
        title: 'Expandable Detail View',
        content: 'Click any timesheet to expand it and see the full daily breakdown — which projects and tasks the team member worked on, how many hours each day, and any descriptions provided. This detail view gives managers enough context to assess whether the time allocation makes sense without needing to cross-reference against the project boards or ask the team member for clarification.'
      },
      {
        title: 'Bulk Approve',
        content: 'Select multiple timesheets and approve them in a single action. For weeks where everything looks normal, bulk approve saves managers from clicking through each submission individually. The bulk action is available from the list view — select the checkboxes, click approve, and all selected timesheets are locked with an approved status. The approval is timestamped and attributed to the approving manager.'
      },
      {
        title: 'Reject with Structured Feedback',
        content: 'Rejecting a timesheet opens a modal where the manager provides a reason. The rejection reason is saved and displayed to the team member on their timesheet page as a prominent banner. Common rejection reasons include missing time entries, incorrect project allocation, and unreasonable hours. The structured feedback ensures corrections are clear and actionable, reducing the back-and-forth that unstructured feedback creates.'
      }
    ]
  },
  'task-level-logging': {
    title: 'Task-Level Logging',
    slug: 'task-level-logging',
    icon: 'i-lucide-list-checks',
    category: 'Time & Capacity',
    categoryIcon: 'i-lucide-timer',
    categoryIconBg: 'bg-indigo-50',
    categoryIconColor: 'text-indigo-600',
    description: 'Link time entries to specific tasks. See time spent per task with progress bars and compare actual effort against estimates.',
    details: [
      {
        title: 'Task-Linked Time Entries',
        content: 'Every time entry can be linked to a specific task within a project. The task selector in the time entry modal shows tasks from the selected project, and the association flows through to all reporting views. When you log 2 hours on "Design social media ads" under the "Q1 Campaign" project, that time appears on the task card, in the project summary, and in the weekly timesheet — all connected.'
      },
      {
        title: 'Progress Bars and Estimates',
        content: 'Set hour estimates on tasks and see progress bars that fill as time is logged. A task estimated at 8 hours with 6 hours logged shows a 75% progress bar. When time logged exceeds the estimate, the bar turns red as a visual warning. This comparison between estimated and actual effort helps project managers identify scope creep and improve future estimates based on real data.'
      },
      {
        title: 'Task Time Summary Panel',
        content: 'The task slideover includes a dedicated Time panel showing summary cards (total time, number of entries, average per entry), the progress bar against estimate, and a list of all time entries with inline logging. Team members can start a timer or log time directly from the task context without navigating to the time tracking page. Everything related to time for that task is in one place.'
      },
      {
        title: 'Utilization and Efficiency Analysis',
        content: 'Task-level time data enables utilization analysis — see which types of tasks consume the most effort, which clients require more hours than budgeted, and which team members are most efficient at specific work types. This data feeds into capacity planning, helping managers allocate work based on actual performance data rather than assumptions about how long things should take.'
      }
    ]
  },

  // ─── Creative & Ad Operations ──────────────────────────────────
  'bulk-ad-launch': {
    title: 'Bulk Ad Launch',
    slug: 'bulk-ad-launch',
    icon: 'i-lucide-rocket',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Launch dozens of ads across platforms in minutes. Select creatives from Banner Studio, configure campaigns, and publish to Meta Ads — all from one page.',
    details: [
      {
        title: 'Cross-Project Creative Selection',
        content: 'Browse every published banner across all your Banner Studio projects in one unified picker. Creatives are grouped by project with thumbnails, format names, and dimensions visible at a glance. Use the search bar to filter by project name or ad format, then select individual banners or entire projects with a single click. The picker supports hundreds of published banners without performance issues, so even agencies running 50+ client accounts can see everything in one view.'
      },
      {
        title: 'Campaign & Ad Set Targeting',
        content: 'Connect your Meta Ads account via OAuth, then browse existing campaigns and ad sets directly inside XeroFlow. No need to switch to Ads Manager to find campaign IDs or create new ad sets. The wizard pulls your campaigns in real time, showing names and statuses. Select a campaign and ad set, and all creatives you launch will be placed there — matching your existing targeting, budget, and schedule settings without reconfiguration.'
      },
      {
        title: 'Multi-Creative Ad Copy',
        content: 'Write up to five primary text variations, five headlines, and five descriptions — Meta will automatically test combinations to find the best performers. Set a call-to-action button, link URL, and Facebook Page. Save your copy as a preset so you can reuse winning text across future launches. The copy section includes character counters and validation to ensure your ads meet platform requirements before you hit publish.'
      },
      {
        title: 'One-Click Bulk Publish',
        content: 'Hit the launch button and watch each creative upload to Meta in sequence — image upload, creative creation, and ad creation happen automatically for every selected banner. A real-time progress tracker shows the status of each creative as it moves through the pipeline. Ads are created in PAUSED status by default so you can review them in Ads Manager before spending. Failed uploads show error details so you can fix and retry without starting over.'
      }
    ]
  },

  'ad-platform-export': {
    title: 'Ad Platform Export',
    slug: 'ad-platform-export',
    icon: 'i-lucide-download',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export HTML5 banners for 14 ad platforms with automatic clickTag injection, file size validation, and compliant ZIP download — ready to upload to any ad server.',
    details: [
      {
        title: 'Platform-Aware ClickTag Injection',
        content: 'Each ad platform has its own click tracking mechanism. Google Ads uses var clickTag, The Trade Desk requires var clickTAG (uppercase TAG — case-sensitive), Xandr needs the AppNexus HTML5 library loaded before calling APPNEXUS.getClickTag(), and Yahoo DSP uses adkit.onReady() with adkit.clicktag(). XeroFlow injects the correct script for the selected platform, including any required external libraries in the head. No manual HTML editing needed.'
      },
      {
        title: 'Automatic Compliance Validation',
        content: 'Before download, your banner is validated against the platform\'s rules. File size is measured in bytes and compared against limits (150KB for Google Ads/AdSense/AdRoll, 200KB for most others). External scripts and stylesheets are flagged for platforms that block third-party calls. GSAP repeat:-1 and CSS infinite animations are detected for platforms that prohibit looping. Animation time limits (15s or 30s) trigger advisory warnings. Results display with clear error vs. warning severity.'
      },
      {
        title: 'One-Click ZIP Download',
        content: 'The export builds a complete HTML5 document with all variables substituted, CSS and JS inlined, the ad.size meta tag set, and the clickTag script injected. External resources are stripped for platforms that block them. Everything is compressed into a ZIP with index.html at the root — the standard format accepted by all ad servers. The filename includes your banner name, dimensions, and platform for easy identification.'
      },
      {
        title: '14 Supported Platforms',
        content: 'Export for Google Ads, Display & Video 360, Google Ad Manager, Campaign Manager 360, Google AdSense, Amazon DSP, The Trade Desk, Xandr (AppNexus), Sizmek, Flashtalking, AdRoll, Criteo, Yahoo DSP, or Generic IAB Standard. Each platform definition includes file size limits, animation constraints, external resource policies, looping rules, and required libraries — all maintained in a single specification file for easy updates.'
      }
    ]
  },

  // ─── Banner Studio ──────────────────────────────────────────────
  'banner-editor': {
    title: 'Visual Editor',
    slug: 'banner-editor',
    icon: 'i-lucide-pen-tool',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Turn uploaded artwork into editable animated banner drafts in a full WYSIWYG artboard editor with layers, a properties panel, drag-to-position, and multi-format support — purpose-built for HTML5 banner production.',
    details: [
      {
        title: 'Layer-Based Design',
        content: 'Build banners by stacking layers — text, images, buttons, rectangles, and background elements. Each layer has its own position, size, rotation, opacity, and animation properties. Reorder layers by drag-and-drop in the sidebar, lock layers to prevent accidental edits, and toggle visibility to focus on specific elements. The layer system mirrors what designers expect from tools like Figma or Photoshop, but outputs production-ready HTML5.'
      },
      {
        title: 'Multi-Format Artboards',
        content: 'Define multiple ad sizes in a single project — 300x250, 728x90, 160x600, 320x50, and any custom dimensions. Each format gets its own artboard with independent layer positioning, so you can fine-tune layouts per size while keeping shared assets and animations consistent. Add new formats at any time, and optionally use AI auto-resize to adapt layouts intelligently.'
      },
      {
        title: 'Properties Panel',
        content: 'Select any layer to reveal a context-sensitive properties panel on the right. Text layers show font family, size, weight, colour, line height, and letter spacing. Images show source URL, object fit, and border radius. All layers expose position (x, y), dimensions (width, height), rotation, opacity, and animation controls. Changes apply instantly on the artboard with no render delay.'
      },
      {
        title: 'Keyboard Shortcuts',
        content: 'Full keyboard shortcut support for professional workflows — arrow keys for pixel nudging, Shift+arrow for 10px jumps, Delete to remove layers, Cmd+D to duplicate, Cmd+Z/Shift+Cmd+Z for undo/redo, and bracket keys for layer reordering. Shortcuts are discoverable in the editor and match conventions from popular design tools so there is no learning curve.'
      }
    ]
  },
  'banner-animation': {
    title: 'Animation & Timeline',
    slug: 'banner-animation',
    icon: 'i-lucide-clapperboard',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'GSAP-powered keyframe timeline with entry and exit animations, easing curves, and frame-accurate playback for rich HTML5 ad production.',
    details: [
      {
        title: 'Keyframe Timeline',
        content: 'A visual timeline at the bottom of the editor shows every layer as a row with diamond-shaped keyframe markers. Drag keyframes to adjust timing, click between them to add new property changes, and use the playhead to scrub through the animation in real time. Each keyframe can animate position, scale, rotation, opacity, colour, and more — all rendered by GSAP for buttery smooth playback.'
      },
      {
        title: 'Entry & Exit Animations',
        content: 'Choose from 9 entry presets (fade in, slide from left/right/top/bottom, scale up, bounce, blur in, rotate in) and 9 matching exit presets. Each preset is configurable — adjust duration, delay, and easing independently. Entry animations fire on timeline start, exit animations fire before the banner loops or ends. This makes building "intro → hold → outro" sequences fast and intuitive.'
      },
      {
        title: 'Easing Library',
        content: 'Select from 30+ easing functions — linear, ease-in, ease-out, ease-in-out, plus GSAP-specific curves like back, elastic, bounce, and power curves (power1 through power4). Preview each curve visually before applying. The right easing choice transforms a mechanical-feeling animation into one that feels natural and polished, critical for ad creative that needs to catch attention in the first half-second.'
      },
      {
        title: 'PlayAll Modal',
        content: 'Preview all formats simultaneously in a single modal. Each artboard animates in sync so you can verify that your 300x250, 728x90, and 160x600 all look correct before exporting. Pause, rewind, and step frame-by-frame. This eliminates the tedious process of previewing each format individually and catching timing mismatches late in production.'
      }
    ]
  },
  'motion-paths': {
    title: 'Motion Paths',
    slug: 'motion-paths',
    icon: 'i-lucide-spline',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'SVG-based motion path editor with draggable waypoints, curviness control, and auto-rotate — animate elements along custom curves.',
    details: [
      {
        title: 'Visual Waypoint Editor',
        content: 'Click on the artboard to place waypoints that define a curved path. Each waypoint appears as a draggable handle overlaid on the canvas, connected by a smooth SVG Catmull-Rom spline. Drag waypoints to reshape the curve in real time — the layer follows the path as you scrub the timeline, giving instant visual feedback on the motion trajectory.'
      },
      {
        title: 'Curviness & Auto-Rotate',
        content: 'Adjust the curviness parameter to control how tightly the path follows the waypoints — low values create angular paths, high values create sweeping arcs. Enable auto-rotate so the layer rotates to face the direction of travel, perfect for animating icons, arrows, or character illustrations that need to orient along the curve.'
      },
      {
        title: 'GSAP MotionPath Integration',
        content: 'Motion paths are powered by GSAP MotionPathPlugin, ensuring pixel-accurate rendering across all browsers. The path data is serialised into the banner HTML so animations work identically in the editor, in preview, and in the published ad tag. When a motion path is active, it replaces manual x/y keyframes — the timeline UI hides position tracks to avoid conflicts.'
      },
      {
        title: 'Export-Ready',
        content: 'Published banners include the MotionPathPlugin CDN script automatically. The SVG path data is embedded as a JSON attribute so the animation runs independently with no server dependency. The exported HTML is self-contained and works on all major ad platforms that support GSAP animations.'
      }
    ]
  },
  'banner-export': {
    title: 'Static & GIF Export',
    slug: 'banner-export',
    icon: 'i-lucide-image',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export banners to PNG or JPG at 1x/2x resolution via headless Chromium, or as animated GIFs with configurable frame rate.',
    details: [
      {
        title: 'Static Image Export',
        content: 'Generate pixel-perfect PNG or JPG screenshots of any banner format using Cloudflare Browser Rendering — a headless Chromium instance running at the edge. Choose 1x or 2x resolution for retina displays. JavaScript is disabled during capture for security, and the rendered HTML is identical to what appears in the editor. Images are uploaded to R2 for CDN delivery.'
      },
      {
        title: 'GIF Export',
        content: 'Capture animated banners as GIF files by rendering frame-by-frame with GSAP timeline seeking. Configure the frame rate between 5 and 15 FPS — lower for smaller files, higher for smoother animation. Each frame is captured as PNG, quantised to an optimised palette, and assembled into a GIF using gifenc. The export modal shows estimated frame count and file size before rendering begins.'
      },
      {
        title: 'File Size Meter',
        content: 'A real-time file size indicator appears in the editor toolbar and export modal, colour-coded green (<100KB), yellow (100-150KB), or red (>150KB). Asset sizes are tracked per-format so you can identify which images or fonts are pushing the banner over ad platform limits. This prevents the common workflow of building a beautiful banner only to discover at export time that it exceeds the 150KB Google Ads limit.'
      },
      {
        title: 'Per-Format Export',
        content: 'Export individual formats or all formats at once. Each format generates its own file with the correct dimensions and format-specific layer positioning. Batch export creates a ZIP containing one file per format, named with the project, dimensions, and format key for easy identification when uploading to ad servers.'
      }
    ]
  },
  'video-export': {
    title: 'Video Export',
    slug: 'video-export',
    icon: 'i-lucide-film',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Export banner animations as MP4 video with frame-by-frame GSAP capture and ffmpeg encoding.',
    details: [
      {
        title: 'Frame-by-Frame Capture',
        content: 'The video export pipeline uses headless Chromium to render each frame individually. GSAP timeline.seek() positions the animation at precise timestamps, and a full-page screenshot captures the result. This approach guarantees frame-accurate output that matches exactly what you see in the editor preview — no dropped frames or timing drift.'
      },
      {
        title: 'ffmpeg Encoding',
        content: 'Captured frames are piped into ffmpeg for MP4 encoding with H.264 compression. The output is optimised for web delivery with a small file size and broad compatibility. Configurable frame rate and quality settings let you balance file size against visual fidelity depending on whether the video is for social media, email, or client presentation.'
      },
      {
        title: 'Social Media Ready',
        content: 'MP4 exports are formatted for direct upload to social platforms. The container format, codec, and pixel format are chosen for maximum compatibility with Meta, LinkedIn, Twitter, and YouTube upload requirements. This extends Banner Studio beyond traditional display ads into short-form video content for social campaigns.'
      },
      {
        title: 'R2 Storage',
        content: 'Exported videos are uploaded to Cloudflare R2 with a stable URL so they can be shared with clients or embedded in presentations. Each export includes metadata about the source project, format dimensions, duration, and frame rate for easy reference.'
      }
    ]
  },
  'ad-tags': {
    title: 'Ad Tags & Publishing',
    slug: 'ad-tags',
    icon: 'i-lucide-code',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Publish banners with stable CDN URLs. Generate iframe, JavaScript, and AMPHTML embed tags with click-through wrapping and tracking pixels.',
    details: [
      {
        title: 'Stable CDN URLs',
        content: 'Published banners are hosted on Cloudflare R2 at a stable path that never changes — banner-hosted/{projectId}/{formatKey}/index.html. When you re-publish with updates, the URL stays the same so any live ad tags automatically serve the latest version. No need to swap URLs in your ad server when you make creative revisions.'
      },
      {
        title: 'Embed Tag Generation',
        content: 'Generate ready-to-paste embed code in three formats: iframe (simplest — works everywhere), JavaScript (loads async with a fallback image), and AMPHTML (for AMP pages and Google Ads). Each tag includes the correct dimensions, sandbox attributes, and loading strategy. Copy to clipboard with one click.'
      },
      {
        title: 'Click-Through & Tracking',
        content: 'Set a click-through URL per format. The published banner wraps all click events to route through your destination URL. Add impression and click tracking pixels — up to 5 of each — that fire alongside the primary click. Tracking URLs are validated (http/https only) to prevent injection attacks.'
      },
      {
        title: 'Version History',
        content: 'Each publish creates a version record with a timestamp, publishing user, and snapshot of the banner configuration. Roll back to any previous version if a live ad needs to revert. Up to 50 versions are stored per project, with the oldest auto-pruned to manage storage.'
      }
    ]
  },
  'brand-kits': {
    title: 'Brand Kits',
    slug: 'brand-kits',
    icon: 'i-lucide-swatch-book',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Per-client brand kits with colour roles, heading and body fonts, light/dark logos and written guidelines — extracted from a website in a minute, applied with one undoable click, enforced at export.',
    details: [
      {
        title: 'Colours With Roles, Not Just Swatches',
        content: 'Every colour in a kit has a job — primary, secondary, accent, background, text — plus as many extras as the brand needs. Roles are what make one-click apply predictable: the primary lands on headlines, the accent on call-to-action buttons (with button text flipped for contrast), the background on every artboard. Add a label like "Leapmotor Green" so the team talks about colours the way the client does.'
      },
      {
        title: 'Heading & Body Typography',
        content: 'Pick a heading face and a body face from the studio font library or your uploaded brand fonts, with the weights the brand is licensed for. Applying a kit sets headlines and buttons in the heading face and subheads and body copy in the body face, and loads the fonts so the canvas renders correctly straight away.'
      },
      {
        title: 'Logos For Light and Dark',
        content: 'Upload the marks the client actually uses and tag each one for light or dark backgrounds. When a kit is applied the right variant replaces any layer flagged as a logo — or is placed top-left if the banner has none — so the artwork is on-brand before anyone touches a layer.'
      },
      {
        title: 'Extract From a Website',
        content: 'Paste the client\'s homepage and the studio pulls the palette, the fonts it loads, and the logo into a draft kit for you to confirm. Or start from a client record and their saved logo comes with it. Either way a brand kit takes a minute, not an afternoon of eyedroppering.'
      },
      {
        title: 'Default Kit Per Client',
        content: 'Mark one kit as the client\'s default and every new project linked to that client is offered it on open. Duplicate a kit for a sub-brand or campaign look, and every save keeps a version so you can restore an earlier palette with one click. Applying a kit is a single undo step in the editor.'
      },
      {
        title: 'Guidelines the AI Reads',
        content: 'Written guidelines — tone of voice, legal lines, do\'s and don\'ts — are fed to the AI copy and image assistants whenever a project is linked to the client, so suggestions arrive on-brand. The export compliance check flags colours and fonts that drift from the client\'s kit before a banner ships.'
      }
    ]
  },
  'template-marketplace': {
    title: 'Template Marketplace',
    slug: 'template-marketplace',
    icon: 'i-lucide-store',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Save designs as reusable templates. Browse a categorised gallery with search, tags, and usage tracking.',
    details: [
      {
        title: 'Save from Project',
        content: 'Turn any banner project into a template with one click. The template captures all layers, animations, formats, and brand settings as a snapshot. Add a description, tags, and category to make it discoverable. Saving a template does not affect the original project — it creates an independent copy that can be instantiated into new projects.'
      },
      {
        title: 'Category Gallery',
        content: 'Browse templates in a visual gallery organised by category — social media ads, display banners, email headers, promotional, and more. Each template card shows a preview thumbnail, format count, and usage statistics. Filter by category, search by name or tag, and sort by newest or most used.'
      },
      {
        title: 'Usage Tracking',
        content: 'Every time a template is used to create a new project, the usage counter increments. This helps your team identify which templates are most popular and which might need updating. Template creators can see how widely their designs are being adopted across the organisation.'
      },
      {
        title: 'Custom HTML Templates',
        content: 'Beyond the visual editor templates, support for custom HTML templates lets developers create advanced banner layouts with custom code. Upload HTML files that integrate with the Banner Studio layer system, enabling effects and interactions that go beyond the standard editor capabilities.'
      }
    ]
  },
  'data-feeds-dco': {
    title: 'Data Feeds & DCO',
    slug: 'data-feeds-dco',
    icon: 'i-lucide-database',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Upload CSV or JSON data feeds, bind columns to layer properties, and auto-generate per-row banner variants for dynamic creative at scale.',
    details: [
      {
        title: 'Feed Upload & Column Detection',
        content: 'Upload a CSV or JSON file and XeroFlow automatically detects column types — text, number, URL, and colour. The feed data is stored as JSON on R2 with a reference in the database. Column types determine which layer properties each column can bind to, preventing mismatches like binding a text column to a colour property.'
      },
      {
        title: 'Layer Property Bindings',
        content: 'Bind feed columns to layer properties with a visual picker. Text columns bind to text content, URL columns to image sources, colour columns to fill and background colours, number columns to font sizes. When a binding is set, the editor shows a feed icon on the bound layer. Bindings are per-layer and per-property, giving precise control over what is dynamic and what stays static.'
      },
      {
        title: 'Editor Preview Mode',
        content: 'Toggle feed preview mode to see your banner populated with actual feed data. Navigate between rows with arrow buttons to preview each variant. The preview updates instantly — every bound property swaps to the current row values. This lets designers verify that product names fit, images load correctly, and colours look right before generating variants.'
      },
      {
        title: 'DCO Variant Generation',
        content: 'Generate pre-baked HTML banners for every combination of feed row and ad format. Unlike runtime data feeds that require JavaScript, DCO variants embed the data directly into the HTML — making them compatible with any ad platform including those that block external scripts. Variants are hosted on R2 with stable URLs and can be exported as ad tags or ZIP files.'
      }
    ]
  },
  'design-precision': {
    title: 'Design Precision',
    slug: 'design-precision',
    icon: 'i-lucide-grid-3x3',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Google Fonts library, custom font upload, pixel grid, snap-to-grid, smart guides, and six-direction layer alignment tools.',
    details: [
      {
        title: 'Google Fonts Library',
        content: 'Access 120+ curated Google Fonts directly in the editor. Fonts load on-demand via a link tag so only the fonts you actually use are included in the published banner. Search by name or browse by category (sans-serif, serif, display, monospace). Recent fonts are tracked so your favourites appear at the top. Published banners include the Google Fonts link tag so text renders correctly everywhere.'
      },
      {
        title: 'Custom Font Upload',
        content: 'Upload WOFF2, WOFF, TTF, or OTF font files for brands that use proprietary typefaces. Uploaded fonts are stored on R2 and injected into the editor and published HTML via @font-face rules. The font picker shows a Custom tab with all uploaded fonts alongside the Google Fonts library. URL validation prevents injection of malicious font sources.'
      },
      {
        title: 'Grid & Snap',
        content: 'Toggle a pixel grid overlay on the artboard with configurable size (8px, 10px, 16px, etc.). When snap-to-grid is enabled, layer positions and sizes round to the nearest grid increment during drag operations. This ensures precise alignment without manual coordinate entry — essential for banner production where pixel-level accuracy matters.'
      },
      {
        title: 'Smart Guides & Alignment',
        content: 'As you drag a layer, magenta guide lines appear when it aligns with artboard edges, artboard centre, or other layer edges. Smart guides snap at configurable thresholds so you get alignment assistance without fighting the cursor. Six-direction alignment buttons (left, centre, right, top, middle, bottom) align selected layers to the artboard. Distribute and match-size operations help create evenly spaced, consistently sized element groups.'
      }
    ]
  },
  'ai-creative-assistant': {
    title: 'AI Creative Assistant',
    slug: 'ai-creative-assistant',
    icon: 'i-lucide-sparkles',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'AI text-to-image generation, layer editing & decomposition, copy suggestions, URL-to-banner, auto-resize, and image recommendations — built into the editor.',
    details: [
      {
        title: 'AI Text-to-Image Generation',
        content: 'Describe an image and AI generates it directly in the editor. Powered by Qwen-Image-2512, the generator supports five aspect ratios (1:1, 16:9, 9:16, 4:3, 3:4), adjustable guidance and inference steps, optional prompt enhancement, and reproducible seed control. Generated images upload to your asset library and drop onto the canvas with one click. Use the "Reuse Seed" button to create variations of a result you like.'
      },
      {
        title: 'AI Layer Editing',
        content: 'Right-click any image layer and select "Edit with AI" to open a prompt-based editor. Describe the change — "make the background blue," "remove the text," "add a sunset sky" — and the AI generates a modified version using Qwen-Image-Edit. Preview before and after side by side, adjust guidance scale and inference steps, lock a seed for reproducibility, then apply or try again. The original layer is preserved until you confirm.'
      },
      {
        title: 'AI Layer Decomposition',
        content: 'Break a flat image into individual editable layers with one click. The AI identifies distinct visual elements — foreground objects, backgrounds, text, logos — and extracts each as a transparent PNG layer on the canvas. Supports prompt-guided decomposition for targeted extraction, and exports PPTX and ZIP bundles of the decomposed layers for use outside the editor.'
      },
      {
        title: 'Merge Layers',
        content: 'Select multiple image layers with Shift+click in the timeline, then right-click to merge them into a single composited layer. The merge uses client-side canvas rendering that respects each layer\'s position, size, opacity, and rotation. The merged result uploads to your asset library as a new image, replacing the originals on the canvas. Useful for flattening complex compositions before export or further AI editing.'
      },
      {
        title: 'AI Copy Suggest',
        content: 'Select any text layer and click the AI icon to generate copy variations. The AI analyses the banner context — other text layers, brand name, and ad format — to suggest headlines, CTAs, and body copy that fit the available space. Powered by Workers AI with Groq fallback for fast response times. Suggestions appear in a popover and apply with one click.'
      },
      {
        title: 'URL-to-Banner',
        content: 'Paste a URL and XeroFlow scrapes the page to extract brand colours, images, headlines, and body copy. The AI then generates a complete banner layout with appropriate layers, typography, and composition. The result is a fully editable banner project — not a static screenshot — so you can tweak every element. Ideal for quickly mocking up ad concepts from a client landing page.'
      },
      {
        title: 'Smart Auto-Resize',
        content: 'When adding new ad formats to a project, AI auto-resize analyses the aspect ratio change and intelligently reflows layers. Wide-to-tall conversions stack elements vertically, tall-to-wide conversions arrange them horizontally. Text that does not fit is automatically trimmed by AI to preserve meaning while fitting the space. Toggle smart resize on or off per format.'
      },
      {
        title: 'Image Suggestions',
        content: 'The AI analyses text layers in your banner to suggest relevant image keywords and style directions. If your headline mentions "summer sale," suggestions include beach, sunshine, warm tones, and lifestyle imagery. Suggestions appear in the assets panel so you can search stock libraries or your uploaded assets with contextually relevant terms.'
      }
    ]
  },
  'banner-collaboration': {
    title: 'Real-Time Collaboration',
    slug: 'banner-collaboration',
    icon: 'i-lucide-users',
    category: 'Banner Studio',
    categoryIcon: 'i-lucide-palette',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Multi-user editing with live cursors, soft layer locking, presence indicators, and version history — powered by Durable Objects.',
    details: [
      {
        title: 'Live Cursors',
        content: 'See other editors\' cursors moving across the artboard in real time. Each collaborator gets a unique colour with their name displayed next to their cursor. Cursor positions are relayed via a Durable Object WebSocket at 12fps (83ms throttle) for smooth movement without excessive bandwidth. Stale cursors from disconnected users are cleaned up after 5 seconds.'
      },
      {
        title: 'Soft Layer Locking',
        content: 'When you select a layer, it is soft-locked to prevent conflicting edits. Other collaborators see a coloured dashed border around the locked layer with the editor\'s name badge. Attempting to select a locked layer shows a toast warning rather than blocking — the lock is advisory, not hard. This prevents frustrating edit conflicts while keeping the workflow flexible.'
      },
      {
        title: 'Live Layer Sync',
        content: 'Layer additions, removals, property changes, and reorderings are broadcast to all connected editors instantly. When your colleague adds a new text layer, it appears on your artboard within milliseconds. Echo prevention ensures you do not see your own changes reflected back. The sync protocol handles concurrent edits gracefully — last-write-wins with visual indicators of who changed what.'
      },
      {
        title: 'Presence & Version History',
        content: 'A presence bar shows stacked avatars of everyone currently editing the project, with an online count. Version history captures snapshots on save, with up to 50 versions per project and automatic pruning of the oldest. Roll back to any previous version if needed. Graceful degradation means the editor works perfectly in single-user mode when the Durable Object is unavailable.'
      }
    ]
  },

  // ─── Creative Production (additional) ───────────────────────────
  'ad-previews': {
    title: 'Ad Previews',
    slug: 'ad-previews',
    icon: 'i-lucide-monitor-smartphone',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Preview banners in 8 platform mockups — see exactly how your ads will look on Meta Feed, Stories, Reels, LinkedIn, and more.',
    details: [
      {
        title: 'Platform Mockup Components',
        content: 'Eight built-in mockup components render your banner inside realistic platform frames — Meta Feed (mobile and desktop), Meta Stories, Meta Reels, Instagram Feed, LinkedIn Feed, Google Display Network, and a generic display mockup. Each frame replicates the actual platform UI around your ad — profile headers, like buttons, comment sections — so you see the full context.'
      },
      {
        title: 'Editor Integration',
        content: 'Open the Preview slideover directly from the editor toolbar. Your current banner renders live inside each mockup with real-time animation playback. Switch between platforms instantly to verify your design works across contexts. The preview uses the same HTML build pipeline as export, so what you see is exactly what gets published.'
      },
      {
        title: 'Standalone Preview Page',
        content: 'A dedicated /agency/ad-preview page lets you preview any published banner by URL. Share the preview link with clients or stakeholders who want to see how ads look in context without accessing the editor. The page loads the published banner from R2 and renders it inside the selected platform mockup.'
      },
      {
        title: 'Responsive Frames',
        content: 'Mockup frames adapt to the banner dimensions. A 300x250 medium rectangle renders in a feed context, while a 728x90 leaderboard shows in a desktop header context. Stories mockups enforce 9:16 aspect ratio framing. The system automatically selects the most appropriate mockup layout based on your banner dimensions.'
      }
    ]
  },
  'safe-zones': {
    title: 'Safe Zone Overlays',
    slug: 'safe-zones',
    icon: 'i-lucide-scan',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Platform-specific safe zone guides for 11 ad platforms — ensure text and logos stay visible across placements.',
    details: [
      {
        title: '11 Platform Definitions',
        content: 'Safe zone definitions for Meta Feed, Meta Stories, Meta Reels, Instagram Feed, Google Display, YouTube, LinkedIn, Twitter/X, Snapchat, TikTok, and Pinterest. Each definition specifies the percentage-based safe area where text and logos will not be obscured by platform UI elements like profile headers, engagement buttons, or swipe-up indicators.'
      },
      {
        title: 'SVG Overlay',
        content: 'Safe zones render as a semi-transparent SVG overlay on the artboard at z-index 9992 — above all layers but below the UI controls. The danger zone is shaded while the safe area is clear, giving an instant visual indication of where to keep important content. Toggle the overlay on and off from the editor toolbar.'
      },
      {
        title: 'Active Zone Selection',
        content: 'Select the active safe zone from a dropdown in the toolbar. When designing for Meta Stories, select the Stories safe zone to see exactly where the profile header and CTA button will overlap your creative. Switch zones as you work across different placements to verify each one.'
      },
      {
        title: 'Design Confidence',
        content: 'Safe zones eliminate the guesswork of "will my headline be cut off on Stories?" or "does the logo overlap with the YouTube skip button?" By making platform constraints visible during design, you catch placement issues before export rather than discovering them after launch when budget has already been spent.'
      }
    ]
  },
  'meta-upload-wizard': {
    title: 'Meta Upload Wizard',
    slug: 'meta-upload-wizard',
    icon: 'i-lucide-upload',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'A five-step slideover wizard to publish banner creatives directly to Meta Ads — account, campaign, ad set, creatives, and go live.',
    details: [
      {
        title: 'Account Selection',
        content: 'Connect your Meta Ads account via OAuth and select which ad account to publish to. The wizard shows all accessible accounts with names, IDs, and status. For agencies managing multiple client accounts, switch between them without re-authenticating. The OAuth scope includes ads_management for full read/write access.'
      },
      {
        title: 'Campaign & Ad Set Picker',
        content: 'Browse existing campaigns and ad sets within the selected account. Campaigns show name, status, objective, and daily budget. Ad sets show targeting summary and schedule. Select where your new ads will live in your existing campaign structure — no need to recreate targeting or budgets that are already configured in Ads Manager.'
      },
      {
        title: 'Creative Selection',
        content: 'Pick published banners from any Banner Studio project. Thumbnails show the banner preview with format dimensions. Multi-select to launch several creatives at once. The wizard validates that selected formats are compatible with the chosen placement — flagging mismatches before you attempt to upload.'
      },
      {
        title: 'Text & Publish',
        content: 'Enter primary text, headline, description, call-to-action, and destination URL. Save text presets for reuse across launches. Hit publish and watch the progress tracker as each creative uploads, creates an ad creative object, and creates an ad in PAUSED status. Review in Ads Manager before activating.'
      }
    ]
  },
  'dealer-inventory-feeds': {
    title: 'Dealer Inventory Feeds',
    slug: 'dealer-inventory-feeds',
    icon: 'i-lucide-boxes',
    category: 'Creative Production',
    categoryIcon: 'i-lucide-rocket',
    categoryIconBg: 'bg-rose-50',
    categoryIconColor: 'text-rose-600',
    description: 'Turn client-mapped vehicle inventory into governed Google Merchant and Meta catalogue feeds without leaving XeroFlow.',
    details: [
      {
        title: 'Client-Scoped Inventory',
        content: 'Map each feed to the exact XeroFlow client and dealership source before it can be delivered. New, demo, and used inventory stay separated, while server-side validation checks the source URL, vehicle counts, client identity, and feed health instead of trusting values copied into a browser form.'
      },
      {
        title: 'Existing Connection, Verified Permissions',
        content: 'XeroFlow reuses the Meta OAuth connection already mapped to the client and checks the permissions Meta actually granted. Catalogue discovery and delivery become available when Meta grants the required catalogue permissions. If app review or a Business Manager role is missing, the platform identifies that exact gate rather than repeatedly asking the operator to reconnect.'
      },
      {
        title: 'Scheduled Delivery & Readback',
        content: 'When a catalogue already has the intended product feed, operators can select that exact feed by ID. XeroFlow verifies it belongs to the chosen catalogue and fails closed instead of creating a duplicate. The schedule change still requires explicit confirmation, followed by an immediate import and provider readback.'
      },
      {
        title: 'Auditable Provider Boundaries',
        content: 'Every attachment records tenant, client, connection, catalogue, source feed, upload identity, schedule, and sanitized provider-readback evidence. Tokens are never copied into the feed ledger. Meta app approval and business-role requirements remain explicit operator gates, and attaching inventory never claims to activate or spend from an advertising campaign.'
      }
    ]
  },

  // ─── Analytics & Reporting ──────────────────────────────────────
  'cross-platform-dashboard': {
    title: 'Cross-Platform Dashboard',
    slug: 'cross-platform-dashboard',
    icon: 'i-lucide-layout-dashboard',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Aggregated ad performance across Meta, Google, and other platforms in a single unified dashboard.',
    details: [
      {
        title: 'Unified Metrics',
        content: 'See spend, impressions, clicks, CTR, CPC, conversions, and ROAS from every connected ad platform in one view. Metrics are normalised so you can compare Meta CPC against Google CPC without switching between platform dashboards. Date range selection applies globally, and all charts update simultaneously.'
      },
      {
        title: 'Multi-Platform Aggregation',
        content: 'Data from Meta Ads, Google Ads, and any other connected platforms is fetched, transformed, and merged on the server. Each platform has its own API client and data normalisation layer so metrics map consistently regardless of how each platform reports them. The dashboard handles API rate limits and partial data gracefully.'
      },
      {
        title: 'Client-Level Filtering',
        content: 'Filter the dashboard by client to see only their campaigns across all platforms. This gives account managers a single view of their client\'s entire paid media performance. Combine with date range filtering to prepare monthly reports or investigate specific time periods.'
      },
      {
        title: 'Campaign Drill-Down',
        content: 'Click any metric to drill down into campaign-level detail. See individual campaigns ranked by spend, ROAS, or any other metric. Deep links take you directly to the campaign in the original ad platform dashboard for further investigation or optimisation. The campaign table uses an Ads Manager–style column layout — Delivery, Results, Cost per result, Reach, Bid strategy, and end dates — with a column picker to save your preferred view and a one-click Meta Ads preset to match the layout you already know.'
      },
      {
        title: 'Campaign Health Score',
        content: 'Each campaign gets a 0–100 health score with a colour-coded verdict — Scale, Hold, or Cut — based on how it performs against your client\'s own KPI targets (cost-per-result, CTR, frequency cap). The score combines efficiency, confidence, and engagement signals so your team knows exactly where to focus budget without requiring constant media buyer oversight.'
      }
    ]
  },
  'hourly-breakdowns': {
    title: 'Hourly Breakdowns',
    slug: 'hourly-breakdowns',
    icon: 'i-lucide-clock-4',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Granular hourly performance data with spend, impressions, and conversion trends throughout the day.',
    details: [
      {
        title: 'Hourly Granularity',
        content: 'See how ad performance varies hour by hour. Identify peak conversion windows, spot wasteful overnight spend, and discover when your audience is most engaged. Daily totals hide these patterns — hourly data reveals them. Charts show spend, impressions, clicks, and conversions for each hour of the selected day.'
      },
      {
        title: 'Day-Part Analysis',
        content: 'Compare morning, afternoon, evening, and night performance automatically. The dashboard highlights which day-parts deliver the best ROAS and which are underperforming. This data directly informs ad scheduling decisions — shift budget to high-performing hours and pause during low-conversion periods.'
      },
      {
        title: 'Heatmap Visualisation',
        content: 'A heatmap view shows days of the week on one axis and hours on the other, with colour intensity representing performance. Patterns emerge quickly — maybe your client\'s audience converts heavily on Tuesday afternoons but barely at all on weekends. The heatmap makes these patterns visible at a glance.'
      },
      {
        title: 'Cross-Platform Timing',
        content: 'Compare hourly patterns across platforms to discover if your audience behaves differently on Meta versus Google. Maybe they browse social media in the morning but search Google in the afternoon. These insights drive platform-specific scheduling strategies that maximise budget efficiency.'
      }
    ]
  },
  'campaign-alerts': {
    title: 'Campaign Alerts',
    slug: 'campaign-alerts',
    icon: 'i-lucide-bell-ring',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Detects ad-spend pacing problems — underspend, overspend, stopped, paused-with-budget, stale-sync and zero-conversion — then adds an AI pacing review for Meta and Google, with an on-demand per-campaign analysis that proposes a daily budget you compare against the rule-based number before deciding.',
    details: [
      {
        title: 'The Gap This Closes',
        content: 'The feature was built around a real failure mode: a SEM campaign running well below its monthly budget for weeks without anyone noticing until the client asked why results were down. Scheduled syncs were working, but nobody was looking at pacing against budget — just at results. The ad-spend health analyser runs daily across every active campaign and compares projected month-end spend against allocated budget, catching underspend and overspend early enough to act on them.'
      },
      {
        title: 'Six Pacing and Delivery Signals',
        content: 'The analyser detects six distinct conditions across Meta and Google campaigns. Underspend: campaign is tracking well below its budget pace and will likely leave significant spend on the table by month-end. Overspend: projected to exceed the monthly budget before the month ends. Stopped: a campaign that had consistent recent spend has gone to zero — could be an accidental pause, a payment issue, or a platform policy flag. Paused-with-budget: a campaign is paused or removed at the platform level but budget is still allocated in the system, meaning the client is potentially expecting delivery that is not happening. Stale-sync: the spend data has not refreshed recently enough to trust pacing calculations — this alert prompts a manual sync before acting on the numbers. Zero-conversion: a campaign is spending real budget but recording no conversions, which could mean a tracking breakage, a landing-page issue, or a targeting problem.'
      },
      {
        title: 'AI Pacing Review',
        content: 'The Ad Spend page turns those same deterministic pacing checks into a review queue for Meta and Google. Media buyers see critical and warning counts, projected over- or under-spend, stale-sync flags, and suggested daily budget targets. Every synced campaign keeps a Review entry point even when it is pacing normally, so buyers can inspect performance, tracking health, platform recommendations, history, and governed adjustment options at any time. AI summarizes which campaigns to inspect first so the team knows where to start each day.'
      },
      {
        title: 'Analyze With AI, Side By Side',
        content: 'Open any campaign and click "Analyze with AI" for an on-demand, real-time read, whether or not a pacing alert is active. The AI proposes a specific daily budget with a short rationale, a confidence level, and risk flags — shown directly alongside the rule-based pacing number so you can compare the two and pick whichever you trust for that campaign. Optionally tick "Refresh from platform first" to re-pull the campaign\'s latest spend from Meta or Google before the analysis runs, so the recommendation is based on up-to-the-minute numbers rather than the last scheduled sync. If the AI is unavailable the panel quietly falls back to the deterministic recommendation — it never blocks the workflow. For ABO campaigns that budget at the ad-set level, an applied recommendation is divided proportionally across the active ad sets — preserving the buyer\'s existing weighting while only the campaign total moves. For Google accounts, the same screen also surfaces Google\'s own optimization recommendations and optimization score — applying a budget recommendation routes it through the identical guard-railed, audited write, while keyword, target-CPA/ROAS, Performance Max ad-strength and tracking-health suggestions link straight into Google Ads. An optional per-severity automation policy can go a step further — on each pacing signal it can notify your team and/or auto-propose a budget adjustment straight into the review queue for a human to approve and apply; nothing is executed on the platform automatically.'
      },
      {
        title: 'Human In The Loop, Always',
        content: 'The analysis is read-only: nothing changes on the ad platform from this screen. When you choose a budget and approve the adjustment, it is recorded as an audited, planned-then-approved action — a clear paper trail of what was recommended, what was chosen, and by whom. Applying a change to a live platform budget is a separate, permission-gated step that an admin performs deliberately, so an AI suggestion can never move client money on its own.'
      },
      {
        title: 'Daily Slack Budget Review',
        content: 'Each morning at 9am tenant-local time (configurable in Settings → Budget Alerts), a Budget Review message is posted to your configured Slack channel. The digest covers every client and campaign with a detected pacing issue — grouped by severity — so your media buying team starts the day with a clear list of what needs attention. The webhook URL is set once in Settings and the timing can be adjusted to match your team\'s morning standup. Critical issues also trigger an immediate real-time Slack alert outside the daily window — a stopped campaign at 2pm does not wait until the next morning digest.'
      },
      {
        title: 'Accountability Tasks',
        content: 'For each critical pacing issue, the system can optionally create an accountability task assigned to the responsible media buyer, due in 24 hours. This bridges the gap between detection and resolution — the alert is not just a notification that gets buried, it becomes a tracked work item with an owner and a deadline. Tasks are created through the existing work management system so they appear in the assignee\'s board and notifications alongside their other work.'
      },
      {
        title: 'Connecting Slack in Two Minutes',
        content: 'Setup is a one-time, no-code step. In Slack, create an Incoming Webhook for the channel your media buyers watch, copy the generated https://hooks.slack.com/services/… URL, and paste it into Settings → Budget Alerts — an in-app guide walks you through it. Pick the hour your daily review should land, then send a test message to confirm it posts. From there the daily digest and real-time critical alerts flow automatically with no per-campaign configuration, and you can toggle the digest, real-time alerts, and accountability tasks independently whenever you like.'
      }
    ]
  },
  'platform-comparison': {
    title: 'Platform Comparison',
    slug: 'platform-comparison',
    icon: 'i-lucide-git-compare',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Side-by-side platform performance with unified metrics, normalised for cross-channel analysis.',
    details: [
      {
        title: 'Normalised Metrics',
        content: 'Each ad platform reports metrics differently — Meta calls it "cost per result" while Google uses "cost per conversion." The comparison view normalises everything into consistent definitions so you can legitimately compare cost-per-acquisition across platforms. Attribution models are noted so you understand the comparison context.'
      },
      {
        title: 'Side-by-Side Charts',
        content: 'Dual-axis charts overlay performance from multiple platforms on the same timeline. See how a Google Ads spend increase correlates with Meta performance changes. Identify which platform is delivering better results for the same audience segment during the same time period.'
      },
      {
        title: 'Budget Allocation Insights',
        content: 'The comparison surface suggests optimal budget allocation based on historical performance data. If Meta consistently delivers 30% lower CPA than Google for a specific client, the dashboard highlights the opportunity to shift budget. These insights are data-driven recommendations, not automated changes.'
      },
      {
        title: 'Client Reporting',
        content: 'Export the comparison view as part of client reports. The unified format means clients see a clear story across platforms without needing to understand each platform\'s reporting quirks. AI-generated summaries provide natural-language explanations of cross-platform trends.'
      }
    ]
  },
  'on-demand-sync': {
    title: 'On-Demand Sync',
    slug: 'on-demand-sync',
    icon: 'i-lucide-refresh-cw',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Pull the latest data from ad platforms instantly — no waiting for scheduled syncs.',
    details: [
      {
        title: 'Instant Data Refresh',
        content: 'Click the sync button to pull the latest data from all connected ad platforms immediately. Scheduled syncs run periodically, but when you are in a client meeting or preparing a report, you want the numbers as of right now. On-demand sync queries the platform APIs in real time and updates the dashboard within seconds.'
      },
      {
        title: 'Per-Platform Control',
        content: 'Sync individual platforms independently. If you only need fresh Meta data, sync just Meta without waiting for Google to respond. Each platform shows its last sync timestamp so you know how fresh the data is. Failed syncs show error details with retry options.'
      },
      {
        title: 'Rate Limit Awareness',
        content: 'The sync engine respects platform API rate limits to avoid account throttling. If you have hit the limit recently, the sync button shows a cooldown indicator with the estimated time until the next sync is available. This prevents accidental rate limit violations that could temporarily block API access.'
      },
      {
        title: 'Incremental Updates',
        content: 'On-demand sync only fetches data that has changed since the last sync, minimising API calls and response time. For date ranges that have already been fully synced, cached data is used. Only the current day and any recently modified historical data are refreshed.'
      }
    ]
  },
  'export-reporting': {
    title: 'Export & Reporting',
    slug: 'export-reporting',
    icon: 'i-lucide-file-down',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Export analytics to CSV with date ranges, metric breakdowns, and AI-generated performance summaries.',
    details: [
      {
        title: 'CSV Export',
        content: 'Export any analytics view to CSV with all visible columns, filters, and date ranges preserved. The export includes raw metric values for spreadsheet analysis, along with calculated fields like CTR and ROAS. Column headers match the dashboard labels so the export is immediately understandable without a data dictionary.'
      },
      {
        title: 'Date Range Selection',
        content: 'Choose custom date ranges, or use presets like last 7 days, last 30 days, this month, last month, or quarter-to-date. Date ranges apply to all charts and tables simultaneously. Compare two date ranges side-by-side to show period-over-period performance changes.'
      },
      {
        title: 'AI Summaries',
        content: 'Each analytics view includes an AI-generated summary that highlights the most important trends in natural language. Instead of scanning 20 metrics to find the story, the summary tells you "Meta spend increased 15% week-over-week with a corresponding 8% improvement in ROAS, driven primarily by the retargeting campaign." The summaries are generated on-demand and can be included in exports.'
      },
      {
        title: 'Breakdown Dimensions',
        content: 'Break down performance by campaign, ad set, ad creative, placement, device, age, gender, and geography. Each breakdown adds a row dimension to the table and a series to the charts. Multiple breakdowns can be combined for detailed cross-tabulation analysis.'
      }
    ]
  },
  'ga4-funnel': {
    title: 'GA4 Funnel & Website Analytics',
    slug: 'ga4-funnel',
    icon: 'i-lucide-filter',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Connect Google Analytics 4 and see the full funnel — ad spend through sessions, on-site conversions, and captured leads, attributed by channel. Close the loop from ad spend to on-site outcomes.',
    details: [
      {
        title: 'One funnel, every channel',
        content: 'We pull Google Analytics 4 alongside your Meta and Google ad spend and line them up by channel, so you read the whole story top to bottom: spend → sessions → key events → captured leads. Instead of three disconnected dashboards, the funnel sits in one place and every stage flows from the one above it.'
      },
      {
        title: 'Channel-level attribution',
        content: 'Paid Search and Paid Social map straight onto GA4 channel groups, so you see cost per session, cost per key event, and cost per lead per channel without fragile UTM wrangling. Spend from each platform lands next to the on-site behaviour it drove, making it obvious which channel is actually earning its budget.'
      },
      {
        title: 'Signal vs ground truth',
        content: 'GA4 key events show on-site conversion signal — form starts, submissions, and the events you have configured. Your captured leads show what actually landed in the inbox. We show both side by side so nothing hides: when GA4 reports conversions but the lead inbox is quiet, the gap is visible immediately rather than buried in a separate tool.'
      },
      {
        title: 'Always current',
        content: 'A daily sync refreshes the last two weeks of GA4 data to absorb Google Analytics reprocessing, which can revise figures for several days after the fact. The client report is never stale and never contradicts what the client sees in their own GA4 property when they check the same date range.'
      }
    ]
  },

  'qr-codes': {
    title: 'Dynamic QR Codes',
    slug: 'qr-codes',
    icon: 'i-lucide-qr-code',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Print-ready SVG QR codes with editable destinations and per-scan analytics — change the link, never reprint.',
    details: [
      {
        title: 'Print once, redirect forever',
        content: 'Every code encodes a short XeroFlow link rather than the destination itself. Change where it points from the dashboard and the update takes effect instantly — no reprinting a poster, a menu, or a vehicle wrap because a landing page moved. A full change history records every destination it has ever pointed to and who changed it.'
      },
      {
        title: 'Designed to match the brand',
        content: 'Pick pattern and corner styles, colours, ready-made templates, and an optional centre logo, add a call-to-action frame (“Scan to enter”, “Scan to book”) in the brand colour, then export a crisp SVG for print or a high-resolution PNG for digital use. The code looks intentional on the page it appears on, not like a generic black-and-white square dropped in as an afterthought.'
      },
      {
        title: 'Every scan counted',
        content: 'Each code tracks a daily scan series, a unique-visitor estimate, and suburb, postcode, country, device, operating system, and browser breakdowns (location is network-derived and approximate) — enough to know a code is working without collecting cookies or storing anything personally identifying about the person who scanned it.'
      },
      {
        title: 'Part of the client\'s 360 view',
        content: 'Switch on Client 360 export and every scan, hosted-page view and lead is mirrored into that client\'s first-party tracking stream, so QR sits beside site visits and form fills in their reports and flows out through the same measurement destinations. Identity is the scan\'s daily hash and the GA4 client id the client\'s own tag already set — never a device fingerprint.'
      },
      {
        title: 'Test two destinations from one print run',
        content: 'Turn on a split test and a share of scans goes to a second URL. The same person sees one arm all day, every lead carries the arm it came from, and the code’s analytics show lead rate per arm with a plain-English verdict once there is enough data — no reprint, no second code.'
      },
      {
        title: 'Launches and subscriber offers',
        content: 'Register-interest pages take registrations until the launch date, then switch themselves to the launched message and send people on to the product. Subscribe pages add the email to one of your marketing lists (double opt-in respected) and reveal an offer code the moment they sign up.'
      },
      {
        title: 'Variants in bulk',
        content: 'Need one code per table, window, flyer or dealer? Paste a list of variants (or pick a count) and every code is created in one go under a campaign, sharing the same style, frame and destination. The campaign view rolls up scans and leads per code and downloads every SVG and PNG in a single ZIP.'
      },
      {
        title: 'Organised by client',
        content: 'Codes live in folders per client, with a QR tab on every client record so a whole client\'s codes are one click away. Role-scoped access keeps each account manager looking only at the clients they work on.'
      }
    ]
  },

  'website-audience-intelligence': {
    title: 'Website Audience Intelligence',
    slug: 'website-audience-intelligence',
    icon: 'i-lucide-radio-tower',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Combine first-party website evidence with governed nearby-dealership discovery and approved public competitor monitoring.',
    details: [
      {
        title: 'Know every tag is talking',
        content: 'See every accessible website endpoint on one live signal ribbon: receiving, stale, missing recent data, never received, or inactive. Open any signal to see its freshness, event volume, origin, and direct route to tracking diagnostics, so broken or forgotten installs become visible before they weaken a report.'
      },
      {
        title: 'Read audience quality',
        content: 'Compare visitors, sessions, engagement, repeat behaviour, lead actions, confirmed leads, conversion rate, and attribution coverage against the preceding equal-length window. Ranked source, campaign, and page breakdowns put lead quality beside volume, while transparent opportunity rules explain the evidence and thresholds behind each recommendation.'
      },
      {
        title: 'Compare clients on one ledger',
        content: 'Give the marketing team an agency-wide ledger of tracking health and aggregate audience performance across every client they are allowed to access. Sort by freshness, visitors, engagement, lead outcomes, conversion, attribution coverage, or period change, then move directly into that client\'s tracking diagnostics when a signal needs attention.'
      },
      {
        title: 'Ask with the evidence attached',
        content: 'Generate a concise read-only briefing or ask a plain-English question on demand. The analyst receives only the active reporting window and redacted aggregate KPIs, opportunity rules, and ranked breakdowns; every answer keeps the supporting numbers one click away. It cannot identify individual visitors, activate an audience, or change a campaign.'
      },
      {
        title: 'Owned-site context',
        content: 'Connect current, client-owned landing pages and offers to that client\'s aggregate audience outcomes. The join uses exact canonical pages inside the authorised client boundary, so the team can see where real attention and lead activity meet stale, missing, or mismatched site content without exposing visitor-level records.'
      },
      {
        title: 'Governed nearby dealership discovery',
        content: 'Explore a non-exhaustive list of up to 20 nearby dealership candidates around a confirmed client location. Agency staff review each candidate, validate its public website, and give explicit human approval before XeroFlow creates or crawls a monitored competitor domain. Permitted portal users can nominate a Place ID for the same agency review; a nomination never starts monitoring.'
      },
      {
        title: 'Public competitor changes',
        content: 'Monitor only approved public competitor pages for material changes to models, offers, finance terms, calls to action, and content. Every change keeps its source URL, observed time, confidence, and structured before-and-after evidence. Access controls and declared content-use signals are respected, and blocked collection is shown as partial coverage rather than worked around.'
      },
      {
        title: 'Evidence-backed gaps',
        content: 'Compare current owned and public competitor facts conservatively. Exact model matches rank above category-level suggestions, expired offers are excluded, and low-evidence comparisons stay marked as insufficient data. XeroFlow never claims or infers competitor traffic, audience size, conversions, spend, or reach.'
      },
      {
        title: 'Controlled AI interpretation',
        content: 'Deterministic extraction and comparison remain the source of truth. Optional AI can summarise changed public content and improve retrieval only when the feature flag, site policy, and tenant controls permit it. AI output is labelled, source-linked, reviewable, and never activates an audience or changes an advertising campaign.'
      }
    ]
  },

  'analytics-ask': {
    title: 'Ask Your Data',
    slug: 'analytics-ask',
    icon: 'i-lucide-sparkles',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Ask a plain-English question about any client\'s performance and get a straight answer — grounded only in your real numbers, never invented.',
    details: [
      {
        title: 'Plain questions, real answers',
        content: 'Type a question the way you would ask a colleague — "which channel had the best cost per lead?" or "where should we shift budget?" — and get a concise, specific answer back. It reads the same filters you are already looking at, so the answer is always about the client and date range on screen.'
      },
      {
        title: 'Grounded in your numbers, not guesses',
        content: 'Every answer is built only from your actual per-channel spend, leads, conversions and revenue for the period. The assistant is instructed to use those figures and nothing else, so it cites concrete numbers and says so plainly when the data does not contain an answer — no confident hallucinations.'
      },
      {
        title: 'Show the numbers',
        content: 'One click expands the exact per-channel table the answer was based on, so you can sanity-check the claim before you repeat it to a client. The reasoning is transparent rather than a black box.'
      }
    ]
  },

  'analytics-benchmarks': {
    title: 'Portfolio Benchmarks',
    slug: 'analytics-benchmarks',
    icon: 'i-lucide-gauge',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'See exactly where a client sits against the rest of your book — engagement, conversion rate, CPL and CPA — as plain percentile rankings.',
    details: [
      {
        title: 'Where does this client really stand?',
        content: 'For the selected client, each key metric is shown against the portfolio: the client value, the portfolio median, and a percentile badge like "Top 22%". It is the line an account manager actually says out loud, backed by the whole book rather than a gut feel.'
      },
      {
        title: 'Direction-aware, so good always reads as good',
        content: 'Engagement and conversion rate are higher-is-better; cost per lead and cost per acquisition are lower-is-better. The ranking understands the difference, so a low CPL correctly shows as top-of-class rather than bottom — no misleading badges.'
      },
      {
        title: 'An agency-wide leaderboard',
        content: 'With no client selected, the same data becomes a sortable leaderboard across every client, so you can spot which accounts are leading and which are lagging on any metric in seconds — the view that runs your internal performance review.'
      }
    ]
  },

  'analytics-presets': {
    title: 'Blend Presets',
    slug: 'analytics-presets',
    icon: 'i-lucide-sliders-horizontal',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'One-click views over the blended cross-channel table, so the right metrics are always a single selection away.',
    details: [
      {
        title: 'The view you need, in one click',
        content: 'The blended channel table can show everything at once, which is rarely what you want in a review. Presets — paid channel mix, last-click, blended ROAS, organic vs paid, position-based lead credit — instantly narrow the table to the metrics that matter for that conversation.'
      },
      {
        title: 'Named, reusable, consistent',
        content: 'Each preset is a saved definition rather than ad-hoc fiddling, so the same view looks the same every time and across every client. Switching back to all metrics is always one selection away.'
      }
    ]
  },

  'analytics-export-api': {
    title: 'Analytics Export API',
    slug: 'analytics-export-api',
    icon: 'i-lucide-database',
    category: 'Analytics & Reporting',
    categoryIcon: 'i-lucide-chart-area',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Mint scoped bearer tokens to pull the canonical analytics fact into a warehouse or share with a client — revocable at any time.',
    details: [
      {
        title: 'Your data, on tap',
        content: 'A token-authenticated export endpoint serves the same canonical daily fact the dashboards are built on, as CSV or JSON. Point a warehouse job at it, schedule a nightly pull, or hand a client a read-only feed — the shape is stable and documented.'
      },
      {
        title: 'Scoped and revocable',
        content: 'Each token is minted with a clear label and a scope: agency-wide across every client, or locked to a single client who should only ever see their own data. The plaintext token is shown exactly once at creation and only its hash is stored, so it can never leak from the dashboard later.'
      },
      {
        title: 'Full control, no surprises',
        content: 'Every token is listed with its label, scope and creation date, and any token can be revoked in one click — instantly cutting off a warehouse job or a former client without disturbing the others.'
      }
    ]
  },

  // ─── Communication (additional) ─────────────────────────────────
  'link-previews': {
    title: 'Link Previews',
    slug: 'link-previews',
    icon: 'i-lucide-external-link',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Automatic OG unfurl for shared URLs — rich preview cards with title, image, and description appear inline in chat.',
    details: [
      {
        title: 'Server-Side OG Unfurl',
        content: 'When a message contains a URL, the server fetches the page and extracts Open Graph metadata — title, description, image, and site name. The unfurl happens server-side so users do not need to click the link to see what it contains. Results are cached to avoid repeated fetches for the same URL.'
      },
      {
        title: 'Rich Preview Cards',
        content: 'Link previews render as cards below the message with the page title, description, thumbnail image, and domain name. Cards are styled to fit naturally within the chat interface without dominating the conversation. Click the card to open the link in a new tab.'
      },
      {
        title: 'Security',
        content: 'The unfurl service validates URLs to prevent SSRF attacks — localhost, private IP ranges, and non-HTTP protocols are blocked. Image URLs from the OG metadata are proxied rather than loaded directly to prevent tracking pixels from firing in the chat context.'
      },
      {
        title: 'Supported Sources',
        content: 'Link previews work with any publicly accessible URL that includes Open Graph or Twitter Card metadata. This covers most websites, blog posts, documentation pages, and social media profiles. Internal XeroFlow links (tasks, boards, projects) render with custom preview cards that show entity-specific details.'
      }
    ]
  },
  'message-forwarding': {
    title: 'Message Forwarding',
    slug: 'message-forwarding',
    icon: 'i-lucide-forward',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Forward messages to any channel or DM with full attribution and context preserved.',
    details: [
      {
        title: 'Forward to Any Channel',
        content: 'Right-click any message or use the forward action to send it to another channel or DM. A modal lets you search and select the destination. The forwarded message appears with clear attribution — showing the original sender, channel, and timestamp. Add an optional note to provide context for why you are sharing it.'
      },
      {
        title: 'Preserved Context',
        content: 'Forwarded messages retain their original formatting, attachments, and emoji reactions. File attachments are linked rather than re-uploaded so they do not consume additional storage. Thread context is noted so recipients know if the message was part of a longer conversation.'
      },
      {
        title: 'Multi-Channel Forwarding',
        content: 'Forward a single message to multiple destinations at once. Select several channels or DMs in the forward modal and the message is sent to all of them simultaneously. Each destination receives an independent copy so reactions and replies in one channel do not affect others.'
      },
      {
        title: 'API Endpoint',
        content: 'Message forwarding is backed by a dedicated API endpoint that handles permission checks, message duplication, and notification delivery. Only users with access to the source message can forward it, and forwarding respects channel membership — you cannot forward to a channel you are not a member of.'
      }
    ]
  },
  'activity-hub': {
    title: 'Activity Hub',
    slug: 'activity-hub',
    icon: 'i-lucide-activity',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'A unified notification centre with live chat feed, For You tab, incoming items, and AI recommendations — accessible via keyboard shortcuts.',
    details: [
      {
        title: 'Live Feed Tab',
        content: 'The Feed tab shows a real-time stream of chat messages across all your channels. Messages arrive instantly via WebSocket — no polling or page refresh needed. Cursor-based pagination loads older messages as you scroll. Muted channels are filtered out so you only see conversations you care about. Click any message to jump directly to that channel.'
      },
      {
        title: 'For You Tab',
        content: 'The For You tab surfaces notifications personalised to your role and activity — task assignments, @mentions, approval requests, deadline reminders, and board events that affect your work. Notifications are grouped by time and priority so the most urgent items appear first.'
      },
      {
        title: 'Draggable Panel',
        content: 'The Activity Hub renders as a floating panel that can be dragged to any position on screen. Toggle between compact and expanded modes depending on how much screen real estate you want to dedicate. Position is persisted via localStorage so it stays where you put it across page navigations and sessions.'
      },
      {
        title: 'Keyboard Shortcuts',
        content: 'Press the period key (.) to toggle the Activity Hub open or closed. Press N to jump directly to the For You tab. These shortcuts work globally across all agency pages, making it fast to check notifications without reaching for the mouse. The hub replaces the old notification slideover and AI chat widget with a unified, more accessible interface.'
      }
    ]
  },

  'smart-watch': {
    title: 'Smart Watch & Notifications',
    slug: 'smart-watch',
    icon: 'i-lucide-bell-ring',
    category: 'Communication',
    categoryIcon: 'i-lucide-message-circle',
    categoryIconBg: 'bg-violet-50',
    categoryIconColor: 'text-violet-600',
    description: 'Granular subscription controls, AI-prioritised inbox, daily digest narrative, snooze, quiet hours, and semantic keyword watch — so the right team members hear about the right work without drowning in pings.',
    details: [
      {
        title: 'Watch any board, any item, any column',
        content: 'Subscribe at three scopes: an entire board, a single item, or a specific column (e.g. only when something enters Done). The Watch popover on every board header surfaces a subscriber stack with avatars, a snooze section, and quick options — All activity, Mentions only, Muted, or Custom… The Custom modal exposes five event categories (items, status moves, field edits, people, structure) plus a per-board email toggle. Item-level Watch lives on the task panel, and a "Watching" page at /agency/notifications/watching lists every subscription with bulk unwatch and a scope filter.'
      },
      {
        title: 'Reasons baked into every notification',
        content: 'Every notification carries a reason tag: Mentioned (red), Assigned (blue), Watching (grey), or system. The reason renders as a UBadge next to the title in your inbox so you can triage in one glance — no more "why am I getting this?" mystery. A small ? icon next to the badge opens an AI-generated one-line explanation specific to that notification, drawing on the actor, the change, and the board context.'
      },
      {
        title: 'AI-prioritised inbox',
        content: 'Every notification is scored 0..1 on importance using a fast rule-based heuristic at write time — mentions and assignments score highest, watching is moderate, with type-specific bumps for overdue tasks and approval requests. On inbox open, Workers AI re-classifies recent items via the llama-3.1-8b classifier and refines the scores in place. Toggle "Sort: Importance" in the inbox tab to surface the urgent stuff first; "Sort: Recent" preserves the historical newest-first behaviour.'
      },
      {
        title: 'Daily digest with AI narrative',
        content: 'A "Digest" tab in the notification slideover rolls up Today or Last 7 days into per-board summaries, with counts split by reason and the top 3 items by activity. Click any board to navigate, click any item to deep-link straight to its panel. Groq generates a one-sentence narrative for each board ("Sarah unblocked the homepage proof and Meta spend jumped 42% awaiting your sign-off") so you can skim what mattered without reading every entry.'
      },
      {
        title: 'Snooze and Quiet Hours',
        content: 'Snooze any board for 1h, 8h, end of day, tomorrow 8am, next workday (skipping weekends), or pick a custom date and time. While snoozed, the Watch button shows a moon icon with the remaining countdown and auto-uncovers when the window expires. At the user level, Quiet Hours suppresses browser push notifications during a configured time range and selected days — your inbox still receives everything, but the bell stops ringing. @mentions and assignments always come through regardless, since they are direct user-action.'
      },
      {
        title: 'Auto-watch & auto-acknowledge',
        content: 'When you create a task, comment on one, get assigned, or are @mentioned, you are automatically subscribed at the item level so you stay in the loop without thinking about it. Toggle off in /settings/notifications if you prefer manual. Auto-acknowledge is opt-in: when on, the moment someone assigns you a task, Groq drafts a contextual acknowledgement comment in your voice and posts it on your behalf, so the assigner knows you are alerted even before you open the app.'
      },
      {
        title: 'Semantic keyword subscriptions',
        content: 'Add keywords on the Watching page to track topics across every board you have access to. When new notification text contains a keyword (case-insensitive ILIKE), you get a "Keyword match" notification. Beyond exact matches, every keyword is embedded with Workers AI bge-base-en-v1.5 and stored in Vectorize, so semantically related text fires "Related to" notifications too — typing "invoicing" once will catch "billing", "payment processing", and "EOM submission" without you naming each.'
      },
      {
        title: 'Auto-watch suggestions',
        content: 'If you keep visiting a board you do not subscribe to (3+ visits in a 7-day window), a friendly toast surfaces with a one-click Watch button. Saves the awkward dance of "oh, I should have subscribed to this last week".'
      }
    ]
  },

  // ─── AI & Intelligence (additional) ─────────────────────────────
  'composite-scoring': {
    title: 'Composite Scoring',
    slug: 'composite-scoring',
    icon: 'i-lucide-blend',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Five-signal retrieval formula that blends semantic similarity, recency, importance, intent match, and entity overlap for optimal AI context.',
    details: [
      {
        title: 'Five-Signal Formula',
        content: 'Every piece of context retrieved for the AI is scored using five signals: semantic similarity (Vectorize cosine distance), recency (exponential decay from last update), importance (type-weighted — spend data scores 0.85, board data 0.55), intent match (how well the item matches the classified intent), and entity overlap (shared clients, projects, or tasks with the query). The signals are combined using per-intent weighting profiles.'
      },
      {
        title: 'Per-Intent Scoring Profiles',
        content: 'Different query types weight the signals differently. Financial queries emphasise recency (0.30 weight, 7-day half-life) because spend data becomes stale quickly. Process queries emphasise semantic similarity (0.35 weight, 90-day half-life) because documentation stays relevant longer. Search queries emphasise entity overlap (0.35 weight) to surface exact matches. All profile weights sum to 1.0.'
      },
      {
        title: 'Diversity Penalty',
        content: 'To prevent the AI context from being dominated by a single type of information, a diversity penalty applies -0.08 per item beyond 3 of the same type. If the top results are all "spend" items, the fourth and fifth spend items get progressively penalised, letting other types (tasks, briefs, clients) surface. This produces more balanced and useful AI responses.'
      },
      {
        title: 'Semantic Reranking',
        content: 'Items sourced from the database are reranked by Vectorize cosine similarity to the user query. A single Vectorize query generates embeddings and attaches a semanticScore to each item. This hybrid approach — database retrieval plus vector reranking — delivers better results than either approach alone, with graceful degradation if Vectorize is unavailable.'
      }
    ]
  },
  'ai-training-pipeline': {
    title: 'AI Training Pipeline',
    slug: 'ai-training-pipeline',
    icon: 'i-lucide-graduation-cap',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Extract training data from conversations, upload knowledge entries, manage datasets, and monitor training quality.',
    details: [
      {
        title: 'Five Extractors',
        content: 'Training data is extracted from real conversations using five specialised extractors: chat Q&A pairs, intent classification examples, RAG retrieval pairs, knowledge base entries, and combined multi-format output. Each extractor produces JSONL output with anonymisation applied — PII is stripped before any data enters the training pipeline.'
      },
      {
        title: 'Dataset Management',
        content: 'View, filter, and manage training datasets from the admin UI. Each dataset shows its source, extraction type, entry count, and creation date. Download datasets as JSONL for external use or delete datasets that are no longer needed. Statistics show the total volume of training data across all dataset types.'
      },
      {
        title: 'R2 Storage',
        content: 'Extracted training data is stored on Cloudflare R2 as JSONL files. Each dataset has a unique key and metadata record in the database. The R2 storage model keeps training data separate from the production database, making it easy to manage lifecycle, access control, and compliance requirements independently.'
      },
      {
        title: 'Queue Integration',
        content: 'Training data extraction runs as async jobs via the queue system. Submit an extraction job from the admin UI, and it processes in the background without blocking the main application. The training.extract job type handles scheduling, progress tracking, and error handling for large extraction operations.'
      }
    ]
  },
  'knowledge-base': {
    title: 'Knowledge Base',
    slug: 'knowledge-base',
    icon: 'i-lucide-book-open',
    category: 'AI & Intelligence',
    categoryIcon: 'i-lucide-brain',
    categoryIconBg: 'bg-amber-50',
    categoryIconColor: 'text-amber-600',
    description: 'Curate and approve knowledge entries that enhance AI responses with agency-specific context and domain expertise.',
    details: [
      {
        title: 'Knowledge Upload',
        content: 'Upload knowledge entries individually or in bulk via CSV/JSONL. Each entry has a title, content, category, and source reference. The upload process validates format and content length, then queues entries for Vectorize embedding so they become searchable by the AI system immediately.'
      },
      {
        title: 'Approval Workflow',
        content: 'Knowledge entries go through an approval workflow before they influence AI responses. New entries start as pending, reviewers can approve or reject with comments, and only approved entries are included in the AI context retrieval pipeline. This prevents inaccurate or outdated information from degrading AI quality.'
      },
      {
        title: 'Vectorize Deduplication',
        content: 'When new entries are uploaded, the system checks for semantic duplicates using Vectorize cosine similarity. Entries that are too similar to existing ones are flagged for review rather than auto-approved. This prevents the knowledge base from accumulating redundant information that wastes context window space.'
      },
      {
        title: 'CRUD API',
        content: 'Six API endpoints handle the full knowledge lifecycle — list with search and filters, create single entries, bulk create from file, read individual entries with full content, update entries and re-embed, and delete entries with Vectorize cleanup. The admin UI provides a searchable, filterable interface for managing hundreds of knowledge entries.'
      }
    ]
  },

  // ─── Briefs & Proposals ─────────────────────────────────────
  'brief-templates': {
    title: 'Brief Templates',
    slug: 'brief-templates',
    icon: 'i-lucide-file-plus',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Build structured intake templates with 30+ field types — text, dropdown, file upload, date pickers, budgets, and more. Start from a ready-made library spanning paid media, creative, print, web, email, and direct response, define required fields, capture offer and compliance details, and organize sections with drag-and-drop.',
    details: [
      {
        title: '30+ Field Types',
        content: 'Go far beyond simple text fields. Brief templates support rich text, dropdowns, multi-select, file uploads, date pickers, number inputs, currency fields, URL inputs, email fields, checkboxes, radio groups, sliders, color pickers, and many more. Each field type has validation rules, placeholder text, and help descriptions that guide clients and team members through the brief creation process.'
      },
      {
        title: 'Drag-and-Drop Organization',
        content: 'Arrange fields in the exact order that makes sense for your workflow. Group related fields into collapsible sections — creative requirements, budget details, timeline, target audience. Reorder entire sections or individual fields with drag-and-drop. Templates stay organized even as you add dozens of fields across multiple categories.'
      },
      {
        title: 'Required vs Optional Fields',
        content: 'Mark fields as required to ensure you always capture critical information, or leave them optional for nice-to-have details. The brief submission form enforces required fields before allowing submission, preventing incomplete briefs from entering your workflow. Optional fields expand on hover to keep the form clean.'
      },
      {
        title: 'Template Library',
        content: 'Start from a ready-made library that spans every channel your team briefs — paid media (search, social, performance-max, and inventory-feed campaigns), creative and design, print and out-of-home, web and landing pages, email, and SMS/MMS. Each template captures the unique information that workflow needs. Duplicate existing templates to create variations without starting from scratch. Templates are versioned so in-progress briefs continue using the version they started with.'
      },
      {
        title: 'Offer, Compliance & Accountability',
        content: 'Campaign and creative templates capture the offer and its legal fine print as structured fields, so the deal, pricing, and required disclaimers travel with every brief — and the disclaimer becomes mandatory the moment a price is entered. An accountability layer records the owner responsible for delivery and the sign-off required before anything goes live, giving every brief a clear chain of who proposed it, who confirmed compliance, and who must approve. The same structured fields make briefs readable by the review automation and AI assistants that route and act on them.'
      }
    ]
  },
  'template-builder': {
    title: 'Template Builder',
    slug: 'template-builder',
    icon: 'i-lucide-blocks',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Visual template editor with live preview, field configuration panels, section grouping, and default value management. Design professional intake forms without code.',
    details: [
      {
        title: 'Visual Field Editor',
        content: 'Each field has a configuration panel where you set the label, placeholder text, help description, validation rules, and default value. Preview how the field will look to brief creators in real time. Toggle between edit mode and preview mode to see the full template as your team and clients will experience it.'
      },
      {
        title: 'Section Grouping',
        content: 'Organize fields into logical sections with custom headers and descriptions. Sections can be collapsed by default to keep long templates scannable. Add section-level instructions that appear above the fields — perfect for explaining what information you need and why you need it for each part of the brief.'
      },
      {
        title: 'Field Validation Rules',
        content: 'Set minimum and maximum character counts for text fields, restrict file uploads to specific formats and sizes, define number ranges for budget fields, and require specific date ranges for timeline fields. Validation errors appear inline as users fill out the brief, catching issues before submission rather than during review.'
      },
      {
        title: 'Default Values & Prefills',
        content: 'Set sensible defaults for fields that commonly have the same value — default currency, standard deliverable sizes, typical timeline lengths. When team members or clients start a new brief from this template, defaults are pre-filled so they only need to change what is different from the norm.'
      }
    ]
  },
  'ai-brief-tools': {
    title: 'AI Brief Tools',
    slug: 'ai-brief-tools',
    icon: 'i-lucide-sparkles',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'AI-powered brief assistance — field suggestions as you type, completeness scoring, quality assessment, and full brief generation from minimal input.',
    details: [
      {
        title: 'Field Suggestions',
        content: 'As you fill out a brief, AI analyzes the context and suggests values for empty fields. Start typing a campaign objective and get suggested target audiences, recommended platforms, and estimated timelines. Suggestions appear as popover cards that you can accept, modify, or dismiss with a single click.'
      },
      {
        title: 'Brief Scoring',
        content: 'Every brief is scored on three dimensions: required field completion (40% weight), optional field completion (20% weight), and content quality (40% weight). Quality scoring evaluates field value length, specificity, and relevance. Scores update in real time as you edit, with a visual progress indicator showing what is needed to reach a strong brief.'
      },
      {
        title: 'AI Brief Generator',
        content: 'Provide a one-paragraph project description and AI generates a complete brief with all template fields populated. Review each field individually — accept the AI suggestion, edit it, or reject it and write your own. The generator uses your agency knowledge base and past briefs to produce contextually relevant content rather than generic placeholders.'
      },
      {
        title: 'Quality Assessment',
        content: 'AI reviews completed briefs for vague language, missing context, conflicting requirements, and unrealistic timelines. Issues are flagged with specific improvement suggestions. This catches problems that template validation cannot — like a brief that requests a TV campaign on a social media budget, or a launch date that falls on a public holiday.'
      }
    ]
  },
  'brief-to-quote': {
    title: 'Brief-to-Quote',
    slug: 'brief-to-quote',
    icon: 'i-lucide-receipt',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Auto-generate quotes from approved briefs. Rate card matching, line item extraction, Xero push, status sync, and quote-to-invoice conversion.',
    details: [
      {
        title: 'Auto-Generation on Approval',
        content: 'When a brief is approved and its template has quoting enabled, a quote is automatically generated. The system extracts deliverables from brief field values and matches each to your rate card using fuzzy matching with a configurable similarity threshold. Line items are created with quantities, rates, and descriptions pulled directly from the brief.'
      },
      {
        title: 'Rate Card Matching',
        content: 'Deliverables from the brief are matched to your rate card entries using fuzzy string matching. The system finds the best match above a 40% similarity threshold, pulling in the correct pricing, account codes, and descriptions. When no match is found, line items are flagged for manual pricing so nothing falls through the cracks.'
      },
      {
        title: 'Xero Integration',
        content: 'Push quotes to Xero as DRAFT quotes with a single click. The system matches the client to their Xero contact, maps line items to chart of accounts codes, and creates the quote in Xero. Sync status back to see when clients view, accept, or decline the quote. All changes flow bidirectionally between XeroFlow and Xero.'
      },
      {
        title: 'Quote-to-Invoice Conversion',
        content: 'When a client accepts a Xero quote, convert it to a DRAFT invoice with one click. The invoice inherits all line items, pricing, and contact details from the quote. This completes the full cycle: brief submission, approval, quote, client acceptance, invoice — all tracked and auditable within XeroFlow.'
      }
    ]
  },
  'bulk-brief-operations': {
    title: 'Bulk Operations',
    slug: 'bulk-brief-operations',
    icon: 'i-lucide-layers',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Multi-select briefs for bulk status changes, assignment, duplication, and export. Floating action bar appears when briefs are selected.',
    details: [
      {
        title: 'Multi-Select Interface',
        content: 'Checkbox selection on the briefs list allows you to select multiple briefs at once. Select all, select by filter criteria, or pick individual items. A floating action bar appears at the bottom of the screen showing the selection count and available bulk actions. Selection persists across page navigation so you can work with large sets.'
      },
      {
        title: 'Bulk Status Changes',
        content: 'Move multiple briefs through workflow stages in one action. Change 20 briefs from Draft to In Review, or archive a batch of completed briefs. Status changes trigger the same notifications and automations as individual changes, so your team stays informed without extra effort.'
      },
      {
        title: 'Bulk Assignment & Duplication',
        content: 'Reassign multiple briefs to a different team member during handoffs or team changes. Duplicate a set of briefs to create a new campaign batch with the same structure but fresh status tracking. Duplicated briefs preserve all field values and attachments while resetting workflow state.'
      },
      {
        title: 'Export & Analytics',
        content: 'Export selected briefs to CSV for reporting or external sharing. The export includes all field values, metadata, status history, and timeline data. Combined with the brief analytics dashboard, you can track cycle times, completion rates, and bottleneck patterns across your entire brief pipeline.'
      }
    ]
  },
  'brief-analytics': {
    title: 'Brief Analytics',
    slug: 'brief-analytics',
    icon: 'i-lucide-bar-chart-2',
    category: 'Briefs & Proposals',
    categoryIcon: 'i-lucide-file-text',
    categoryIconBg: 'bg-orange-50',
    categoryIconColor: 'text-orange-600',
    description: 'Cycle time funnels, completion rates, aggregate analytics, and template performance — understand how briefs flow through your agency.',
    details: [
      {
        title: 'Cycle Time Funnel',
        content: 'Visualize how long briefs spend in each workflow stage — from submission to review to approval to production. Identify bottlenecks where briefs stall and take action to speed up your pipeline. Filter by template, client, or team member to drill into specific workflow patterns.'
      },
      {
        title: 'Completion Rates',
        content: 'Track what percentage of briefs reach completion versus those that are abandoned, rejected, or stuck in review. Break down by template type to see which brief formats have the highest success rate. Low completion rates signal template complexity issues or unclear requirements.'
      },
      {
        title: 'Template Performance',
        content: 'Compare templates against each other — which ones produce the highest quality briefs, which have the fastest turnaround, and which generate the most revisions. Use these insights to refine your templates over time, removing friction from your best-performing workflows.'
      },
      {
        title: 'Aggregate Metrics',
        content: 'Dashboard widgets show total briefs in progress, average time to approval, briefs awaiting review, and briefs converted to quotes. Eight aggregate queries power the analytics dashboard, giving you a real-time pulse on your agency\'s brief pipeline across all clients and projects.'
      }
    ]
  },

  // ─── People Operations ──────────────────────────────────────
  'hr-people-operations': {
    title: 'HR & People Operations',
    slug: 'hr-people-operations',
    icon: 'i-lucide-users-round',
    category: 'People Operations',
    categoryIcon: 'i-lucide-shield-check',
    categoryIconBg: 'bg-cyan-50',
    categoryIconColor: 'text-cyan-600',
    description: 'Bring role clarity, private business reviews, evidence-aware scorecards, responsibility mapping, contract controls, and launch governance into one restricted people operations workspace.',
    details: [
      {
        title: 'Start With Role Clarity',
        content: 'Build versioned role profiles from contractual responsibilities, actual decision rights, agreed outcomes, and role-specific evidence requirements. Assign the published baseline to each team member before a review begins, then let them acknowledge it or record a correction when the role no longer reflects the work they perform.'
      },
      {
        title: 'Run Evidence-Aware Business Reviews',
        content: 'Commission neutral questionnaires from approved role profiles, schedule private review cycles, and keep participant responses inside a restricted workspace. Scorecards separate evidenced delivery from operational enablement, disclose their sources, and abstain when the configured evidence threshold has not been met.'
      },
      {
        title: 'Keep People in the Decision Loop',
        content: 'XeroFlow does not turn a questionnaire, operational signal, or score into an employment decision. Reviewers must consider contrary evidence, participants can challenge incorrect KPI evidence or role assumptions, and final findings require a recorded human review with the participant response attached.'
      },
      {
        title: 'Govern Every Launch and Change',
        content: 'Use explicit launch gates, current approval evidence, a contract vault, responsibility mapping, and an append-only decision history to keep the process accountable. Sensitive evidence remains access-controlled, private messages and protected attributes stay outside the review scope, and expired approvals return the workflow to a blocked state.'
      }
    ]
  },

  // ─── Administration ─────────────────────────────────────────
  'custom-roles': {
    title: 'Custom Roles',
    slug: 'custom-roles',
    icon: 'i-lucide-user-cog',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Create custom roles beyond the 15 built-in levels. Define granular permissions for each role to match your agency\'s unique organizational structure.',
    details: [
      {
        title: 'Beyond Built-In Roles',
        content: 'XeroFlow ships with 15 roles from owner to guest, but every agency is different. Create custom roles like \'Junior Media Buyer\' with ad spend visibility but no budget editing, or \'External Contractor\' with board access but no financial data. Custom roles inherit a base permission set that you can expand or restrict.'
      },
      {
        title: 'Granular Permission Matrix',
        content: 'Each role is defined by a matrix of 15+ permission areas — finance, creative, media buying, client management, admin, board access, chat, time tracking, and more. Toggle permissions on or off for each area. The permission matrix is visual, showing exactly what each role can and cannot do at a glance.'
      },
      {
        title: 'Server-Enforced Security',
        content: 'Permissions are not just a frontend concept. Every API endpoint checks the user\'s resolved permissions via server middleware. Even if someone manipulates the frontend, the server blocks unauthorized actions. Role resolution happens on every request, so permission changes take effect immediately without requiring users to log out.'
      },
      {
        title: 'Role Assignment',
        content: 'Assign roles from the admin user management panel. Change a user\'s role and their sidebar, available pages, and API access update instantly. Bulk role changes are supported for team restructuring. An audit trail tracks who changed what role and when, so you always know who authorized access changes.'
      }
    ]
  },
  'permission-system': {
    title: 'Permission System',
    slug: 'permission-system',
    icon: 'i-lucide-lock',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Fine-grained role-based access control with server-enforced middleware. 15+ permission areas cover every part of the platform.',
    details: [
      {
        title: 'RBAC Architecture',
        content: 'The permission system is built on role-based access control with permissions defined at both server and frontend levels. Server middleware blocks unauthorized mutations globally — viewers and guests cannot create, update, or delete any resources. Frontend middleware prevents navigation to unauthorized pages, and sidebar items are conditionally hidden based on permissions.'
      },
      {
        title: '15+ Permission Areas',
        content: 'Permissions cover finance (invoices, expenses, P&L), creative (banner studio, briefs), media (ad accounts, spend), client management (portal, contacts), admin (users, roles, settings), boards (create, edit, archive), chat (channels, DMs), time tracking (entries, approvals), AI (chat, training), and more. Each area can be independently granted or restricted per role.'
      },
      {
        title: 'Route Protection',
        content: '87 page files are protected by 7 route middleware files — role-admin, role-finance, role-creative, role-media, role-management, role-clients, and sales. Users who navigate to a page they cannot access are redirected to the dashboard. Direct URL access is blocked server-side, not just hidden in the UI.'
      },
      {
        title: 'Mutation Guards',
        content: 'Every POST, PUT, PATCH, and DELETE request passes through the RBAC middleware. External callers like Xero webhooks and Cloudflare Workers are exempt. Internal API routes are scoped correctly. The system enforces write access restrictions at the API layer, making permission bypass impossible regardless of how the request originates.'
      }
    ]
  },
  'admin-dashboard': {
    title: 'Admin Dashboard',
    slug: 'admin-dashboard',
    icon: 'i-lucide-settings',
    category: 'Administration',
    categoryIcon: 'i-lucide-shield',
    categoryIconBg: 'bg-slate-50',
    categoryIconColor: 'text-slate-600',
    description: 'Central admin panel with horizontal tab navigation — manage users, configure permissions, assign roles, and monitor access controls.',
    details: [
      {
        title: 'User Management',
        content: 'View all team members with their current roles, last login, and status. Search and filter by role, department, or activity. Invite new users, deactivate accounts, and change roles from a single interface. User cards show role badges and permission summaries so administrators can quickly audit who has access to what.'
      },
      {
        title: 'Role Configuration',
        content: 'The permissions tab displays the full role-permission matrix. See every built-in and custom role alongside their granted permissions. Create new custom roles, edit existing ones, and compare roles side by side. Changes are applied immediately and enforced on the next API request — no deployment or restart needed.'
      },
      {
        title: 'Horizontal Tab Navigation',
        content: 'The admin panel uses horizontal tabs within the agency layout — Users, Permissions, and Settings are all accessible without leaving the main navigation. This matches the platform\'s existing tab-based design patterns and keeps admin tasks integrated with the daily workflow rather than hidden in a separate settings area.'
      },
      {
        title: 'Audit & Compliance',
        content: 'Track role changes, permission modifications, and user access patterns. Know when a role was created, who assigned it, and what permissions were granted. This audit trail is essential for agencies handling client data, financial information, or regulated advertising — demonstrating who had access to what and when.'
      }
    ]
  },

  // ─── Financial Operations (additional) ──────────────────────
  'rate-cards': {
    title: 'Rate Cards',
    slug: 'rate-cards',
    icon: 'i-lucide-credit-card',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Define service pricing with rate cards. Fuzzy match to Xero chart of accounts, variance dashboards, and AI integration for pricing queries.',
    details: [
      {
        title: 'Service Pricing Database',
        content: 'Create rate card entries for every service your agency offers — hourly rates for strategy, fixed prices for deliverables, platform fees, production costs, and retainer components. Each entry includes a description, unit price, tax treatment, and mapping to your Xero chart of accounts. Rate cards serve as your single source of truth for pricing.'
      },
      {
        title: 'Xero Account Matching',
        content: 'Rate card entries are fuzzy-matched to your Xero chart of accounts so invoices generated from rate cards automatically use the correct revenue accounts. The variance dashboard highlights discrepancies between your rate card pricing and what is actually invoiced in Xero, catching pricing drift before it becomes a revenue issue.'
      },
      {
        title: 'Variance Dashboard',
        content: 'Compare rate card pricing against actual invoiced amounts across clients and time periods. See which services are consistently quoted at rates above or below the rate card. Identify clients with special pricing arrangements and track whether those arrangements are being applied correctly by your accounts team.'
      },
      {
        title: 'AI Pricing Integration',
        content: 'Ask the AI assistant pricing questions — \'What do we charge for social media management?\' or \'What is our hourly rate for video production?\' — and get instant answers from your rate card data. Rate card entries are embedded in the vector database so pricing information is part of the AI\'s knowledge base.'
      }
    ]
  },
  'quotes-proposals': {
    title: 'Quotes & Proposals',
    slug: 'quotes-proposals',
    icon: 'i-lucide-file-check',
    category: 'Financial Operations',
    categoryIcon: 'i-lucide-calculator',
    categoryIconBg: 'bg-emerald-50',
    categoryIconColor: 'text-emerald-600',
    description: 'Generate quotes from briefs with rate card pricing. Push to Xero, sync acceptance status, and convert accepted quotes directly into invoices.',
    details: [
      {
        title: 'Brief-Driven Quotes',
        content: 'Quotes are generated directly from approved briefs. The system extracts deliverables and quantities from brief field values, matches each to your rate card, and creates a structured quote with line items, totals, and tax calculations. This eliminates the manual step of re-entering brief requirements into a quoting tool.'
      },
      {
        title: 'Xero Quote Sync',
        content: 'Push quotes to Xero as DRAFT quotes with one click. Client contact matching, chart of accounts mapping, and tax treatment are handled automatically based on your rate card configuration. Once in Xero, quotes can be sent to clients for review. Status changes in Xero sync back to XeroFlow automatically.'
      },
      {
        title: 'Acceptance Tracking',
        content: 'Monitor quote status from within XeroFlow — Draft, Sent, Viewed, Accepted, Declined. When a client accepts a quote in Xero, the status updates in XeroFlow and the brief is marked as commercially approved. Declined quotes can be revised and resubmitted without creating duplicate records.'
      },
      {
        title: 'Invoice Conversion',
        content: 'Convert accepted quotes to DRAFT invoices with a single action. All line items, pricing, contact details, and account codes transfer from the quote to the invoice. This completes the brief-to-cash pipeline: intake, approval, quote, acceptance, invoice, payment tracking.'
      }
    ]
  }
}

const feature = computed(() => features[slug] || null)

useSeoMeta({
  title: `${feature.value?.title ?? 'Feature'} — XeroFlow`,
  description: feature.value?.description ?? 'Explore this XeroFlow feature.',
  ogTitle: `${feature.value?.title ?? 'Feature'} — XeroFlow`,
  ogDescription: feature.value?.description ?? 'Explore this XeroFlow feature.'
})
</script>
