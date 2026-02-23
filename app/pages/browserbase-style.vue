<template>
  <div class="min-h-screen" style="background: #000000;">
    <!-- Navigation -->
    <nav class="fixed top-0 left-0 right-0 z-50 nb-nav">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <BrandCube color="red" :size="28" :rotation="-10" :animated="false" />
          <span class="font-semibold text-white">Browserbase</span>
        </div>
        <div class="hidden md:flex items-center gap-8 text-sm text-white/60">
          <a href="#features" class="hover:text-white transition-colors">Features</a>
          <a href="#pricing" class="hover:text-white transition-colors">Pricing</a>
          <a href="#docs" class="hover:text-white transition-colors">Docs</a>
        </div>
        <NbButton variant="primary" size="sm">Get Started</NbButton>
      </div>
    </nav>

    <!-- Hero Section -->
    <section class="min-h-screen flex items-center justify-center pt-16 px-6" style="background: #000000;">
      <div class="max-w-4xl mx-auto text-center">
        <NbScrollReveal direction="up" :distance="40">
          <h1 class="text-5xl md:text-7xl font-bold tracking-tight leading-[1.05] mb-6">
            <span class="text-white">We help AI</span>
            <br />
            <span style="color: #FF6B6B;">use the web.</span>
          </h1>
        </NbScrollReveal>
        
        <NbScrollReveal direction="up" :distance="30" :delay="150">
          <p class="text-lg md:text-xl text-white/60 max-w-xl mx-auto mb-10 leading-relaxed">
            Autonomously read, write, and perform tasks on the web with a serverless browser.
          </p>
        </NbScrollReveal>
        
        <NbScrollReveal direction="up" :distance="20" :delay="300">
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
            <NbButton variant="primary" size="lg">Get Started Free</NbButton>
            <NbButton variant="ghost" size="lg" trailing-icon="i-lucide-arrow-right">View Docs</NbButton>
          </div>
        </NbScrollReveal>

        <!-- Trust badges -->
        <NbScrollReveal direction="up" :distance="15" :delay="450">
          <div class="mt-20 pt-10 border-t border-white/10">
            <p class="text-xs font-mono uppercase tracking-widest text-white/40 mb-6">Trusted by AI-first companies worldwide</p>
            <div class="flex flex-wrap items-center justify-center gap-10 opacity-40">
              <div v-for="i in 5" :key="i" class="h-6 w-20 bg-white/20 rounded" />
            </div>
          </div>
        </NbScrollReveal>
      </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-32 px-6 nb-grid-dots" style="background: #000000;">
      <div class="max-w-6xl mx-auto">
        <NbScrollReveal direction="up">
          <div class="text-center mb-16">
            <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Features</h2>
            <p class="text-white/50 max-w-xl mx-auto text-lg">
              Everything you need to build powerful browser automations at scale.
            </p>
          </div>
        </NbScrollReveal>

        <NbFeatureGrid :features="features" />
      </div>
    </section>

    <!-- Quote Section -->
    <section class="py-24 px-6" style="background: #000000;">
      <div class="max-w-3xl mx-auto">
        <NbScrollReveal direction="up" :distance="30">
          <div class="relative border border-white/10 rounded-2xl p-8 md:p-12 text-center" style="background: rgba(255,255,255,0.02);">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2">
              <div class="bg-[#FF6B6B] text-black px-3 py-1 rounded text-xs font-bold">
                <UIcon name="i-lucide-quote" class="w-4 h-4" />
              </div>
            </div>
            
            <blockquote class="text-lg md:text-xl font-medium text-white/90 mb-8 leading-relaxed">
              "Getting browsers sorted for our web agents could've been a never-ending battle, but the BB team has become like our in-house browser team."
            </blockquote>
            
            <div class="flex items-center justify-center gap-3">
              <div class="w-10 h-10 rounded-full bg-[#4ECDC4]" />
              <div class="text-left">
                <div class="font-medium text-white text-sm">Sarah Chen</div>
                <div class="text-xs text-white/40">CTO at AgentFlow</div>
              </div>
            </div>
          </div>
        </NbScrollReveal>
      </div>
    </section>

    <!-- Stats Section -->
    <section class="py-20 px-6 border-y border-white/10" style="background: #000000;">
      <div class="max-w-5xl mx-auto">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-8">
          <NbScrollReveal 
            v-for="(stat, index) in stats" 
            :key="stat.label"
            :delay="index * 100"
            direction="up"
          >
            <div class="text-center">
              <div class="text-4xl md:text-5xl font-bold text-white mb-1">
                {{ stat.value }}
              </div>
              <div class="text-xs font-mono uppercase tracking-wider text-white/40">{{ stat.label }}</div>
            </div>
          </NbScrollReveal>
        </div>
      </div>
    </section>

    <!-- Pricing Section -->
    <section id="pricing" class="py-32 px-6" style="background: #000000;">
      <div class="max-w-6xl mx-auto">
        <NbScrollReveal direction="up">
          <div class="text-center mb-16">
            <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">
              Power your automations with flexible,<br />usage-based pricing.
            </h2>
            <p class="text-white/50 max-w-lg mx-auto">
              Start free, scale as you grow. No hidden fees.
            </p>
          </div>
        </NbScrollReveal>

        <!-- Pricing Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-20">
          <NbPricingCard
            v-for="(plan, index) in pricingPlans"
            :key="plan.name"
            v-bind="plan"
            :delay="index * 100"
          />
        </div>

        <!-- Pricing Table -->
        <NbScrollReveal direction="up" :delay="400">
          <h3 class="text-xl font-semibold text-white mb-6">Pricing plans</h3>
          <div class="border border-white/10 rounded-xl overflow-hidden" style="background: rgba(255,255,255,0.02);">
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead>
                  <tr class="border-b border-white/10" style="background: rgba(255,255,255,0.03);">
                    <th class="text-left p-4 text-xs font-mono uppercase tracking-wider text-white/40">Plan Details</th>
                    <th class="text-center p-4 text-xs font-mono uppercase tracking-wider text-white/40">Free</th>
                    <th class="text-center p-4 text-xs font-mono uppercase tracking-wider text-white/40">Developer</th>
                    <th class="text-center p-4 text-xs font-mono uppercase tracking-wider" style="color: #FF6B6B;">Startup</th>
                    <th class="text-center p-4 text-xs font-mono uppercase tracking-wider text-white/40">Scale</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in pricingTable" :key="row.feature" class="border-b border-white/5">
                    <td class="p-4 text-sm text-white/60">{{ row.feature }}</td>
                    <td class="p-4 text-center font-mono text-sm text-white/80">{{ row.free }}</td>
                    <td class="p-4 text-center font-mono text-sm text-white/80">{{ row.dev }}</td>
                    <td class="p-4 text-center font-mono text-sm font-medium" style="color: #FF6B6B;">{{ row.startup }}</td>
                    <td class="p-4 text-center font-mono text-sm text-white/80">{{ row.scale }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </NbScrollReveal>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-32 px-6 nb-grid" style="background: #000000;">
      <div class="max-w-2xl mx-auto text-center">
        <NbScrollReveal direction="up">
          <BrandCube color="yellow" :size="72" class="mx-auto mb-10" />
          <h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Ready to get started?</h2>
          <p class="text-white/50 mb-10 max-w-md mx-auto">
            Join thousands of developers building the future of web automation.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
            <NbButton variant="primary" size="lg">Start Free Trial</NbButton>
            <NbButton variant="secondary" size="lg" trailing-icon="i-lucide-calendar">
              Book a Demo
            </NbButton>
          </div>
        </NbScrollReveal>
      </div>
    </section>

    <!-- FAQ Section -->
    <section class="py-24 px-6" style="background: #000000;">
      <div class="max-w-2xl mx-auto">
        <NbScrollReveal direction="up">
          <h2 class="text-2xl font-bold text-white mb-10 text-center">FAQs</h2>
        </NbScrollReveal>

        <div class="space-y-3">
          <NbScrollReveal
            v-for="(faq, index) in faqs"
            :key="faq.question"
            :delay="index * 80"
            direction="up"
          >
            <details class="group border border-white/10 rounded-xl overflow-hidden" style="background: rgba(255,255,255,0.02);">
              <summary class="flex items-center justify-between p-4 cursor-pointer list-none hover:bg-white/[0.02] transition-colors">
                <span class="font-medium text-white/90 text-sm">{{ faq.question }}</span>
                <UIcon 
                  name="i-lucide-chevron-down" 
                  class="w-4 h-4 text-white/40 transition-transform group-open:rotate-180"
                />
              </summary>
              <div class="px-4 pb-4 text-sm text-white/50 leading-relaxed">
                {{ faq.answer }}
              </div>
            </details>
          </NbScrollReveal>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="py-10 px-6 border-t border-white/10" style="background: #000000;">
      <div class="max-w-6xl mx-auto">
        <div class="flex flex-col md:flex-row items-center justify-between gap-6">
          <div class="flex items-center gap-2">
            <BrandCube color="red" :size="20" :animated="false" />
            <span class="font-semibold text-white">Browserbase</span>
          </div>
          <div class="flex items-center gap-8 text-sm text-white/40">
            <a href="#" class="hover:text-white transition-colors">Privacy</a>
            <a href="#" class="hover:text-white transition-colors">Terms</a>
            <a href="#" class="hover:text-white transition-colors">Twitter</a>
            <a href="#" class="hover:text-white transition-colors">GitHub</a>
          </div>
          <p class="text-xs text-white/30">
            © 2024 Browserbase
          </p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

const features = [
  {
    icon: 'i-lucide-plug',
    title: 'Seamless integration',
    color: 'teal' as const,
    items: [
      'Compatible with Playwright, Puppeteer, Selenium',
      'Integrate without changing existing code',
      'Chrome DevTools Protocol support'
    ]
  },
  {
    icon: 'i-lucide-zap',
    title: 'Scalable',
    color: 'yellow' as const,
    items: [
      'Spin up 1000s of browsers in milliseconds',
      'Serverless infrastructure',
      'Run your code anywhere'
    ]
  },
  {
    icon: 'i-lucide-gauge',
    title: 'Fast',
    color: 'red' as const,
    items: [
      'Globally located browsers',
      '4 vCPUs per browser',
      'Optimized for AI agents'
    ]
  },
  {
    icon: 'i-lucide-shield',
    title: 'Secure',
    color: 'purple' as const,
    items: [
      'Isolated browser instances',
      'SOC-2 Type 1 and HIPAA',
      'Self-hosted available'
    ]
  },
  {
    icon: 'i-lucide-eye',
    title: 'Observable',
    color: 'teal' as const,
    items: [
      'Live View iFrame embedding',
      'Session recording',
      'Command logging'
    ]
  },
  {
    icon: 'i-lucide-fingerprint',
    title: 'Stealth',
    color: 'yellow' as const,
    items: [
      'Managed captcha solving',
      'Intelligent proxy selection',
      'Configurable fingerprinting'
    ]
  },
  {
    icon: 'i-lucide-blocks',
    title: 'Extensible',
    color: 'red' as const,
    items: [
      'File uploads and downloads',
      'Contexts API for state',
      'Node.js and Python SDKs'
    ]
  },
  {
    icon: 'i-lucide-code-2',
    title: 'Developer First',
    color: 'purple' as const,
    items: [
      'Browser Playground',
      'AI Codegen feature',
      'Comprehensive docs'
    ]
  }
]

const stats = [
  { value: '95%', label: 'Faster' },
  { value: '10M+', label: 'Browsers' },
  { value: '99.9%', label: 'Uptime' },
  { value: '50ms', label: 'Latency' }
]

const pricingPlans = [
  {
    name: 'Free Plan',
    price: '$0',
    period: '/month',
    features: [
      { text: '1 concurrent browser' },
      { text: '1 browser hour included' },
      { text: '7 day data retention' },
      { text: 'Up to 15 min per session' }
    ],
    ctaText: 'Sign Up',
    popular: false
  },
  {
    name: 'Developer',
    price: '$20',
    period: '/month',
    features: [
      { text: '25 concurrent browsers' },
      { text: '100 browser hours', highlight: 'then $0.12/hr' },
      { text: '1GB proxies', highlight: 'then $12/GB' },
      { text: 'Auto captcha solving' }
    ],
    ctaText: 'Sign Up',
    popular: false
  },
  {
    name: 'Startup',
    price: '$99',
    period: '/month',
    features: [
      { text: '100 concurrent browsers' },
      { text: '500 browser hours', highlight: 'then $0.10/hr' },
      { text: '5GB proxies', highlight: 'then $10/GB' },
      { text: 'Priority support' }
    ],
    ctaText: 'Sign Up',
    popular: true
  },
  {
    name: 'Scale',
    price: 'Custom',
    features: [
      { text: '250+ concurrent browsers' },
      { text: 'SSO available' },
      { text: 'HIPAA (BAA) & DPA' },
      { text: 'Advanced Stealth' }
    ],
    ctaText: 'Book Demo',
    popular: false
  }
]

const pricingTable = [
  { feature: 'Price', free: '$0', dev: '$20', startup: '$99', scale: 'Custom' },
  { feature: 'Browser Hours', free: '1', dev: '100', startup: '500', scale: 'Usage' },
  { feature: 'Proxy', free: '0 GB', dev: '1 GB', startup: '5 GB', scale: 'Usage' },
  { feature: 'Concurrency', free: '1', dev: '25', startup: '100', scale: '250+' },
  { feature: 'Data Retention', free: '7 days', dev: '30 days', startup: '30 days', scale: '30+' },
  { feature: 'Support', free: 'Email', dev: 'Standard', startup: 'Priority', scale: 'High' }
]

const faqs = [
  {
    question: 'What does Browserbase do?',
    answer: 'Browserbase provides serverless browsers for AI agents and automation. We handle the infrastructure so you can focus on building.'
  },
  {
    question: 'What tools can I use with Browserbase?',
    answer: 'We support Playwright, Puppeteer, Selenium, and our own framework Stagehand. You can also connect directly via Chrome DevTools Protocol.'
  },
  {
    question: 'Can I bring my own proxies?',
    answer: 'Yes! While we provide managed proxies, you can also configure Browserbase to use your own proxy infrastructure.'
  },
  {
    question: 'How is Browserbase related to Stagehand?',
    answer: 'Stagehand is our open-source browser automation framework. It works great with Browserbase but can also be used independently.'
  }
]
</script>

<style scoped>
@import '~/assets/css/neubrutalism.css';

.nb-nav {
  background: rgba(0, 0, 0, 0.8);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

html {
  scroll-behavior: smooth;
}
</style>
