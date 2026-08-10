<template>
  <div class="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
    <MarketingNav />

    <!-- Three.js Scene (fixed background) -->
    <AiTrainingScene />

    <!-- Scrollable content overlay -->
    <div class="ai-training-content relative z-[2]">

      <!-- Section 1: Hero -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative pt-[52px]">
        <div class="w-full max-w-[1600px] mx-auto px-[5%]">
          <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-sm mb-8 hero-entrance hero-delay-1">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span class="text-[13px] text-white/60 font-medium">The agency operating system</span>
          </div>
          <h1 class="font-display text-[clamp(4rem,12vw,10rem)] leading-[1.05] mb-8 font-bold text-white tracking-[-0.02em] uppercase hero-entrance hero-delay-1">
            One Platform.<br>Every Operation.
          </h1>
          <p class="text-[clamp(1.1rem,2vw,1.5rem)] max-w-[620px] mb-10 text-white/80 font-light leading-relaxed hero-entrance hero-delay-2">
            Work management, financials, real-time chat, AI insights, client portal, and a full banner studio — unified in a single platform built for modern agencies.
          </p>
          <div class="flex flex-col sm:flex-row items-start gap-4 hero-entrance hero-delay-3">
            <NuxtLink
              to="/contact"
              class="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#0a0a0a] text-lg font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Talk to us
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5" />
            </NuxtLink>
            <button
              class="inline-flex items-center gap-2 px-8 py-4 border border-white/20 text-white text-lg font-medium rounded-full hover:bg-white/[0.06] transition-colors"
              @click="scrollTo('features')"
            >
              See What's Inside
              <UIcon name="i-lucide-chevron-down" class="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      <!-- Section 2: Platform Overview Grid -->
      <section id="features" class="py-24 relative">
        <div class="section-backdrop-center" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="text-center mb-16">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] font-bold text-white tracking-[-0.02em] uppercase reveal">
              Everything<br>You Need
            </h2>
            <p class="text-[clamp(1rem,1.5vw,1.2rem)] max-w-[560px] mx-auto mt-6 text-white/60 font-light leading-relaxed reveal reveal-d1">
              Replace your stack of disconnected tools with one platform that keeps your entire agency in sync.
            </p>
          </div>

          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="(feature, i) in platformFeatures"
              :key="feature.title"
              class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-7 group hover:border-white/[0.15] transition-all reveal"
              :class="'reveal-d' + ((i % 3) + 1)"
            >
              <div class="flex items-center gap-4 mb-4">
                <div class="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" :class="feature.bg">
                  <UIcon :name="feature.icon" class="w-5 h-5" :class="feature.color" />
                </div>
                <h3 class="text-[17px] font-medium text-white">{{ feature.title }}</h3>
              </div>
              <p class="text-[14px] text-white/50 leading-relaxed">{{ feature.desc }}</p>
              <div class="flex flex-wrap gap-2 mt-4">
                <span
                  v-for="tag in feature.tags"
                  :key="tag"
                  class="px-2.5 py-1 rounded-full bg-white/[0.04] text-[11px] text-white/40 font-medium"
                >
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Work Management Deep Dive -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 mb-6 reveal">
              <UIcon name="i-lucide-kanban" class="w-3.5 h-3.5 text-blue-400" />
              <span class="text-[12px] text-blue-400 font-medium">Work Management</span>
            </div>
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Boards<br>Built For<br>Agencies
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Monday.com-style boards with 20+ column types, five views (Kanban, Table, Timeline, Calendar, Gallery), groups, subtasks, and real-time SSE sync.
            </p>

            <div class="grid sm:grid-cols-2 gap-4">
              <div
                v-for="(item, i) in workFeatures"
                :key="item.title"
                class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-5 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="flex items-center gap-3 mb-2">
                  <UIcon :name="item.icon" class="w-4 h-4 text-blue-400" />
                  <span class="text-[15px] font-medium text-white">{{ item.title }}</span>
                </div>
                <span class="text-[13px] text-white/45 leading-relaxed">{{ item.desc }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: Financial Operations -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop-right" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px] ml-auto">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 mb-6 reveal">
              <UIcon name="i-lucide-calculator" class="w-3.5 h-3.5 text-emerald-400" />
              <span class="text-[12px] text-emerald-400 font-medium">Financial Operations</span>
            </div>
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Money.<br>Managed.
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Xero-integrated invoicing, P&amp;L tracking, end-of-month automation, Meta &amp; Google Ads spend syncing with budget management and audit trails.
            </p>

            <!-- Finance stats row -->
            <div class="grid grid-cols-3 gap-4 mb-6 reveal reveal-d2">
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-5 text-center">
                <div class="text-[clamp(24px,4vw,40px)] font-bold text-emerald-400 mb-1">$0</div>
                <div class="text-[12px] text-white/40">Manual reconciliation</div>
              </div>
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-5 text-center">
                <div class="text-[clamp(24px,4vw,40px)] font-bold text-white mb-1">2-way</div>
                <div class="text-[12px] text-white/40">Xero sync</div>
              </div>
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-5 text-center">
                <div class="text-[clamp(24px,4vw,40px)] font-bold text-amber-400 mb-1">EOM</div>
                <div class="text-[12px] text-white/40">Auto-generation</div>
              </div>
            </div>

            <div class="flex flex-col gap-3 reveal reveal-d3">
              <div
                v-for="item in financeHighlights"
                :key="item"
                class="flex items-center gap-3"
              >
                <div class="w-5 h-5 rounded-full bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-emerald-400" />
                </div>
                <span class="text-[14px] text-white/70">{{ item }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 5: AI Intelligence -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 mb-6 reveal">
              <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5 text-amber-400" />
              <span class="text-[12px] text-amber-400 font-medium">AI Intelligence</span>
            </div>
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              AI That<br>Knows<br>Your Agency
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Conversational AI and proactive analysis with visible CRM keyword search. Controlled semantic assistance is limited to approved agency-assistant contexts and is off by default.
            </p>

            <div class="flex flex-col gap-3">
              <div
                v-for="(step, i) in aiFeatures"
                :key="step.label"
                class="flex items-center gap-5 rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg px-6 py-5 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="step.bg">
                  <UIcon :name="step.icon" class="w-5 h-5" :class="step.color" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-medium text-white">{{ step.label }}</div>
                  <div class="text-[13px] text-white/50 leading-relaxed">{{ step.desc }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 6: Chat + Client Portal (Side by Side) -->
      <section class="py-24 relative">
        <div class="section-backdrop-center" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="grid md:grid-cols-2 gap-6">
            <!-- Chat -->
            <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-8 reveal">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 mb-6">
                <UIcon name="i-lucide-message-circle" class="w-3.5 h-3.5 text-violet-400" />
                <span class="text-[12px] text-violet-400 font-medium">Real-Time Chat</span>
              </div>
              <h3 class="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[1.1] mb-4 font-bold text-white tracking-[-0.02em] uppercase">
                Team<br>Comms
              </h3>
              <p class="text-[14px] text-white/60 leading-relaxed mb-6">
                Channels, DMs, threads, file sharing, emoji reactions, presence indicators, and Cmd+K switcher. Integrated with boards for seamless context.
              </p>
              <div class="flex flex-wrap gap-2">
                <span v-for="tag in chatTags" :key="tag" class="px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/15 text-[11px] text-violet-400 font-medium">
                  {{ tag }}
                </span>
              </div>
            </div>

            <!-- Client Portal -->
            <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-8 reveal reveal-d1">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 mb-6">
                <UIcon name="i-lucide-building-2" class="w-3.5 h-3.5 text-rose-400" />
                <span class="text-[12px] text-rose-400 font-medium">Client Portal</span>
              </div>
              <h3 class="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[1.1] mb-4 font-bold text-white tracking-[-0.02em] uppercase">
                Client<br>Access
              </h3>
              <p class="text-[14px] text-white/60 leading-relaxed mb-6">
                Permission-gated CRM, campaign insights, jobs, briefs, approvals, meetings, shared files, social reporting, and billing for every client.
              </p>
              <div class="flex flex-wrap gap-2">
                <span v-for="tag in portalTags" :key="tag" class="px-2.5 py-1 rounded-full bg-rose-500/10 border border-rose-500/15 text-[11px] text-rose-400 font-medium">
                  {{ tag }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 7: Banner Studio Showcase -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop-center" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="text-center mb-16">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 mb-6 reveal">
              <UIcon name="i-lucide-palette" class="w-3.5 h-3.5 text-rose-400" />
              <span class="text-[12px] text-rose-400 font-medium">Banner Studio</span>
            </div>
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-6 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Design.<br>Animate.<br>Publish.
            </h2>
            <p class="text-[clamp(1rem,1.5vw,1.2rem)] max-w-[580px] mx-auto text-white/60 font-light leading-relaxed reveal reveal-d1">
              A full HTML5 banner editor with GSAP animations, data feeds, DCO variants, Google Fonts, smart guides, video export, and one-click ad tag publishing.
            </p>
          </div>

          <!-- Banner studio feature grid -->
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              v-for="(item, i) in bannerFeatures"
              :key="item.title"
              class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal"
              :class="'reveal-d' + ((i % 4) + 1)"
            >
              <div class="w-10 h-10 rounded-xl flex items-center justify-center mb-4" :class="item.bg">
                <UIcon :name="item.icon" class="w-5 h-5" :class="item.color" />
              </div>
              <h4 class="text-[15px] font-medium text-white mb-1.5">{{ item.title }}</h4>
              <p class="text-[13px] text-white/45 leading-relaxed">{{ item.desc }}</p>
            </div>
          </div>

          <!-- Animated poster showcase (Swissted-style from Banner Studio) -->
          <div class="mt-14 grid md:grid-cols-3 gap-6 reveal reveal-d2">
            <div
              v-for="(poster, pi) in posters"
              :key="poster.word"
              :ref="el => setPosterRef(el as HTMLElement, pi)"
              class="poster-card relative rounded-2xl overflow-hidden cursor-pointer select-none group"
              :style="{ backgroundColor: poster.bg, aspectRatio: '3 / 4' }"
              @click="replayPoster(pi)"
            >
              <!-- Large letterforms -->
              <div class="absolute inset-0 flex items-end pointer-events-none">
                <div class="poster-letters relative w-full" :style="{ height: '70%' }">
                  <span
                    v-for="(letter, li) in poster.letters"
                    :key="li"
                    class="poster-letter absolute font-black leading-[0.85] select-none"
                    :style="{
                      fontSize: letter.size + 'px',
                      left: letter.x + '%',
                      top: letter.y + '%',
                      color: letter.color,
                    }"
                  >{{ letter.char }}</span>
                </div>
              </div>

              <!-- Text details — right-aligned -->
              <div class="absolute top-0 right-0 p-6 md:p-8 text-right z-10 pointer-events-none">
                <div class="poster-text-line text-[11px] md:text-[13px] font-semibold tracking-wide mb-6" :style="{ color: poster.textColor }">
                  {{ poster.line1 }}
                </div>
                <div class="poster-text-line text-[10px] md:text-[12px] font-medium mb-1" :style="{ color: poster.textColor }">
                  {{ poster.line2 }}
                </div>
                <div class="poster-text-line text-[10px] md:text-[12px] font-medium mb-6" :style="{ color: poster.textColor }">
                  {{ poster.line3 }}
                </div>
                <div class="poster-text-line text-[10px] md:text-[12px] font-medium" :style="{ color: poster.textColor }">
                  {{ poster.line4 }}
                </div>
              </div>

              <!-- Bottom detail text -->
              <div class="absolute bottom-0 right-0 p-6 md:p-8 text-right z-10 pointer-events-none">
                <div class="poster-text-line text-[9px] md:text-[11px] font-medium" :style="{ color: poster.textColor }">
                  {{ poster.bottom1 }}
                </div>
                <div class="poster-text-line text-[9px] md:text-[11px] font-medium" :style="{ color: poster.textColor }">
                  {{ poster.bottom2 }}
                </div>
              </div>

              <!-- Replay hint on hover -->
              <div class="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center opacity-0 group-hover:opacity-100 z-20 pointer-events-none">
                <div class="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                  <UIcon name="i-lucide-rotate-ccw" class="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 8: Agency pain points — cheeky -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop-center" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="text-center mb-16">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 bg-white/[0.04] mb-6 reveal">
              <span class="text-[12px] text-white/60 font-medium">Tough love</span>
            </div>
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-6 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Sound<br>Familiar?
            </h2>
          </div>

          <div class="grid md:grid-cols-2 gap-4 max-w-[1000px] mx-auto mb-16">
            <div
              v-for="(pain, i) in agencyPains"
              :key="pain.gripe"
              class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal"
              :class="'reveal-d' + ((i % 4) + 1)"
            >
              <div class="text-[15px] text-white/90 font-medium mb-2">{{ pain.gripe }}</div>
              <div class="text-[13px] text-white/40 leading-relaxed">{{ pain.fix }}</div>
            </div>
          </div>

          <div class="text-center reveal reveal-d2">
            <p class="text-[clamp(1.2rem,2vw,1.6rem)] text-white/70 font-light leading-relaxed max-w-[600px] mx-auto">
              You didn't start an agency to wrestle spreadsheets.<br>
              <span class="text-white font-medium">We built XeroFlow so you don't have to.</span>
            </p>
          </div>
        </div>
      </section>

      <!-- CTA — Interest / Offer Form -->
      <section class="py-24 md:py-32 relative">
        <div class="section-backdrop-center" />
        <div class="w-full max-w-[1100px] mx-auto px-[5%] relative">
          <div class="grid md:grid-cols-2 gap-10 md:gap-16 items-center">

            <!-- Left — copy -->
            <div class="reveal">
              <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 mb-6">
                <div class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span class="text-[12px] text-emerald-400 font-medium">Founding intake &middot; limited spots</span>
              </div>
              <h2 class="font-display text-[clamp(2.5rem,7vw,5rem)] leading-[1.05] mb-6 font-bold text-white tracking-[-0.02em] uppercase">
                Now<br>Onboarding.
              </h2>
              <p class="text-[clamp(1rem,1.5vw,1.2rem)] text-white/60 font-light leading-relaxed mb-8">
                We're onboarding a handful of agencies this quarter. If you're running 5+ people and drowning in tabs, we'd love to chat. No demos that could've been an email — just a straight conversation.
              </p>
              <div class="flex flex-col gap-3">
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span class="text-[14px] text-white/70">Full platform access — no feature gates</span>
                </div>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span class="text-[14px] text-white/70">White-glove onboarding &amp; data migration</span>
                </div>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span class="text-[14px] text-white/70">A written proposal — platform fee and scope, upfront</span>
                </div>
              </div>
            </div>

            <!-- Right — form -->
            <div class="rounded-2xl border border-white/[0.1] bg-white/[0.04] backdrop-blur-xl p-8 reveal reveal-d1">
              <h3 class="text-[20px] font-medium text-white mb-1">
                Request a walkthrough
              </h3>
              <p class="text-[13px] text-white/40 mb-6">
                A real person replies within one business day. No spam, pinky promise.
              </p>

              <form @submit.prevent="submitInterest" class="flex flex-col gap-4">
                <div>
                  <label class="block text-[12px] text-white/50 font-medium mb-1.5">Your name</label>
                  <input
                    v-model="interestForm.name"
                    type="text"
                    required
                    placeholder="Jane Smith"
                    class="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-[14px] placeholder-white/25 outline-none focus:border-white/25 transition-colors"
                  >
                </div>
                <div>
                  <label class="block text-[12px] text-white/50 font-medium mb-1.5">Work email</label>
                  <input
                    v-model="interestForm.email"
                    type="email"
                    required
                    placeholder="jane@agency.com"
                    class="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-[14px] placeholder-white/25 outline-none focus:border-white/25 transition-colors"
                  >
                </div>
                <div>
                  <label class="block text-[12px] text-white/50 font-medium mb-1.5">Agency name</label>
                  <input
                    v-model="interestForm.agency"
                    type="text"
                    required
                    placeholder="ACME Digital"
                    class="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-[14px] placeholder-white/25 outline-none focus:border-white/25 transition-colors"
                  >
                </div>
                <div>
                  <label class="block text-[12px] text-white/50 font-medium mb-1.5">Team size</label>
                  <select
                    v-model="interestForm.teamSize"
                    required
                    class="w-full px-4 py-3 rounded-xl bg-white/[0.06] border border-white/[0.1] text-white text-[14px] outline-none focus:border-white/25 transition-colors appearance-none cursor-pointer"
                  >
                    <option value="" disabled class="bg-[#1a1a1a]">Select team size</option>
                    <option value="2-5" class="bg-[#1a1a1a]">2–5 people</option>
                    <option value="6-15" class="bg-[#1a1a1a]">6–15 people</option>
                    <option value="16-50" class="bg-[#1a1a1a]">16–50 people</option>
                    <option value="50+" class="bg-[#1a1a1a]">50+ people</option>
                  </select>
                </div>

                <button
                  type="submit"
                  :disabled="interestSubmitting"
                  class="mt-2 w-full py-3.5 rounded-xl bg-white text-[#0a0a0a] text-[15px] font-semibold hover:bg-white/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {{ interestSubmitting ? 'Sending...' : interestSubmitted ? 'We\'ll be in touch!' : 'Request a walkthrough' }}
                </button>
                <p v-if="interestError" class="text-[13px] text-red-400 text-center">
                  Something went wrong — please try again, or use the <NuxtLink to="/contact" class="underline">contact page</NuxtLink>.
                </p>
              </form>

              <p class="text-[11px] text-white/25 mt-4 text-center">
                By submitting, you agree to hear from us. Unsubscribe anytime.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- Footer -->
      <MarketingFooter dark />
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'XeroFlow — The Agency Operating System',
  description: 'Work management, financials, real-time chat, AI insights, client portal, and banner studio — all in one platform built for modern agencies.',
  ogTitle: 'XeroFlow — The Agency Operating System',
  ogDescription: 'One platform for every agency operation. Boards, financials, chat, AI, client portal, and a full banner studio.',
})

useHead({
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Boldonse&display=swap' }
  ]
})

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

// ---- Interest form ----
const interestForm = reactive({
  name: '',
  email: '',
  agency: '',
  teamSize: '',
})
const interestSubmitting = ref(false)
const interestSubmitted = ref(false)
const interestError = ref(false)

async function submitInterest() {
  if (interestSubmitted.value) return
  interestSubmitting.value = true
  interestError.value = false
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        name: interestForm.name,
        email: interestForm.email,
        company: interestForm.agency || undefined,
        teamSize: interestForm.teamSize || undefined
      }
    })
    interestSubmitted.value = true
  } catch {
    interestError.value = true
  } finally {
    interestSubmitting.value = false
  }
}

let posterObserver: IntersectionObserver | null = null

// IntersectionObserver for scroll reveals + GSAP poster animations
onMounted(async () => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed')
          observer.unobserve(entry.target)
        }
      })
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  )

  document.querySelectorAll('.reveal').forEach((el) => observer.observe(el))

  // Load GSAP for poster animations
  const { default: gsap } = await import('gsap')
  gsapInstance = gsap

  await nextTick()
  posterObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const index = posterRefs.indexOf(entry.target as HTMLElement)
        if (index >= 0 && !posterTimelines[index]) {
          posterTimelines[index] = animatePoster(posterRefs[index], posters[index], gsap)
        }
        posterObserver?.unobserve(entry.target)
      }
    })
  }, { threshold: 0.3 })

  posterRefs.forEach((el) => {
    if (el) posterObserver!.observe(el)
  })
})

onUnmounted(() => {
  if (gsapInstance) {
    posterRefs.forEach((el) => { if (el) gsapInstance!.killTweensOf(el) })
  }
  posterObserver?.disconnect()
})

// ---- Platform features grid ----
const platformFeatures = [
  {
    title: 'Work Management',
    desc: 'Monday.com-style boards with 20+ column types, Kanban, timeline, calendar and gallery views, groups, and subtasks.',
    icon: 'i-lucide-kanban',
    bg: 'bg-blue-500/15',
    color: 'text-blue-400',
    tags: ['Boards', 'Views', 'Templates', 'Real-time']
  },
  {
    title: 'Financial Operations',
    desc: 'Xero integration for invoices, expenses and P&L. End-of-month automation, Meta & Google Ads spend tracking.',
    icon: 'i-lucide-calculator',
    bg: 'bg-emerald-500/15',
    color: 'text-emerald-400',
    tags: ['Xero', 'EOM Engine', 'Ad Spend', 'P&L']
  },
  {
    title: 'Real-Time Chat',
    desc: 'Channels, DMs, threads, file sharing, emoji reactions, presence, and keyboard shortcuts. Board-integrated.',
    icon: 'i-lucide-message-circle',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400',
    tags: ['Channels', 'Threads', 'Search', 'Presence']
  },
  {
    title: 'AI Assistant',
    desc: 'Conversational AI, anomaly detection, visible CRM keyword search, and controlled agency-assistant retrieval.',
    icon: 'i-lucide-sparkles',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400',
    tags: ['Chat', 'Anomaly Detection', 'Search', 'LoRA']
  },
  {
    title: 'Client Portal',
    desc: 'Client CRM, campaign insights, jobs, briefs, approvals, meetings, shared work, and billing in one permission-gated portal.',
    icon: 'i-lucide-building-2',
    bg: 'bg-rose-500/15',
    color: 'text-rose-400',
    tags: ['CRM', 'Campaigns', 'Jobs', 'Billing']
  },
  {
    title: 'Banner Studio',
    desc: 'Full HTML5 editor with GSAP animations, data feeds, DCO variants, video export, and ad tag publishing.',
    icon: 'i-lucide-palette',
    bg: 'bg-pink-500/15',
    color: 'text-pink-400',
    tags: ['Animation', 'Export', 'Fonts', 'Data Feeds']
  },
]

// ---- Work management features ----
const workFeatures = [
  { title: '5 Board Views', desc: 'Kanban, Table, Timeline, Calendar, and Gallery — all reading from the same data.', icon: 'i-lucide-layout-grid' },
  { title: '20+ Column Types', desc: 'Status, people, date, formula, files, rating, dropdown, tags, progress, and more.', icon: 'i-lucide-columns-3' },
  { title: 'Real-Time SSE Sync', desc: 'Every change syncs instantly via Server-Sent Events with WebSocket fallback.', icon: 'i-lucide-zap' },
  { title: 'Templates & Export', desc: 'Save board configurations as reusable templates. Export to CSV with one click.', icon: 'i-lucide-copy' },
]

// ---- Finance highlights ----
const financeHighlights = [
  'Invoice generation with Xero sync',
  'Meta & Google Ads spend tracking',
  'Campaign budget management with audit trails',
  'Cashflow forecasting and P&L dashboards',
  'End-of-month automation engine',
  'R2-backed export archives',
]

// ---- AI features ----
const aiFeatures = [
  {
    label: 'Conversational AI',
    desc: 'Chat with @entity mentions for tasks, clients, projects. Context-aware responses trained on your operations.',
    icon: 'i-lucide-message-square',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400'
  },
  {
    label: 'Anomaly Detection',
    desc: '8 proactive analyzers scan spend, deadlines, workload, and more — surfacing issues before they escalate.',
    icon: 'i-lucide-shield-alert',
    bg: 'bg-rose-500/15',
    color: 'text-rose-400'
  },
  {
    label: 'Controlled CRM Search',
    desc: 'Visible keyword ranking with off-by-default semantic assistance for approved agency-assistant contexts after confirmed indexing.',
    icon: 'i-lucide-search',
    bg: 'bg-blue-500/15',
    color: 'text-blue-400'
  },
  {
    label: 'Private AI Training',
    desc: 'LoRA fine-tuning, knowledge extraction, and edge inference — all trained exclusively on your data.',
    icon: 'i-lucide-brain',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
]

// ---- Chat & Portal tags ----
const chatTags = ['Channels', 'DMs', 'Threads', 'File Sharing', 'Reactions', 'Presence', 'Cmd+K', 'Read Receipts']
const portalTags = ['CRM', 'Leads', 'Campaigns', 'Jobs', 'Briefs', 'Approvals', 'Billing', 'Meetings', 'Social']

// ---- Banner studio features ----
const bannerFeatures = [
  { title: 'GSAP Animations', desc: 'Keyframe timeline, motion paths, entrance/exit presets, and easing control.', icon: 'i-lucide-play', bg: 'bg-rose-500/15', color: 'text-rose-400' },
  { title: 'Data Feeds & DCO', desc: 'CSV/JSON feeds with column bindings. Pre-generate per-row variants for dynamic creative.', icon: 'i-lucide-database', bg: 'bg-blue-500/15', color: 'text-blue-400' },
  { title: 'Font & Design Tools', desc: '120+ Google Fonts, custom font upload, smart guides, grid snap, and alignment tools.', icon: 'i-lucide-type', bg: 'bg-violet-500/15', color: 'text-violet-400' },
  { title: 'Export & Publish', desc: 'PNG, JPG, GIF, MP4 export. One-click ad tag generation (iframe, JS, AMPHTML).', icon: 'i-lucide-upload', bg: 'bg-emerald-500/15', color: 'text-emerald-400' },
  { title: 'Brand Kits', desc: 'Save colours, fonts, and logos as reusable brand kits. Apply with undo support.', icon: 'i-lucide-bookmark', bg: 'bg-amber-500/15', color: 'text-amber-400' },
  { title: 'Template Marketplace', desc: 'Save designs as templates. Browse by category, search, and reuse across projects.', icon: 'i-lucide-layout-template', bg: 'bg-pink-500/15', color: 'text-pink-400' },
  { title: 'AI Creative Assistant', desc: 'AI copy suggestions, URL-to-banner generation, auto-resize, and image suggestions.', icon: 'i-lucide-sparkles', bg: 'bg-amber-500/15', color: 'text-amber-400' },
  { title: 'Video Backgrounds', desc: 'Video layer support with GSAP proxy sync. File size meter for ad network compliance.', icon: 'i-lucide-video', bg: 'bg-indigo-500/15', color: 'text-indigo-400' },
]

// ---- Swissted-style animated posters ----
interface PosterLetter {
  char: string
  size: number
  x: number
  y: number
  color: string
  fromX?: number
  fromY?: number
}

interface PosterData {
  word: string
  bg: string
  textColor: string
  letters: PosterLetter[]
  line1: string
  line2: string
  line3: string
  line4: string
  bottom1: string
  bottom2: string
}

const posters: PosterData[] = [
  {
    word: 'BIG',
    bg: '#ef4444',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'B', size: 320, x: -8, y: 0, color: '#fecdd3', fromX: -600, fromY: 0 },
      { char: 'I', size: 280, x: 32, y: 12, color: '#18181b', fromX: 0, fromY: -600 },
      { char: 'G', size: 340, x: 48, y: -5, color: '#fecdd3', fromX: 600, fromY: 0 },
    ],
    line1: 'xeroflow studio presents\nthe big sale',
    line2: 'friday / march 15, 2026',
    line3: 'all categories 50% off',
    line4: 'at your favourite stores\nnationwide',
    bottom1: 'with brands you love',
    bottom2: 'nike, adidas & more / free shipping',
  },
  {
    word: 'NEW',
    bg: '#6366f1',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'N', size: 300, x: -5, y: 5, color: '#c7d2fe', fromX: 0, fromY: 600 },
      { char: 'E', size: 260, x: 30, y: 18, color: '#18181b', fromX: -600, fromY: 0 },
      { char: 'W', size: 340, x: 42, y: -8, color: '#c7d2fe', fromX: 600, fromY: 0 },
    ],
    line1: 'acme technologies presents\nthe new collection',
    line2: 'launching / april 1, 2026',
    line3: 'from 9:00 am AEST',
    line4: 'exclusive online\npre-order available',
    bottom1: 'limited first edition',
    bottom2: 'early access & special pricing',
  },
  {
    word: 'GO',
    bg: '#10b981',
    textColor: 'rgba(255,255,255,0.85)',
    letters: [
      { char: 'G', size: 380, x: -10, y: -5, color: '#a7f3d0', fromX: -600, fromY: 0 },
      { char: 'O', size: 360, x: 38, y: 0, color: '#18181b', fromX: 0, fromY: -600 },
    ],
    line1: 'greenleaf co. presents\ngo green campaign',
    line2: 'earth day / april 22, 2026',
    line3: 'join the movement',
    line4: 'sustainable living\nstarts here',
    bottom1: 'plant a tree with every order',
    bottom2: '100% carbon neutral / certified',
  },
]

const posterRefs: HTMLElement[] = []
let posterTimelines: any[] = []
let gsapInstance: typeof import('gsap').default | null = null

function setPosterRef(el: HTMLElement | null, index: number) {
  if (el) posterRefs[index] = el
}

function animatePoster(posterEl: HTMLElement, poster: PosterData, gsap: any) {
  const tl = gsap.timeline({
    defaults: { duration: 1.8, ease: 'power4.out' },
  })

  const letters = posterEl.querySelectorAll('.poster-letter')
  letters.forEach((el: Element, i: number) => {
    const letterData = poster.letters[i]
    if (!letterData) return
    gsap.set(el, {
      x: letterData.fromX || 0,
      y: letterData.fromY || 0,
      opacity: 0,
    })
    tl.to(el, {
      x: 0,
      y: 0,
      opacity: 1,
      duration: 2,
      ease: 'power4.out',
    }, i * 0.15)
  })

  const textLines = posterEl.querySelectorAll('.poster-text-line')
  textLines.forEach((el: Element) => {
    gsap.set(el, { opacity: 0, y: 20 })
  })
  tl.to(textLines, {
    opacity: 1,
    y: 0,
    stagger: 0.1,
    duration: 1,
    ease: 'power4.out',
  }, 0.6)

  return tl
}

function replayPoster(index: number) {
  if (!gsapInstance || !posterRefs[index]) return
  if (posterTimelines[index]) {
    posterTimelines[index].restart()
  }
}

// ---- Agency pain points ----
const agencyPains = [
  { gripe: '"Can you just check the spreadsheet?"', fix: 'Boards, timesheets, and financials — live, in one place. No spreadsheet required.' },
  { gripe: '"Which version of the banner is this?"', fix: 'Banner Studio with versioning, ad tags, and a shared gallery your whole team can see.' },
  { gripe: '"I\'ll Slack you the Dropbox link to the Google Sheet."', fix: 'Chat, files, tasks, and approvals in a single platform. One link. Done.' },
  { gripe: '"The client says they never got the invoice."', fix: 'Client portal with self-serve invoice access, approval workflows, and read receipts.' },
  { gripe: '"We need the EOM reports by Friday."', fix: 'One click. Ad spend, invoices, and P&L — pulled, reconciled, and ready to send.' },
  { gripe: '"Who\'s actually working on what right now?"', fix: 'Real-time presence, board views, and time tracking. No standup required.' },
  { gripe: '"Our media buyer left and took all the context."', fix: 'AI trained on your operations. Institutional knowledge that stays, even when people don\'t.' },
  { gripe: '"Can someone make this banner 14 more sizes?"', fix: 'Data feeds + DCO. Upload a CSV, get hundreds of variants. Go grab a coffee.' },
]
</script>

<style scoped>
.font-display {
  font-family: 'Boldonse', serif;
}

/* Hero entrance — CSS-only, plays on page load */
.hero-entrance {
  opacity: 0;
  transform: translateY(50px);
  animation: hero-in 1s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
.hero-delay-1 { animation-delay: 0.2s; }
.hero-delay-2 { animation-delay: 0.5s; }
.hero-delay-3 { animation-delay: 0.7s; }

@keyframes hero-in {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Scroll reveal */
.reveal {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.reveal.revealed {
  opacity: 1;
  transform: translateY(0);
}

.reveal-d1 { transition-delay: 0.1s; }
.reveal-d2 { transition-delay: 0.2s; }
.reveal-d3 { transition-delay: 0.3s; }
.reveal-d4 { transition-delay: 0.4s; }
.reveal-d5 { transition-delay: 0.5s; }
.reveal-d6 { transition-delay: 0.6s; }

/* Swissted-style poster cards */
.poster-card {
  transition: transform 0.3s ease;
}
.poster-card:hover {
  transform: scale(1.02);
}

.poster-letter {
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  line-height: 0.85;
  will-change: transform, opacity;
}

.poster-letters {
  overflow: hidden;
}

.poster-text-line {
  white-space: pre-line;
  will-change: transform, opacity;
}

/* Section backdrop variants for content readability */
.section-backdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 70% at 30% 50%, rgba(0, 0, 0, 0.7) 0%, transparent 70%);
  pointer-events: none;
}
.section-backdrop-right {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 70% at 70% 50%, rgba(0, 0, 0, 0.7) 0%, transparent 70%);
  pointer-events: none;
}
.section-backdrop-center {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 90% 80% at 50% 50%, rgba(0, 0, 0, 0.65) 0%, transparent 70%);
  pointer-events: none;
}
</style>
