<template>
  <div class="bb-light min-h-screen">
    <!-- Navigation -->
    <nav class="bb-nav sticky top-0 z-50">
      <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="w-8 h-8 bg-[#13B5EA] rounded flex items-center justify-center text-white font-bold text-sm">X</div>
          <span class="font-semibold">XeroFlow</span>
        </div>
        <div class="hidden md:flex items-center gap-8">
          <a href="#" class="bb-nav-link">Features</a>
          <a href="#" class="bb-nav-link">Implementation</a>
          <a href="#" class="bb-nav-link">Pricing</a>
          <a href="#" class="bb-nav-link">About</a>
        </div>
        <div class="flex items-center gap-3">
          <button class="bb-btn bb-btn-ghost">Log in</button>
          <button class="bb-btn bb-btn-primary">Sign Up</button>
        </div>
      </div>
    </nav>

    <!-- Hero -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <!-- Left Content -->
          <div>
            <h1 class="text-5xl md:text-6xl font-normal text-black leading-tight mb-6">
              Streamline your Xero implementations.
            </h1>
            <p class="text-lg text-black/70 leading-relaxed mb-8 max-w-xl">
              XeroFlow is the all-in-one task manager for Xero implementation specialists. Automate client onboarding, track progress across multiple implementations, and deliver consistent, error-free setups every time.
            </p>
            <button class="px-8 py-4 bg-[#FF4D00] text-white font-medium rounded hover:bg-[#E64500] transition-colors">
              Get a Demo
            </button>
          </div>
          
          <!-- Right Content - Browser Mockup -->
          <div class="relative">
            <div class="border border-black/20 rounded-lg overflow-hidden bg-[#FFFBF0]">
              <!-- Browser Header -->
              <div class="h-10 bg-[#2A2A2A] flex items-center px-4 gap-2">
                <div class="w-3 h-3 rounded-full bg-[#FF6B6B]"></div>
                <div class="w-3 h-3 rounded-full bg-[#F4B942]"></div>
                <div class="w-3 h-3 rounded-full bg-[#7DD3A8]"></div>
              </div>
              <!-- Browser Content -->
              <div class="p-8 relative">
                <!-- Task Tab -->
                <div class="inline-block border border-black/20 border-b-0 bg-white px-4 py-2 text-sm font-medium text-black">
                  Implementation Tasks
                </div>
                <!-- Task List -->
                <div class="border border-black/20 bg-white p-6 -mt-0">
                  <!-- Progress Bar -->
                  <div class="flex justify-between items-center mb-4">
                    <span class="text-xs text-black/60">Acme Consulting</span>
                    <div class="w-24 h-2 bg-black/10 rounded-full overflow-hidden">
                      <div class="w-3/4 h-full bg-[#13B5EA] rounded-full"></div>
                    </div>
                  </div>
                  <!-- Task Items -->
                  <div class="space-y-2">
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                      <span class="text-sm text-black/60 line-through">Chart of accounts setup</span>
                    </div>
                    <div class="flex items-center gap-2">
                      <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                      <span class="text-sm text-black/60 line-through">Bank feeds connected</span>
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
    </section>

    <!-- Use Cases Grid -->
    <section class="py-16 px-6 bg-white border-b border-black/10">
      <div class="max-w-6xl mx-auto">
        <!-- Feature Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8 mb-16">
          <!-- Streamline Client Onboarding -->
          <div>
            <div class="flex items-start gap-3 mb-4">
              <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #13B5EA;"></div>
              <h3 class="text-lg font-bold text-black leading-tight">Streamline Client Onboarding</h3>
            </div>
            <p class="text-sm text-black/70 leading-relaxed">
              Automate repetitive setup tasks like chart of accounts configuration, bank feed connections, and user permissions. Complete Xero setups in hours, not days.
            </p>
          </div>
          
          <!-- Track Multiple Implementations -->
          <div>
            <div class="flex items-start gap-3 mb-4">
              <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #E866A9;"></div>
              <h3 class="text-lg font-bold text-black leading-tight">Track Multiple Implementations</h3>
            </div>
            <p class="text-sm text-black/70 leading-relaxed">
              Manage dozens of client implementations simultaneously. Visual dashboards show exactly where each client is in their onboarding journey.
            </p>
          </div>
          
          <!-- Standardize Your Process -->
          <div>
            <div class="flex items-start gap-3 mb-4">
              <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #F4B942;"></div>
              <h3 class="text-lg font-bold text-black leading-tight">Standardize Your Process</h3>
            </div>
            <p class="text-sm text-black/70 leading-relaxed">
              Create reusable task templates for different client types. Ensure every implementation follows your best practices with built-in checklists.
            </p>
          </div>
          
          <!-- Collaborate with Clients -->
          <div>
            <div class="flex items-start gap-3 mb-4">
              <div class="w-2 h-2 rounded-sm mt-2.5 shrink-0" style="background: #7DD3A8;"></div>
              <h3 class="text-lg font-bold text-black leading-tight">Collaborate with Clients</h3>
            </div>
            <p class="text-sm text-black/70 leading-relaxed">
              Share progress with clients and assign them tasks. Keep everyone aligned with automated reminders and clear next steps.
            </p>
          </div>
        </div>
        
        <!-- Stats Row -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
          <!-- 12hrs -->
          <div class="border border-black/20 rounded-lg overflow-hidden bg-white">
            <div class="h-2" style="background: #13B5EA;"></div>
            <div class="p-6">
              <div class="text-5xl font-normal text-black mb-2">12<span class="text-3xl">hrs</span></div>
              <p class="text-sm text-black/70">saved per Xero implementation</p>
            </div>
          </div>
          
          <!-- 85% -->
          <div class="border border-black/20 rounded-lg overflow-hidden bg-white">
            <div class="h-2" style="background: #E866A9;"></div>
            <div class="p-6">
              <div class="text-5xl font-normal text-black mb-2">85<span class="text-3xl">%</span></div>
              <p class="text-sm text-black/70">faster client onboarding</p>
            </div>
          </div>
          
          <!-- 3x -->
          <div class="border border-black/20 rounded-lg overflow-hidden bg-white">
            <div class="h-2" style="background: #F4B942;"></div>
            <div class="p-6">
              <div class="text-5xl font-normal text-black mb-2">3<span class="text-3xl">x</span></div>
              <p class="text-sm text-black/70">more clients managed</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Large Quote Section -->
    <section class="py-16 px-6" style="background: #FFF8F5;">
      <div class="max-w-5xl mx-auto">
        <!-- Quote Box -->
        <div class="border border-black bg-white p-12 md:p-16">
          <blockquote class="text-3xl md:text-4xl font-normal text-black leading-snug">
            "XeroFlow transformed how we onboard clients. What used to take 3 days now takes 4 hours. The standardized templates ensure nothing falls through the cracks."
          </blockquote>
        </div>
        <!-- Attribution -->
        <div class="flex justify-end -mt-px">
          <div class="border border-black bg-white px-8 py-4 flex items-center gap-2">
            <span class="text-black font-medium">Sarah Chen, CPA</span>
            <UIcon name="i-lucide-badge-check" class="w-4 h-4 text-[#13B5EA]" />
          </div>
        </div>
      </div>
    </section>

    <!-- Why XeroFlow -->
    <section class="py-24 px-6" style="background: #FAF8F6;">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-4xl font-normal text-black mb-12">Why XeroFlow</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6">
          <!-- Built for Xero -->
          <div class="border border-black/20 bg-white">
            <!-- Diagonal textured header -->
            <div class="h-6 pricing-header-sm"></div>
            <div class="p-6 relative">
              <!-- Xero blue icon box -->
              <div class="absolute top-0 right-0 w-10 h-10 flex items-center justify-center" style="background: #13B5EA; transform: translateY(-50%);">
                <UIcon name="i-lucide-award" class="w-5 h-5 text-white" />
              </div>
              <h3 class="text-base font-semibold text-black mb-2 pr-8">Built for Xero</h3>
              <p class="text-sm text-black/60">Purpose-built for Xero implementation specialists.</p>
            </div>
          </div>
          
          <!-- Accountant Approved -->
          <div class="border border-black/20 bg-white">
            <div class="h-6 pricing-header-sm"></div>
            <div class="p-6 relative">
              <!-- Green icon box -->
              <div class="absolute top-0 right-0 w-10 h-10 flex items-center justify-center" style="background: #7DD3A8; transform: translateY(-50%);">
                <UIcon name="i-lucide-check" class="w-5 h-5 text-white" />
              </div>
              <h3 class="text-base font-semibold text-black mb-2 pr-8">Accountant Approved</h3>
              <p class="text-sm text-black/60">Designed with input from 100+ accounting firms.</p>
            </div>
          </div>
          
          <!-- Scales With You -->
          <div class="border border-black/20 bg-white">
            <div class="h-6 pricing-header-sm"></div>
            <div class="p-6 relative">
              <!-- Purple icon box -->
              <div class="absolute top-0 right-0 w-10 h-10 flex items-center justify-center" style="background: #9B87F5; transform: translateY(-50%);">
                <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-white" />
              </div>
              <h3 class="text-base font-semibold text-black mb-2 pr-8">Scales With You</h3>
              <p class="text-sm text-black/60">From solo bookkeepers to 100-person firms.</p>
            </div>
          </div>
          
          <!-- Always Improving -->
          <div class="border border-black/20 bg-white">
            <div class="h-6 pricing-header-sm"></div>
            <div class="p-6 relative">
              <!-- Yellow icon box -->
              <div class="absolute top-0 right-0 w-10 h-10 flex items-center justify-center" style="background: #F4B942; transform: translateY(-50%);">
                <UIcon name="i-lucide-sparkles" class="w-5 h-5 text-black" />
              </div>
              <h3 class="text-base font-semibold text-black mb-2 pr-8">Always Improving</h3>
              <p class="text-sm text-black/60">New features weekly based on your feedback.</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Trusted By -->
    <section class="py-12 px-6 border-y border-black/10">
      <div class="max-w-6xl mx-auto text-center">
        <p class="bb-text-label mb-8">Trusted by accounting firms and Xero partners worldwide</p>
        <div class="flex items-center justify-center gap-12 opacity-40">
          <span class="text-xl font-semibold text-black/60">Grant Thornton</span>
          <span class="text-xl font-semibold text-black/60">BDO</span>
          <span class="text-xl font-semibold text-black/60">RSM</span>
          <span class="text-xl font-semibold text-black/60">Mazars</span>
          <span class="text-xl font-semibold text-black/60">Crowe</span>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="py-24 px-6 bb-bg-checkered">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start">
          <!-- 3D Cubes Visual -->
          <div class="relative h-96 bg-white border border-black/10 rounded-lg flex items-center justify-center">
            <div class="absolute inset-0 flex items-center justify-center">
              <div class="w-32 h-32 bg-[#7DD3A8] rounded-lg transform rotate-45 translate-x-8 translate-y-8 shadow-lg" style="box-shadow: 8px 8px 0 rgba(0,0,0,0.2);"></div>
              <div class="w-32 h-32 bg-[#4A90D9] rounded-lg transform rotate-45 -translate-x-4 translate-y-4 shadow-lg" style="box-shadow: 8px 8px 0 rgba(0,0,0,0.2);"></div>
              <div class="w-32 h-32 bg-[#F4B942] rounded-lg transform rotate-45 -translate-x-12 -translate-y-4 shadow-lg" style="box-shadow: 8px 8px 0 rgba(0,0,0,0.2);"></div>
            </div>
          </div>

          <!-- Feature List -->
          <div class="bb-feature-list">
            <div v-for="(feature, i) in features" :key="feature.name" 
              class="bb-feature-item"
              :class="{ active: i === 0 }">
              <div class="bb-feature-header">
                <div class="bb-feature-icon" :class="{ active: i === 0 }">
                  <UIcon :name="feature.icon" class="w-4 h-4" :class="i === 0 ? 'text-black' : 'text-black/60'" />
                </div>
                <span class="font-medium">{{ feature.name }}</span>
              </div>
              <div v-if="i === 0" class="bb-feature-content">
                <ul>
                  <li v-for="item in feature.items" :key="item">{{ item }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Case Study Card -->
    <section class="py-24 px-6 bg-[#FAFAFA]">
      <div class="max-w-5xl mx-auto">
        <div class="border border-black rounded-lg overflow-hidden flex flex-col md:flex-row bg-white">
          <div class="p-8 md:p-12 flex-1 flex items-center">
            <h4 class="text-3xl md:text-4xl font-normal text-black leading-tight">
              How Thompson & Co Doubled Their Client Capacity
            </h4>
          </div>
          <div class="flex-1 flex flex-col">
            <div class="p-8 md:p-12 flex-1" style="background: #E8E0F7;">
              <p class="text-black/80 leading-relaxed text-lg">
                A 12-person accounting firm scaled from 50 to 120 Xero implementations per month using XeroFlow's standardized templates and automated workflows
              </p>
            </div>
            <div class="p-6 flex justify-end" style="background: #0a0a0a;">
              <button class="px-8 py-3 bg-white text-black text-sm font-medium rounded hover:bg-white/90 transition-colors">
                Read the case study
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Problem/Solution Section -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <!-- The Problem -->
          <div class="border border-black/20 rounded overflow-hidden">
            <div class="inline-block px-4 py-2 bg-[#2A2A2A] text-white text-sm font-medium">The problem</div>
            <div class="p-8">
              <h3 class="text-2xl font-normal text-black mb-6 leading-tight">Xero implementations are chaotic</h3>
              <ul class="space-y-3">
                <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Spreadsheets and emails to track client progress.</span></li>
                <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Inconsistent setup processes across team members.</span></li>
                <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Clients asking "what is next" and "when will it be done."</span></li>
                <li class="flex items-start gap-3"><span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span><span class="text-black/70">Important steps forgotten, leading to rework.</span></li>
              </ul>
            </div>
            <div class="h-64 bg-[#FFFBF0] relative overflow-hidden">
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="w-64 bg-white border border-black/20 rounded shadow-lg p-4">
                  <div class="flex items-center gap-2 mb-3">
                    <UIcon name="i-lucide-file-spreadsheet" class="w-5 h-5 text-[#7DD3A8]" />
                    <span class="text-sm font-medium">Client Tracking.xlsx</span>
                  </div>
                  <div class="space-y-2">
                    <div class="h-2 bg-black/10 rounded w-full"></div>
                    <div class="h-2 bg-black/10 rounded w-3/4"></div>
                    <div class="h-2 bg-black/10 rounded w-5/6"></div>
                  </div>
                  <div class="mt-4 flex items-center gap-2 text-xs text-black/60">
                    <UIcon name="i-lucide-alert-circle" class="w-4 h-4 text-[#FF6B6B]" />
                    <span>Last updated: 3 weeks ago</span>
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
              <h3 class="text-2xl font-normal text-black mb-6 leading-tight">How XeroFlow changes everything</h3>
              <ul class="space-y-3">
                <li class="flex items-start gap-3">
                  <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                  <div><span class="font-medium text-black">Smart templates</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">ensure consistent, complete setups every time.</span></div>
                </li>
                <li class="flex items-start gap-3">
                  <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                  <div><span class="font-medium text-black">Visual dashboards</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">show exactly where every client stands.</span></div>
                </li>
                <li class="flex items-start gap-3">
                  <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                  <div><span class="font-medium text-black">Client portal</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">keeps clients informed and engaged.</span></div>
                </li>
                <li class="flex items-start gap-3">
                  <span class="w-1.5 h-1.5 bg-black rounded-sm mt-2"></span>
                  <div><span class="font-medium text-black">Automated reminders</span><UIcon name="i-lucide-arrow-right" class="w-3.5 h-3.5 inline mx-1 text-black/40" /><span class="text-black/70">so no task ever falls through the cracks.</span></div>
                </li>
              </ul>
            </div>
            <div class="h-64 bg-[#E8F5E9] relative overflow-hidden">
              <div class="absolute inset-0 flex items-center justify-center">
                <div class="flex flex-col items-center gap-4">
                  <div class="bg-white border border-black/20 rounded px-4 py-2 flex items-center gap-2 shadow-sm">
                    <div class="w-5 h-5 bg-[#13B5EA] rounded flex items-center justify-center text-white text-xs font-bold">X</div>
                    <span class="text-sm font-medium">XeroFlow</span>
                  </div>
                  <div class="flex gap-4">
                    <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                      <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                      <span class="text-xs">Chart of Accounts</span>
                    </div>
                    <div class="bg-white border border-black/20 rounded px-3 py-2 flex items-center gap-1.5 shadow-sm">
                      <UIcon name="i-lucide-check-circle" class="w-4 h-4 text-[#7DD3A8]" />
                      <span class="text-xs">Bank Feeds</span>
                    </div>
                    <div class="bg-white border border-black/20 rounded px-3 py-2 shadow-sm">
                      <UIcon name="i-lucide-circle" class="w-4 h-4 text-[#13B5EA]" />
                      <span class="text-xs">Invoicing</span>
                    </div>
                  </div>
                  <div class="bg-white border-2 border-black rounded px-4 py-2 shadow-sm">
                    <span class="text-sm font-medium">Your clients</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Quote Section -->
    <section class="bb-quote-section">
      <div class="bb-quote-card">
        <p class="bb-quote-text">
          "Before XeroFlow, we were drowning in spreadsheets and Post-it notes trying to track 
          client implementations. Now we have complete visibility across all our onboarding projects. 
          Our team can finally focus on advising clients instead of managing chaos."
        </p>
        <div class="bb-quote-author">
          <span>- Marcus Thompson, Cloud Accounting Partners</span>
          <div class="w-4 h-4 rounded bg-[#13B5EA]"></div>
        </div>
      </div>
    </section>

    <!-- Feature Cards -->
    <section class="py-24 px-6">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div v-for="feature in featureCards" :key="feature.title" class="border border-black rounded-lg p-6">
            <div class="w-2.5 h-2.5 rounded-sm mb-4" :style="`background: ${feature.color}`"></div>
            <h4 class="font-medium text-black mb-3">{{ feature.title }}</h4>
            <p class="text-sm text-black/60 leading-relaxed">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </section>

    <!-- Stats Cards -->
    <section class="py-16 px-6 border-y border-black/10 bg-[#FAFAFA]">
      <div class="max-w-5xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div v-for="stat in statCards" :key="stat.label" class="border border-black rounded-lg overflow-hidden bg-white">
            <div class="h-3" :style="`background: ${stat.borderColor}`"></div>
            <div class="p-6">
              <div class="text-6xl font-normal text-black mb-3">{{ stat.value }}</div>
              <p class="text-sm text-black/70">{{ stat.label }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Proof Section -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-4xl mx-auto">
        <!-- Title -->
        <h2 class="text-3xl font-normal text-black mb-8">Real results from real firms</h2>

        <!-- Quote Card -->
        <div class="border border-black/20 rounded overflow-hidden mb-8">
          <div class="p-8 md:p-10 bg-[#F5F5F5]">
            <p class="text-xl md:text-2xl text-black leading-relaxed">
              "XeroFlow paid for itself in the first month. We have cut our implementation time by 60 percent and our clients are happier because they always know what is happening."
            </p>
          </div>
          <div class="px-8 py-4 border-t border-black/20 bg-white flex items-center gap-2">
            <UIcon name="i-lucide-building-2" class="w-5 h-5 text-black" />
            <span class="font-semibold text-black">Westside Accounting Group</span>
          </div>
        </div>

        <!-- Before/After Labels -->
        <div class="grid grid-cols-2 gap-0 mb-0">
          <div class="px-4 pb-3">
            <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">Before XeroFlow</span>
          </div>
          <div class="px-4 pb-3">
            <span class="inline-block px-4 py-2 bg-[#C4C4C4] text-black text-sm font-medium">After XeroFlow</span>
          </div>
        </div>

        <!-- Comparison Table -->
        <div class="border border-black/20 rounded overflow-hidden">
          <div class="grid grid-cols-2 border-b border-black/20">
            <div class="p-6 flex items-start gap-4 bg-white">
              <UIcon name="i-lucide-x" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
              <span class="text-black">2-3 days to complete Xero setup per client</span>
            </div>
            <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
              <UIcon name="i-lucide-check" class="w-5 h-5 text-[#7DD3A8] mt-0.5 flex-shrink-0" />
              <span class="text-black">4-6 hours with automated task workflows</span>
            </div>
          </div>
          <div class="grid grid-cols-2 border-b border-black/20">
            <div class="p-6 flex items-start gap-4 bg-white">
              <UIcon name="i-lucide-x" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
              <span class="text-black">Constant back-and-forth emails with clients</span>
            </div>
            <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
              <UIcon name="i-lucide-check" class="w-5 h-5 text-[#7DD3A8] mt-0.5 flex-shrink-0" />
              <span class="text-black">Clients self-serve through the portal</span>
            </div>
          </div>
          <div class="grid grid-cols-2">
            <div class="p-6 flex items-start gap-4 bg-white">
              <UIcon name="i-lucide-x" class="w-5 h-5 text-black mt-0.5 flex-shrink-0" />
              <span class="text-black">Missed steps and inconsistent setups</span>
            </div>
            <div class="p-6 flex items-start gap-4 bg-[#FAF8F6] border-l border-black/20">
              <UIcon name="i-lucide-check" class="w-5 h-5 text-[#7DD3A8] mt-0.5 flex-shrink-0" />
              <span class="text-black">Standardized templates ensure completeness</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Pricing -->
    <section class="py-24 px-6 bg-[#FAFAFA]">
      <div class="max-w-6xl mx-auto">
        <div class="text-center mb-16">
          <h2 class="bb-text-title mb-4">Power your automations</h2>
          <p class="bb-text-subtitle">with flexible, usage-based pricing.</p>
        </div>

        <!-- Pricing Cards -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-16">
          <div v-for="(plan, i) in pricingPlans" :key="plan.name" 
            class="bb-pricing text-center"
            :class="{ 
              'bb-pricing-popular': plan.popular,
              'bb-pricing-featured': plan.featured 
            }">
            <!-- Cube -->
            <div class="h-20 flex items-center justify-center mb-4">
              <div class="bb-cube" :style="`background: ${plan.cubeColor};`"></div>
            </div>

            <h3 class="text-sm font-medium mb-1" :class="plan.featured ? 'text-white/70' : 'text-black/60'">{{ plan.name }}</h3>
            <div class="text-3xl font-normal mb-6">{{ plan.price }}</div>

            <ul class="space-y-3 mb-6 text-sm">
              <li v-for="feature in plan.features" :key="feature" 
                class="py-2 border-b"
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

        <!-- Pricing Comparison Table -->
        <div class="text-center mb-8">
          <h3 class="text-4xl font-normal text-black mb-3">Pricing plans</h3>
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
                  <div class="text-sm text-black/50 mt-1 leading-relaxed">You also have the ability to bring your own proxies!</div>
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
    </section>

    <!-- What Our Clients Say / Testimonials -->
    <section class="py-24 px-6 bg-[#F5F5F5]">
      <div class="max-w-6xl mx-auto">
        <h2 class="text-4xl md:text-5xl font-normal text-black mb-12">What Our Clients Say</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <!-- CPA Firm -->
          <div class="border border-black rounded overflow-hidden bg-white">
            <div class="h-16 flex items-center justify-center gap-2" style="background: #13B5EA;">
              <UIcon name="i-lucide-building-2" class="w-5 h-5 text-white" />
              <span class="font-semibold text-white text-lg">Summit CPAs</span>
            </div>
            <div class="p-6">
              <p class="text-black leading-relaxed">"We went from onboarding 10 clients a month to 35. XeroFlow's templates ensure every setup is perfect."</p>
            </div>
            <div class="px-6 py-4 border-t border-black/20">
              <button class="text-sm text-black flex items-center gap-2 hover:underline">
                Read Case Study <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <!-- Bookkeeping -->
          <div class="border border-black rounded overflow-hidden bg-white">
            <div class="h-16 flex items-center justify-center gap-2" style="background: #9B87F5;">
              <div class="w-6 h-6 bg-white rounded flex items-center justify-center">
                <span class="font-bold text-[#9B87F5] text-sm">B</span>
              </div>
              <span class="font-semibold text-white text-lg">BookSmart</span>
            </div>
            <div class="p-6">
              <p class="text-black leading-relaxed">"The client portal is a game-changer. Our clients love seeing their progress in real-time."</p>
            </div>
            <div class="px-6 py-4 border-t border-black/20">
              <button class="text-sm text-black flex items-center gap-2 hover:underline">
                Read Case Study <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <!-- Advisory -->
          <div class="border border-black rounded overflow-hidden bg-white">
            <div class="h-16 flex items-center justify-center gap-2 bg-black">
              <UIcon name="i-lucide-trending-up" class="w-5 h-5 text-white" />
              <span class="font-semibold text-white text-lg">Cloud Advisors</span>
            </div>
            <div class="p-6">
              <p class="text-black leading-relaxed">"We reduced implementation errors by 90%. The checklist system is bulletproof."</p>
            </div>
            <div class="px-6 py-4 border-t border-black/20">
              <button class="text-sm text-black flex items-center gap-2 hover:underline">
                Read Case Study <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <!-- Multi-service Firm -->
          <div class="border border-black rounded overflow-hidden bg-white">
            <div class="h-16 flex items-center justify-center gap-2" style="background: #E866A9;">
              <span class="font-semibold text-white text-lg">Allied Group</span>
              <UIcon name="i-lucide-users" class="w-5 h-5 text-white" />
            </div>
            <div class="p-6">
              <p class="text-black leading-relaxed">"The team collaboration features are incredible. Everyone knows what to work on next."</p>
            </div>
            <div class="px-6 py-4 border-t border-black/20">
              <button class="text-sm text-black flex items-center gap-2 hover:underline">
                Read Case Study <UIcon name="i-lucide-arrow-right" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- FAQ -->
    <section class="py-24 px-6 bg-white">
      <div class="max-w-6xl mx-auto">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-12">
          <div>
            <h2 class="text-5xl font-normal text-black">FAQs</h2>
          </div>
          <div class="space-y-4">
            <div class="border border-black rounded overflow-hidden" style="background: #E8F5E9;">
              <details open class="group">
                <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span class="font-medium text-black text-lg">What is XeroFlow?</span>
                  <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-[#7DD3A8]">
                    <UIcon name="i-lucide-minus" class="w-5 h-5 text-black" />
                  </div>
                </summary>
                <div class="px-6 pb-6 text-black/80 leading-relaxed">
                  XeroFlow is a task management platform built specifically for Xero implementation specialists. It helps accounting firms and bookkeepers streamline client onboarding with customizable templates, progress tracking, and client collaboration tools. We integrate directly with Xero to automate setup tasks and keep everyone aligned.
                </div>
              </details>
            </div>
            <div class="border border-black rounded overflow-hidden bg-white">
              <details class="group">
                <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span class="font-medium text-black text-lg">Who is XeroFlow for?</span>
                  <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-white group-open:bg-[#7DD3A8]">
                    <UIcon name="i-lucide-plus" class="w-5 h-5 text-black group-open:hidden" />
                    <UIcon name="i-lucide-minus" class="w-5 h-5 text-black hidden group-open:block" />
                  </div>
                </summary>
                <div class="px-6 pb-6 text-black/80 leading-relaxed">
                  XeroFlow is designed for accounting firms, bookkeeping practices, and Xero implementation consultants. Whether you are a solo bookkeeper or a 100-person firm, if you help clients set up and configure Xero, XeroFlow will save you time and help you deliver better implementations.
                </div>
              </details>
            </div>
            <div class="border border-black rounded overflow-hidden bg-white">
              <details class="group">
                <summary class="flex items-center justify-between p-6 cursor-pointer list-none">
                  <span class="font-medium text-black text-lg">Does XeroFlow integrate with Xero?</span>
                  <div class="w-10 h-10 border border-black rounded flex items-center justify-center bg-white group-open:bg-[#7DD3A8]">
                    <UIcon name="i-lucide-plus" class="w-5 h-5 text-black group-open:hidden" />
                    <UIcon name="i-lucide-minus" class="w-5 h-5 text-black hidden group-open:block" />
                  </div>
                </summary>
                <div class="px-6 pb-6 text-black/80 leading-relaxed">
                  Yes! XeroFlow integrates directly with the Xero API. This allows us to automate many setup tasks like configuring chart of accounts, connecting bank feeds, and setting up users. We also integrate with popular tools like Google Workspace, Microsoft 365, and practice management systems.
                </div>
              </details>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- CTA -->
    <section class="py-24 px-6 text-center bb-bg-checkered">
      <div class="max-w-2xl mx-auto">
        <div class="w-16 h-16 mx-auto mb-6 rounded-lg bg-[#13B5EA] transform rotate-45 shadow-lg" style="box-shadow: 6px 6px 0 rgba(0,0,0,0.2);"></div>
        <h2 class="bb-text-title mb-4">Ready to transform your Xero implementations?</h2>
        <p class="bb-text-body mb-8">Join hundreds of accounting firms delivering faster, better client onboarding.</p>
        <div class="flex items-center justify-center gap-3">
          <button class="bb-btn bb-btn-primary px-8 py-3" style="background: #13B5EA;">Start Free Trial</button>
          <button class="bb-btn bb-btn-accent px-8 py-3 flex items-center gap-2">
            Book a Demo <UIcon name="i-lucide-calendar" class="w-4 h-4" />
          </button>
        </div>
      </div>
    </section>

    <!-- CTA Section -->
    <section class="py-24 px-6 bb-bg-checkered">
      <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
        <h2 class="text-4xl md:text-5xl font-normal text-black">Ready to streamline your implementations?</h2>
        <div class="flex flex-col gap-3 w-full md:w-auto">
          <button class="px-12 py-4 bg-white border border-black text-black font-medium min-w-[240px]">
            Get a Demo
          </button>
          <button class="px-12 py-4 bg-[#13B5EA] text-white font-medium min-w-[240px]">
            Start Free Trial
          </button>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer style="background: #13B5EA;">
      <div class="max-w-6xl mx-auto">
        <!-- Main Footer Content with vertical divider -->
        <div class="flex flex-col md:flex-row">
          <!-- Left side - Links -->
          <div class="flex-1 px-6 py-16 border-r border-white/20">
            <div class="grid grid-cols-3 gap-8">
              <div>
                <h4 class="text-white font-semibold mb-4 text-sm">Product</h4>
                <ul class="space-y-2">
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Features</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Templates</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Integrations</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Pricing</a></li>
                </ul>
              </div>
              <div>
                <h4 class="text-white font-semibold mb-4 text-sm">Resources</h4>
                <ul class="space-y-2">
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Help Center</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Xero Setup Guide</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Template Library</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Blog</a></li>
                </ul>
              </div>
              <div>
                <h4 class="text-white font-semibold mb-4 text-sm">Company</h4>
                <ul class="space-y-2">
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">About Us</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Careers</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Contact</a></li>
                  <li><a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Xero Partner Program</a></li>
                </ul>
              </div>
            </div>
            
            <!-- Bottom row with social icons -->
            <div class="mt-12 pt-8 border-t border-white/20 flex flex-col md:flex-row items-center justify-between gap-4">
              <div class="flex items-center gap-6">
                <a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Privacy policy</a>
                <a href="#" class="text-white/70 hover:text-white text-sm transition-colors">Terms of Service</a>
              </div>
              <div class="flex items-center gap-3">
                <a href="#" class="text-white/70 hover:text-white transition-colors">
                  <UIcon name="i-lucide-linkedin" class="w-5 h-5" />
                </a>
                <a href="#" class="text-white/70 hover:text-white transition-colors">
                  <UIcon name="i-lucide-x" class="w-5 h-5" />
                </a>
                <a href="#" class="text-white/70 hover:text-white transition-colors">
                  <UIcon name="i-lucide-instagram" class="w-5 h-5" />
                </a>
                <a href="#" class="text-white/70 hover:text-white transition-colors">
                  <UIcon name="i-lucide-youtube" class="w-5 h-5" />
                </a>
              </div>
            </div>
          </div>
          
          <!-- Right side - 3D Cube -->
          <div class="w-full md:w-80 flex items-center justify-center px-6 py-16">
            <div class="w-40 h-40 relative" style="perspective: 200px;">
              <div class="absolute inset-0 flex items-center justify-center" style="transform: rotateX(-20deg) rotateY(25deg); transform-style: preserve-3d;">
                <div class="w-28 h-28 relative" style="transform-style: preserve-3d;">
                  <div class="absolute inset-0 bg-white flex items-center justify-center" style="transform: translateZ(56px);">
                    <span class="text-[#13B5EA] text-5xl font-bold">X</span>
                  </div>
                  <div class="absolute inset-0 bg-[#0E8BBA]" style="transform: rotateY(90deg) translateZ(56px);"></div>
                  <div class="absolute inset-0 bg-[#0A6B8F]" style="transform: rotateX(90deg) translateZ(56px);"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Large XeroFlow Logo -->
        <div class="px-6 pb-8">
          <span class="text-8xl md:text-9xl font-bold text-white tracking-tight">XeroFlow</span>
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
    name: 'Xero Integration',
    icon: 'i-lucide-plug',
    items: [
      'Direct Xero API connectivity',
      'Import existing Xero organizations',
      'Sync data in real-time'
    ]
  },
  { name: 'Task Automation', icon: 'i-lucide-zap' },
  { name: 'Progress Tracking', icon: 'i-lucide-gauge' },
  { name: 'Secure & Compliant', icon: 'i-lucide-shield' },
  { name: 'Client Visibility', icon: 'i-lucide-eye' },
  { name: 'Team Collaboration', icon: 'i-lucide-users' },
  { name: 'Customizable Templates', icon: 'i-lucide-blocks' },
  { name: 'Accountant Friendly', icon: 'i-lucide-calculator' }
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

const stats = [
  { value: '75%', label: 'Faster Implementation' },
  { value: '500+', label: 'Firms Using XeroFlow' },
  { value: '50K+', label: 'Clients Onboarded' },
  { value: '4.9', label: 'User Rating' }
]

const pricingPlans = [
  {
    name: 'Solo',
    price: '$29/month',
    features: ['5 active clients', 'Basic templates', 'Email support', 'Xero integration'],
    cta: 'Start Free Trial',
    cubeColor: '#E866A9',
    featured: false,
    popular: false
  },
  {
    name: 'Team',
    price: '$79/month',
    features: ['20 active clients', 'Custom templates', 'Priority support', 'Client portal'],
    cta: 'Start Free Trial',
    cubeColor: '#E866A9',
    featured: false,
    popular: false
  },
  {
    name: 'Practice',
    price: '$199/month',
    features: ['Unlimited clients', 'Advanced templates', 'Team collaboration', 'White-label option'],
    cta: 'Start Free Trial',
    cubeColor: '#13B5EA',
    featured: false,
    popular: true
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    features: ['Dedicated onboarding', 'Custom integrations', 'SLA guarantee', 'Account manager'],
    cta: 'Contact Sales',
    cubeColor: '#7DD3A8',
    featured: true,
    popular: false
  }
]
</script>

<style>
@import '~/assets/css/browserbase-light.css';

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

.pricing-header-sm {
  background-color: #2A2A2A;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 1px,
    rgba(255,255,255,0.05) 1px,
    rgba(255,255,255,0.05) 2px
  );
}
</style>
