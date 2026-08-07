<template>
  <div class="min-h-screen bg-[#0a0b0e]">
    <MarketingStarsBackground fullscreen :count="2000" />
    <div class="relative z-[1]">
      <MarketingNav active="contact" />

      <!-- Hero -->
      <section class="relative pt-[52px]">
        <div class="relative max-w-[1200px] mx-auto px-6 pt-28 pb-12 md:pt-36 md:pb-16 text-center">
          <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] mb-8">
            <div class="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span class="text-[13px] text-white/60 font-medium">Replies within one business day</span>
          </div>
          <h1 class="text-[clamp(36px,5vw,56px)] font-[450] text-white leading-[1.1] tracking-[-0.03em] mb-5">
            Talk to us
          </h1>
          <p class="text-lg text-white/50 max-w-[540px] mx-auto leading-relaxed">
            Tell us a little about your agency. Two sentences is plenty — a real person reads every message.
          </p>
        </div>
      </section>

      <!-- Form + what happens next -->
      <section class="py-16 md:py-24">
        <div class="max-w-[1100px] mx-auto px-6 grid md:grid-cols-[1fr_1.2fr] gap-12 md:gap-16 items-start">
          <!-- What happens next -->
          <div class="md:pt-2">
            <h2 class="text-[24px] font-[450] text-white tracking-[-0.02em] mb-8">
              What happens next
            </h2>
            <div class="flex flex-col gap-8">
              <div v-for="(step, i) in nextSteps" :key="step.title" class="flex gap-4">
                <p class="text-[13px] font-medium text-white/30 tracking-wide pt-0.5 w-6 flex-shrink-0">
                  {{ String(i + 1).padStart(2, '0') }}
                </p>
                <div>
                  <h3 class="text-[15.5px] font-medium text-white mb-1">
                    {{ step.title }}
                  </h3>
                  <p class="text-[14px] text-white/55 leading-relaxed">
                    {{ step.body }}
                  </p>
                </div>
              </div>
            </div>
            <p class="mt-10 text-[14px] text-white/55 leading-relaxed border-l-2 border-white/[0.08] pl-4">
              No decks and no pressure — if XeroFlow isn't the right fit, we'll say so.
            </p>
          </div>

          <!-- Form card -->
          <div class="rounded-3xl border border-white/[0.06] bg-white/[0.03] backdrop-blur-xl p-7 md:p-9">
            <template v-if="!submitted">
              <form @submit.prevent="submit">
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <UFormField label="Name" :error="errors.name || undefined" :ui="fieldUi">
                    <UInput
                      v-model="form.name"
                      placeholder="Jane Doe"
                      autocomplete="name"
                      aria-required="true"
                      color="neutral"
                      :ui="inputUi"
                      class="w-full"
                      size="lg"
                    />
                  </UFormField>
                  <UFormField label="Work email" :error="errors.email || undefined" :ui="fieldUi">
                    <UInput
                      v-model="form.email"
                      type="email"
                      placeholder="jane@agency.com"
                      autocomplete="email"
                      aria-required="true"
                      color="neutral"
                      :ui="inputUi"
                      class="w-full"
                      size="lg"
                    />
                  </UFormField>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                  <UFormField label="Agency" hint="Optional" :ui="fieldUi">
                    <UInput
                      v-model="form.company"
                      placeholder="Acme Digital"
                      autocomplete="organization"
                      color="neutral"
                      :ui="inputUi"
                      class="w-full"
                      size="lg"
                    />
                  </UFormField>
                  <UFormField label="Team size" hint="Optional" :ui="fieldUi">
                    <USelectMenu
                      v-model="form.teamSize"
                      :items="teamSizeOptions"
                      placeholder="Select team size"
                      color="neutral"
                      :ui="inputUi"
                      class="w-full"
                      size="lg"
                    />
                  </UFormField>
                </div>
                <UFormField
                  label="What are you looking to solve?"
                  :error="errors.message || undefined"
                  :ui="fieldUi"
                  class="mb-7"
                >
                  <UTextarea
                    v-model="form.message"
                    :rows="5"
                    placeholder="How you run today, what's slowing you down, or what you'd want to see in a walkthrough."
                    aria-required="true"
                    color="neutral"
                    :ui="inputUi"
                    class="w-full"
                    size="lg"
                  />
                </UFormField>

                <!-- Honeypot — humans never see or fill this -->
                <div class="absolute -left-[9999px] top-auto w-px h-px overflow-hidden" aria-hidden="true">
                  <label>
                    Website
                    <input
                      v-model="form.website"
                      type="text"
                      tabindex="-1"
                      autocomplete="off"
                      name="website"
                    >
                  </label>
                </div>

                <UButton
                  type="submit"
                  :loading="submitting"
                  size="xl"
                  block
                  class="rounded-full justify-center bg-white hover:bg-white/90 text-[#121317] font-medium"
                >
                  Send message
                </UButton>
              </form>
            </template>

            <template v-else>
              <div class="py-10 text-center">
                <div class="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-5">
                  <UIcon name="i-lucide-check" class="w-6 h-6 text-emerald-400" />
                </div>
                <h3 class="text-[20px] font-[450] text-white tracking-[-0.01em] mb-2">
                  Message sent
                </h3>
                <p class="text-[14.5px] text-white/55 leading-relaxed max-w-[320px] mx-auto">
                  We'll reply to {{ sentTo }} within one business day.
                </p>
              </div>
            </template>
          </div>
        </div>
      </section>

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
  title: 'Contact — XeroFlow',
  description: 'Talk to the team behind XeroFlow. Tell us about your agency and we\'ll reply within one business day.',
  ogTitle: 'Contact — XeroFlow',
  ogDescription: 'Talk to the team behind XeroFlow. Tell us about your agency and we\'ll reply within one business day.'
})

const toast = useToast()

const nextSteps = [
  { title: 'We read it', body: 'Your message goes straight to the team that builds XeroFlow — not a ticket queue. You\'ll hear back within one business day.' },
  { title: 'A short walkthrough', body: 'If it looks like a fit, we\'ll book a 30-minute live tour scoped to the modules your agency would actually use.' },
  { title: 'A written proposal', body: 'Platform fee, implementation scope and timeline — in writing, so you can weigh it properly.' }
]

const teamSizeOptions = ['1–5 people', '6–15 people', '16–40 people', '41+ people']

// The page is always-dark; pin form-control styling so it doesn't follow the
// visitor's app color mode.
const fieldUi = { label: 'text-white', hint: 'text-white/40' }
const inputUi = { base: 'rounded-xl bg-white/[0.06] ring-white/[0.12] text-white placeholder:text-white/25 focus-visible:ring-white/40' }

const form = reactive({
  name: '',
  email: '',
  company: '',
  teamSize: undefined as string | undefined,
  message: '',
  website: '' // honeypot
})

const errors = reactive({ name: '', email: '', message: '' })
const submitting = ref(false)
const submitted = ref(false)
const sentTo = ref('')

function validate(): boolean {
  errors.name = form.name.trim() ? '' : 'Please add your name.'
  errors.email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()) ? '' : 'Please use a valid email so we can reply.'
  errors.message = form.message.trim().length >= 10 ? '' : 'A sentence or two helps us reply usefully.'
  return !errors.name && !errors.email && !errors.message
}

async function submit() {
  if (submitting.value || !validate()) return
  submitting.value = true
  try {
    await $fetch('/api/public/contact', {
      method: 'POST',
      body: {
        name: form.name.trim(),
        email: form.email.trim(),
        company: form.company.trim() || undefined,
        teamSize: form.teamSize,
        message: form.message.trim(),
        website: form.website
      }
    })
    sentTo.value = form.email.trim()
    submitted.value = true
  } catch {
    toast.add({
      title: 'Message not sent',
      description: 'Something went wrong on our side. Please try again, or email advertising@adme.net.au directly.',
      color: 'error'
    })
  } finally {
    submitting.value = false
  }
}
</script>
