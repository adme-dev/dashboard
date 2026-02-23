<template>
  <div class="min-h-screen" style="background: #000000;">
    <!-- Header -->
    <div class="max-w-6xl mx-auto px-6 py-12">
      <div class="flex items-center gap-4 mb-4">
        <BrandCube color="red" :size="48" rotation="-20" />
        <div>
          <h1 class="text-4xl md:text-5xl font-bold text-white tracking-tight">
            Textured Neubrutalism
          </h1>
          <p class="text-white/50 mt-1 text-lg">
            Premium Dev Tool Aesthetic — No Greys
          </p>
        </div>
      </div>
    </div>

    <div class="max-w-6xl mx-auto px-6 pb-24 space-y-20">
      <!-- Color Palette -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-palette" class="w-5 h-5" />
          Color Palette
        </h2>
        <div class="grid grid-cols-3 md:grid-cols-6 gap-3">
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #000000;"></div>
            <div class="text-xs font-mono text-white/40">bg-primary</div>
            <div class="text-xs text-white/60">#000000</div>
          </div>
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #FF6B6B;"></div>
            <div class="text-xs font-mono text-white/40">accent-red</div>
            <div class="text-xs text-white/60">#FF6B6B</div>
          </div>
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #FFE66D;"></div>
            <div class="text-xs font-mono text-white/40">accent-yellow</div>
            <div class="text-xs text-white/60">#FFE66D</div>
          </div>
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #4ECDC4;"></div>
            <div class="text-xs font-mono text-white/40">accent-teal</div>
            <div class="text-xs text-white/60">#4ECDC4</div>
          </div>
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #A78BFA;"></div>
            <div class="text-xs font-mono text-white/40">accent-purple</div>
            <div class="text-xs text-white/60">#A78BFA</div>
          </div>
          <div class="border border-white/10 rounded-lg p-4 text-center" style="background: #000000;">
            <div class="w-full h-12 rounded mb-2 border border-white/20" style="background: #FFFFFF;"></div>
            <div class="text-xs font-mono text-white/40">text-primary</div>
            <div class="text-xs text-white/60">#FFFFFF</div>
          </div>
        </div>
      </section>

      <!-- 3D Cubes -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-box" class="w-5 h-5" />
          3D Brand Cubes
        </h2>
        <div class="border border-white/10 rounded-xl p-8" style="background: rgba(255,255,255,0.02);">
          <div class="flex flex-wrap items-center justify-around gap-10">
            <div v-for="color in cubeColors" :key="color" class="flex flex-col items-center gap-3">
              <BrandCube :color="color" :size="64" :rotation="Math.random() * 30 - 15" />
              <span class="text-xs font-mono uppercase tracking-wider text-white/40">{{ color }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Buttons -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-mouse-pointer-click" class="w-5 h-5" />
          Buttons
        </h2>
        <div class="border border-white/10 rounded-xl p-6 space-y-8" style="background: rgba(255,255,255,0.02);">
          <div>
            <h3 class="text-xs font-mono uppercase tracking-wider text-white/40 mb-3">Variants</h3>
            <div class="flex flex-wrap gap-3">
              <NbButton>Default</NbButton>
              <NbButton variant="primary">Primary</NbButton>
              <NbButton variant="secondary">Secondary</NbButton>
              <NbButton variant="ghost">Ghost</NbButton>
            </div>
          </div>
          
          <div>
            <h3 class="text-xs font-mono uppercase tracking-wider text-white/40 mb-3">Sizes</h3>
            <div class="flex flex-wrap items-center gap-3">
              <NbButton size="sm" variant="primary">Small</NbButton>
              <NbButton size="md" variant="primary">Medium</NbButton>
              <NbButton size="lg" variant="primary">Large</NbButton>
            </div>
          </div>
          
          <div>
            <h3 class="text-xs font-mono uppercase tracking-wider text-white/40 mb-3">States</h3>
            <div class="flex flex-wrap gap-3">
              <NbButton variant="primary" icon="i-lucide-plus">With Icon</NbButton>
              <NbButton variant="primary" trailing-icon="i-lucide-arrow-right">Trailing</NbButton>
              <NbButton variant="primary" loading>Loading</NbButton>
              <NbButton variant="primary" disabled>Disabled</NbButton>
            </div>
          </div>
        </div>
      </section>

      <!-- Cards -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-square" class="w-5 h-5" />
          Cards
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="border border-white/10 rounded-xl p-6" style="background: rgba(255,255,255,0.02);">
            <h3 class="font-semibold text-white mb-2">Default</h3>
            <p class="text-sm text-white/50">Standard card with subtle border on pure black.</p>
          </div>
          
          <div class="border border-white/10 rounded-xl p-6 hover:border-white/20 transition-colors" style="background: rgba(255,255,255,0.02);">
            <h3 class="font-semibold text-white mb-2">Hoverable</h3>
            <p class="text-sm text-white/50">Hover to see border brighten.</p>
          </div>
          
          <div class="border rounded-xl p-6" style="border-color: #FF6B6B; background: rgba(255, 107, 107, 0.03);">
            <h3 class="font-semibold text-white mb-2">Elevated</h3>
            <p class="text-sm text-white/50">Colored border for featured content.</p>
          </div>
        </div>
      </section>

      <!-- Badges -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-tag" class="w-5 h-5" />
          Badges
        </h2>
        <div class="border border-white/10 rounded-xl p-6" style="background: rgba(255,255,255,0.02);">
          <div class="flex flex-wrap gap-3">
            <span class="px-2 py-1 text-xs font-mono uppercase border rounded" style="border-color: rgba(255,255,255,0.2); color: rgba(255,255,255,0.6);">neutral</span>
            <span class="px-2 py-1 text-xs font-mono uppercase border rounded" style="border-color: #FF6B6B; color: #FF6B6B; background: rgba(255,107,107,0.1);">primary</span>
            <span class="px-2 py-1 text-xs font-mono uppercase border rounded" style="border-color: #4ECDC4; color: #4ECDC4; background: rgba(78,205,196,0.1);">success</span>
            <span class="px-2 py-1 text-xs font-mono uppercase border rounded" style="border-color: #FFE66D; color: #FFE66D; background: rgba(255,230,109,0.1);">warning</span>
            <span class="px-2 py-1 text-xs font-mono uppercase border rounded font-semibold" style="border-color: #FF6B6B; background: #FF6B6B; color: #000;">solid</span>
          </div>
        </div>
      </section>

      <!-- Progress Bars -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-loader-2" class="w-5 h-5" />
          Progress Bars
        </h2>
        <div class="border border-white/10 rounded-xl p-6 space-y-6" style="background: rgba(255,255,255,0.02);">
          <div>
            <div class="flex justify-between text-xs text-white/40 mb-2">
              <span>Migration Progress</span>
              <span>68%</span>
            </div>
            <div class="h-1.5 rounded-full overflow-hidden" style="background: rgba(255,255,255,0.1);">
              <div class="h-full rounded-full" style="width: 68%; background: #FF6B6B;"></div>
            </div>
          </div>
          <div>
            <div class="flex justify-between text-xs text-white/40 mb-2">
              <span>Upload Complete</span>
              <span>100%</span>
            </div>
            <div class="h-1.5 rounded-full overflow-hidden" style="background: rgba(255,255,255,0.1);">
              <div class="h-full rounded-full" style="width: 100%; background: #4ECDC4;"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- Data Table -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-table" class="w-5 h-5" />
          Data Table
        </h2>
        <div class="border border-white/10 rounded-xl overflow-hidden" style="background: rgba(255,255,255,0.02);">
          <table class="w-full">
            <thead>
              <tr class="border-b border-white/10" style="background: rgba(255,255,255,0.03);">
                <th class="text-left p-4 text-xs font-mono uppercase tracking-wider text-white/40">ID</th>
                <th class="text-left p-4 text-xs font-mono uppercase tracking-wider text-white/40">Migration</th>
                <th class="text-left p-4 text-xs font-mono uppercase tracking-wider text-white/40">Status</th>
                <th class="text-right p-4 text-xs font-mono uppercase tracking-wider text-white/40">Items</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in tableData" :key="row.id" class="border-b border-white/5">
                <td class="p-4 font-mono text-sm text-white/60">{{ row.id }}</td>
                <td class="p-4 text-sm text-white/80">{{ row.name }}</td>
                <td class="p-4">
                  <span 
                    class="px-2 py-0.5 text-xs font-mono uppercase border rounded"
                    :style="row.status === 'completed' ? 'border-color: #4ECDC4; color: #4ECDC4;' : 'border-color: #FF6B6B; color: #FF6B6B;'"
                  >
                    {{ row.status }}
                  </span>
                </td>
                <td class="p-4 text-right font-mono text-sm text-white/60">{{ row.items.toLocaleString() }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- Background Patterns -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-grid-3x3" class="w-5 h-5" />
          Background Patterns
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="border border-white/10 rounded-xl p-8 h-32 flex items-center justify-center nb-grid" style="background: #000000;">
            <span class="text-xs font-mono uppercase tracking-wider text-white/40">Grid Lines</span>
          </div>
          <div class="border border-white/10 rounded-xl p-8 h-32 flex items-center justify-center nb-grid-dots" style="background: #000000;">
            <span class="text-xs font-mono uppercase tracking-wider text-white/40">Dot Grid</span>
          </div>
          <div class="border border-white/10 rounded-xl p-8 h-32 flex items-center justify-center" style="background: #000000;">
            <span class="text-xs font-mono uppercase tracking-wider text-white/40">Pure Black</span>
          </div>
        </div>
      </section>

      <!-- Scroll Animation Demo -->
      <section>
        <h2 class="text-xl font-semibold text-white mb-6 flex items-center gap-2">
          <UIcon name="i-lucide-move-down" class="w-5 h-5" />
          Scroll Reveal Animation
        </h2>
        <div class="space-y-4">
          <NbScrollReveal 
            v-for="i in 5" 
            :key="i"
            :delay="(i - 1) * 100"
            direction="up"
            :distance="20"
          >
            <div class="border border-white/10 rounded-xl p-6" style="background: rgba(255,255,255,0.02);">
              <div class="flex items-center gap-4">
                <div class="w-10 h-10 rounded-lg flex items-center justify-center" :style="`background: ${['#FF6B6B', '#FFE66D', '#4ECDC4', '#A78BFA', '#FFA07A'][i-1]}20; border: 1px solid ${['#FF6B6B', '#FFE66D', '#4ECDC4', '#A78BFA', '#FFA07A'][i-1]}40;`">
                  <UIcon name="i-lucide-zap" class="w-5 h-5" :style="`color: ${['#FF6B6B', '#FFE66D', '#4ECDC4', '#A78BFA', '#FFA07A'][i-1]};`" />
                </div>
                <div>
                  <h3 class="font-medium text-white">Feature {{ i }}</h3>
                  <p class="text-sm text-white/40">Scroll-triggered reveal with stagger delay</p>
                </div>
              </div>
            </div>
          </NbScrollReveal>
        </div>
      </section>

      <!-- Footer -->
      <div class="border-t border-white/10 pt-8">
        <p class="text-center text-xs text-white/30">
          Textured Neubrutalism Design System • Pure Black • Vibrant Accents • No Greys
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false
})

const cubeColors = ['red', 'yellow', 'blue', 'green', 'purple'] as const

const tableData = [
  { id: 'M-001', name: 'Q4 Data Migration', status: 'completed', items: 15420 },
  { id: 'M-002', name: 'Client Boards Import', status: 'running', items: 8934 },
  { id: 'M-003', name: 'Archive Cleanup', status: 'completed', items: 5621 },
  { id: 'M-004', name: 'Template Sync', status: 'completed', items: 342 }
]
</script>

<style>
@import '~/assets/css/neubrutalism.css';
</style>
