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
          <h1 class="font-display text-[clamp(4rem,12vw,10rem)] leading-[1.05] mb-8 font-bold text-white tracking-[-0.02em] uppercase hero-entrance hero-delay-1">
            Your AI,<br>Trained<br>On You
          </h1>
          <p class="text-[clamp(1.1rem,2vw,1.5rem)] max-w-[600px] mb-10 text-white/70 font-light leading-relaxed hero-entrance hero-delay-2">
            XeroFlow's intelligence learns from your agency's unique patterns — your workflows, your clients, your language. Never from anyone else's. Your personal IP stays personal.
          </p>
          <div class="hero-entrance hero-delay-3">
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#0a0a0a] text-lg font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Get Started
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5" />
            </NuxtLink>
          </div>
        </div>
      </section>

      <!-- Section 2: Your IP Stays Yours -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="w-full max-w-[1600px] mx-auto px-[5%]">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Your IP<br>Stays Yours
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/70 font-light leading-relaxed reveal reveal-d1">
              Every piece of training data lives within your instance. No cross-pollination between accounts, no shared models, no data leaving your boundaries. Your competitive intelligence remains exactly that — yours.
            </p>

            <!-- Privacy cards -->
            <div class="grid sm:grid-cols-3 gap-4">
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 reveal reveal-d2">
                <div class="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-blue-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Isolated Models</div>
                <div class="text-[13px] text-white/40 leading-relaxed">Your AI model is trained exclusively on your data. Zero bleed between tenants.</div>
              </div>
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 reveal reveal-d3">
                <div class="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-lock" class="w-5 h-5 text-violet-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Edge Processing</div>
                <div class="text-[13px] text-white/40 leading-relaxed">Inference runs on Cloudflare's edge network. Data never leaves the wire.</div>
              </div>
              <div class="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 reveal reveal-d4">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-eye-off" class="w-5 h-5 text-emerald-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Auto-Anonymisation</div>
                <div class="text-[13px] text-white/40 leading-relaxed">PII is stripped from training data before it ever touches the model.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Learns While You Work -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="w-full max-w-[1600px] mx-auto px-[5%]">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Learns<br>While You<br>Work
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/70 font-light leading-relaxed reveal reveal-d1">
              Every chat, every decision, every workflow pattern makes your AI smarter. Knowledge extraction, intent classification, and semantic search — all trained on your real operations, continuously.
            </p>

            <!-- Pipeline steps -->
            <div class="flex flex-col gap-3">
              <div
                v-for="(step, i) in pipelineSteps"
                :key="step.label"
                class="flex items-center gap-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm px-6 py-5 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="step.bg">
                  <UIcon :name="step.icon" class="w-5 h-5" :class="step.color" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-medium text-white">{{ step.label }}</div>
                  <div class="text-[13px] text-white/40 leading-relaxed">{{ step.desc }}</div>
                </div>
                <div class="text-[11px] font-mono text-white/20 flex-shrink-0 hidden sm:block">{{ String(i + 1).padStart(2, '0') }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: Full Control -->
      <section class="ai-training-section min-h-screen w-full flex items-center relative">
        <div class="w-full max-w-[1600px] mx-auto px-[5%]">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Full<br>Control
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/70 font-light leading-relaxed reveal reveal-d1">
              Review what the AI knows, approve training data, manage adapters, and export everything. You decide what your AI learns — and when it forgets.
            </p>

            <!-- Control features grid -->
            <div class="grid sm:grid-cols-2 gap-4">
              <div
                v-for="(feature, i) in controlFeatures"
                :key="feature.label"
                class="rounded-2xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-sm p-6 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="feature.bg">
                    <UIcon :name="feature.icon" class="w-4 h-4" :class="feature.color" />
                  </div>
                  <div class="text-[15px] font-medium text-white">{{ feature.label }}</div>
                </div>
                <div class="text-[13px] text-white/40 leading-relaxed">{{ feature.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="min-h-[60vh] w-full flex items-center justify-center relative">
        <div class="text-center px-6 reveal">
          <div class="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mx-auto mb-8">
            <span class="text-white text-sm font-semibold tracking-tight">XF</span>
          </div>
          <h2 class="text-[clamp(28px,5vw,56px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Intelligence that's<br class="hidden sm:block">uniquely yours
          </h2>
          <p class="text-white/50 text-lg max-w-[480px] mx-auto mb-10 leading-relaxed">
            Start training your AI on day one. The more you use XeroFlow, the smarter it gets — for you alone.
          </p>
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-8 py-4 bg-white text-[#0a0a0a] text-[17px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
        </div>
      </section>

      <!-- Footer -->
      <footer class="pt-20 pb-10">
        <div class="max-w-[1200px] mx-auto px-6">
          <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
            <div>
              <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-white tracking-[-0.02em]">
                Experience XeroFlow
              </h3>
            </div>
            <div class="flex gap-20 md:gap-28">
              <div class="flex flex-col gap-3.5 text-[15px]">
                <NuxtLink to="/auth/login" class="text-white/50 hover:text-white transition-colors">Sign In</NuxtLink>
                <NuxtLink to="/portal/login" class="text-white/50 hover:text-white transition-colors">Client Portal</NuxtLink>
                <a href="/#features" class="text-white/50 hover:text-white transition-colors">Features</a>
              </div>
              <div class="flex flex-col gap-3.5 text-[15px]">
                <NuxtLink to="/privacy" class="text-white/50 hover:text-white transition-colors">Privacy</NuxtLink>
                <NuxtLink to="/terms" class="text-white/50 hover:text-white transition-colors">Terms</NuxtLink>
                <NuxtLink to="/support" class="text-white/50 hover:text-white transition-colors">Support</NuxtLink>
              </div>
            </div>
          </div>

          <div class="overflow-hidden mb-10">
            <div class="text-[clamp(80px,18vw,220px)] font-[450] text-white leading-[0.9] tracking-[-0.04em] select-none">
              XeroFlow
            </div>
          </div>

          <div class="pt-6 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-2.5">
              <div class="w-5 h-5 bg-white rounded flex items-center justify-center">
                <span class="text-[#0a0a0a] text-[8px] font-semibold">XF</span>
              </div>
              <span class="text-[13px] text-white/60">ADME Digital</span>
            </div>
            <div class="flex items-center gap-6 text-[13px] text-white/40">
              <NuxtLink to="/about" class="hover:text-white transition-colors">About</NuxtLink>
              <NuxtLink to="/privacy" class="hover:text-white transition-colors">Privacy</NuxtLink>
              <NuxtLink to="/terms" class="hover:text-white transition-colors">Terms</NuxtLink>
              <span>&copy; {{ new Date().getFullYear() }}</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'AI Training — XeroFlow',
  description: 'Your agency AI, trained on your data. XeroFlow learns from your unique workflows, clients, and operations — while keeping your IP completely private.',
  ogTitle: 'AI Training — XeroFlow',
  ogDescription: 'Your agency AI, trained on your data. Private, continuous, and entirely under your control.',
})

useHead({
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Boldonse&display=swap' }
  ]
})

// IntersectionObserver for scroll reveals (robust, no GSAP dependency)
onMounted(() => {
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
})

const pipelineSteps = [
  {
    label: 'Knowledge Extraction',
    desc: 'Conversations, decisions, and workflows are distilled into structured knowledge entries.',
    icon: 'i-lucide-brain',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400'
  },
  {
    label: 'Intent Classification',
    desc: 'The AI learns how your team asks questions — financial queries, process lookups, client searches.',
    icon: 'i-lucide-sparkles',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
  {
    label: 'Semantic Indexing',
    desc: 'Every entity — tasks, briefs, clients, spend data — is embedded into a vector index for instant retrieval.',
    icon: 'i-lucide-search',
    bg: 'bg-blue-500/15',
    color: 'text-blue-400'
  },
  {
    label: 'Adapter Fine-Tuning',
    desc: 'Lightweight LoRA adapters are trained on your patterns and deployed at the edge for fast inference.',
    icon: 'i-lucide-cpu',
    bg: 'bg-emerald-500/15',
    color: 'text-emerald-400'
  },
  {
    label: 'Continuous Feedback',
    desc: 'Every thumbs up, correction, and override feeds back into the training loop to improve accuracy.',
    icon: 'i-lucide-refresh-cw',
    bg: 'bg-rose-500/15',
    color: 'text-rose-400'
  }
]

const controlFeatures = [
  {
    label: 'Knowledge Manager',
    desc: 'Browse, edit, and approve every knowledge entry before it trains the model. Bulk upload via CSV or JSONL.',
    icon: 'i-lucide-database',
    bg: 'bg-blue-500/15',
    color: 'text-blue-400'
  },
  {
    label: 'Dataset Inspector',
    desc: 'View extracted training datasets — Q&A pairs, intents, RAG entries — with full provenance tracking.',
    icon: 'i-lucide-file-search',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
  {
    label: 'Adapter Lifecycle',
    desc: 'Deploy, monitor, A/B test, and retire LoRA adapters. Weighted traffic routing for safe rollouts.',
    icon: 'i-lucide-git-branch',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400'
  },
  {
    label: 'Export & Delete',
    desc: 'Full data export in standard formats. Delete any training data, any time. Your data, your rules.',
    icon: 'i-lucide-download',
    bg: 'bg-emerald-500/15',
    color: 'text-emerald-400'
  }
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

/* Scroll reveal — starts hidden, .revealed class added by IntersectionObserver */
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

/* Staggered delays for reveal children */
.reveal-d1 { transition-delay: 0.1s; }
.reveal-d2 { transition-delay: 0.2s; }
.reveal-d3 { transition-delay: 0.3s; }
.reveal-d4 { transition-delay: 0.4s; }
.reveal-d5 { transition-delay: 0.5s; }
.reveal-d6 { transition-delay: 0.6s; }
</style>
