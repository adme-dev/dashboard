<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e] overflow-x-hidden">
    <MarketingNav active="features" />

    <!-- 1. Hero Section — dark dramatic opening -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div class="absolute top-1/3 left-1/4 w-[600px] h-[600px] rounded-full bg-fuchsia-500/[0.08] blur-[140px]" />
        <div class="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] rounded-full bg-cyan-500/[0.06] blur-[120px]" />
        <div class="absolute top-[15%] right-[10%] w-[350px] h-[350px] rounded-full bg-amber-500/[0.05] blur-[120px]" />

        <!-- Grid pattern background -->
        <svg class="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        <div class="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0b0e] to-transparent" />
      </div>

      <div class="relative max-w-[1200px] mx-auto px-6 pt-28 pb-24 md:pt-40 md:pb-36 text-center">
        <!-- Breadcrumb -->
        <div class="inline-flex items-center gap-2 mb-8">
          <NuxtLink to="/banner-studio" class="text-[13px] text-white/40 hover:text-white/70 transition-colors">Banner Studio</NuxtLink>
          <UIcon name="i-lucide-chevron-right" class="w-3 h-3 text-white/30" />
          <span class="text-[13px] text-white/70 font-medium">Dynamic Ads</span>
        </div>

        <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/[0.06] border border-white/[0.08] mb-8">
          <div class="w-1.5 h-1.5 rounded-full bg-fuchsia-400 animate-pulse" />
          <span class="text-[13px] text-white/70 font-medium">Dynamic Creative Optimisation</span>
        </div>

        <h1 class="text-[clamp(36px,6.5vw,72px)] font-[450] text-white leading-[1.08] tracking-[-0.03em] mb-6 max-w-[900px] mx-auto">
          One design, hundreds<br class="hidden sm:block">of personalised ads
        </h1>

        <p class="text-lg md:text-xl text-white/50 max-w-[600px] mx-auto mb-12 leading-relaxed">
          Connect a data feed to your banner designs and automatically generate unique ad variants for every product, location, or audience segment.
        </p>

        <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
          <NuxtLink
            to="/auth/login"
            class="inline-flex items-center gap-2.5 px-7 py-3.5 bg-white text-[#121317] text-[17px] font-medium rounded-full hover:bg-white/90 transition-colors"
          >
            Try Dynamic Ads
            <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
          </NuxtLink>
          <NuxtLink
            to="/banner-studio"
            class="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.06] text-white/80 text-[17px] font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
          >
            Back to Banner Studio
          </NuxtLink>
        </div>
      </div>
    </section>

    <!-- 2. How It Works — 3 step process -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.12] tracking-[-0.02em] mb-4">
            How dynamic ads work
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[560px] mx-auto leading-relaxed">
            Three steps from a single design to a full campaign of personalised creatives.
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <div v-for="(step, i) in steps" :key="step.title" class="relative">
            <!-- Connector line (between cards) -->
            <div v-if="i < steps.length - 1" class="hidden md:block absolute top-12 -right-4 w-8 border-t border-dashed border-[#121317]/[0.15] dark:border-white/[0.15]" />
            <div class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-8 hover:border-[#121317]/[0.12] dark:hover:border-white/[0.12] hover:shadow-lg transition-all duration-300 h-full group">
              <div class="flex items-center gap-3 mb-6">
                <div class="w-10 h-10 rounded-full flex items-center justify-center text-[16px] font-bold" :class="step.numClass">
                  {{ i + 1 }}
                </div>
                <div
                  class="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                  :class="step.iconBg"
                >
                  <UIcon :name="step.icon" class="w-5 h-5" :class="step.iconColor" />
                </div>
              </div>
              <h3 class="text-[20px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-3">
                {{ step.title }}
              </h3>
              <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
                {{ step.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 3. Data Feeds Deep Dive -->
    <section class="py-20 md:py-32 bg-[#fafafa] dark:bg-[#121317]">
      <div class="max-w-[1200px] mx-auto px-6 flex flex-col gap-24 md:gap-32">

        <!-- Data Feed Upload — fuchsia accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-fuchsia-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
              <span class="text-[12px] text-fuchsia-700 dark:text-fuchsia-300 font-medium">Data Feeds</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Connect any data source
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Upload a CSV or JSON file with your product catalogue, location data, or campaign copy. Banner Studio auto-detects column types and maps them to layer properties.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in feedFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-fuchsia-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-fuchsia-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-fuchsia-50 via-purple-50 to-pink-100/50 dark:from-fuchsia-950/30 dark:via-purple-950/20 dark:to-pink-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-fuchsia-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">products-feed.csv</span>
                  <div class="ml-auto flex items-center gap-1.5">
                    <div class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/20 text-[8px] font-medium text-emerald-700 dark:text-emerald-300">24 rows</div>
                    <div class="px-2 py-0.5 rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/20 text-[8px] font-medium text-fuchsia-700 dark:text-fuchsia-300">5 columns</div>
                  </div>
                </div>
                <!-- Mini spreadsheet -->
                <div class="overflow-hidden">
                  <table class="w-full text-[10px]">
                    <thead>
                      <tr class="bg-[#121317]/[0.02] dark:bg-white/[0.03]">
                        <th v-for="col in feedColumns" :key="col.name" class="px-3 py-2 text-left font-semibold text-[#45474D]/60 dark:text-white/40">
                          <div class="flex items-center gap-1">
                            {{ col.name }}
                            <span class="text-[7px] px-1 py-0.5 rounded bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-600 dark:text-fuchsia-300 font-medium">{{ col.type }}</span>
                          </div>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(row, ri) in feedRows" :key="ri" class="border-t border-black/[0.03] dark:border-white/[0.03]">
                        <td v-for="(cell, ci) in row" :key="ci" class="px-3 py-1.5 text-[#45474D] dark:text-white/60 truncate max-w-[100px]">
                          {{ cell }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Property Bindings — cyan accent -->
        <div class="flex flex-col gap-8 md:flex-row-reverse md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-cyan-500" />
              <span class="text-[12px] text-cyan-700 dark:text-cyan-300 font-medium">Property Bindings</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Bind data to any layer
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Map feed columns to layer properties — text content, image sources, colours, and font sizes. Preview each row in the editor before generating.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in bindingFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-cyan-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-cyan-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-cyan-50 via-sky-50 to-blue-100/50 dark:from-cyan-950/30 dark:via-sky-950/20 dark:to-blue-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-cyan-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Feed Bindings</span>
                </div>
                <div class="flex flex-col gap-2 p-3">
                  <div v-for="binding in bindings" :key="binding.layer" class="rounded-xl border border-black/[0.05] dark:border-white/[0.06] px-3 py-2.5 flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" :class="binding.bg">
                      <UIcon :name="binding.icon" class="w-4 h-4" :class="binding.color" />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div class="text-[10px] font-medium text-[#121317] dark:text-white">{{ binding.layer }}</div>
                      <div class="text-[8px] text-[#45474D]/50 dark:text-white/30">{{ binding.property }}</div>
                    </div>
                    <UIcon name="i-lucide-arrow-right" class="w-3 h-3 text-[#45474D]/30 dark:text-white/20 flex-shrink-0" />
                    <div class="px-2 py-1 rounded-lg bg-cyan-50 dark:bg-cyan-500/10 text-[9px] font-medium text-cyan-700 dark:text-cyan-300 flex-shrink-0">
                      {{ binding.column }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Variant Generation — amber accent -->
        <div class="flex flex-col gap-8 md:flex-row md:items-center">
          <div class="flex-1 flex flex-col justify-center">
            <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 mb-5 self-start">
              <div class="w-1.5 h-1.5 rounded-full bg-amber-500" />
              <span class="text-[12px] text-amber-700 dark:text-amber-300 font-medium">Variant Generation</span>
            </div>
            <h2 class="text-[clamp(26px,3.5vw,38px)] font-[450] text-[#121317] dark:text-white leading-[1.15] tracking-[-0.02em] mb-4">
              Generate at scale
            </h2>
            <p class="text-[#45474D] dark:text-white/60 text-base md:text-lg leading-relaxed max-w-[480px] mb-6">
              Hit generate and Banner Studio creates a unique HTML5 banner for every row in your feed, across every ad size. Each variant gets a stable CDN URL and ready-to-use ad tags.
            </p>
            <ul class="flex flex-col gap-3">
              <li v-for="item in variantFeatures" :key="item" class="flex items-center gap-3 text-[15px] text-[#45474D] dark:text-white/60">
                <div class="w-5 h-5 rounded-full bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <UIcon name="i-lucide-check" class="w-3 h-3 text-amber-600" />
                </div>
                {{ item }}
              </li>
            </ul>
          </div>
          <div class="flex-1">
            <div class="w-full rounded-3xl bg-gradient-to-br from-amber-50 via-orange-50 to-yellow-100/50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-900/20 overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
              <div class="w-full rounded-2xl bg-white/80 dark:bg-white/[0.06] backdrop-blur-sm shadow-sm overflow-hidden flex flex-col">
                <div class="flex items-center gap-2.5 px-4 py-3 border-b border-black/[0.04] dark:border-white/[0.06]">
                  <div class="w-2 h-2 rounded-full bg-amber-400" />
                  <span class="text-[11px] font-medium text-[#121317]/70 dark:text-white/70">Variant Gallery</span>
                  <div class="ml-auto text-[9px] text-[#45474D]/50 dark:text-white/30">72 variants generated</div>
                </div>
                <div class="grid grid-cols-4 gap-1.5 p-3">
                  <div
                    v-for="n in 8"
                    :key="n"
                    class="aspect-[4/3] rounded-lg flex items-center justify-center text-[7px] font-bold text-white/80"
                    :class="variantColors[(n - 1) % variantColors.length]"
                  >
                    <div class="flex flex-col items-center gap-0.5">
                      <span>Row {{ n }}</span>
                      <span class="text-[6px] font-normal text-white/50">300x250</span>
                    </div>
                  </div>
                </div>
                <div class="px-3 pb-3">
                  <div class="flex items-center gap-2 rounded-xl bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2">
                    <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-amber-500" />
                    <span class="text-[10px] text-amber-700 dark:text-amber-300 font-medium">All variants published to CDN</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 4. Use Cases Grid -->
    <section class="py-20 md:py-32">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="text-center mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04] dark:bg-white/[0.06] mb-6">
            <div class="w-1.5 h-1.5 rounded-full bg-fuchsia-500" />
            <span class="text-[13px] text-[#45474D] dark:text-white/70 font-medium">Use Cases</span>
          </div>
          <h2 class="text-[clamp(28px,4vw,44px)] font-[450] text-[#121317] dark:text-white leading-[1.12] tracking-[-0.02em] mb-4">
            Dynamic ads for every campaign
          </h2>
          <p class="text-[#45474D] dark:text-white/60 text-lg max-w-[520px] mx-auto leading-relaxed">
            From product catalogues to localised campaigns, dynamic creative scales to any use case.
          </p>
        </div>

        <div class="grid sm:grid-cols-2 gap-6">
          <div
            v-for="useCase in useCases"
            :key="useCase.title"
            class="rounded-2xl border border-[#121317]/[0.06] dark:border-white/[0.06] p-7 hover:border-[#121317]/[0.12] dark:hover:border-white/[0.12] hover:shadow-lg transition-all duration-300 group"
          >
            <div class="flex items-start gap-5">
              <div
                class="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                :class="useCase.iconBg"
              >
                <UIcon :name="useCase.icon" class="w-5.5 h-5.5" :class="useCase.iconColor" />
              </div>
              <div>
                <h3 class="text-[18px] font-[450] text-[#121317] dark:text-white tracking-[-0.01em] mb-2">
                  {{ useCase.title }}
                </h3>
                <p class="text-[15px] text-[#45474D] dark:text-white/60 leading-relaxed">
                  {{ useCase.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 5. Dark CTA Section -->
    <section class="py-10 md:py-16">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="relative rounded-[2rem] bg-[#0a0b0e] overflow-hidden py-24 md:py-36">
          <div class="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <div class="absolute top-1/3 left-1/3 w-[500px] h-[500px] rounded-full bg-fuchsia-500/[0.06] blur-[120px]" />
            <div class="absolute bottom-1/4 right-1/3 w-[400px] h-[400px] rounded-full bg-cyan-500/[0.04] blur-[100px]" />
          </div>

          <div class="relative text-center px-6">
            <div class="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center mx-auto mb-8">
              <span class="text-white text-xs font-semibold tracking-tight">XF</span>
            </div>
            <h2 class="text-[clamp(28px,4vw,48px)] font-[450] text-white leading-[1.15] tracking-[-0.02em] mb-5">
              Scale your ad creative today
            </h2>
            <p class="text-white/40 text-lg max-w-[480px] mx-auto mb-10 leading-relaxed">
              Dynamic ads are included in Banner Studio. Upload a feed and start generating variants in minutes.
            </p>
            <div class="flex flex-col sm:flex-row items-center justify-center gap-3">
              <NuxtLink
                to="/auth/login"
                class="inline-flex items-center gap-2 px-7 py-3.5 bg-white text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-white/90 transition-colors"
              >
                Get Started Free
                <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </NuxtLink>
              <NuxtLink
                to="/banner-studio"
                class="inline-flex items-center gap-2 px-6 py-3.5 bg-white/[0.06] text-white/80 text-[17px] font-medium rounded-full hover:bg-white/[0.1] transition-colors border border-white/[0.08]"
              >
                Explore Banner Studio
              </NuxtLink>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 6. Footer -->
    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Dynamic Ads — Banner Studio — XeroFlow',
  description: 'Generate hundreds of personalised ad variants from a single design. Connect data feeds, bind properties, and publish at scale with XeroFlow Banner Studio.',
  ogTitle: 'Dynamic Ads — Banner Studio — XeroFlow',
  ogDescription: 'Generate hundreds of personalised ad variants from a single design. Connect data feeds, bind properties, and publish at scale.',
})

// How it works steps
const steps = [
  {
    title: 'Upload your data feed',
    description: 'Upload a CSV or JSON file with your product catalogue, location data, or campaign variants. Banner Studio auto-detects column types — text, numbers, URLs, and colours.',
    icon: 'i-lucide-upload',
    iconBg: 'bg-fuchsia-500/10',
    iconColor: 'text-fuchsia-600',
    numClass: 'bg-fuchsia-500/10 text-fuchsia-600'
  },
  {
    title: 'Bind columns to layers',
    description: 'Map feed columns to layer properties — headline text, product images, background colours, CTA copy. Preview each row in the editor before generating.',
    icon: 'i-lucide-link',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-600',
    numClass: 'bg-cyan-500/10 text-cyan-600'
  },
  {
    title: 'Generate & publish',
    description: 'Hit generate to create a unique HTML5 banner for every row across every ad size. Each variant gets a stable CDN URL and ready-to-use ad tags with tracking.',
    icon: 'i-lucide-rocket',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600',
    numClass: 'bg-amber-500/10 text-amber-600'
  }
]

// Feed features
const feedFeatures = [
  'CSV and JSON file upload',
  'Auto-detect column types (text, number, URL, colour)',
  'Preview rows in the editor with navigation',
  'Feed data stored on R2 for fast access'
]

// Binding features
const bindingFeatures = [
  'Bind text content from any column',
  'Map image URLs to image layer sources',
  'Override colours and font sizes dynamically',
  'Smart type matching (URL columns to src, colour to fills)'
]

// Variant features
const variantFeatures = [
  'One click generates all rows x all formats',
  'Pre-baked HTML with no runtime JavaScript',
  'Stable CDN URLs per variant',
  'Bulk ad tag export as CSV'
]

// Feed mock data
const feedColumns = [
  { name: 'product', type: 'text' },
  { name: 'price', type: 'number' },
  { name: 'image', type: 'url' },
  { name: 'cta', type: 'text' },
]

const feedRows = [
  ['Summer Dress', '$49.00', 'cdn.shop/dress.jpg', 'Shop Now'],
  ['Beach Towel', '$24.99', 'cdn.shop/towel.jpg', 'Buy Today'],
  ['Sunglasses', '$89.00', 'cdn.shop/glass.jpg', 'Get Yours'],
]

// Bindings illustration
const bindings = [
  { layer: 'Headline Text', property: 'text content', column: 'product', icon: 'i-lucide-type', bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10', color: 'text-fuchsia-600' },
  { layer: 'Price Label', property: 'text content', column: 'price', icon: 'i-lucide-type', bg: 'bg-amber-50 dark:bg-amber-500/10', color: 'text-amber-600' },
  { layer: 'Product Image', property: 'image source', column: 'image', icon: 'i-lucide-image', bg: 'bg-cyan-50 dark:bg-cyan-500/10', color: 'text-cyan-600' },
  { layer: 'CTA Button', property: 'button text', column: 'cta', icon: 'i-lucide-square', bg: 'bg-emerald-50 dark:bg-emerald-500/10', color: 'text-emerald-600' },
]

// Variant gallery colors
const variantColors = [
  'bg-gradient-to-br from-rose-400 to-pink-500',
  'bg-gradient-to-br from-fuchsia-400 to-purple-500',
  'bg-gradient-to-br from-violet-400 to-indigo-500',
  'bg-gradient-to-br from-cyan-400 to-blue-500',
  'bg-gradient-to-br from-emerald-400 to-teal-500',
  'bg-gradient-to-br from-amber-400 to-orange-500',
  'bg-gradient-to-br from-blue-400 to-indigo-500',
  'bg-gradient-to-br from-rose-400 to-fuchsia-500',
]

// Use cases
const useCases = [
  {
    title: 'Product Catalogues',
    description: 'Connect your e-commerce product feed to generate unique ads for every SKU. Product names, prices, images, and CTAs all update automatically.',
    icon: 'i-lucide-shopping-bag',
    iconBg: 'bg-fuchsia-500/10',
    iconColor: 'text-fuchsia-600'
  },
  {
    title: 'Localised Campaigns',
    description: 'Create city or region-specific ad variants from a locations spreadsheet. Different copy, imagery, and offers per market — all from one master design.',
    icon: 'i-lucide-map-pin',
    iconBg: 'bg-cyan-500/10',
    iconColor: 'text-cyan-600'
  },
  {
    title: 'A/B Testing at Scale',
    description: 'Upload a feed of headline and CTA variations to generate all possible combinations. Test different copy treatments across your full ad size set.',
    icon: 'i-lucide-split',
    iconBg: 'bg-amber-500/10',
    iconColor: 'text-amber-600'
  },
  {
    title: 'Multi-Brand Management',
    description: 'Agencies managing multiple clients can swap brand kits and data feeds to generate full ad sets for each client from a shared template library.',
    icon: 'i-lucide-building-2',
    iconBg: 'bg-emerald-500/10',
    iconColor: 'text-emerald-600'
  }
]
</script>
