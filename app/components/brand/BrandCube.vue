<template>
  <div 
    class="brand-cube"
    :class="`color-${color}`"
    :style="cubeStyles"
  >
    <div class="cube-wrapper" :style="wrapperStyles">
      <div class="cube-face cube-front"></div>
      <div class="cube-face cube-back"></div>
      <div class="cube-face cube-right"></div>
      <div class="cube-face cube-left"></div>
      <div class="cube-face cube-top"></div>
      <div class="cube-face cube-bottom"></div>
    </div>
    <!-- Shadow -->
    <div class="cube-shadow" :style="shadowStyles"></div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  color?: 'red' | 'yellow' | 'blue' | 'green' | 'purple' | 'teal'
  size?: number
  rotation?: number
  animated?: boolean
  floatSpeed?: number
}

const props = withDefaults(defineProps<Props>(), {
  color: 'red',
  size: 64,
  rotation: -15,
  animated: true,
  floatSpeed: 5
})

const colorMap = {
  red: '#FF6B6B',
  yellow: '#FFE66D',
  blue: '#4ECDC4',
  green: '#95E1D3',
  purple: '#A78BFA',
  teal: '#4ECDC4'
}

const cubeColor = computed(() => colorMap[props.color])

const cubeStyles = computed(() => ({
  '--cube-size': `${props.size}px`,
  '--cube-color': cubeColor.value,
  '--float-speed': `${props.floatSpeed}s`,
  '--rotation': `${props.rotation}deg`
}))

const wrapperStyles = computed(() => ({
  transform: `rotateX(-20deg) rotateY(${props.rotation}deg)`,
  animation: props.animated ? `nb-float var(--float-speed) ease-in-out infinite` : 'none'
}))

const shadowStyles = computed(() => ({
  width: `${props.size * 0.7}px`,
  height: `${props.size * 0.7}px`,
  transform: `translateX(${(props.size - props.size * 0.7) / 2}px) rotateX(90deg) translateZ(${-props.size * 0.5}px)`,
  animation: props.animated ? `nb-shadow-float var(--float-speed) ease-in-out infinite` : 'none'
}))
</script>

<style scoped>
.brand-cube {
  --cube-size: 64px;
  --cube-color: #FF6B6B;
  width: var(--cube-size);
  height: var(--cube-size);
  position: relative;
  perspective: 600px;
}

.cube-wrapper {
  width: 100%;
  height: 100%;
  position: relative;
  transform-style: preserve-3d;
}

.cube-face {
  position: absolute;
  width: var(--cube-size);
  height: var(--cube-size);
  background: var(--cube-color);
  border: 1px solid rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  backface-visibility: visible;
}

.cube-front {
  transform: translateZ(calc(var(--cube-size) / 2));
}

.cube-back {
  transform: rotateY(180deg) translateZ(calc(var(--cube-size) / 2));
  filter: brightness(0.85);
}

.cube-right {
  transform: rotateY(90deg) translateZ(calc(var(--cube-size) / 2));
  filter: brightness(0.9);
}

.cube-left {
  transform: rotateY(-90deg) translateZ(calc(var(--cube-size) / 2));
  filter: brightness(1.1);
}

.cube-top {
  transform: rotateX(90deg) translateZ(calc(var(--cube-size) / 2));
  filter: brightness(1.15);
}

.cube-bottom {
  transform: rotateX(-90deg) translateZ(calc(var(--cube-size) / 2));
  filter: brightness(0.7);
}

.cube-shadow {
  position: absolute;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.25);
  filter: blur(6px);
  border-radius: 50%;
  transform-origin: center bottom;
  pointer-events: none;
}

@keyframes nb-float {
  0%, 100% {
    transform: rotateX(-20deg) rotateY(var(--rotation)) translateY(0);
  }
  50% {
    transform: rotateX(-20deg) rotateY(var(--rotation)) translateY(-6px);
  }
}

@keyframes nb-shadow-float {
  0%, 100% {
    opacity: 0.25;
    transform: translateX(calc((var(--cube-size) - var(--cube-size) * 0.7) / 2)) rotateX(90deg) translateZ(calc(var(--cube-size) * -0.5)) scale(1);
  }
  50% {
    opacity: 0.15;
    transform: translateX(calc((var(--cube-size) - var(--cube-size) * 0.7) / 2)) rotateX(90deg) translateZ(calc(var(--cube-size) * -0.4)) scale(0.9);
  }
}
</style>
