<template>
  <div 
    class="nb-pricing-card"
    :class="{
      'nb-pricing-card-popular': popular,
      'nb-pricing-card-highlighted': highlighted
    }"
    :style="delayStyle"
  >
    <!-- Popular badge -->
    <div v-if="popular" class="nb-pricing-badge">
      Most popular
    </div>
    
    <!-- Header -->
    <div class="nb-pricing-header">
      <h3 class="nb-pricing-name">{{ name }}</h3>
      <div class="nb-pricing-price">
        <span class="nb-pricing-amount">{{ price }}</span>
        <span v-if="period" class="nb-pricing-period">{{ period }}</span>
      </div>
    </div>
    
    <!-- Features -->
    <ul class="nb-pricing-features">
      <li v-for="feature in features" :key="feature.text" class="nb-pricing-feature">
        <span class="nb-pricing-check">
          <UIcon name="i-lucide-check" class="w-3.5 h-3.5" />
        </span>
        <div>
          <span class="nb-pricing-feature-text">{{ feature.text }}</span>
          <span v-if="feature.highlight" class="nb-pricing-feature-highlight">
            {{ feature.highlight }}
          </span>
        </div>
      </li>
    </ul>
    
    <!-- CTA -->
    <div class="nb-pricing-cta">
      <NbButton 
        :variant="popular ? 'primary' : 'default'" 
        block
        :to="ctaLink"
      >
        {{ ctaText }}
      </NbButton>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Feature {
  text: string
  highlight?: string
}

interface Props {
  name: string
  price: string
  period?: string
  features: Feature[]
  ctaText: string
  ctaLink?: string
  popular?: boolean
  highlighted?: boolean
  delay?: number
}

const props = withDefaults(defineProps<Props>(), {
  period: '/month',
  ctaLink: '#',
  popular: false,
  highlighted: false,
  delay: 0
})

const delayStyle = computed(() => ({
  '--stagger-delay': `${props.delay}ms`
}))
</script>

<style scoped>
.nb-pricing-card {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1.5rem;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  opacity: 0;
  transform: translateY(24px);
  animation: nb-pricing-enter 0.6s ease forwards;
  animation-delay: var(--stagger-delay, 0ms);
}

@keyframes nb-pricing-enter {
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.nb-pricing-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.02);
}

.nb-pricing-card-popular {
  border-color: var(--nb-accent-red);
  background: rgba(255, 107, 107, 0.03);
}

.nb-pricing-card-popular:hover {
  border-color: var(--nb-accent-red);
  box-shadow: 0 16px 40px -12px rgba(255, 107, 107, 0.2);
}

.nb-pricing-badge {
  position: absolute;
  top: -10px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--nb-accent-red);
  color: #000000;
  padding: 0.25rem 0.75rem;
  font-size: 0.625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: 4px;
  white-space: nowrap;
}

.nb-pricing-header {
  text-align: center;
  padding-top: 0.5rem;
}

.nb-pricing-name {
  font-size: 0.8125rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--nb-text-tertiary);
  margin-bottom: 0.75rem;
}

.nb-pricing-price {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem;
}

.nb-pricing-amount {
  font-size: 2.5rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #ffffff;
  line-height: 1;
}

.nb-pricing-period {
  font-size: 0.875rem;
  color: var(--nb-text-tertiary);
}

.nb-pricing-features {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.875rem;
  flex: 1;
}

.nb-pricing-feature {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  font-size: 0.875rem;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.7);
}

.nb-pricing-check {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  background: rgba(78, 205, 196, 0.1);
  border: 1px solid var(--nb-accent-teal);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--nb-accent-teal);
  margin-top: 1px;
}

.nb-pricing-feature-highlight {
  display: block;
  font-size: 0.75rem;
  color: var(--nb-text-muted);
  margin-top: 0.125rem;
}

.nb-pricing-cta {
  margin-top: auto;
}
</style>
