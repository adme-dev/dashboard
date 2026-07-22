<template>
  <div class="min-h-screen bg-[#0a0a0a] overflow-x-hidden">
    <MarketingNav />

    <!-- Three.js Scene (fixed background) -->
    <VoiceAiScene />

    <!-- Scrollable content overlay -->
    <div class="voice-ai-content relative z-[2]">

      <!-- Section 1: Hero -->
      <section class="voice-ai-section min-h-screen w-full flex items-center relative pt-[52px]">
        <div class="w-full max-w-[1600px] mx-auto px-[5%]">
          <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] backdrop-blur-lg mb-8 hero-entrance hero-delay-1">
            <span class="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
            <span class="text-[13px] text-white/60 font-medium tracking-wide uppercase">Voice-Powered AI</span>
          </div>
          <h1 class="font-display text-[clamp(4rem,12vw,10rem)] leading-[1.05] mb-8 font-bold text-white tracking-[-0.02em] uppercase hero-entrance hero-delay-1">
            Just<br>Speak
          </h1>
          <p class="text-[clamp(1.1rem,2vw,1.5rem)] max-w-[600px] mb-10 text-white/80 font-light leading-relaxed hero-entrance hero-delay-2">
            Talk to your AI assistant like a colleague. Ask questions, get answers, hear responses &mdash; all by voice. No typing required.
          </p>
          <div class="flex items-center gap-4 hero-entrance hero-delay-3">
            <NuxtLink
              to="/auth/login"
              class="inline-flex items-center gap-3 px-8 py-4 bg-white text-[#0a0a0a] text-lg font-medium rounded-full hover:bg-white/90 transition-colors"
            >
              Try Voice AI
              <UIcon name="i-lucide-arrow-right" class="w-5 h-5" />
            </NuxtLink>
            <div class="flex items-center gap-2 text-white/40 text-sm">
              <UIcon name="i-lucide-mic" class="w-4 h-4" />
              <span>Works in any browser</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 2: How It Works -->
      <section class="voice-ai-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Speak.<br>Hear.<br>Done.
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              A natural conversation loop. Your voice is transcribed instantly, processed by your trained AI, and spoken back to you &mdash; all in under two seconds.
            </p>

            <!-- Pipeline flow -->
            <div class="flex flex-col gap-3">
              <div
                v-for="(step, i) in pipelineSteps"
                :key="step.label"
                class="flex items-center gap-5 rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg px-6 py-5 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" :class="step.bg">
                  <UIcon :name="step.icon" class="w-6 h-6" :class="step.color" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-medium text-white">{{ step.label }}</div>
                  <div class="text-[13px] text-white/50 leading-relaxed">{{ step.desc }}</div>
                </div>
                <div class="text-[11px] font-mono text-white/15 flex-shrink-0 hidden sm:block">{{ String(i + 1).padStart(2, '0') }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 3: Intelligent Listening -->
      <section class="voice-ai-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Intelligent<br>Listening
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Not just transcription &mdash; understanding. Live volume feedback, automatic silence detection, and noise suppression make voice input effortless, even in busy offices.
            </p>

            <!-- Feature cards -->
            <div class="grid sm:grid-cols-3 gap-4">
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal reveal-d2">
                <div class="w-10 h-10 rounded-xl bg-indigo-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-audio-waveform" class="w-5 h-5 text-indigo-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Live Waveform</div>
                <div class="text-[13px] text-white/50 leading-relaxed">Real-time volume visualisation confirms your mic is working and picking up clearly.</div>
              </div>
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal reveal-d3">
                <div class="w-10 h-10 rounded-xl bg-cyan-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-mic-off" class="w-5 h-5 text-cyan-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Silence Detection</div>
                <div class="text-[13px] text-white/50 leading-relaxed">Stops listening automatically when you finish speaking. No need to press a button.</div>
              </div>
              <div class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal reveal-d4">
                <div class="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center mb-4">
                  <UIcon name="i-lucide-shield-check" class="w-5 h-5 text-violet-400" />
                </div>
                <div class="text-[15px] font-medium text-white mb-1">Noise Suppression</div>
                <div class="text-[13px] text-white/50 leading-relaxed">Echo cancellation and noise reduction built into the browser — clean input every time.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 4: Edge-Powered Speed -->
      <section class="voice-ai-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Edge-<br>Powered<br>Speed
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Speech-to-text and text-to-speech run on Cloudflare's global edge network. Your voice never leaves the wire, and responses arrive in milliseconds.
            </p>

            <!-- Stats grid -->
            <div class="grid sm:grid-cols-2 gap-4">
              <div
                v-for="(stat, i) in edgeStats"
                :key="stat.label"
                class="rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg p-6 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="flex items-center gap-3 mb-3">
                  <div class="w-8 h-8 rounded-lg flex items-center justify-center" :class="stat.bg">
                    <UIcon :name="stat.icon" class="w-4 h-4" :class="stat.color" />
                  </div>
                  <div class="text-[15px] font-medium text-white">{{ stat.label }}</div>
                </div>
                <div class="text-[28px] font-bold text-white mb-1 tracking-tight">{{ stat.value }}</div>
                <div class="text-[13px] text-white/50 leading-relaxed">{{ stat.desc }}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Section 5: Text + Voice = One Conversation -->
      <section class="voice-ai-section min-h-screen w-full flex items-center relative">
        <div class="section-backdrop" />
        <div class="w-full max-w-[1600px] mx-auto px-[5%] relative">
          <div class="max-w-[800px]">
            <h2 class="font-display text-[clamp(3rem,10vw,8rem)] leading-[1.1] mb-8 font-bold text-white tracking-[-0.02em] uppercase reveal">
              Voice &<br>Text,<br>Together
            </h2>
            <p class="text-[clamp(1rem,1.8vw,1.35rem)] max-w-[560px] mb-12 text-white/80 font-light leading-relaxed reveal reveal-d1">
              Switch between typing and speaking mid-conversation. Voice messages are transcribed and saved as text, so your full history stays searchable and readable.
            </p>

            <div class="flex flex-col gap-3">
              <div
                v-for="(feature, i) in unifiedFeatures"
                :key="feature.label"
                class="flex items-center gap-5 rounded-2xl border border-white/[0.08] bg-black/50 backdrop-blur-lg px-6 py-5 reveal"
                :class="'reveal-d' + (i + 2)"
              >
                <div class="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" :class="feature.bg">
                  <UIcon :name="feature.icon" class="w-5 h-5" :class="feature.color" />
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-[15px] font-medium text-white">{{ feature.label }}</div>
                  <div class="text-[13px] text-white/50 leading-relaxed">{{ feature.desc }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- CTA Section -->
      <section class="min-h-[60vh] w-full flex items-center justify-center relative">
        <div class="section-backdrop" />
        <div class="text-center px-6 reveal relative">
          <div class="w-14 h-14 bg-indigo-500/15 rounded-2xl flex items-center justify-center mx-auto mb-8">
            <UIcon name="i-lucide-mic" class="w-7 h-7 text-indigo-400" />
          </div>
          <h2 class="text-[clamp(28px,5vw,56px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-4">
            Your AI speaks<br class="hidden sm:block">your language
          </h2>
          <p class="text-white/50 text-lg max-w-[480px] mx-auto mb-10 leading-relaxed">
            Stop typing, start talking. XeroFlow Voice AI turns every conversation into a natural dialogue.
          </p>
          <NuxtLink
            to="/contact"
            class="inline-flex items-center gap-2.5 px-8 py-4 bg-white text-[#0a0a0a] text-[17px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Get Started
          </NuxtLink>
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
  title: 'Voice AI — XeroFlow',
  description: 'Talk to your AI assistant by voice. Speech-to-text transcription and text-to-speech responses powered by Cloudflare Workers AI, running at the edge.',
  ogTitle: 'Voice AI — XeroFlow',
  ogDescription: 'Talk to your AI assistant by voice. Instant transcription, spoken responses, edge-powered speed.',
})

useHead({
  link: [
    { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Boldonse&display=swap' }
  ]
})

// IntersectionObserver for scroll reveals
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
    label: 'Click the Mic',
    desc: 'One tap to start recording. The waveform visualiser shows your voice in real time.',
    icon: 'i-lucide-mic',
    bg: 'bg-indigo-500/15',
    color: 'text-indigo-400'
  },
  {
    label: 'Speech-to-Text',
    desc: 'Your audio is transcribed instantly by Deepgram on Cloudflare\'s edge — sub-second latency.',
    icon: 'i-lucide-file-text',
    bg: 'bg-cyan-500/15',
    color: 'text-cyan-400'
  },
  {
    label: 'AI Processing',
    desc: 'The transcript flows through your trained AI — context retrieval, intent classification, response generation.',
    icon: 'i-lucide-brain',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
  {
    label: 'Spoken Response',
    desc: 'The AI\'s answer is converted to natural speech and played back to you. Text is shown simultaneously.',
    icon: 'i-lucide-volume-2',
    bg: 'bg-emerald-500/15',
    color: 'text-emerald-400'
  },
]

const edgeStats = [
  {
    label: 'Transcription',
    value: '<1s',
    desc: 'Speech-to-text runs at the edge, returning your transcript before you finish thinking about it.',
    icon: 'i-lucide-zap',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400'
  },
  {
    label: 'Full Round-Trip',
    value: '~2s',
    desc: 'From the moment you stop speaking to hearing the AI\'s voice — the complete pipeline in under two seconds.',
    icon: 'i-lucide-timer',
    bg: 'bg-cyan-500/15',
    color: 'text-cyan-400'
  },
  {
    label: 'Privacy',
    value: '100%',
    desc: 'Audio is processed ephemerally. Nothing is stored — only the text transcript lives in your conversation.',
    icon: 'i-lucide-lock',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
  {
    label: 'Setup Required',
    value: 'Zero',
    desc: 'No extensions, no downloads. Uses your browser\'s native microphone API. Works on desktop and mobile.',
    icon: 'i-lucide-check-circle',
    bg: 'bg-emerald-500/15',
    color: 'text-emerald-400'
  },
]

const unifiedFeatures = [
  {
    label: 'Seamless Switching',
    desc: 'Type one message, speak the next. Both appear in the same conversation thread with full context.',
    icon: 'i-lucide-arrow-left-right',
    bg: 'bg-indigo-500/15',
    color: 'text-indigo-400'
  },
  {
    label: 'Searchable Transcripts',
    desc: 'Every voice message is saved as text. Search, pin, and reference voice conversations just like typed ones.',
    icon: 'i-lucide-search',
    bg: 'bg-cyan-500/15',
    color: 'text-cyan-400'
  },
  {
    label: 'Audio Playback Control',
    desc: 'Stop playback any time with one click. The text is always there if you prefer to read.',
    icon: 'i-lucide-volume-x',
    bg: 'bg-violet-500/15',
    color: 'text-violet-400'
  },
  {
    label: 'Context-Aware Responses',
    desc: 'Voice questions use the same AI context — @mentions, knowledge base, rate cards, spend data — as typed ones.',
    icon: 'i-lucide-sparkles',
    bg: 'bg-amber-500/15',
    color: 'text-amber-400'
  },
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

/* Semi-transparent dark gradient behind each section's content for readability */
.section-backdrop {
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 80% 70% at 30% 50%, rgba(0, 0, 0, 0.7) 0%, transparent 70%);
  pointer-events: none;
}
</style>
