<template>
  <div class="nb-feature-grid">
    <NbScrollReveal
      v-for="(feature, index) in features"
      :key="feature.title"
      :delay="index * 80"
      direction="up"
      :distance="24"
    >
      <div class="nb-feature-item">
        <div class="nb-feature-icon" :class="`icon-${feature.color || 'default'}`">
          <UIcon :name="feature.icon" class="w-5 h-5" />
        </div>
        <h3 class="nb-feature-title">{{ feature.title }}</h3>
        <ul class="nb-feature-list">
          <li v-for="item in feature.items" :key="item">{{ item }}</li>
        </ul>
      </div>
    </NbScrollReveal>
  </div>
</template>

<script setup lang="ts">
interface Feature {
  icon: string
  title: string
  items: string[]
  color?: 'red' | 'yellow' | 'teal' | 'purple'
}

interface Props {
  features: Feature[]
}

defineProps<Props>()
</script>

<style scoped>
.nb-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.nb-feature-item {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 1.5rem;
  transition: all 0.3s ease;
  height: 100%;
}

.nb-feature-item:hover {
  background: rgba(255, 255, 255, 0.02);
  border-color: rgba(255, 255, 255, 0.15);
  transform: translateY(-2px);
}

.nb-feature-icon {
  width: 40px;
  height: 40px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.7);
}

.nb-feature-icon.icon-red {
  background: rgba(255, 107, 107, 0.08);
  border-color: rgba(255, 107, 107, 0.3);
  color: var(--nb-accent-red);
}

.nb-feature-icon.icon-yellow {
  background: rgba(255, 230, 109, 0.08);
  border-color: rgba(255, 230, 109, 0.3);
  color: var(--nb-accent-yellow);
}

.nb-feature-icon.icon-teal {
  background: rgba(78, 205, 196, 0.08);
  border-color: rgba(78, 205, 196, 0.3);
  color: var(--nb-accent-teal);
}

.nb-feature-icon.icon-purple {
  background: rgba(167, 139, 250, 0.08);
  border-color: rgba(167, 139, 250, 0.3);
  color: var(--nb-accent-purple);
}

.nb-feature-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: #ffffff;
  margin-bottom: 0.75rem;
  letter-spacing: -0.01em;
}

.nb-feature-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.nb-feature-list li {
  font-size: 0.8125rem;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  position: relative;
  padding-left: 0.875rem;
}

.nb-feature-list li::before {
  content: '—';
  position: absolute;
  left: 0;
  color: rgba(255, 255, 255, 0.2);
}
</style>
