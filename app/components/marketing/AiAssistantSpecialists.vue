<template>
  <section id="specialists" class="px-6 py-20 md:py-32">
    <div class="mx-auto max-w-[1200px]">
      <div class="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
        <div>
          <p class="text-[13px] font-medium uppercase tracking-[0.16em] text-amber-600 dark:text-amber-300">
            Department depth
          </p>
          <h2 class="mt-4 text-[clamp(30px,4.5vw,48px)] font-[450] leading-[1.08] tracking-[-0.03em] text-[#121317] dark:text-white">
            Focused specialists, working from the same truth
          </h2>
          <p class="mt-5 max-w-[500px] text-[16px] leading-relaxed text-[#45474D] dark:text-white/55 md:text-[18px]">
            Specialists do not invent a second system of record. They read the XeroFlow work, clients and permissions already available to the person asking.
          </p>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <article
            v-for="specialist in specialists"
            :key="specialist.name"
            class="rounded-2xl border border-[#121317]/[0.06] bg-[#f4f5f7] p-6 dark:border-white/[0.06] dark:bg-white/[0.03]"
          >
            <div class="flex items-start justify-between gap-4">
              <span class="flex size-11 items-center justify-center rounded-xl bg-white dark:bg-white/[0.07]">
                <UIcon :name="specialist.icon" class="size-5" :class="specialist.iconClass" />
              </span>
              <span class="rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                {{ specialist.mode }}
              </span>
            </div>
            <h3 class="mt-5 text-[18px] font-medium text-[#121317] dark:text-white">
              {{ specialist.name }}
            </h3>
            <p class="mt-2 text-[14px] leading-relaxed text-[#45474D]/75 dark:text-white/45">
              {{ specialist.description }}
            </p>
          </article>
        </div>
      </div>

      <div class="mt-24 rounded-[28px] bg-[#0a0b0e] px-6 py-10 md:px-10 md:py-12">
        <div class="grid gap-10 lg:grid-cols-[0.7fr_1.3fr] lg:items-center">
          <div>
            <p class="text-[13px] font-medium uppercase tracking-[0.16em] text-amber-200">
              Personal composition
            </p>
            <h2 class="mt-4 text-[clamp(28px,4vw,42px)] font-[450] leading-[1.1] tracking-[-0.025em] text-white">
              One front door, shaped around the individual
            </h2>
            <p class="mt-4 text-[15px] leading-relaxed text-white/50">
              The personal assistant combines role, department membership, connected clients and explicit permissions before it chooses what context or specialist to use.
            </p>
          </div>
          <div class="grid gap-3 sm:grid-cols-2">
            <div v-for="layer in compositionLayers" :key="layer.title" class="flex gap-3 rounded-xl bg-white/[0.05] p-4">
              <UIcon :name="layer.icon" class="mt-0.5 size-4 shrink-0 text-amber-200" />
              <div>
                <h3 class="text-[13px] font-medium text-white">
                  {{ layer.title }}
                </h3>
                <p class="mt-1 text-[12px] leading-relaxed text-white/40">
                  {{ layer.description }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
const specialists = [
  { name: 'Spend Controller', mode: 'Read + propose', icon: 'i-lucide-gauge', iconClass: 'text-rose-500', description: 'Reviews Meta and Google pacing, delivery health and budget pressure without changing bids or budgets.' },
  { name: 'Publishing Planner', mode: 'Read + draft', icon: 'i-lucide-calendar-days', iconClass: 'text-violet-500', description: 'Reviews publishing commitments and prepares editable plans without scheduling or publishing a post.' },
  { name: 'Financial Watch', mode: 'Read only', icon: 'i-lucide-landmark', iconClass: 'text-emerald-600', description: 'Surfaces advisor reports, recommendations and tenant-scoped budget alerts without touching Xero or invoices.' },
  { name: 'Traffic Controller', mode: 'Read only', icon: 'i-lucide-route', iconClass: 'text-sky-600', description: 'Connects signals across spend, publishing and finance to highlight operational conflicts and priorities.' }
]

const compositionLayers = [
  { title: 'Who you are', icon: 'i-lucide-user-round', description: 'Role, team and department membership shape the assistant’s focus.' },
  { title: 'What you can access', icon: 'i-lucide-key-round', description: 'Tenant, client and permission boundaries are enforced in code.' },
  { title: 'What matters now', icon: 'i-lucide-focus', description: 'The current task, client or conversation supplies immediate context.' },
  { title: 'What you approve', icon: 'i-lucide-circle-check-big', description: 'Drafts remain drafts until an authorised person confirms the next step.' }
]
</script>
