<template>
  <div class="nb-input-wrapper">
    <label v-if="label" class="nb-input-label">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <div class="relative">
      <span v-if="icon" class="nb-input-icon">
        <UIcon :name="icon" class="w-4 h-4" />
      </span>
      <input
        v-model="modelValue"
        class="nb-input"
        :class="{ 'pl-10': icon }"
        :type="type"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        v-bind="$attrs"
      />
    </div>
    <span v-if="hint" class="nb-input-hint">{{ hint }}</span>
    <span v-if="error" class="nb-input-error">{{ error }}</span>
  </div>
</template>

<script setup lang="ts">
interface Props {
  modelValue?: string
  label?: string
  type?: string
  placeholder?: string
  icon?: string
  hint?: string
  error?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  modelValue: ''
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const modelValue = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})
</script>

<style scoped>
.nb-input-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.nb-input-label {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--nb-text-secondary);
}

.nb-input-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  color: var(--nb-text-tertiary);
  pointer-events: none;
}

.nb-input-hint {
  font-size: 0.75rem;
  color: var(--nb-text-tertiary);
}

.nb-input-error {
  font-size: 0.75rem;
  color: var(--nb-accent-red);
}
</style>
