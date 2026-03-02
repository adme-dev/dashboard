<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav />

    <!-- Hero -->
    <section class="relative bg-[#0a0b0e] pt-[52px]">
      <MarketingHeroBackground theme="legal" />
      <div class="relative max-w-[720px] mx-auto px-6 pt-32 md:pt-44 pb-16 md:pb-20">
        <h1 class="text-[clamp(36px,6vw,56px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-6">
          Privacy Policy
        </h1>
        <p class="text-[15px] text-white/40">Last updated: February 2026</p>
      </div>
    </section>

    <!-- Content -->
    <div>
      <div class="max-w-[720px] mx-auto px-6 pt-12 pb-20 md:pb-32">

        <div class="prose-legal flex flex-col gap-10">
          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">1. Information We Collect</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              XeroFlow collects information you provide directly when creating an account, including your name, email address, and organisation details. We also collect usage data such as feature interactions, session duration, and device information to improve our service.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">2. How We Use Your Information</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              We use collected information to provide and maintain the XeroFlow platform, process transactions, send service notifications, improve user experience, and ensure security. We do not sell your personal information to third parties.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">3. Data Storage & Security</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              Your data is stored securely using industry-standard encryption on Cloudflare's global network and Neon's serverless Postgres infrastructure. We implement appropriate technical and organisational measures to protect against unauthorised access, alteration, or destruction of data.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">4. Third-Party Services</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              XeroFlow integrates with third-party services including Xero (accounting), Meta and Google (advertising), and Resend (email delivery). These integrations are initiated by you and governed by the respective service's privacy policies. We only share the minimum data required for each integration to function.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">5. Cookies & Tracking</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              We use essential cookies for authentication and session management. We do not use third-party advertising trackers. Analytics data is collected in aggregate form to understand usage patterns and improve the platform.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">6. Your Rights</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              You have the right to access, correct, or delete your personal data at any time. You may export your data or request account deletion by contacting our support team. We will respond to all data requests within 30 days.
            </p>
          </section>

          <section>
            <h2 class="text-[20px] font-[450] text-[#121317] mb-4">7. Contact Us</h2>
            <p class="text-[15px] text-[#45474D] leading-relaxed">
              For any privacy-related questions or requests, please contact us at
              <a href="mailto:privacy@xeroflow.agency" class="text-[#121317] underline underline-offset-2">privacy@xeroflow.agency</a>.
            </p>
          </section>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <footer class="pt-20 pb-10">
      <div class="max-w-[1200px] mx-auto px-6">
        <div class="flex flex-col md:flex-row gap-12 md:gap-0 md:justify-between mb-20">
          <div>
            <h3 class="text-[clamp(22px,3vw,32px)] font-[450] text-[#121317] tracking-[-0.02em]">Experience XeroFlow</h3>
          </div>
          <div class="flex gap-20 md:gap-28">
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/auth/login" class="text-[#45474D] hover:text-[#121317] transition-colors">Sign In</NuxtLink>
              <NuxtLink to="/auth/xeroflow" class="text-[#45474D] hover:text-[#121317] transition-colors">XeroFlow</NuxtLink>
              <NuxtLink to="/portal/login" class="text-[#45474D] hover:text-[#121317] transition-colors">Client Portal</NuxtLink>
              <NuxtLink to="/features" class="text-[#45474D] hover:text-[#121317] transition-colors">Features</NuxtLink>
            </div>
            <div class="flex flex-col gap-3.5 text-[15px]">
              <NuxtLink to="/privacy" class="text-[#45474D] hover:text-[#121317] transition-colors">Privacy</NuxtLink>
              <NuxtLink to="/terms" class="text-[#45474D] hover:text-[#121317] transition-colors">Terms</NuxtLink>
              <NuxtLink to="/support" class="text-[#45474D] hover:text-[#121317] transition-colors">Support</NuxtLink>
            </div>
          </div>
        </div>
        <div class="overflow-hidden mb-10">
          <div class="text-[clamp(80px,18vw,220px)] font-[450] text-[#121317] leading-[0.9] tracking-[-0.04em] select-none">XeroFlow</div>
        </div>
        <div class="pt-6 border-t border-black/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="flex items-center gap-2.5">
            <div class="w-5 h-5 bg-[#121317] rounded flex items-center justify-center">
              <span class="text-white text-[8px] font-semibold">XF</span>
            </div>
            <span class="text-[13px] text-[#45474D]">ADME Digital</span>
          </div>
          <div class="flex items-center gap-6 text-[13px] text-[#45474D]/60">
            <NuxtLink to="/about" class="hover:text-[#45474D] transition-colors">About</NuxtLink>
            <NuxtLink to="/privacy" class="hover:text-[#45474D] transition-colors">Privacy</NuxtLink>
            <NuxtLink to="/terms" class="hover:text-[#45474D] transition-colors">Terms</NuxtLink>
            <span>&copy; {{ new Date().getFullYear() }}</span>
          </div>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
definePageMeta({ layout: false })

useSeoMeta({
  title: 'Privacy Policy — XeroFlow',
  description: 'How XeroFlow handles your data. Our privacy policy covers data collection, usage, security, and your rights.',
  ogTitle: 'Privacy Policy — XeroFlow',
  ogDescription: 'How XeroFlow handles your data. Our privacy policy covers data collection, usage, security, and your rights.',
})
</script>
