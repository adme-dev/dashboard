<template>
  <section id="governance" class="bg-[#f4f5f7]/70 px-6 py-20 dark:bg-white/[0.02] md:py-32">
    <div class="mx-auto max-w-[1200px]">
      <div class="mx-auto max-w-[720px] text-center">
        <p class="text-[13px] font-medium uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
          Built for trust
        </p>
        <h2 class="mt-4 text-[clamp(30px,4.5vw,48px)] font-[450] leading-[1.08] tracking-[-0.03em] text-[#121317] dark:text-white">
          Human approval stays in control
        </h2>
        <p class="mt-5 text-[16px] leading-relaxed text-[#45474D] dark:text-white/55 md:text-[18px]">
          The model can reason about work, but it cannot grant itself access. Authority, scope and confirmation are decided outside the prompt and checked again at every boundary.
        </p>
      </div>

      <ol class="mt-14 grid gap-4 md:grid-cols-4">
        <li v-for="(step, index) in steps" :key="step.title" class="rounded-2xl bg-white p-6 dark:bg-white/[0.04]">
          <span class="text-[12px] font-medium text-amber-600 dark:text-amber-300">0{{ index + 1 }}</span>
          <h3 class="mt-4 text-[17px] font-medium text-[#121317] dark:text-white">
            {{ step.title }}
          </h3>
          <p class="mt-2 text-[13px] leading-relaxed text-[#45474D]/75 dark:text-white/45">
            {{ step.description }}
          </p>
        </li>
      </ol>

      <div class="mt-12 grid gap-4 md:grid-cols-3">
        <div v-for="guardrail in guardrails" :key="guardrail.title" class="flex gap-4 rounded-2xl border border-[#121317]/[0.06] p-5 dark:border-white/[0.07]">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10">
            <UIcon :name="guardrail.icon" class="size-4 text-emerald-700 dark:text-emerald-300" />
          </span>
          <div>
            <h3 class="text-[14px] font-medium text-[#121317] dark:text-white">
              {{ guardrail.title }}
            </h3>
            <p class="mt-1 text-[12px] leading-relaxed text-[#45474D]/70 dark:text-white/40">
              {{ guardrail.description }}
            </p>
          </div>
        </div>
      </div>

      <p class="mx-auto mt-10 max-w-[760px] text-center text-[12px] leading-relaxed text-[#45474D]/55 dark:text-white/30">
        Powered by Cloudflare Workers AI, Project Think and Durable Objects. Turns are bounded, tool access is allowlisted, reasoning is suppressed from responses, and operational telemetry excludes prompts, secrets and raw identity data.
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
const steps = [
  { title: 'Ask naturally', description: 'Start with the client, task or decision in plain language.' },
  { title: 'Scope first', description: 'XeroFlow derives the exact tenants, clients and tools the caller may use.' },
  { title: 'Read and draft', description: 'The assistant gathers allowed context and prepares an answer or editable proposal.' },
  { title: 'Person decides', description: 'Consequential work stays behind existing approval and action controls.' }
]

const guardrails = [
  { title: 'Permission-bound', icon: 'i-lucide-shield-check', description: 'Model requests can narrow signed authority, never broaden it.' },
  { title: 'Prompt-safe telemetry', icon: 'i-lucide-eye-off', description: 'Correlation, status, latency and tool counts are logged without prompt content.' },
  { title: 'Immediate kill switches', icon: 'i-lucide-toggle-left', description: 'App and Worker gates can independently stop Think turns without removing the rest of XeroFlow.' }
]
</script>
