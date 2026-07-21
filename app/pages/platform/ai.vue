<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="ai" />
      <div class="relative max-w-[1200px] mx-auto px-6 pt-32 pb-16 md:pt-44 md:pb-24 text-center">
        <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/[0.12] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span class="text-[13px] text-amber-400 font-medium">AI & Intelligence</span>
        </div>
        <h1 class="text-[clamp(36px,6vw,64px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6 max-w-[800px] mx-auto">
          AI that knows<br class="hidden sm:block">your agency
        </h1>
        <p class="text-lg md:text-xl text-white/50 max-w-[560px] mx-auto leading-relaxed">
          Groq-powered conversational AI, 8 anomaly analyzers, semantic search, and fine-tuned models -- all trained on your agency data.
        </p>
        <NuxtLink
          to="/ai-assistants"
          class="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-[#121317] transition-colors hover:bg-white/90"
        >
          Meet AI Assistants
          <UIcon name="i-lucide-arrow-right" class="size-4" />
        </NuxtLink>
      </div>
    </section>

    <!-- AI Chat Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-start">
          <!-- Left: Text -->
          <div class="md:sticky md:top-24">
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-bot" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Conversational AI</h2>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Ask questions about your clients, campaigns, budgets, and workflows in plain language.
              Mention any entity with <span class="font-medium text-[#121317] dark:text-white">@client</span>, <span class="font-medium text-[#121317] dark:text-white">@task</span>, or <span class="font-medium text-[#121317] dark:text-white">@project</span> to pin context directly into the conversation.
            </p>
            <p class="text-[15px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              The AI understands your agency's structure -- it retrieves relevant tasks, briefs, spend data, and timesheets to give you answers grounded in real data, not hallucinations.
            </p>
          </div>

          <!-- Right: Feature list -->
          <div class="space-y-4">
            <div
              v-for="item in chatFeatures"
              :key="item.title"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 flex items-start gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
            >
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0">
                <UIcon :name="item.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ item.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Anomaly Detection Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-12">
          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <h2 class="text-[clamp(24px,3vw,36px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">8 specialized analyzers</h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[520px] mx-auto leading-relaxed">
            A proactive agent that continuously scans your agency data and flags issues before they become problems.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div
            v-for="analyzer in analyzers"
            :key="analyzer.title"
            class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-5 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] mb-4">
              <UIcon :name="analyzer.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1.5">{{ analyzer.title }}</h3>
            <p class="text-[13px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ analyzer.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Semantic Search Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-start">
          <!-- Left: Text -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-search" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Semantic Search</h2>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Powered by Cloudflare Vectorize, search goes beyond keyword matching. Find tasks, clients, briefs, and knowledge base entries by meaning -- not just exact text.
            </p>
            <p class="text-[15px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              Every result is ranked by a 5-signal composite score that combines semantic similarity, recency, entity importance, intent match, and entity overlap. The system automatically diversifies results so you see the full picture, not just one type of match.
            </p>
          </div>

          <!-- Right: Scoring signals -->
          <div class="space-y-4">
            <div
              v-for="signal in scoringSignals"
              :key="signal.title"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 flex items-start gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
            >
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0">
                <UIcon :name="signal.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ signal.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ signal.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- AI Briefs Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid md:grid-cols-2 gap-12 md:gap-16 items-start">
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl bg-orange-50 dark:bg-orange-500/10 flex items-center justify-center">
                <UIcon name="i-lucide-file-text" class="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <h2 class="text-[clamp(24px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">AI-Powered Briefs</h2>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              AI assists at every stage of brief creation — from suggesting field values as you type, to scoring brief quality in real time, to generating complete briefs from a single paragraph.
            </p>
            <p class="text-[15px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">
              The quality scoring engine rates each brief across three dimensions: required field completion (40%), optional fields (20%), and content quality (40%). Issues like vague language, conflicting requirements, and unrealistic timelines are flagged with specific improvement suggestions.
            </p>
          </div>

          <div class="space-y-4">
            <div
              v-for="item in briefAiFeatures"
              :key="item.title"
              class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 flex items-start gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
            >
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] shrink-0">
                <UIcon :name="item.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white mb-1">{{ item.title }}</h3>
                <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ item.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Edge AI Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-12">
          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-cloud-lightning" class="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <h2 class="text-[clamp(24px,3vw,36px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">Edge AI inference</h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[520px] mx-auto leading-relaxed">
            Powered by Cloudflare Workers AI, intent classification and summarization run at the edge for sub-50ms latency with Groq fallback.
          </p>
        </div>

        <div class="grid sm:grid-cols-3 gap-5">
          <div
            v-for="card in edgeAiCards"
            :key="card.title"
            class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 flex flex-col gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <UIcon :name="card.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ card.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ card.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- LoRA Section -->
    <section class="pb-20 md:pb-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-12">
          <div class="flex items-center justify-center gap-3 mb-4">
            <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
              <UIcon name="i-lucide-cpu" class="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
          </div>
          <h2 class="text-[clamp(24px,3vw,36px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-3">Fine-tune with your data</h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/60 max-w-[560px] mx-auto leading-relaxed">
            Train custom LoRA adapters on your agency's chat history, knowledge base, and workflows. Route traffic between adapters with weighted A/B testing.
          </p>
        </div>

        <div class="grid sm:grid-cols-3 gap-5">
          <div
            v-for="card in loraCards"
            :key="card.title"
            class="bg-[#f4f5f7] dark:bg-white/[0.03] rounded-2xl p-6 flex flex-col gap-4 hover:bg-[#eef0f3] dark:hover:bg-white/[0.05] transition-colors"
          >
            <div class="w-11 h-11 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
              <UIcon :name="card.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
            </div>
            <div>
              <h3 class="text-[16px] font-medium text-[#121317] dark:text-white mb-1.5">{{ card.title }}</h3>
              <p class="text-[14px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ card.description }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Dark CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Intelligence built for agencies
          </h2>
          <p class="text-[16px] text-white/50 max-w-[440px] mx-auto leading-relaxed mb-10">
            Stop digging through dashboards. Ask the AI, and it finds the answer.
          </p>
          <NuxtLink
            to="/auth/login"
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
definePageMeta({
  layout: false,
  public: true
})

const chatFeatures = [
  {
    title: 'Groq LLM',
    icon: 'i-lucide-zap',
    description: 'Ultra-fast inference powered by Groq. Sub-second responses for real-time conversational workflows.'
  },
  {
    title: '@Entity Mentions',
    icon: 'i-lucide-at-sign',
    description: 'Type @client, @task, or @project to pin entities into context. The AI fetches their full data automatically.'
  },
  {
    title: 'Context Awareness',
    icon: 'i-lucide-brain',
    description: 'Intent classification routes queries to the right data sources -- spend, timesheets, tasks, briefs, or knowledge base.'
  },
  {
    title: 'Live Data Tools',
    icon: 'i-lucide-wrench',
    description: 'The assistant calls dedicated tools to pull live numbers on demand -- finance, ad-spend, anomalies, projects, clients, social -- and proposes any change (like creating a task) for you to confirm. It never acts on its own, and only ever within your permissions.'
  },
  {
    title: 'Role-Focused Assistants',
    icon: 'i-lucide-users',
    description: 'Switch between Finance, Marketing, Sales, and Account Management assistants -- same engine, each leading with the right focus and tools for the role.'
  },
  {
    title: 'Conversation Pinning',
    icon: 'i-lucide-pin',
    description: 'Pin important conversations for quick access. Up to 25 pinned threads per user with dedicated sidebar section.'
  },
  {
    title: 'Rate Card Queries',
    icon: 'i-lucide-credit-card',
    description: 'Ask pricing questions in plain language. Rate card entries are embedded in the vector database so the AI knows your exact service rates.'
  },
  {
    title: 'Time Tracking Queries',
    icon: 'i-lucide-timer',
    description: 'Ask "How many hours on Client X last month?" and get instant answers. Timesheet gap analysis spots missing entries automatically.'
  }
]

const analyzers = [
  {
    title: 'Spend Anomaly',
    icon: 'i-lucide-trending-up',
    description: 'Detects unusual spikes or drops in ad spend across Meta and Google campaigns.'
  },
  {
    title: 'Budget Overrun',
    icon: 'i-lucide-wallet',
    description: 'Flags campaigns approaching or exceeding their monthly budget limits.'
  },
  {
    title: 'Deadline Risk',
    icon: 'i-lucide-alarm-clock',
    description: 'Identifies tasks and projects at risk of missing their due dates.'
  },
  {
    title: 'Client Health',
    icon: 'i-lucide-heart-pulse',
    description: 'Monitors client engagement signals and flags accounts needing attention.'
  },
  {
    title: 'Revenue Trend',
    icon: 'i-lucide-bar-chart-3',
    description: 'Tracks revenue patterns and alerts on declining or stagnant client revenue.'
  },
  {
    title: 'Utilization',
    icon: 'i-lucide-gauge',
    description: 'Analyzes team capacity and flags over- or under-utilized team members.'
  },
  {
    title: 'Campaign Performance',
    icon: 'i-lucide-megaphone',
    description: 'Evaluates campaign KPIs against benchmarks and flags underperformers.'
  },
  {
    title: 'Billing Gap',
    icon: 'i-lucide-receipt',
    description: 'Finds unbilled work, missing invoices, and revenue leakage across clients.'
  }
]

const scoringSignals = [
  {
    title: 'Semantic Similarity',
    icon: 'i-lucide-sparkles',
    description: 'Vectorize cosine similarity matches results by meaning, not just keywords.'
  },
  {
    title: 'Recency',
    icon: 'i-lucide-clock',
    description: 'Exponential decay scoring with configurable half-life per intent type.'
  },
  {
    title: 'Entity Importance',
    icon: 'i-lucide-star',
    description: 'Weighted scoring by entity type -- spend data ranks higher than board metadata.'
  },
  {
    title: 'Intent Match',
    icon: 'i-lucide-target',
    description: 'Edge-classified intent aligns results to what you are actually asking about.'
  },
  {
    title: 'Entity Overlap',
    icon: 'i-lucide-layers',
    description: 'Results mentioning the same clients, projects, or tasks as your query rank higher.'
  }
]

const briefAiFeatures = [
  {
    title: 'Field Suggestions',
    icon: 'i-lucide-sparkles',
    description: 'AI suggests values for empty fields as you type — target audiences, platforms, timelines — based on context and past briefs.'
  },
  {
    title: 'Brief Generator',
    icon: 'i-lucide-wand-2',
    description: 'Provide a one-paragraph description and AI populates every template field. Accept, edit, or reject each suggestion individually.'
  },
  {
    title: 'Quality Assessment',
    icon: 'i-lucide-check-circle',
    description: 'AI reviews completed briefs for vague language, conflicting requirements, and unrealistic timelines with specific fix suggestions.'
  }
]

const edgeAiCards = [
  {
    title: 'Intent Classification',
    icon: 'i-lucide-route',
    description: 'Queries are classified at the edge into financial, process, search, time tracking, pricing, and other intents — routing to the right data sources in under 50ms.'
  },
  {
    title: 'Edge Summarization',
    icon: 'i-lucide-text',
    description: 'Long documents and thread summaries are generated at the edge via Llama 3.1 8B. No round-trip to external APIs — everything stays on Cloudflare\'s network.'
  },
  {
    title: 'Graceful Fallback',
    icon: 'i-lucide-shield',
    description: 'If Workers AI is unavailable, requests automatically fall back to Groq for classification and generation. Zero downtime for AI features.'
  }
]

const loraCards = [
  {
    title: 'Training Data Extraction',
    icon: 'i-lucide-database',
    description: 'Five extractors pull chat Q&A pairs, intent examples, RAG documents, knowledge entries, and combined datasets. Automatic anonymization and JSONL export to R2.'
  },
  {
    title: 'Adapter Management',
    icon: 'i-lucide-settings',
    description: 'Upload, activate, and retire LoRA adapters. Weighted traffic routing lets you A/B test new models against the baseline with gradual rollout.'
  },
  {
    title: 'Metrics Dashboard',
    icon: 'i-lucide-activity',
    description: 'Track adapter performance across response quality, latency, and user satisfaction. Compare adapters side-by-side and promote winners automatically.'
  }
]
</script>
