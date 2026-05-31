<script setup lang="ts">
import { VisXYContainer, VisLine, VisAxis, VisArea, VisCrosshair, VisTooltip } from '@unovis/vue'

const props = defineProps<{ points: { day: string, visitors: number, events: number }[] }>()
const data = computed(() => props.points.map((p, i) => ({ x: i, ...p })))
const x = (d: any) => d.x
const y = (d: any) => d.visitors
</script>

<template>
  <UCard>
    <template #header>
      <span class="text-sm font-medium">Visitors over time</span>
    </template>
    <VisXYContainer v-if="points.length" :data="data" :height="220">
      <VisArea
        :x="x"
        :y="y"
        color="var(--ui-primary)"
        :opacity="0.1"
      />
      <VisLine :x="x" :y="y" color="var(--ui-primary)" />
      <VisAxis type="x" :tick-format="(i: number) => data[i]?.day?.slice(5) ?? ''" />
      <VisAxis type="y" />
      <VisCrosshair :template="(d: any) => `${d.day}: ${d.visitors} visitors, ${d.events} events`" />
      <VisTooltip />
    </VisXYContainer>
    <p v-else class="text-sm text-muted text-center py-8">
      No traffic in this range.
    </p>
  </UCard>
</template>
