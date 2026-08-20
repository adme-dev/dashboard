<template>
  <div class="min-h-screen bg-white dark:bg-[#0a0b0e]">
    <MarketingNav active="features" />

    <main>
      <section class="relative overflow-hidden bg-[#0a0b0e] px-6 pb-20 pt-[116px] md:pb-28 md:pt-[140px]">
        <MarketingHeroBackground theme="chat" />
        <div class="relative mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
          <div>
            <div class="mb-7 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3.5 py-1.5">
              <span class="size-1.5 rounded-full bg-emerald-400" />
              <span class="text-[13px] font-medium text-emerald-300">Virtual office</span>
            </div>
            <h1 class="max-w-[620px] text-[clamp(40px,6vw,68px)] font-[450] leading-[1.04] tracking-[-0.035em] text-white">
              Give your agency a place to work together
            </h1>
            <p class="mt-6 max-w-[560px] text-[17px] leading-relaxed text-white/55 md:text-[19px]">
              See who is around, step into a room, welcome clients, and turn every meeting into organised follow-up — without leaving XeroFlow.
            </p>
            <div class="mt-9 flex flex-col gap-3 sm:flex-row">
              <a
                href="https://app.xeroflow.io/office"
                class="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-[15px] font-medium text-[#121317] transition-colors hover:bg-white/90"
              >
                Open Office
                <UIcon name="i-lucide-arrow-right" class="size-4" />
              </a>
              <NuxtLink
                to="/auth/login"
                class="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/[0.05] px-6 py-3 text-[15px] font-medium text-white transition-colors hover:bg-white/[0.09]"
              >
                Sign in to XeroFlow
              </NuxtLink>
            </div>
          </div>

          <figure class="relative" aria-labelledby="office-preview-caption">
            <div class="absolute -inset-8 rounded-full bg-emerald-400/[0.08] blur-3xl" />
            <div class="relative overflow-hidden rounded-[28px] border border-white/[0.1] bg-[#101319]/95 p-3 shadow-[0_30px_100px_-40px_rgba(0,0,0,0.85)] sm:p-4">
              <div class="flex items-center gap-2 border-b border-white/[0.07] px-2 pb-3">
                <span class="flex size-8 items-center justify-center rounded-lg bg-emerald-400/10">
                  <UIcon name="i-lucide-building-2" class="size-4 text-emerald-300" />
                </span>
                <div>
                  <p class="text-[12px] font-medium text-white">
                    Agency Office
                  </p>
                  <p class="text-[10px] text-white/35">
                    4 people around · 2 rooms active
                  </p>
                </div>
                <span class="ml-auto inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300">
                  <span class="size-1.5 rounded-full bg-emerald-400" />
                  Live
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 p-2 sm:grid-cols-3">
                <div
                  v-for="room in officeRooms"
                  :key="room.name"
                  class="min-h-24 rounded-xl border border-white/[0.07] bg-white/[0.035] p-3"
                  :class="room.active ? 'ring-1 ring-emerald-400/30' : ''"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="flex size-7 items-center justify-center rounded-lg bg-white/[0.05]">
                      <UIcon :name="room.icon" class="size-3.5" :class="room.iconColor" />
                    </span>
                    <span class="text-[9px] text-white/30">{{ room.count }}/{{ room.capacity }}</span>
                  </div>
                  <p class="mt-3 text-[11px] font-medium text-white/80">
                    {{ room.name }}
                  </p>
                  <div class="mt-2 flex -space-x-1.5">
                    <span
                      v-for="person in room.people"
                      :key="person.initials"
                      class="flex size-5 items-center justify-center rounded-full border border-[#101319] text-[7px] font-semibold text-[#121317]"
                      :class="person.color"
                    >
                      {{ person.initials }}
                    </span>
                    <span v-if="room.people.length === 0" class="text-[9px] text-white/25">Open room</span>
                  </div>
                </div>
              </div>

              <div class="mx-2 mb-2 flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.035] px-3 py-2.5">
                <span class="relative flex size-8 items-center justify-center rounded-full bg-sky-300 text-[9px] font-semibold text-sky-950">
                  PH
                  <span class="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-[#171a20] bg-emerald-400" />
                </span>
                <div class="min-w-0">
                  <p class="truncate text-[11px] font-medium text-white/80">
                    You are around
                  </p>
                  <p class="text-[9px] text-white/30">
                    Available for a quick conversation
                  </p>
                </div>
                <span class="ml-auto rounded-full bg-white/[0.05] px-2.5 py-1 text-[9px] text-white/45">Available</span>
              </div>
            </div>
            <figcaption id="office-preview-caption" class="sr-only">
              A visual representation of the XeroFlow Office floor plan, showing live rooms, presence, and availability.
            </figcaption>
          </figure>
        </div>
      </section>

      <section class="px-6 py-20 md:py-28" aria-labelledby="office-presence-title">
        <div class="mx-auto max-w-[1200px]">
          <div class="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
            <div>
              <p class="mb-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-600 dark:text-emerald-400">
                Presence with purpose
              </p>
              <h2 id="office-presence-title" class="text-[clamp(30px,4vw,46px)] font-[450] leading-[1.08] tracking-[-0.03em] text-[#121317] dark:text-white">
                Know where the work is happening
              </h2>
              <p class="mt-5 max-w-[480px] text-[16px] leading-relaxed text-[#45474D] dark:text-white/55">
                Office makes a distributed agency feel visible again. Find people, rooms, and desks; check availability; then join the right space without scheduling another call.
              </p>
            </div>

            <ul class="grid gap-4 sm:grid-cols-2">
              <li v-for="feature in presenceFeatures" :key="feature.title" class="rounded-2xl bg-[#f4f5f7] p-6 dark:bg-white/[0.035]">
                <span class="flex size-10 items-center justify-center rounded-xl bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] dark:bg-white/[0.06] dark:shadow-none">
                  <UIcon :name="feature.icon" class="size-5 text-[#121317] dark:text-white" />
                </span>
                <h3 class="mt-5 text-[16px] font-medium text-[#121317] dark:text-white">
                  {{ feature.title }}
                </h3>
                <p class="mt-2 text-[14px] leading-relaxed text-[#45474D]/75 dark:text-white/45">
                  {{ feature.description }}
                </p>
              </li>
            </ul>
          </div>
        </div>
      </section>

      <section class="px-6 pb-20 md:pb-28" aria-labelledby="office-flow-title">
        <div class="mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-[#0d1015] px-6 py-10 md:px-12 md:py-14">
          <div class="mb-10 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p class="mb-3 text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-300">
                One connected meeting flow
              </p>
              <h2 id="office-flow-title" class="max-w-[620px] text-[clamp(28px,4vw,44px)] font-[450] leading-[1.1] tracking-[-0.025em] text-white">
                From a knock at the door to the next action
              </h2>
            </div>
            <p class="max-w-[400px] text-[14px] leading-relaxed text-white/45">
              The conversation, evidence, and follow-up stay together in the same governed workspace.
            </p>
          </div>

          <ol class="grid gap-3 md:grid-cols-4" aria-label="Office meeting workflow">
            <li v-for="(step, index) in meetingFlow" :key="step.title" class="relative rounded-2xl border border-white/[0.07] bg-white/[0.035] p-5">
              <div class="flex items-center justify-between">
                <span class="flex size-9 items-center justify-center rounded-xl bg-white/[0.06]">
                  <UIcon :name="step.icon" class="size-4.5 text-emerald-300" />
                </span>
                <span class="text-[11px] font-medium text-white/25">0{{ index + 1 }}</span>
              </div>
              <h3 class="mt-5 text-[15px] font-medium text-white">
                {{ step.title }}
              </h3>
              <p class="mt-2 text-[13px] leading-relaxed text-white/40">
                {{ step.description }}
              </p>
            </li>
          </ol>
        </div>
      </section>

      <section class="px-6 pb-20 md:pb-28" aria-labelledby="office-controls-title">
        <div class="mx-auto grid max-w-[1200px] items-center gap-12 lg:grid-cols-2 lg:gap-20">
          <div class="order-2 grid grid-cols-2 gap-3 lg:order-1">
            <div v-for="control in officeControls" :key="control.title" class="min-h-40 rounded-2xl border border-black/[0.06] bg-[#f7f8f9] p-5 dark:border-white/[0.07] dark:bg-white/[0.035]">
              <UIcon :name="control.icon" class="size-5 text-violet-600 dark:text-violet-300" />
              <h3 class="mt-8 text-[15px] font-medium text-[#121317] dark:text-white">
                {{ control.title }}
              </h3>
              <p class="mt-1.5 text-[13px] leading-relaxed text-[#45474D]/70 dark:text-white/40">
                {{ control.description }}
              </p>
            </div>
          </div>
          <div class="order-1 lg:order-2">
            <p class="mb-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-violet-600 dark:text-violet-400">
              Built for client work
            </p>
            <h2 id="office-controls-title" class="text-[clamp(30px,4vw,46px)] font-[450] leading-[1.08] tracking-[-0.03em] text-[#121317] dark:text-white">
              Welcoming for guests. Governed for your agency.
            </h2>
            <p class="mt-5 max-w-[500px] text-[16px] leading-relaxed text-[#45474D] dark:text-white/55">
              Share external lobby links and temporary room access while your team keeps control of meeting policies, recordings, retention, and sensitive changes.
            </p>
          </div>
        </div>
      </section>

      <section class="px-6 pb-24">
        <div class="relative isolate mx-auto max-w-[1200px] overflow-hidden rounded-[32px] bg-[#0a0b0e] px-6 py-20 text-center md:py-24">
          <MarketingCtaParticles theme="emerald" />
          <p class="mb-4 text-[12px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
            XeroFlow Office
          </p>
          <h2 class="mx-auto max-w-[680px] text-[clamp(30px,4vw,48px)] font-[450] leading-[1.1] tracking-[-0.03em] text-white">
            Bring the human side of agency work into the platform
          </h2>
          <p class="mx-auto mt-5 max-w-[520px] text-[16px] leading-relaxed text-white/50">
            Open your Office, find your team, and keep every meeting connected to the work that follows.
          </p>
          <a
            href="https://app.xeroflow.io/office"
            class="mt-9 inline-flex items-center gap-2 rounded-full bg-white px-7 py-3.5 text-[15px] font-medium text-[#121317] transition-colors hover:bg-white/90"
          >
            Open Office
            <UIcon name="i-lucide-arrow-right" class="size-4" />
          </a>
        </div>
      </section>
    </main>

    <MarketingFooter />
  </div>
</template>

<script setup lang="ts">
definePageMeta({
  layout: false,
  public: true
})

useSeoMeta({
  title: 'Virtual Office for Agencies | XeroFlow',
  description: 'Bring distributed agency teams together with live presence, virtual rooms, guest lobbies, meeting artifacts, recordings, AI follow-up, and governed Office controls.',
  ogTitle: 'Virtual Office for Agencies | XeroFlow',
  ogDescription: 'See who is around, step into a room, welcome clients, and turn meetings into organised follow-up inside XeroFlow.'
})

const officeRooms = [
  { name: 'Focus Room', count: 1, capacity: 4, icon: 'i-lucide-focus', iconColor: 'text-sky-300', active: true, people: [{ initials: 'AK', color: 'bg-sky-300' }] },
  { name: 'Meeting Room', count: 3, capacity: 12, icon: 'i-lucide-presentation', iconColor: 'text-violet-300', active: true, people: [{ initials: 'JL', color: 'bg-violet-300' }, { initials: 'SR', color: 'bg-amber-300' }, { initials: 'TM', color: 'bg-emerald-300' }] },
  { name: 'Client Lobby', count: 0, capacity: 50, icon: 'i-lucide-door-open', iconColor: 'text-emerald-300', active: false, people: [] }
]

const presenceFeatures = [
  { title: 'Live floor plan', description: 'See rooms, private offices, desks, and occupancy in one visual workspace.', icon: 'i-lucide-layout-dashboard' },
  { title: 'Availability status', description: 'Show when you are available, away, busy, or already in a conversation.', icon: 'i-lucide-radio' },
  { title: 'Knock and join', description: 'Approach the right person or room with a clear, lightweight entry flow.', icon: 'i-lucide-hand' },
  { title: 'Find anyone quickly', description: 'Search people, rooms, and desks without hunting across separate tools.', icon: 'i-lucide-search' }
]

const meetingFlow = [
  { title: 'Invite or knock', description: 'Bring teammates into a room or route external guests through a lobby.', icon: 'i-lucide-door-open' },
  { title: 'Meet in context', description: 'See who is present and keep the conversation tied to its room.', icon: 'i-lucide-users' },
  { title: 'Capture the work', description: 'Create meeting notes, artifacts, action items, and recordings.', icon: 'i-lucide-notebook-tabs' },
  { title: 'Follow through', description: 'Use the Office assistant to organise AI notes and follow-up jobs.', icon: 'i-lucide-sparkles' }
]

const officeControls = [
  { title: 'Guest lobbies', description: 'External meeting links, intake routing, and availability.', icon: 'i-lucide-door-open' },
  { title: 'Guest badges', description: 'Temporary external room passes with visible status.', icon: 'i-lucide-badge-check' },
  { title: 'Retention controls', description: 'Set policies for recordings, artifacts, and Office data.', icon: 'i-lucide-shield-check' },
  { title: 'Audit trail', description: 'Review policy and other sensitive Office changes.', icon: 'i-lucide-scroll-text' }
]
</script>
