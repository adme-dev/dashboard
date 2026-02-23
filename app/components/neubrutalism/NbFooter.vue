<template>
  <footer style="background: #0E9AD1;">
    <div class="max-w-6xl mx-auto">
      <!-- Main Footer Content with vertical divider -->
      <div class="flex flex-col md:flex-row">
        <!-- Left side - Links -->
        <div class="flex-1 px-6 py-16 border-r border-white/20">
          <div class="grid grid-cols-3 gap-8">
            <div>
              <h4 class="text-white font-semibold mb-4 text-sm">Product</h4>
              <ul class="space-y-2">
                <li v-for="link in productLinks" :key="link.label">
                  <a :href="link.href" class="text-white/70 hover:text-white text-sm transition-colors">{{ link.label }}</a>
                </li>
              </ul>
            </div>
            <div>
              <h4 class="text-white font-semibold mb-4 text-sm">Company</h4>
              <ul class="space-y-2">
                <li v-for="link in companyLinks" :key="link.label">
                  <a :href="link.href" class="text-white/70 hover:text-white text-sm transition-colors">{{ link.label }}</a>
                </li>
              </ul>
            </div>
            <div>
              <h4 class="text-white font-semibold mb-4 text-sm">Resources</h4>
              <ul class="space-y-2">
                <li v-for="link in resourceLinks" :key="link.label">
                  <a :href="link.href" class="text-white/70 hover:text-white text-sm transition-colors">{{ link.label }}</a>
                </li>
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
                <div class="absolute inset-0 bg-[#13B5EA] flex items-center justify-center" style="transform: translateZ(56px);">
                  <span class="text-white text-5xl font-bold">X</span>
                </div>
                <div class="absolute inset-0 bg-[#0E9AD1]" style="transform: rotateY(90deg) translateZ(56px);"></div>
                <div class="absolute inset-0 bg-[#0A7AA8]" style="transform: rotateX(90deg) translateZ(56px);"></div>
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
</template>

<script setup lang="ts">
const productLinks = [
  { label: 'Features', href: '#' },
  { label: 'Integrations', href: '#' },
  { label: 'Pricing', href: '#' }
]

const companyLinks = [
  { label: 'About', href: '#' },
  { label: 'Careers', href: '#' },
  { label: 'Contact', href: '#' }
]

const resourceLinks = [
  { label: 'Documentation', href: '#' },
  { label: 'Blog', href: '#' },
  { label: 'Support', href: '#' }
]
</script>
