<script setup lang="ts">
const emit = defineEmits<{
  select: [role: string]
}>()

const personas = [
  {
    key: 'member',
    title: 'Designer / Developer',
    icon: 'i-lucide-palette',
    color: 'blue',
    description: 'Your tasks, deadlines, proofs, and deliverables',
  },
  {
    key: 'project_manager',
    title: 'Producer / Traffic Manager',
    icon: 'i-lucide-gantt-chart',
    color: 'violet',
    description: 'Team capacity, blocked tasks, unassigned work, and deadlines',
  },
  {
    key: 'sales',
    title: 'Account Manager',
    icon: 'i-lucide-handshake',
    color: 'emerald',
    description: 'Client health, briefs pipeline, and your client list',
  },
  {
    key: 'marketing',
    title: 'Media Buyer',
    icon: 'i-lucide-megaphone',
    color: 'orange',
    description: 'Ad spend pacing, campaign alerts, and platform performance',
  },
  {
    key: 'consultant',
    title: 'Finance / Consultant',
    icon: 'i-lucide-calculator',
    color: 'cyan',
    description: 'Cash position, revenue, receivables, and project profitability',
  },
  {
    key: 'owner',
    title: 'Owner / Admin',
    icon: 'i-lucide-crown',
    color: 'amber',
    description: 'Everything — full visibility across all departments',
  },
] as const

const colorStyles: Record<string, { border: string; bg: string; icon: string; hover: string }> = {
  blue: {
    border: 'border-l-blue-500',
    bg: 'bg-blue-100 dark:bg-blue-500/10',
    icon: 'text-blue-600 dark:text-blue-400',
    hover: 'hover:border-blue-400 dark:hover:border-blue-500',
  },
  violet: {
    border: 'border-l-violet-500',
    bg: 'bg-violet-100 dark:bg-violet-500/10',
    icon: 'text-violet-600 dark:text-violet-400',
    hover: 'hover:border-violet-400 dark:hover:border-violet-500',
  },
  emerald: {
    border: 'border-l-emerald-500',
    bg: 'bg-emerald-100 dark:bg-emerald-500/10',
    icon: 'text-emerald-600 dark:text-emerald-400',
    hover: 'hover:border-emerald-400 dark:hover:border-emerald-500',
  },
  orange: {
    border: 'border-l-orange-500',
    bg: 'bg-orange-100 dark:bg-orange-500/10',
    icon: 'text-orange-600 dark:text-orange-400',
    hover: 'hover:border-orange-400 dark:hover:border-orange-500',
  },
  cyan: {
    border: 'border-l-cyan-500',
    bg: 'bg-cyan-100 dark:bg-cyan-500/10',
    icon: 'text-cyan-600 dark:text-cyan-400',
    hover: 'hover:border-cyan-400 dark:hover:border-cyan-500',
  },
  amber: {
    border: 'border-l-amber-500',
    bg: 'bg-amber-100 dark:bg-amber-500/10',
    icon: 'text-amber-600 dark:text-amber-400',
    hover: 'hover:border-amber-400 dark:hover:border-amber-500',
  },
}
</script>

<template>
  <div class="max-w-4xl mx-auto py-12 px-4">
    <!-- Welcome Header -->
    <div class="text-center mb-10">
      <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--ui-bg-elevated)] border border-[var(--ui-border)] mb-5">
        <UIcon name="i-lucide-sparkles" class="w-8 h-8 text-[var(--ui-text-highlighted)]" />
      </div>
      <h1 class="text-2xl font-bold text-[var(--ui-text-highlighted)] mb-2">
        Welcome to your Dashboard
      </h1>
      <p class="text-[var(--ui-text-muted)] max-w-lg mx-auto">
        Choose your role to personalize your widgets. You can always change this later.
      </p>
    </div>

    <!-- Persona Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
      <button
        v-for="persona in personas"
        :key="persona.key"
        class="flex items-start gap-4 p-5 rounded-lg border border-[var(--ui-border)] border-l-4 bg-[var(--ui-bg-elevated)] text-left transition-all duration-150 cursor-pointer"
        :class="[
          colorStyles[persona.color].border,
          colorStyles[persona.color].hover,
        ]"
        @click="emit('select', persona.key)"
      >
        <div
          class="w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center"
          :class="colorStyles[persona.color].bg"
        >
          <UIcon
            :name="persona.icon"
            class="w-5 h-5"
            :class="colorStyles[persona.color].icon"
          />
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-[var(--ui-text-highlighted)]">
            {{ persona.title }}
          </p>
          <p class="text-sm text-[var(--ui-text-muted)] mt-0.5">
            {{ persona.description }}
          </p>
        </div>
      </button>
    </div>

    <!-- Footer Note -->
    <p class="text-center text-xs text-[var(--ui-text-muted)]">
      You can customize individual widgets anytime from the
      <UIcon name="i-lucide-settings" class="w-3.5 h-3.5 inline-block align-text-bottom" />
      Customize button
    </p>
  </div>
</template>
