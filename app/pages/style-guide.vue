<template>
  <div class="min-h-screen" style="background: #FFFFFF;">
    <!-- Header -->
    <header class="border-b border-black/10">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-sm">X</div>
          <span class="font-semibold text-black">XeroFlow Style Guide</span>
        </div>
        <nav class="hidden md:flex items-center gap-8 text-sm text-black/60">
          <a href="#colors" class="hover:text-black transition-colors">Colors</a>
          <a href="#typography" class="hover:text-black transition-colors">Typography</a>
          <a href="#components" class="hover:text-black transition-colors">Components</a>
          <a href="#patterns" class="hover:text-black transition-colors">Patterns</a>
        </nav>
      </div>
    </header>

    <main class="max-w-6xl mx-auto px-6 py-16 space-y-24">
      
      <!-- Hero -->
      <section class="text-center">
        <h1 class="text-5xl md:text-6xl font-normal text-black tracking-tight mb-4">
          XeroFlow Style Guide
        </h1>
        <p class="text-lg text-black/60 max-w-xl mx-auto">
          Xero Implementation & Task Manager Platform — Clean, professional design system for accounting firms
        </p>
      </section>

      <!-- Colors -->
      <section id="colors">
        <h2 class="text-3xl font-normal text-black mb-8">Colors</h2>
        
        <div class="space-y-8">
          <!-- Primary Colors -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Primary</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3 border border-black/10" style="background: #FFFFFF;"></div>
                <div class="text-xs font-mono text-black/40">background</div>
                <div class="text-sm text-black">#FFFFFF</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #000000;"></div>
                <div class="text-xs font-mono text-black/40">text-primary</div>
                <div class="text-sm text-black">#000000</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: rgba(0,0,0,0.6);"></div>
                <div class="text-xs font-mono text-black/40">text-secondary</div>
                <div class="text-sm text-black">60% black</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3 border border-black/10" style="background: #F5F5F5;"></div>
                <div class="text-xs font-mono text-black/40">surface</div>
                <div class="text-sm text-black">#F5F5F5</div>
              </div>
            </div>
          </div>

          <!-- Brand Colors -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Brand</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #13B5EA;"></div>
                <div class="text-xs font-mono text-black/40">xero-blue</div>
                <div class="text-sm text-black">#13B5EA</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #0E8BBA;"></div>
                <div class="text-xs font-mono text-black/40">xero-blue-dark</div>
                <div class="text-sm text-black">#0E8BBA</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #E8F5F9;"></div>
                <div class="text-xs font-mono text-black/40">xero-blue-light</div>
                <div class="text-sm text-black">#E8F5F9</div>
              </div>
            </div>
          </div>

          <!-- Accent Colors -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Accents</h3>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #F4B942;"></div>
                <div class="text-xs font-mono text-black/40">yellow</div>
                <div class="text-sm text-black">#F4B942</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #9B87F5;"></div>
                <div class="text-xs font-mono text-black/40">purple</div>
                <div class="text-sm text-black">#9B87F5</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #E866A9;"></div>
                <div class="text-xs font-mono text-black/40">pink</div>
                <div class="text-sm text-black">#E866A9</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #7DD3A8;"></div>
                <div class="text-xs font-mono text-black/40">mint</div>
                <div class="text-sm text-black">#7DD3A8</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4">
                <div class="w-full h-20 rounded mb-3" style="background: #FF6B6B;"></div>
                <div class="text-xs font-mono text-black/40">red</div>
                <div class="text-sm text-black">#FF6B6B</div>
              </div>
            </div>
          </div>

          <!-- Border Colors -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Borders</h3>
            <div class="flex gap-4">
              <div class="border border-black/10 rounded-lg p-4 flex-1">
                <div class="w-full h-12 rounded mb-3 border" style="border-color: rgba(0,0,0,0.1);"></div>
                <div class="text-xs font-mono text-black/40">border-subtle</div>
                <div class="text-sm text-black">10% black</div>
              </div>
              <div class="border border-black/10 rounded-lg p-4 flex-1">
                <div class="w-full h-12 rounded mb-3 border border-black"></div>
                <div class="text-xs font-mono text-black/40">border-strong</div>
                <div class="text-sm text-black">100% black</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Typography -->
      <section id="typography">
        <h2 class="text-3xl font-normal text-black mb-8">Typography</h2>
        <div class="border border-black/10 rounded-lg p-8 space-y-8">
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40 mb-2">Display</div>
            <p class="text-5xl md:text-6xl font-normal text-black tracking-tight">Streamline your Xero implementations</p>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40 mb-2">Title</div>
            <p class="text-3xl md:text-4xl font-normal text-black">Power your accounting practice</p>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40 mb-2">Subtitle</div>
            <p class="text-xl text-black/60">with automated task management and client onboarding</p>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40 mb-2">Body</div>
            <p class="text-base text-black/60 leading-relaxed max-w-2xl">
              Browserbase gives agents secure, headless browsers with built-in anti-bot protection 
              and stealth capabilities. Sessions persist across runs so agents stay logged in.
            </p>
          </div>
          <div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40 mb-2">Label</div>
            <p class="text-xs font-mono uppercase tracking-wider text-black/40">Most popular</p>
          </div>
        </div>
      </section>

      <!-- Components -->
      <section id="components">
        <h2 class="text-3xl font-normal text-black mb-8">Components</h2>
        
        <div class="space-y-12">
          <!-- Hero Section -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Hero Section</h3>
            <div class="border border-black/20 rounded-lg overflow-hidden">
              <div class="p-8 md:p-12 bg-white">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                  <!-- Left Content -->
                  <div>
                    <h2 class="text-4xl md:text-5xl font-normal text-black leading-tight mb-4">
                      Streamline your Xero implementations.
                    </h2>
                    <p class="text-base text-black/70 leading-relaxed mb-6">
                      XeroFlow is the all-in-one task manager for Xero implementation specialists. Automate client onboarding, track progress across multiple implementations, and deliver consistent, error-free setups every time.
                    </p>
                    <button class="px-6 py-3 bg-[#13B5EA] text-white font-medium rounded hover:bg-[#0E8BBA] transition-colors">
                      Get a Demo
                    </button>
                  </div>
                  <!-- Right Content - Task Manager Mockup -->
                  <div class="border border-black/20 rounded-lg overflow-hidden bg-[#FFFBF0]">
                    <div class="h-8 bg-[#2A2A2A] flex items-center px-3 gap-1.5">
                      <div class="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]"></div>
                      <div class="w-2.5 h-2.5 rounded-full bg-[#F4B942]"></div>
                      <div class="w-2.5 h-2.5 rounded-full bg-[#7DD3A8]"></div>
                    </div>
                    <div class="p-6">
                      <div class="inline-block border border-black/20 border-b-0 bg-white px-3 py-1.5 text-xs font-medium">Implementation Tasks</div>
                      <div class="border border-black/20 bg-white p-4">
                        <div class="flex justify-between items-center mb-3">
                          <span class="text-xs text-black/60">Acme Consulting</span>
                          <div class="w-24 h-1.5 bg-black/10 rounded-full overflow-hidden">
                            <div class="w-3/4 h-full bg-[#13B5EA] rounded-full"></div>
                          </div>
                        </div>
                        <div class="space-y-2">
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                            <span class="text-sm text-black/60 line-through">Chart of accounts</span>
                          </div>
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                            <span class="text-sm text-black/60 line-through">Bank feeds</span>
                          </div>
                          <div class="flex items-center gap-2">
                            <UIcon name="i-lucide-circle" class="w-4 h-4 text-[#13B5EA]" />
                            <span class="text-sm text-black">Invoice templates</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Testimonial Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Testimonial Cards</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <!-- Yellow Card -->
              <div class="border border-black rounded overflow-hidden">
                <div class="h-16 flex items-center justify-center" style="background: #F4B942;">
                  <span class="font-semibold text-black">Chronicle</span>
                </div>
                <div class="p-4">
                  <p class="text-sm text-black/80 leading-relaxed">
                    "It's hard to measure peace of mind. The key is that I no longer have to think about this"
                  </p>
                </div>
                <div class="px-4 py-3 border-t border-black/10">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Purple Card -->
              <div class="border border-black rounded overflow-hidden">
                <div class="h-16 flex items-center justify-center" style="background: #9B87F5;">
                  <span class="font-semibold text-white">benny</span>
                </div>
                <div class="p-4">
                  <p class="text-sm text-black/80 leading-relaxed">
                    "I love the product. Browserbase has allowed us to abstract away the difficulties"
                  </p>
                </div>
                <div class="px-4 py-3 border-t border-black/10">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Black Card -->
              <div class="border border-black rounded overflow-hidden">
                <div class="h-16 flex items-center justify-center bg-black">
                  <span class="font-semibold text-white">▲ Vercel</span>
                </div>
                <div class="p-4">
                  <p class="text-sm text-black/80 leading-relaxed">
                    "It's good to have someone reliable handling the browser management and CDN challenges"
                  </p>
                </div>
                <div class="px-4 py-3 border-t border-black/10">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>

              <!-- Pink Card -->
              <div class="border border-black rounded overflow-hidden">
                <div class="h-16 flex items-center justify-center" style="background: #E866A9;">
                  <span class="font-semibold text-white">Convergence</span>
                </div>
                <div class="p-4">
                  <p class="text-sm text-black/80 leading-relaxed">
                    "Our requests were treated seriously. You don't want to build a partnership where they just charge you"
                  </p>
                </div>
                <div class="px-4 py-3 border-t border-black/10">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Pricing Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Pricing Cards</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div v-for="(plan, i) in pricingPlans" :key="plan.name" 
                class="border border-black rounded-lg p-6 text-center relative"
                :class="{ 'bg-black text-white': plan.featured }">
                <div v-if="plan.popular" class="absolute -top-2 left-1/2 -translate-x-1/2">
                  <span class="px-2 py-0.5 text-xs font-mono uppercase rounded" style="background: #9B87F5; color: white;">
                    Most popular
                  </span>
                </div>
                
                <!-- 3D Cube Placeholder -->
                <div class="h-16 flex items-center justify-center mb-4">
                  <div class="w-12 h-12 rounded" :style="`background: ${plan.cubeColor}; transform: rotate(45deg);`"></div>
                </div>

                <h4 class="text-sm font-medium mb-2" :class="plan.featured ? 'text-white/70' : 'text-black/60'">{{ plan.name }}</h4>
                <div class="text-3xl font-normal mb-6">{{ plan.price }}</div>
                
                <ul class="space-y-3 mb-6">
                  <li v-for="feature in plan.features" :key="feature" 
                    class="text-sm py-2 border-b"
                    :class="plan.featured ? 'border-white/10 text-white/80' : 'border-black/10 text-black/70'">
                    {{ feature }}
                  </li>
                </ul>

                <button class="w-full py-2.5 border rounded text-sm font-medium transition-colors"
                  :class="plan.featured 
                    ? 'border-white text-white hover:bg-white hover:text-black' 
                    : 'border-black text-black hover:bg-black hover:text-white'">
                  {{ plan.cta }}
                </button>
              </div>
            </div>
          </div>

          <!-- FAQ Accordion (Two Column) -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">FAQ Accordion (Two Column)</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
              <div>
                <h2 class="text-5xl font-normal text-black">FAQs</h2>
              </div>
              <div class="space-y-4">
                <div class="border border-black rounded overflow-hidden" style="background: #E8F5E9;">
                  <details open class="group">
                    <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                      <span class="font-medium text-black text-lg">What does Browserbase do?</span>
                      <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-[#7DD3A8]">
                        <UIcon name="i-lucide-minus" class="w-5 h-5 text-black" />
                      </div>
                    </summary>
                    <div class="px-6 pb-6 text-black/80 leading-relaxed">
                      Browserbase is a cloud platform for browser automations. We provide production-ready infrastructure for running automated web browsers at scale, eliminating the need to manage your own infrastructure.
                    </div>
                  </details>
                </div>
                <div class="border border-black rounded overflow-hidden bg-white">
                  <details class="group">
                    <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                      <span class="font-medium text-black text-lg">What kinds of use cases?</span>
                      <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-white group-open:bg-[#7DD3A8]">
                        <UIcon name="i-lucide-plus" class="w-5 h-5 text-black group-open:hidden" />
                        <UIcon name="i-lucide-minus" class="w-5 h-5 text-black hidden group-open:block" />
                      </div>
                    </summary>
                    <div class="px-6 pb-6 text-black/80 leading-relaxed">
                      Companies use Browserbase for web scraping, automated testing, AI agent workflows, and data extraction.
                    </div>
                  </details>
                </div>
                <div class="border border-black rounded overflow-hidden bg-white">
                  <details class="group">
                    <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                      <span class="font-medium text-black text-lg">What tools work with Browserbase?</span>
                      <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-white group-open:bg-[#7DD3A8]">
                        <UIcon name="i-lucide-plus" class="w-5 h-5 text-black group-open:hidden" />
                        <UIcon name="i-lucide-minus" class="w-5 h-5 text-black hidden group-open:block" />
                      </div>
                    </summary>
                    <div class="px-6 pb-6 text-black/80 leading-relaxed">
                      Browserbase works with Playwright, Puppeteer, Selenium, and our own framework Stagehand.
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </div>

          <!-- Feature List -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Feature Accordion</h3>
            <div class="border border-black rounded-lg overflow-hidden divide-y divide-black/10 max-w-md">
              <div v-for="(feature, i) in features" :key="feature.name" 
                class="group"
                :style="i === 0 ? 'background: #FFFBE6;' : ''">
                <div class="flex items-center gap-3 p-4 cursor-pointer hover:bg-black/[0.02]">
                  <div class="w-8 h-8 border border-black rounded flex items-center justify-center"
                    :style="i === 0 ? 'background: #F4B942;' : ''">
                    <UIcon :name="feature.icon" class="w-4 h-4" :class="i === 0 ? 'text-black' : 'text-black/60'" />
                  </div>
                  <span class="font-medium text-black">{{ feature.name }}</span>
                </div>
                <div v-if="i === 0" class="px-4 pb-4 pl-16">
                  <ul class="space-y-2 text-sm text-black/60">
                    <li v-for="item in feature.items" :key="item" class="flex items-start gap-2">
                      <span class="text-[#F4B942]">▪</span>
                      {{ item }}
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <!-- Pricing Comparison Table -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Pricing Comparison Table</h3>
            <div class="text-center mb-8">
              <h4 class="text-4xl font-normal text-black mb-3">Pricing plans</h4>
              <p class="text-black/60 text-base max-w-2xl mx-auto">
                Get started for free turning your web-based workflows into scalable operations without building your own browser infrastructure.
              </p>
            </div>
            <div class="border border-black/10 rounded-lg overflow-hidden bg-white">
              <table class="w-full">
                <thead>
                  <tr>
                    <th class="text-left p-5 font-medium text-black border-b border-black/10 bg-[#FAFAFA] w-[28%]">Plan Details</th>
                    <th class="p-5 text-center font-medium text-white border-b border-black/10 pricing-header">Free</th>
                    <th class="p-5 text-center font-medium text-white border-b border-black/10 pricing-header">Developer</th>
                    <th class="p-5 text-center font-medium text-white border-b border-black/10 pricing-header">Startup</th>
                    <th class="p-5 text-center font-medium text-white border-b border-black/10 pricing-header">Scale</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-black/10">
                  <tr class="hover:bg-black/[0.01]">
                    <td class="p-5">
                      <div class="text-base font-medium text-black">Price</div>
                    </td>
                    <td class="p-5 text-center text-base text-black">$0</td>
                    <td class="p-5 text-center text-base text-black">$20</td>
                    <td class="p-5 text-center text-base text-black">$99</td>
                    <td class="p-5 text-center text-base text-black">Custom</td>
                  </tr>
                  <tr class="hover:bg-black/[0.01]">
                    <td class="p-5">
                      <div class="text-base font-medium text-black">Browser Hours</div>
                    </td>
                    <td class="p-5 text-center text-base text-black">1</td>
                    <td class="p-5 text-center text-base text-black">100</td>
                    <td class="p-5 text-center text-base text-black">500</td>
                    <td class="p-5 text-center text-base text-black">Usage based</td>
                  </tr>
                  <tr class="hover:bg-black/[0.01]">
                    <td class="p-5">
                      <div class="text-base font-medium text-black">Proxy</div>
                      <div class="text-sm text-black/50 mt-1 leading-relaxed">You also have the ability to bring your own proxies if you would like!</div>
                    </td>
                    <td class="p-5 text-center text-base text-black">0 GB</td>
                    <td class="p-5 text-center text-base text-black">1 GB</td>
                    <td class="p-5 text-center text-base text-black">5 GB</td>
                    <td class="p-5 text-center text-base text-black">Usage based</td>
                  </tr>
                  <tr class="hover:bg-black/[0.01]">
                    <td class="p-5">
                      <div class="text-base font-medium text-black">Functions (Code Execution)</div>
                      <div class="text-sm text-black/50 mt-1 leading-relaxed">Free for all plans</div>
                    </td>
                    <td class="p-5 text-center text-base text-black">Free</td>
                    <td class="p-5 text-center text-base text-black">Free</td>
                    <td class="p-5 text-center text-base text-black">Free</td>
                    <td class="p-5 text-center text-base text-black">Free</td>
                  </tr>
                  <tr class="hover:bg-black/[0.01]">
                    <td class="p-5">
                      <div class="text-base font-medium text-black">Concurrency</div>
                    </td>
                    <td class="p-5 text-center text-base text-black">1</td>
                    <td class="p-5 text-center text-base text-black">25</td>
                    <td class="p-5 text-center text-base text-black">100</td>
                    <td class="p-5 text-center text-base text-black">250+</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

              <!-- Feature Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Feature Cards</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div v-for="(feature, i) in featureCards" :key="feature.title" class="border border-black rounded-lg p-6">
                <div class="w-2.5 h-2.5 rounded-sm mb-4" :style="`background: ${feature.color};`"></div>
                <h4 class="font-medium text-black mb-3">{{ feature.title }}</h4>
                <p class="text-sm text-black/60 leading-relaxed">{{ feature.description }}</p>
              </div>
            </div>
          </div>

          <!-- Use Cases Grid with Stats -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Use Cases Grid with Stats</h3>
            <div class="border border-black/20 rounded-lg p-8">
              <!-- Feature Grid -->
              <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-12">
                <div>
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #E8774A;"></div>
                    <h4 class="text-base font-bold text-black leading-tight">Automate Insurance Operations</h4>
                  </div>
                  <p class="text-sm text-black/70 leading-relaxed">
                    Handle eligibility checks, benefits verification, prior authorization requests, and provider credentialing across multiple payer portals without API limitations
                  </p>
                </div>
                <div>
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #E866A9;"></div>
                    <h4 class="text-base font-bold text-black leading-tight">Maintain Accurate Provider Directories</h4>
                  </div>
                  <p class="text-sm text-black/70 leading-relaxed">
                    Automatically update provider information, specialties, availability, and network status from hospital systems and insurance portals
                  </p>
                </div>
                <div>
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #F4B942;"></div>
                    <h4 class="text-base font-bold text-black leading-tight">Streamline Document Management</h4>
                  </div>
                  <p class="text-sm text-black/70 leading-relaxed">
                    Download and organize PDFs, EOBs, claims documents, and medical records from various payer portals
                  </p>
                </div>
                <div>
                  <div class="flex items-start gap-3 mb-3">
                    <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #9B87F5;"></div>
                    <h4 class="text-base font-bold text-black leading-tight">Monitor Regulatory Compliance</h4>
                  </div>
                  <p class="text-sm text-black/70 leading-relaxed">
                    Track changes in healthcare regulations, payer policies, formulary updates, and coverage guidelines across multiple sources
                  </p>
                </div>
              </div>
              
              <!-- Stats Row -->
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="border border-black/20 rounded overflow-hidden">
                  <div class="h-2" style="background: #FF4D00;"></div>
                  <div class="p-5">
                    <div class="text-4xl font-normal text-black mb-1">4.5<span class="text-2xl">hrs</span></div>
                    <p class="text-sm text-black/70">of maintenance time saved weekly</p>
                  </div>
                </div>
                <div class="border border-black/20 rounded overflow-hidden">
                  <div class="h-2" style="background: #9B87F5;"></div>
                  <div class="p-5">
                    <div class="text-4xl font-normal text-black mb-1">90<span class="text-2xl">%</span></div>
                    <p class="text-sm text-black/70">reduction in onboarding time</p>
                  </div>
                </div>
                <div class="border border-black/20 rounded overflow-hidden">
                  <div class="h-2" style="background: #F4B942;"></div>
                  <div class="p-5">
                    <div class="text-4xl font-normal text-black mb-1">97<span class="text-2xl">%</span></div>
                    <p class="text-sm text-black/70">reduction in issue diagnosis time</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Why Browserbase Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Why Browserbase Cards</h3>
            <div class="border border-black/20 rounded-lg p-8" style="background: #FAF8F6;">
              <h2 class="text-3xl font-normal text-black mb-8">Why Browserbase</h2>
              <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div class="border border-black/20 bg-white">
                  <div class="h-6" style="background-color: #2A2A2A; background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);"></div>
                  <div class="p-4 relative">
                    <div class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center" style="background: #F4B942; transform: translateY(-50%);">
                      <UIcon name="i-lucide-search" class="w-4 h-4 text-black" />
                    </div>
                    <h4 class="text-sm font-semibold text-black mb-1 pr-6">Access to non-API data sources</h4>
                    <p class="text-xs text-black/60">Without brittle hacks.</p>
                  </div>
                </div>
                <div class="border border-black/20 bg-white">
                  <div class="h-6" style="background-color: #2A2A2A; background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);"></div>
                  <div class="p-4 relative">
                    <div class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center" style="background: #4A90D9; transform: translateY(-50%);">
                      <UIcon name="i-lucide-check" class="w-4 h-4 text-white" />
                    </div>
                    <h4 class="text-sm font-semibold text-black mb-1 pr-6">Compliance-ready</h4>
                    <p class="text-xs text-black/60">SOC 2 Type II, full session isolation.</p>
                  </div>
                </div>
                <div class="border border-black/20 bg-white">
                  <div class="h-6" style="background-color: #2A2A2A; background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);"></div>
                  <div class="p-4 relative">
                    <div class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center" style="background: #9B87F5; transform: translateY(-50%);">
                      <UIcon name="i-lucide-shield" class="w-4 h-4 text-white" />
                    </div>
                    <h4 class="text-sm font-semibold text-black mb-1 pr-6">Operational resilience</h4>
                    <p class="text-xs text-black/60">Scrapers survive UI changes.</p>
                  </div>
                </div>
                <div class="border border-black/20 bg-white">
                  <div class="h-6" style="background-color: #2A2A2A; background-image: repeating-linear-gradient(45deg, transparent, transparent 1px, rgba(255,255,255,0.05) 1px, rgba(255,255,255,0.05) 2px);"></div>
                  <div class="p-4 relative">
                    <div class="absolute top-0 right-0 w-8 h-8 flex items-center justify-center" style="background: #7DD3A8; transform: translateY(-50%);">
                      <UIcon name="i-lucide-clock" class="w-4 h-4 text-black" />
                    </div>
                    <h4 class="text-sm font-semibold text-black mb-1 pr-6">Faster GTM</h4>
                    <p class="text-xs text-black/60">Launch data-powered workflows in days.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Stats Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Stats Cards</h3>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div v-for="stat in statCards" :key="stat.label" class="border border-black rounded-lg overflow-hidden">
                <div class="h-3" :style="`background: ${stat.borderColor};`"></div>
                <div class="p-6">
                  <div class="text-6xl font-normal text-black mb-3">{{ stat.value }}</div>
                  <p class="text-sm text-black/70">{{ stat.label }}</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Testimonial Cards with Colored Headers -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Testimonial Cards with Colored Headers</h3>
            <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
              <!-- Chronicle -->
              <div class="border border-black rounded overflow-hidden bg-white">
                <div class="h-16 flex items-center justify-center gap-2" style="background: #F4B942;">
                  <span class="font-semibold text-white text-lg">Chronicle</span>
                  <UIcon name="i-lucide-newspaper" class="w-5 h-5 text-white" />
                </div>
                <div class="p-6">
                  <p class="text-black leading-relaxed">"It's hard to measure peace of mind. The key is that I no longer have to think about this"</p>
                </div>
                <div class="px-6 py-4 border-t border-black/20">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <!-- benny -->
              <div class="border border-black rounded overflow-hidden bg-white">
                <div class="h-16 flex items-center justify-center gap-2" style="background: #9B87F5;">
                  <div class="w-6 h-6 bg-white rounded flex items-center justify-center">
                    <span class="font-bold text-[#9B87F5] text-sm">b</span>
                  </div>
                  <span class="font-semibold text-white text-lg">benny</span>
                </div>
                <div class="p-6">
                  <p class="text-black leading-relaxed">"I love the product. Browserbase has allowed us to abstract away the difficulties of getting data that traditionally doesn't have APIs"</p>
                </div>
                <div class="px-6 py-4 border-t border-black/20">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <!-- Vercel -->
              <div class="border border-black rounded overflow-hidden bg-white">
                <div class="h-16 flex items-center justify-center gap-2 bg-black">
                  <UIcon name="i-lucide-triangle" class="w-5 h-5 text-white fill-white" />
                  <span class="font-semibold text-white text-lg">Vercel</span>
                </div>
                <div class="p-6">
                  <p class="text-black leading-relaxed">"It's good to have someone reliable handling the browser management and CDN challenges so we can focus on the intelligence layer"</p>
                </div>
                <div class="px-6 py-4 border-t border-black/20">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              <!-- Convergence -->
              <div class="border border-black rounded overflow-hidden bg-white">
                <div class="h-16 flex items-center justify-center gap-2" style="background: #E866A9;">
                  <span class="font-semibold text-white text-lg">Convergence</span>
                  <UIcon name="i-lucide-flask-conical" class="w-5 h-5 text-white" />
                </div>
                <div class="p-6">
                  <p class="text-black leading-relaxed">"Our requests were treated seriously. You don't want to build a partnership where they just charge you and don't do anything."</p>
                </div>
                <div class="px-6 py-4 border-t border-black/20">
                  <button class="text-sm text-black flex items-center gap-2 hover:underline">
                    Read More <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Large Quote Section -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Large Quote Section</h3>
            <div class="border border-black/20 rounded-lg overflow-hidden" style="background: #FFF8F5;">
              <div class="p-8 md:p-12">
                <!-- Quote Box -->
                <div class="border border-black bg-white p-8 md:p-12">
                  <blockquote class="text-2xl md:text-3xl font-normal text-black leading-snug">
                    "XeroFlow transformed how we onboard clients. What used to take 3 days now takes 4 hours. The standardized templates ensure nothing falls through the cracks."
                  </blockquote>
                </div>
                <!-- Attribution -->
                <div class="flex justify-end -mt-px">
                  <div class="border border-black bg-white px-6 py-3 flex items-center gap-2">
                    <span class="text-black font-medium">Sarah Chen, CPA</span>
                    <UIcon name="i-lucide-badge-check" class="w-4 h-4 text-[#13B5EA]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Problem/Solution Cards -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Problem/Solution Cards</h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
              <!-- The Problem -->
              <div class="border border-black/20 rounded overflow-hidden">
                <div class="inline-block px-4 py-2 bg-[#2A2A2A] text-white text-sm font-medium">The problem</div>
                <div class="p-8">
                  <h3 class="text-2xl font-normal text-black mb-6 leading-tight">The hidden factory inside every company</h3>
                  <ul class="space-y-3">
                    <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Onboarding vendors across clunky portals.</span></li>
                    <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Pulling reports from legacy dashboards.</span></li>
                    <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Copying data from one SaaS app to another.</span></li>
                    <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Clicking through captchas, forms, and approvals.</span></li>
                  </ul>
                </div>
                <div class="h-64 bg-[#FFFBF0] relative overflow-hidden">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="w-64 bg-white border border-black/20 rounded shadow-lg">
                      <div class="h-8 bg-[#2A2A2A] flex items-center px-3 gap-1.5">
                        <div class="w-2.5 h-2.5 rounded-full bg-[#FF6B6B]"></div>
                        <div class="w-2.5 h-2.5 rounded-full bg-[#F4B942]"></div>
                        <div class="w-2.5 h-2.5 rounded-full bg-[#7DD3A8]"></div>
                      </div>
                      <div class="p-4 space-y-3">
                        <div class="h-3 bg-[#4A90D9] rounded w-full"></div>
                        <div class="h-3 bg-[#4A90D9] rounded w-3/4"></div>
                        <div class="border border-black/10 rounded p-2 flex justify-between items-center">
                          <span class="text-xs text-black/60">Verify</span>
                          <div class="w-4 h-4 border border-black/20 rounded flex items-center justify-center">
                            <UIcon name="i-lucide-check" class="w-3 h-3 text-black/60" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2">
                    <UIcon name="i-lucide-mouse-pointer-2" class="w-6 h-6 text-black/60" />
                  </div>
                </div>
              </div>

              <!-- The Solution -->
              <div class="border border-black/20 rounded overflow-hidden">
                <div class="inline-block px-4 py-2 bg-[#2A2A2A] text-white text-sm font-medium">The solution</div>
                <div class="p-8">
                  <h3 class="text-2xl font-normal text-black mb-6 leading-tight">How Browserbase changes the game</h3>
                  <ul class="space-y-3">
                    <li class="flex items-start gap-3">
                      <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                      <div><span class="font-medium text-black">Persistent sessions</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">stay logged in across runs.</span></div>
                    </li>
                    <li class="flex items-start gap-3">
                      <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                      <div><span class="font-medium text-black">Human-like navigation</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">click, scroll and interact without fragile hacks.</span></div>
                    </li>
                    <li class="flex items-start gap-3">
                      <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                      <div><span class="font-medium text-black">Form filling</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">eliminate typos and retries.</span></div>
                    </li>
                    <li class="flex items-start gap-3">
                      <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                      <div><span class="font-medium text-black">File handling at scale</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">upload, download and verify automatically.</span></div>
                    </li>
                  </ul>
                </div>
                <div class="h-64 bg-[#F4D9A3] relative overflow-hidden">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <div class="flex flex-col items-center gap-4">
                      <div class="bg-white border border-black/20 rounded px-4 py-2 flex items-center gap-2 shadow-sm">
                        <div class="w-5 h-5 bg-[#FF6B6B] rounded flex items-center justify-center text-white text-xs font-bold">B</div>
                        <span class="text-sm font-medium">Browserbase</span>
                      </div>
                      <div class="flex gap-4">
                        <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                          <UIcon name="i-lucide-video" class="w-4 h-4 text-[#00A4EF]" />
                          <span class="text-xs">Skype</span>
                        </div>
                        <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                          <UIcon name="i-lucide-linkedin" class="w-4 h-4 text-[#0077B5]" />
                          <span class="text-xs">LinkedIn</span>
                        </div>
                        <div class="bg-white border border-black/20 rounded px-3 py-2 shadow-sm">
                          <div class="w-8 h-4 flex gap-0.5">
                            <div class="flex-1 bg-black/10 rounded-sm"></div>
                            <div class="flex-1 bg-black/10 rounded-sm"></div>
                            <div class="flex-1 bg-black/10 rounded-sm"></div>
                          </div>
                        </div>
                      </div>
                      <div class="bg-white border-2 border-black rounded px-4 py-2 shadow-sm">
                        <span class="text-sm font-medium">Your systems</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Proof Section (Before/After) -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Proof Section (Before/After)</h3>
            <div class="max-w-4xl mx-auto">
              <!-- Title -->
              <h2 class="text-3xl font-normal text-black mb-8">Proof from the field</h2>

              <!-- Quote Card -->
              <div class="border border-black/20 rounded overflow-hidden mb-8">
                <div class="p-8 md:p-10 bg-[#F5F5F5]">
                  <p class="text-xl md:text-2xl text-black leading-relaxed">
                    "Creating the Browserbase and Stagehand automation saved days worth of work that would have been manual Playwright scripting."
                  </p>
                </div>
                <div class="px-8 py-4 border-t border-black/20 bg-white flex items-center gap-2">
                  <UIcon name="i-lucide-triangle" class="w-5 h-5 text-black fill-black" />
                  <span class="font-semibold text-black">Numeral</span>
                </div>
              </div>

              <!-- Before/After Labels -->
              <div class="grid grid-cols-2 gap-0 mb-0">
                <div class="px-4 pb-3">
                  <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">Before</span>
                </div>
                <div class="px-4 pb-3">
                  <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">After</span>
                </div>
              </div>

              <!-- Comparison Table -->
              <div class="border border-black/20 rounded overflow-hidden">
                <div class="grid grid-cols-2 border-b border-black/20">
                  <div class="p-6 flex items-start gap-4 bg-white">
                    <UIcon name="i-lucide-plus-square" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">Custom scripts for each state portal</span>
                  </div>
                  <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
                    <UIcon name="i-lucide-square" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">Natural language prompts navigate portals automatically</span>
                  </div>
                </div>
                <div class="grid grid-cols-2 border-b border-black/20">
                  <div class="p-6 flex items-start gap-4 bg-white">
                    <UIcon name="i-lucide-x" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">UI changes broke scripts</span>
                  </div>
                  <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
                    <UIcon name="i-lucide-arrow-right" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">AI adapts to changes without code updates</span>
                  </div>
                </div>
                <div class="grid grid-cols-2">
                  <div class="p-6 flex items-start gap-4 bg-white">
                    <UIcon name="i-lucide-clock" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">Days of maintenance</span>
                  </div>
                  <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
                    <UIcon name="i-lucide-clock" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
                    <span class="text-black">Just a few hours</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Case Study Card -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Case Study Card</h3>
            <div class="border border-black rounded-lg overflow-hidden flex flex-col md:flex-row">
              <div class="p-8 md:p-12 flex-1 flex items-center">
                <h4 class="text-3xl md:text-4xl font-normal text-black leading-tight">
                  How Live View Became Convergence's Secret Weapon
                </h4>
              </div>
              <div class="flex-1 flex flex-col">
                <div class="p-8 md:p-12 flex-1" style="background: #E8E0F7;">
                  <p class="text-black/80 leading-relaxed">
                    Web agent startup scales to 200,000 users before Salesforce acquisition, powered by Browserbase's human-in-the-loop capabilities
                  </p>
                </div>
                <div class="p-6 flex justify-end" style="background: #0a0a0a;">
                  <button class="px-8 py-3 bg-white text-black text-sm font-medium rounded hover:bg-white/90 transition-colors">
                    Learn more
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Buttons -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Buttons</h3>
            <div class="flex flex-wrap gap-4">
              <button class="px-6 py-2.5 bg-black text-white rounded text-sm font-medium hover:bg-black/80 transition-colors">
                Primary
              </button>
              <button class="px-6 py-2.5 border border-black rounded text-sm font-medium hover:bg-black hover:text-white transition-colors">
                Secondary
              </button>
              <button class="px-6 py-2.5 text-sm font-medium text-black/60 hover:text-black transition-colors flex items-center gap-2">
                Tertiary <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
              <button class="px-6 py-2.5 rounded text-sm font-medium text-black flex items-center gap-2" style="background: #F4B942;">
                Accent <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </div>

          <!-- Stats -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Stats</h3>
            <div class="grid grid-cols-4 gap-8 py-8 border-y border-black/10">
              <div v-for="stat in stats" :key="stat.label" class="text-center">
                <div class="text-4xl font-normal text-black mb-1">{{ stat.value }}</div>
                <div class="text-xs font-mono uppercase tracking-wider text-black/40">{{ stat.label }}</div>
              </div>
            </div>
          </div>

          <!-- Quote Block -->
          <div>
            <h3 class="text-sm font-mono uppercase tracking-wider text-black/40 mb-4">Quote Block</h3>
            <div class="rounded-lg p-12 text-center" style="background: #9B87F5;">
              <div class="max-w-2xl mx-auto bg-white rounded-lg p-8 shadow-lg">
                <p class="text-lg text-black leading-relaxed mb-6">
                  "Getting browsers sorted for our web agents could've been a never-ending battle, 
                  but the BB team has become like our in-house browser team."
                </p>
                <div class="flex items-center justify-center gap-2">
                  <span class="font-semibold text-black">- Structify</span>
                  <div class="w-4 h-4 rounded" style="background: #FF6B6B;"></div>
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      <!-- Patterns -->
      <section id="patterns">
        <h2 class="text-3xl font-normal text-black mb-8">Background Patterns</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="border border-black rounded-lg p-8 h-40 flex items-center justify-center bb-bg-checkered">
            <span class="relative text-sm font-mono uppercase tracking-wider text-black/40 bg-white px-2 py-1">Checkered (20px)</span>
          </div>
          <div class="border border-black rounded-lg p-8 h-40 flex items-center justify-center bb-bg-grid">
            <span class="relative text-sm font-mono uppercase tracking-wider text-black/40 bg-white px-2 py-1">Grid (40px)</span>
          </div>
          <div class="border border-black rounded-lg p-8 h-40 flex items-center justify-center bb-bg-dots">
            <span class="relative text-sm font-mono uppercase tracking-wider text-black/40 bg-white px-2 py-1">Dot Grid</span>
          </div>
          <div class="border border-black rounded-lg p-8 h-40 flex items-center justify-center bb-bg-grid-fine">
            <span class="relative text-sm font-mono uppercase tracking-wider text-black/40 bg-white px-2 py-1">Fine Grid</span>
          </div>
        </div>
      </section>

      <!-- 3D Cubes Reference -->
      <section>
        <h2 class="text-3xl font-normal text-black mb-8">3D Cube Colors</h2>
        <div class="flex flex-wrap gap-8 items-end">
          <div v-for="cube in cubes" :key="cube.color" class="text-center">
            <div class="w-16 h-16 mb-3 rounded-lg transform rotate-45 shadow-lg" :style="`background: ${cube.hex}; box-shadow: 4px 4px 0 rgba(0,0,0,0.2);`"></div>
            <div class="text-xs font-mono uppercase tracking-wider text-black/40">{{ cube.name }}</div>
            <div class="text-sm text-black">{{ cube.hex }}</div>
          </div>
        </div>
      </section>

      <!-- Footer (Xero Blue) -->
      <section>
        <h2 class="text-3xl font-normal text-black mb-8">Footer</h2>
        <div style="background: #13B5EA;" class="rounded-lg overflow-hidden">
          <div class="flex flex-col md:flex-row">
            <!-- Left side - Links -->
            <div class="flex-1 px-8 py-12 border-r border-white/20">
              <div class="grid grid-cols-3 gap-8">
                <div>
                  <h4 class="text-white font-semibold mb-4 text-sm">Product</h4>
                  <ul class="space-y-2">
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Features</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Templates</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Integrations</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Pricing</a></li>
                  </ul>
                </div>
                <div>
                  <h4 class="text-white font-semibold mb-4 text-sm">Resources</h4>
                  <ul class="space-y-2">
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Help Center</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Xero Setup Guide</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Template Library</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Blog</a></li>
                  </ul>
                </div>
                <div>
                  <h4 class="text-white font-semibold mb-4 text-sm">Company</h4>
                  <ul class="space-y-2">
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">About Us</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Careers</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Contact</a></li>
                    <li><a href="#" class="text-white/70 hover:text-white text-sm">Xero Partner Program</a></li>
                  </ul>
                </div>
              </div>
              <div class="mt-8 pt-6 border-t border-white/20 flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-6">
                  <a href="#" class="text-white/70 hover:text-white text-sm">Privacy policy</a>
                  <a href="#" class="text-white/70 hover:text-white text-sm">Terms of Service</a>
                </div>
                <div class="flex items-center gap-3">
                  <UIcon name="i-lucide-linkedin" class="w-5 h-5 text-white/70" />
                  <UIcon name="i-lucide-x" class="w-5 h-5 text-white/70" />
                  <UIcon name="i-lucide-instagram" class="w-5 h-5 text-white/70" />
                  <UIcon name="i-lucide-youtube" class="w-5 h-5 text-white/70" />
                </div>
              </div>
            </div>
            <!-- Right side - 3D Cube placeholder -->
            <div class="w-64 flex items-center justify-center px-8 py-12">
              <div class="w-24 h-24 bg-white rounded flex items-center justify-center">
                <span class="text-[#13B5EA] text-4xl font-bold">X</span>
              </div>
            </div>
          </div>
          <div class="px-8 pb-6">
            <span class="text-6xl font-bold text-white tracking-tight">XeroFlow</span>
          </div>
        </div>
      </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-black/10 py-8 mt-24">
      <div class="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-2">
          <div class="w-6 h-6 bg-black rounded flex items-center justify-center text-white font-bold text-xs">B</div>
          <span class="text-sm text-black/60">Browserbase Style Guide</span>
        </div>
        <p class="text-xs text-black/40">Based on screenshots from browserbase.com</p>
      </div>
    </footer>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

const pricingPlans = [
  {
    name: 'Free Plan',
    price: '$0/month',
    features: ['1 concurrent browser', '1 browser hour', '7 day retention'],
    cta: 'Sign Up',
    cubeColor: '#E866A9',
    featured: false,
    popular: false
  },
  {
    name: 'Developer Plan',
    price: '$20/month',
    features: ['25 concurrent browsers', '100 browser hours', '7 day retention'],
    cta: 'Sign Up',
    cubeColor: '#E866A9',
    featured: false,
    popular: false
  },
  {
    name: 'Startup Plan',
    price: '$99/month',
    features: ['100 concurrent browsers', '500 browser hours', '30 day retention'],
    cta: 'Sign Up',
    cubeColor: '#F4B942',
    featured: false,
    popular: true
  },
  {
    name: 'Scale Plan',
    price: 'Custom',
    features: ['250+ browsers', 'SSO available', 'HIPAA & DPA'],
    cta: 'Book a Demo',
    cubeColor: '#7DD3A8',
    featured: true,
    popular: false
  }
]

const faqs = [
  {
    question: 'What does Browserbase do?',
    answer: 'Browserbase is a cloud platform for browser automations. We provide production-ready infrastructure for running automated web browsers at scale.'
  },
  {
    question: 'What kinds of use cases do companies use Browserbase for?',
    answer: 'Companies use Browserbase for web scraping, automated testing, AI agent workflows, and data extraction from websites without APIs.'
  },
  {
    question: 'What tools might I use with or alongside Browserbase?',
    answer: 'Browserbase works with Playwright, Puppeteer, Selenium, and our own framework Stagehand.'
  }
]

const features = [
  {
    name: 'Seamless integration',
    icon: 'i-lucide-plug',
    items: [
      'Compatible with Playwright, Puppeteer, Selenium',
      'Integrate without changing existing code',
      'Chrome DevTools Protocol support'
    ]
  },
  { name: 'Scalable', icon: 'i-lucide-zap' },
  { name: 'Fast', icon: 'i-lucide-gauge' },
  { name: 'Secure', icon: 'i-lucide-shield' },
  { name: 'Observable', icon: 'i-lucide-eye' },
  { name: 'Stealth', icon: 'i-lucide-fingerprint' },
  { name: 'Extensible', icon: 'i-lucide-blocks' },
  { name: 'Developer First', icon: 'i-lucide-code-2' }
]

const stats = [
  { value: '95%', label: 'Faster' },
  { value: '10M+', label: 'Browsers' },
  { value: '99.9%', label: 'Uptime' },
  { value: '50ms', label: 'Latency' }
]

const cubes = [
  { name: 'Xero Blue', hex: '#13B5EA' },
  { name: 'Pink', hex: '#E866A9' },
  { name: 'Yellow', hex: '#F4B942' },
  { name: 'Green', hex: '#7DD3A8' },
  { name: 'Purple', hex: '#9B87F5' }
]

const featureCards = [
  {
    title: 'Smart Task Automation',
    color: '#13B5EA',
    description: 'Automatically generate task lists based on client type. From sole traders to multi-entity groups, every implementation gets the right checklist.'
  },
  {
    title: 'Progress Dashboard',
    color: '#FF6B6B',
    description: 'See all your client implementations at a glance. Know exactly which clients need attention and what tasks are blocking progress.'
  },
  {
    title: 'Template Library',
    color: '#9B87F5',
    description: 'Build reusable implementation templates for different industries. Retail, professional services, construction—each with industry-specific tasks.'
  },
  {
    title: 'Client Collaboration',
    color: '#E866A9',
    description: 'Invite clients to view their implementation progress. They can see what is completed, what is next, and upload documents directly to specific tasks.'
  }
]

const statCards = [
  {
    value: '50+',
    label: 'clients onboarded per month with XeroFlow',
    borderColor: '#13B5EA'
  },
  {
    value: '500+',
    label: 'hours saved on repetitive setup tasks',
    borderColor: '#F4B942'
  },
  {
    value: '0',
    label: 'clients lost due to onboarding delays',
    borderColor: '#7DD3A8'
  }
]

const testimonialCards = [
  {
    quote: "XeroFlow transformed how we onboard clients. What used to take 3 days now takes 4 hours.",
    company: 'Summit CPAs',
    logoIcon: 'i-lucide-building-2',
    logoStyle: 'color: #13B5EA;'
  },
  {
    quote: "The client portal is a game-changer. Our clients love seeing their progress in real-time.",
    company: 'BookSmart',
    logoIcon: 'i-lucide-book-check',
    logoStyle: 'color: #9B87F5;'
  },
  {
    quote: "We reduced implementation errors by 90%. The checklist system is bulletproof.",
    company: 'Cloud Advisors',
    logoIcon: 'i-lucide-trending-up',
    logoStyle: 'color: #13B5EA; font-weight: 600;'
  }
]
</script>

<style>
/* Custom styles for the light mode aesthetic */
html {
  scroll-behavior: smooth;
}

/* Override any dark mode styles */
:root {
  color-scheme: light;
}

/* Details/summary styling */
details > summary::-webkit-details-marker {
  display: none;
}

/* Pricing table header with diagonal texture */
.pricing-header {
  background-color: #2A2A2A;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2px,
    rgba(255,255,255,0.03) 2px,
    rgba(255,255,255,0.03) 4px
  );
}

/* Grid Backgrounds */
.bb-bg-grid {
  background-color: #ffffff;
  background-image: 
    linear-gradient(rgba(0, 0, 0, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px);
  background-size: 40px 40px;
}

.bb-bg-checkered {
  background-color: #ffffff;
  background-image: 
    linear-gradient(rgba(0, 0, 0, 0.06) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.06) 1px, transparent 1px);
  background-size: 24px 24px;
}

.bb-bg-dots {
  background-color: #ffffff;
  background-image: radial-gradient(circle, rgba(0, 0, 0, 0.12) 1.5px, transparent 1.5px);
  background-size: 24px 24px;
}

.bb-bg-grid-fine {
  background-color: #ffffff;
  background-image: 
    linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px);
  background-size: 10px 10px;
}
</style>
