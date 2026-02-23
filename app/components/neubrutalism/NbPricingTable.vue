<template>
  <div class="nb-pricing-table">
    <!-- Header -->
    <div v-if="title" class="text-center mb-8">
      <h3 class="text-4xl font-normal text-black mb-3">{{ title }}</h3>
      <p v-if="subtitle" class="text-black/60 text-base max-w-2xl mx-auto">{{ subtitle }}</p>
    </div>

    <!-- Table -->
    <div class="border border-black/10 rounded-lg overflow-hidden bg-white">
      <table class="w-full">
        <thead>
          <tr>
            <th class="text-left p-5 font-medium text-black border-b border-black/10 bg-[#FAFAFA] w-[28%]">
              {{ rowHeaderLabel }}
            </th>
            <th 
              v-for="plan in plans" 
              :key="plan.name"
              class="p-5 text-center font-medium text-white border-b border-black/10 nb-pricing-header"
            >
              {{ plan.name }}
            </th>
          </tr>
        </thead>
        <tbody class="divide-y divide-black/10">
          <tr v-for="row in rows" :key="row.label" class="hover:bg-black/[0.01]">
            <td class="p-5">
              <div class="text-base font-medium text-black">{{ row.label }}</div>
              <div v-if="row.sublabel" class="text-sm text-black/50 mt-1 leading-relaxed">{{ row.sublabel }}</div>
            </td>
            <td 
              v-for="(value, index) in row.values" 
              :key="index"
              class="p-5 text-center text-base text-black"
            >
              {{ value }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Plan {
  name: string
}

interface Row {
  label: string
  sublabel?: string
  values: string[]
}

interface Props {
  title?: string
  subtitle?: string
  rowHeaderLabel?: string
  plans: Plan[]
  rows: Row[]
}

withDefaults(defineProps<Props>(), {
  rowHeaderLabel: 'Plan Details'
})
</script>

<style scoped>
.nb-pricing-header {
  background-color: #2A2A2A;
  background-image: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 2px,
    rgba(255,255,255,0.03) 2px,
    rgba(255,255,255,0.03) 4px
  );
}
</style>
