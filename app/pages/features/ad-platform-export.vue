<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <!-- Hero — dark, full-width with gradient -->
    <section class="relative bg-[#0a0b0e] pt-[52px] overflow-hidden">
      <MarketingHeroBackground theme="feature-detail" />

      <!-- Floating gradient orbs -->
      <div class="absolute top-32 -right-40 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div class="absolute bottom-0 -left-40 w-[400px] h-[400px] bg-blue-500/8 rounded-full blur-[100px] pointer-events-none" />

      <div class="relative max-w-[1200px] mx-auto px-6 pt-8">
        <!-- Breadcrumb -->
        <NuxtLink to="/features" class="inline-flex items-center gap-1.5 text-[14px] text-white/60 hover:text-white transition-colors">
          <UIcon name="i-lucide-arrow-left" class="w-3.5 h-3.5" />
          All Features
        </NuxtLink>

        <!-- Hero content — two-column -->
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 pt-16 pb-20 md:pt-24 md:pb-28 items-center">
          <!-- Left: text -->
          <div>
            <div class="flex items-center gap-3 mb-6">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center bg-rose-500/15">
                <UIcon name="i-lucide-palette" class="w-5 h-5 text-rose-400" />
              </div>
              <span class="text-[14px] text-white/60 font-medium">Communication & Creative</span>
            </div>
            <h1 class="text-[clamp(36px,5vw,56px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6">
              Export banners for<br class="hidden md:block">any ad platform
            </h1>
            <p class="text-lg md:text-xl text-white/50 leading-relaxed mb-8 max-w-[520px]">
              Select a platform, get the right clickTag injected, validate against size limits, and download a compliant ZIP — ready to upload.
            </p>
            <div class="flex flex-wrap gap-3">
              <NuxtLink
                to="/auth/login"
                class="inline-flex items-center gap-2 px-6 py-3 bg-white text-[#121317] text-[15px] font-medium rounded-full hover:bg-white/90 transition-colors"
              >
                Get Started
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </NuxtLink>
              <NuxtLink
                to="/resources/ad-platform-export"
                class="inline-flex items-center gap-2 px-6 py-3 bg-white/[0.08] text-white text-[15px] font-medium rounded-full hover:bg-white/[0.12] transition-colors border border-white/[0.08]"
              >
                Read the Guide
              </NuxtLink>
            </div>
          </div>

          <!-- Right: platform grid mockup -->
          <div class="relative hidden lg:block">
            <div class="rounded-2xl bg-white/[0.04] border border-white/[0.06] p-6 backdrop-blur-sm">
              <div class="flex items-center gap-2 mb-4">
                <UIcon name="i-lucide-download" class="w-4 h-4 text-white/60" />
                <span class="text-[14px] font-medium text-white/80">Export for Ad Platform</span>
              </div>
              <div class="grid grid-cols-3 gap-2 mb-4">
                <div
                  v-for="p in heroMockPlatforms"
                  :key="p.name"
                  class="flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px]"
                  :class="p.active
                    ? 'border-blue-400/50 bg-blue-500/10 text-white'
                    : 'border-white/[0.06] text-white/50'"
                >
                  <UIcon :name="p.icon" class="w-3.5 h-3.5 shrink-0" />
                  <span class="truncate">{{ p.name }}</span>
                </div>
              </div>
              <!-- Mock requirements panel -->
              <div class="rounded-lg bg-white/[0.03] border border-white/[0.04] p-3 space-y-1.5 mb-4">
                <div class="text-[10px] font-semibold text-white/30 uppercase tracking-wider">Requirements</div>
                <div class="flex items-center gap-1.5 text-[11px] text-white/50">
                  <UIcon name="i-lucide-check-circle" class="w-3 h-3 text-emerald-400" />
                  Max file size: 150KB
                </div>
                <div class="flex items-center gap-1.5 text-[11px] text-white/50">
                  <UIcon name="i-lucide-alert-circle" class="w-3 h-3 text-amber-400" />
                  External calls: Not allowed
                </div>
                <div class="flex items-center gap-1.5 text-[11px] text-white/50">
                  <UIcon name="i-lucide-alert-circle" class="w-3 h-3 text-amber-400" />
                  Looping: Not allowed
                </div>
              </div>
              <!-- Mock size bar -->
              <div class="space-y-1">
                <div class="flex justify-between text-[10px] text-white/40">
                  <span>File size</span>
                  <span>89KB / 150KB</span>
                </div>
                <div class="w-full h-1 rounded-full bg-white/[0.06] overflow-hidden">
                  <div class="h-full rounded-full bg-emerald-400" style="width: 59%" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Platform Support Grid -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">
            14 platforms, one workflow
          </h2>
          <p class="text-[16px] text-[#45474D] dark:text-white/50 max-w-[560px] mx-auto leading-relaxed">
            Each platform has unique requirements for file size, click tracking, animation limits, and external resources. We handle all of it.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="p in platformCards"
            :key="p.name"
            class="rounded-2xl bg-[#f4f5f7] dark:bg-white/[0.03] p-5 flex flex-col gap-3 group hover:bg-[#eef0f3] dark:hover:bg-white/[0.06] transition-colors"
          >
            <div class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-xl bg-white dark:bg-white/[0.06] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
                <UIcon :name="p.icon" class="w-5 h-5 text-[#121317] dark:text-white" />
              </div>
              <div>
                <h3 class="text-[15px] font-medium text-[#121317] dark:text-white">{{ p.name }}</h3>
                <span class="text-[12px] text-[#45474D]/60 dark:text-white/30">{{ p.size }}</span>
              </div>
            </div>
            <div class="flex flex-wrap gap-1.5">
              <span
                v-for="tag in p.tags"
                :key="tag.label"
                class="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium"
                :class="tag.ok
                  ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                  : 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400'"
              >
                {{ tag.label }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- How It Works -->
    <section class="py-20 md:py-28 bg-[#f8f9fa] dark:bg-white/[0.015]">
      <div class="max-w-[720px] mx-auto px-6">
        <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4 text-center">
          How it works
        </h2>
        <p class="text-[16px] text-[#45474D] dark:text-white/50 text-center mb-16 max-w-[480px] mx-auto leading-relaxed">
          Three steps from editor to compliant ad. No manual HTML editing required.
        </p>

        <div class="flex flex-col gap-14">
          <div v-for="(step, i) in steps" :key="i" class="relative">
            <div class="flex items-center gap-3 mb-4">
              <div class="w-8 h-8 rounded-lg bg-[#121317] dark:bg-white text-white dark:text-[#121317] flex items-center justify-center text-[14px] font-medium">
                {{ i + 1 }}
              </div>
              <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em]">{{ step.title }}</h3>
            </div>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-[1.75] pl-11">
              {{ step.content }}
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- ClickTag Technical Detail -->
    <section class="py-20 md:py-28">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="grid lg:grid-cols-2 gap-12 lg:gap-20 items-start">
          <div>
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">
              Platform-specific click tracking
            </h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Every ad platform has its own way of handling click tracking. Some use a simple <code class="px-1.5 py-0.5 rounded bg-[#f4f5f7] dark:bg-white/[0.06] text-[14px]">clickTag</code> variable, others require external libraries. XeroFlow injects the correct pattern automatically.
            </p>
            <div class="space-y-4">
              <div
                v-for="ct in clickTagExamples"
                :key="ct.platform"
                class="rounded-xl border border-[#121317]/[0.06] dark:border-white/[0.06] overflow-hidden"
              >
                <div class="px-4 py-2.5 bg-[#f4f5f7] dark:bg-white/[0.03] flex items-center gap-2">
                  <UIcon :name="ct.icon" class="w-4 h-4 text-[#45474D] dark:text-white/50" />
                  <span class="text-[13px] font-medium text-[#121317] dark:text-white">{{ ct.platform }}</span>
                </div>
                <div class="px-4 py-3">
                  <code class="text-[12px] text-[#45474D] dark:text-white/60 font-mono whitespace-pre-wrap">{{ ct.code }}</code>
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 class="text-[clamp(28px,4vw,40px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em] mb-4">
              Automatic validation
            </h2>
            <p class="text-[16px] text-[#45474D] dark:text-white/60 leading-relaxed mb-6">
              Before you download, XeroFlow checks your banner against the platform's rules and tells you exactly what passes and what needs attention.
            </p>
            <div class="space-y-3">
              <div
                v-for="check in validationChecks"
                :key="check.label"
                class="flex items-start gap-3 rounded-xl bg-[#f4f5f7] dark:bg-white/[0.03] p-4"
              >
                <UIcon :name="check.icon" class="w-5 h-5 mt-0.5 shrink-0" :class="check.iconColor" />
                <div>
                  <p class="text-[14px] font-medium text-[#121317] dark:text-white mb-0.5">{{ check.label }}</p>
                  <p class="text-[13px] text-[#45474D]/70 dark:text-white/40 leading-relaxed">{{ check.description }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="rounded-[2rem] bg-[#0a0b0e] py-24 md:py-32 text-center px-6">
          <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-5">
            Export compliant ads in seconds
          </h2>
          <p class="text-lg text-white/50 mb-10 max-w-[480px] mx-auto">
            Stop manually editing HTML for each platform. Let XeroFlow handle the specs.
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
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] dark:text-white tracking-[-0.02em]">Experience XeroFlow</h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Features</NuxtLink>
              <NuxtLink to="/pricing" class="text-[#45474D] dark:text-white/50 hover:text-[#121317] dark:hover:text-white transition-colors">Pricing</NuxtLink>
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
  title: 'Ad Platform Export — XeroFlow',
  description: 'Export HTML5 banners for 14 ad platforms with automatic clickTag injection, file size validation, and compliant ZIP download.',
  ogTitle: 'Ad Platform Export — XeroFlow',
  ogDescription: 'Export HTML5 banners for Google Ads, DV360, The Trade Desk, Xandr, and 10 more platforms with one-click compliance.',
})

const heroMockPlatforms = [
  { name: 'Google Ads', icon: 'i-lucide-megaphone', active: true },
  { name: 'DV360', icon: 'i-lucide-monitor-play', active: false },
  { name: 'Trade Desk', icon: 'i-lucide-bar-chart-3', active: false },
  { name: 'Xandr', icon: 'i-lucide-network', active: false },
  { name: 'Amazon DSP', icon: 'i-lucide-shopping-cart', active: false },
  { name: 'Criteo', icon: 'i-lucide-mouse-pointer-click', active: false },
]

const platformCards = [
  { name: 'Google Ads', icon: 'i-lucide-megaphone', size: '150KB max', tags: [{ label: '30s anim', ok: true }, { label: 'No externals', ok: false }, { label: 'No looping', ok: false }] },
  { name: 'Display & Video 360', icon: 'i-lucide-monitor-play', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'Google Ad Manager', icon: 'i-lucide-layout-dashboard', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'Campaign Manager 360', icon: 'i-lucide-target', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'No externals', ok: false }] },
  { name: 'Google AdSense', icon: 'i-lucide-badge-dollar-sign', size: '150KB max', tags: [{ label: '30s anim', ok: true }, { label: 'No looping', ok: false }] },
  { name: 'Amazon DSP', icon: 'i-lucide-shopping-cart', size: '200KB max', tags: [{ label: 'No anim limit', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'The Trade Desk', icon: 'i-lucide-bar-chart-3', size: '200KB max', tags: [{ label: '15s anim', ok: true }, { label: 'clickTAG', ok: true }] },
  { name: 'Xandr (AppNexus)', icon: 'i-lucide-network', size: '200KB max', tags: [{ label: 'AppNexus lib', ok: true }, { label: '30s anim', ok: true }] },
  { name: 'Sizmek', icon: 'i-lucide-layers', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'Flashtalking', icon: 'i-lucide-zap', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'AdRoll', icon: 'i-lucide-repeat', size: '150KB max', tags: [{ label: '30s anim', ok: true }, { label: 'No looping', ok: false }] },
  { name: 'Criteo', icon: 'i-lucide-mouse-pointer-click', size: '200KB max', tags: [{ label: '30s anim', ok: true }, { label: 'Looping OK', ok: true }] },
  { name: 'Yahoo DSP', icon: 'i-lucide-radio', size: '200KB max', tags: [{ label: 'AdKit lib', ok: true }, { label: '15s anim', ok: true }] },
  { name: 'Generic / IAB', icon: 'i-lucide-globe', size: 'No limit', tags: [{ label: 'No restrictions', ok: true }] },
]

const steps = [
  {
    title: 'Choose your platform',
    content: 'Open the Export modal from the Custom Banner Editor toolbar. A grid of 14 supported platforms is displayed — Google Ads, DV360, The Trade Desk, Xandr, Amazon DSP, and more. Select one and instantly see its requirements: file size limits, animation constraints, external resource rules, and looping policies.',
  },
  {
    title: 'Review requirements and warnings',
    content: 'The requirements panel shows exactly what the platform allows and restricts. When you click Download, XeroFlow validates your banner against these rules. File size is checked against the limit, external scripts are flagged if the platform blocks them, and infinite animation loops trigger a warning for platforms that prohibit looping. Errors and warnings are displayed with clear severity indicators.',
  },
  {
    title: 'Download the compliant ZIP',
    content: 'XeroFlow builds a platform-compliant HTML file with the correct clickTag script injected, strips disallowed external resources, wraps everything in a ZIP with index.html at the root, and triggers the download. The file is named with your banner name, dimensions, and platform — ready to upload directly to the ad server.',
  },
]

const clickTagExamples = [
  {
    platform: 'Google Ads / DV360',
    icon: 'i-lucide-megaphone',
    code: `var clickTag = "%%CLICK_URL_UNESC%%";
document.addEventListener("click", function() {
  window.open(clickTag, "_blank");
});`,
  },
  {
    platform: 'The Trade Desk',
    icon: 'i-lucide-bar-chart-3',
    code: `var clickTAG = "%%CLICK_URL%%";  // uppercase TAG
document.addEventListener("click", function() {
  window.open(clickTAG, "_blank");
});`,
  },
  {
    platform: 'Xandr (AppNexus)',
    icon: 'i-lucide-network',
    code: `// Requires AppNexus HTML5 library
document.addEventListener("click", function() {
  window.open(APPNEXUS.getClickTag(), "_blank");
});`,
  },
  {
    platform: 'Yahoo DSP',
    icon: 'i-lucide-radio',
    code: `// Requires Yahoo AdKit library
adkit.onReady(function() {
  document.addEventListener("click", function() {
    adkit.clicktag();
  });
});`,
  },
]

const validationChecks = [
  {
    label: 'File size compliance',
    description: 'Your banner HTML is measured in bytes and compared against the platform limit. A progress bar shows how close you are to the cap.',
    icon: 'i-lucide-hard-drive',
    iconColor: 'text-blue-600 dark:text-blue-400',
  },
  {
    label: 'External resource scanning',
    description: 'External scripts and stylesheets are detected and flagged for platforms that block third-party network calls.',
    icon: 'i-lucide-shield-check',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    label: 'Animation loop detection',
    description: 'GSAP repeat:-1 and CSS infinite animations are caught for platforms that prohibit looping.',
    icon: 'i-lucide-repeat',
    iconColor: 'text-violet-600 dark:text-violet-400',
  },
  {
    label: 'Animation time limits',
    description: 'Platforms with 15s or 30s limits show an advisory so you can verify your animation duration.',
    icon: 'i-lucide-timer',
    iconColor: 'text-amber-600 dark:text-amber-400',
  },
]
</script>
