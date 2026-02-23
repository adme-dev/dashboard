<template>
  <div class="bg-white rounded-lg border border-gray-200 p-6">
    <div class="flex items-center gap-4">
      <div 
        class="w-12 h-12 rounded-lg flex items-center justify-center"
        :class="iconBgClass"
      >
        <UIcon :name="icon" :class="iconColorClass" class="w-6 h-6" />
      </div>
      <div>
        <p class="text-sm text-gray-600">{{ title }}</p>
        <p class="text-2xl font-bold text-gray-900">{{ value }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  title: {
    type: String,
    required: true
  },
  value: {
    type: [String, Number],
    required: true
  },
  icon: {
    type: String,
    required: true
  },
  color: {
    type: String,
    default: 'blue',
    validator: (value) => ['blue', 'green', 'yellow', 'purple', 'red'].includes(value)
  }
})

const colorMap = {
  blue: { bg: 'bg-blue-100', icon: 'text-blue-600' },
  green: { bg: 'bg-green-100', icon: 'text-green-600' },
  yellow: { bg: 'bg-yellow-100', icon: 'text-yellow-600' },
  purple: { bg: 'bg-purple-100', icon: 'text-purple-600' },
  red: { bg: 'bg-red-100', icon: 'text-red-600' }
}

const iconBgClass = computed(() => colorMap[props.color].bg)
const iconColorClass = computed(() => colorMap[props.color].icon)
</script>
