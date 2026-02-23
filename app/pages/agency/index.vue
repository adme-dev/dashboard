<script setup lang="ts">
import { format } from 'date-fns'

definePageMeta({
  title: 'Agency Dashboard'
})

// Agency KPIs
const { data: kpis, pending: kpisLoading } = await useFetch('/api/agency/kpis')

// Active projects summary
const { data: projectsSummary } = await useFetch('/api/agency/projects/summary')

// Recent time entries
const { data: recentTime } = await useFetch('/api/agency/time/recent')

// Format currency
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value)
}

// Format percentage
const formatPercent = (value: number) => {
  return `${value.toFixed(1)}%`
}

// KPI cards configuration
const kpiCards = computed(() => {
  const kpisData = kpis.value as any
  const grossMargin = kpisData?.grossMargin ?? 0
  const avgUtilizationRate = kpisData?.avgUtilizationRate ?? 0
  const outstandingAR = kpisData?.outstandingAR ?? 0

  return [
    {
      title: 'Monthly Revenue',
      value: formatCurrency(kpisData?.totalRevenue || 0),
      icon: 'i-lucide-dollar-sign',
      change: kpisData?.revenueChange || 0,
      color: '#13B5EA',
      bgColor: '#E6F7FC'
    },
    {
      title: 'Gross Margin',
      value: formatPercent(grossMargin),
      icon: 'i-lucide-trending-up',
      change: kpisData?.marginChange || 0,
      color: grossMargin >= 30 ? '#7DD3A8' : '#F4B942',
      bgColor: grossMargin >= 30 ? '#E8F5E9' : '#FFF8E1'
    },
    {
      title: 'Utilization Rate',
      value: formatPercent(avgUtilizationRate),
      icon: 'i-lucide-clock',
      change: kpisData?.utilizationChange || 0,
      color: avgUtilizationRate >= 70 ? '#7DD3A8' : '#F4B942',
      bgColor: avgUtilizationRate >= 70 ? '#E8F5E9' : '#FFF8E1'
    },
    {
      title: 'Active Projects',
      value: kpisData?.activeProjects || 0,
      icon: 'i-lucide-folder-kanban',
      change: 0,
      color: '#13B5EA',
      bgColor: '#E6F7FC'
    },
    {
      title: 'MRR (Retainers)',
      value: formatCurrency(kpisData?.mrr || 0),
      icon: 'i-lucide-repeat',
      change: kpisData?.mrrChange || 0,
      color: '#9B87F5',
      bgColor: '#F0EEFC'
    },
    {
      title: 'Outstanding AR',
      value: formatCurrency(outstandingAR),
      icon: 'i-lucide-receipt',
      change: 0,
      color: outstandingAR > 50000 ? '#FF6B6B' : '#666666',
      bgColor: outstandingAR > 50000 ? '#FFEBEE' : '#F5F5F5'
    }
  ]
})

// Project status distribution
const projectStatusData = computed(() => {
  if (!projectsSummary.value) return []
  return [
    { name: 'Active', value: projectsSummary.value.active || 0, color: '#13B5EA' },
    { name: 'On Hold', value: projectsSummary.value.onHold || 0, color: '#F4B942' },
    { name: 'Completed', value: projectsSummary.value.completed || 0, color: '#7DD3A8' },
    { name: 'Draft', value: projectsSummary.value.draft || 0, color: '#9ca3af' }
  ]
})
</script>

<template>
  <div class="min-h-screen bg-white w-full">
    <!-- Header -->
    <div class="border-b border-black/10 w-full">
      <div class="w-full px-6 py-6">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-3xl font-normal text-black mb-1">Agency Dashboard</h1>
            <p class="text-black/60">Track projects, tasks, and team performance</p>
          </div>
          <div class="flex items-center gap-3">
            <NuxtLink
              to="/agency/workflow"
              class="px-4 py-2 border border-black text-black font-medium rounded hover:bg-black hover:text-white transition-colors"
            >
              View Board
            </NuxtLink>
            <NuxtLink
              to="/agency/tasks/new"
              class="px-4 py-2 bg-black text-white font-medium rounded hover:bg-black/80 transition-colors"
            >
              New Task
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="w-full px-6 py-8">
      <!-- KPI Grid - Responsive: 2 cols md, 3 cols lg, 6 cols xl -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8 w-full">
        <div
          v-for="card in kpiCards"
          :key="card.title"
          class="border border-black/20 rounded-lg overflow-hidden hover:border-black/40 transition-colors w-full"
        >
          <div class="h-1" :style="{ backgroundColor: card.color }"></div>
          <div class="p-5">
            <div class="flex items-start justify-between mb-4">
              <div
                class="w-10 h-10 rounded flex items-center justify-center"
                :style="{ backgroundColor: card.bgColor }"
              >
                <UIcon :name="card.icon" class="w-5 h-5" :style="{ color: card.color }" />
              </div>
              <span
                v-if="card.change !== 0"
                class="text-sm font-medium"
                :class="card.change > 0 ? 'text-[#7DD3A8]' : 'text-[#FF6B6B]'"
              >
                {{ card.change > 0 ? '+' : '' }}{{ card.change }}%
              </span>
            </div>
            <h3 class="text-sm text-black/60 mb-1">{{ card.title }}</h3>
            <p class="text-2xl font-semibold text-black">{{ card.value }}</p>
          </div>
        </div>
      </div>

      <!-- Charts Row - Full width -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 w-full">
        <!-- Project Status Distribution -->
        <div class="border border-black/20 rounded-lg overflow-hidden w-full">
          <div class="h-1 bg-[#13B5EA]"></div>
          <div class="p-6">
            <h3 class="text-lg font-semibold text-black mb-6">Project Status</h3>
            <div class="space-y-4">
              <div
                v-for="status in projectStatusData"
                :key="status.name"
                class="flex items-center justify-between"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-3 h-3 rounded-sm"
                    :style="{ backgroundColor: status.color }"
                  ></div>
                  <span class="text-black">{{ status.name }}</span>
                </div>
                <span class="text-black/60 font-medium">{{ status.value }}</span>
              </div>
            </div>
            <div class="mt-6 pt-6 border-t border-black/10">
              <div class="flex items-center justify-between text-sm">
                <span class="text-black/60">Total Projects</span>
                <span class="font-semibold text-black">
                  {{ projectStatusData.reduce((acc, s) => acc + s.value, 0) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Team Utilization -->
        <div class="border border-black/20 rounded-lg overflow-hidden w-full">
          <div class="h-1 bg-[#7DD3A8]"></div>
          <div class="p-6">
            <h3 class="text-lg font-semibold text-black mb-6">Team Utilization</h3>
            <div class="space-y-4">
              <div
                v-for="member in (kpis as any)?.teamUtilization || []"
                :key="member.name"
                class="space-y-2"
              >
                <div class="flex justify-between text-sm">
                  <span class="text-black">{{ member.name }}</span>
                  <span
                    :class="member.rate >= member.target ? 'text-[#7DD3A8]' : 'text-[#F4B942]'"
                    class="font-medium"
                  >
                    {{ formatPercent(member.rate) }}
                  </span>
                </div>
                <div class="h-2 bg-black/10 rounded-full overflow-hidden">
                  <div
                    class="h-full rounded-full transition-all"
                    :class="member.rate >= member.target ? 'bg-[#7DD3A8]' : 'bg-[#F4B942]'"
                    :style="{ width: `${Math.min(member.rate, 100)}%` }"
                  ></div>
                </div>
              </div>
            </div>
            <div class="mt-6 pt-6 border-t border-black/10">
              <p class="text-sm text-black/60">Target: 75% billable utilization</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Activity & Quick Actions - Full width -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        <!-- Recent Time Entries -->
        <div class="border border-black/20 rounded-lg overflow-hidden w-full">
          <div class="h-1 bg-[#9B87F5]"></div>
          <div class="p-6">
            <h3 class="text-lg font-semibold text-black mb-6">Recent Time Entries</h3>
            <div class="space-y-3">
              <div
                v-for="entry in (recentTime as any)?.entries || []"
                :key="entry.id"
                class="flex items-center justify-between p-4 border border-black/10 rounded-lg hover:border-black/20 transition-colors"
              >
                <div>
                  <p class="font-medium text-black">{{ entry.project }}</p>
                  <p class="text-sm text-black/60">
                    {{ entry.user }} - {{ entry.description }}
                  </p>
                </div>
                <div class="text-right">
                  <p class="font-semibold text-black">{{ entry.hours }}h</p>
                  <p class="text-sm text-black/60">
                    {{ format(new Date(entry.date), 'MMM d') }}
                  </p>
                </div>
              </div>
              <div v-if="!(recentTime as any)?.entries?.length" class="text-center py-8 text-black/40">
                <UIcon name="i-lucide-clock" class="w-8 h-8 mx-auto mb-2" />
                <p>No recent time entries</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Budget Alerts -->
        <div class="border border-black/20 rounded-lg overflow-hidden w-full">
          <div class="h-1 bg-[#F4B942]"></div>
          <div class="p-6">
            <div class="flex items-center gap-2 mb-6">
              <UIcon name="i-lucide-alert-triangle" class="w-5 h-5 text-[#F4B942]" />
              <h3 class="text-lg font-semibold text-black">Budget Alerts</h3>
            </div>
            <div class="space-y-3">
              <div
                v-for="alert in (kpis as any)?.budgetAlerts || []"
                :key="alert.project"
                class="p-4 border-l-4 rounded-r-lg"
                :class="{
                  'border-[#FF6B6B] bg-[#FF6B6B]/5': alert.severity === 'critical',
                  'border-[#F4B942] bg-[#F4B942]/5': alert.severity === 'warning'
                }"
              >
                <div class="flex justify-between items-start mb-2">
                  <p class="font-medium text-black">{{ alert.project }}</p>
                  <span
                    class="px-2 py-1 text-xs font-medium rounded"
                    :class="{
                      'bg-[#FF6B6B] text-white': alert.severity === 'critical',
                      'bg-[#F4B942] text-black': alert.severity === 'warning'
                    }"
                  >
                    {{ alert.percentUsed }}% used
                  </span>
                </div>
                <p class="text-sm text-black/60">{{ alert.message }}</p>
              </div>
              <div
                v-if="!(kpis as any)?.budgetAlerts?.length"
                class="text-center py-8"
              >
                <UIcon name="i-lucide-check-circle" class="w-8 h-8 mx-auto mb-2 text-[#7DD3A8]" />
                <p class="text-black/60">All projects within budget</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
