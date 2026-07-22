<template>
  <div ref="containerRef" class="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true" />
</template>

<script setup lang="ts">
// Stars-only variant of AiTrainingScene.client.vue: the drifting particle
// field without the shader cone, constellation lines or scroll choreography.
// Scoped to its container (not the viewport) so it can sit inside a dark
// hero section on pages that are light further down.
import * as THREE from 'three'

const props = withDefaults(defineProps<{ count?: number }>(), { count: 1400 })

const containerRef = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let particleSystem: THREE.Points | null = null
let animationId: number | null = null
let resizeObserver: ResizeObserver | null = null
let reduceMotion = false

const mouse = { x: 0, y: 0 }

function createStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.1, 'rgba(255, 255, 255, 0.95)')
  gradient.addColorStop(0.3, 'rgba(200, 200, 255, 0.7)')
  gradient.addColorStop(0.6, 'rgba(140, 140, 230, 0.4)')
  gradient.addColorStop(1, 'rgba(40, 40, 120, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  ctx.globalCompositeOperation = 'lighten'
  const vGrad = ctx.createLinearGradient(32, 0, 32, 64)
  vGrad.addColorStop(0, 'rgba(100, 100, 230, 0)')
  vGrad.addColorStop(0.5, 'rgba(250, 250, 255, 0.7)')
  vGrad.addColorStop(1, 'rgba(100, 100, 230, 0)')
  ctx.fillStyle = vGrad
  ctx.fillRect(28, 0, 8, 64)

  const hGrad = ctx.createLinearGradient(0, 32, 64, 32)
  hGrad.addColorStop(0, 'rgba(100, 100, 230, 0)')
  hGrad.addColorStop(0.5, 'rgba(250, 250, 255, 0.7)')
  hGrad.addColorStop(1, 'rgba(100, 100, 230, 0)')
  ctx.fillStyle = hGrad
  ctx.fillRect(0, 28, 64, 8)

  const texture = new THREE.Texture(canvas)
  texture.needsUpdate = true
  return texture
}

function containerSize() {
  const el = containerRef.value
  return { w: el?.clientWidth || 1, h: el?.clientHeight || 1 }
}

function init() {
  if (!containerRef.value) return

  const { w, h } = containerSize()

  scene = new THREE.Scene()
  scene.background = null

  camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  containerRef.value.appendChild(renderer.domElement)

  createParticles()
  animate(0)
}

function createParticles() {
  if (!scene) return

  const PARTICLE_COUNT = props.count
  const DEPTH_RANGE = 12

  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const velocities = new Float32Array(PARTICLE_COUNT * 3)
  const sizes = new Float32Array(PARTICLE_COUNT)
  const colors = new Float32Array(PARTICLE_COUNT * 3)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const radius = 3 + Math.random() * 3
    const depthExt = Math.random() * DEPTH_RANGE - DEPTH_RANGE / 2

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi) + depthExt

    velocities[i * 3] = (Math.random() - 0.5) * 0.0004
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.0004
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.0002

    const normalizedDepth = (positions[i * 3 + 2] + DEPTH_RANGE / 2) / DEPTH_RANGE
    sizes[i] = 0.008 + 0.03 * (1 - normalizedDepth)

    const brightness = 0.5 + 0.5 * (1 - normalizedDepth)
    colors[i * 3] = 0.4 + 0.3 * brightness
    colors[i * 3 + 1] = 0.4 + 0.3 * brightness
    colors[i * 3 + 2] = 0.7 + 0.3 * brightness
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.03,
    map: createStarTexture(),
    transparent: true,
    vertexColors: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true
  })

  particleSystem = new THREE.Points(geo, mat)
  scene.add(particleSystem)
}

function animate(timestamp: number) {
  if (!renderer || !scene || !camera) return

  if (particleSystem && !reduceMotion) {
    const positions = particleSystem.geometry.attributes.position.array as Float32Array
    const velocities = particleSystem.geometry.attributes.velocity.array as Float32Array
    const count = positions.length / 3

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3] += velocities[i3]
      positions[i3 + 1] += velocities[i3 + 1]
      positions[i3 + 2] += velocities[i3 + 2]

      positions[i3] += (mouse.x * 3 - positions[i3]) * 0.0001
      positions[i3 + 1] += (mouse.y * 3 - positions[i3 + 1]) * 0.0001

      const dist = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2)
      if (dist > 10) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = 5 + Math.random() * 2
        positions[i3] = r * Math.sin(phi) * Math.cos(theta)
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        positions[i3 + 2] = r * Math.cos(phi)
        velocities[i3] = (Math.random() - 0.5) * 0.0004
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.0004
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.0002
      }
    }

    particleSystem.geometry.attributes.position.needsUpdate = true
  }

  renderer.render(scene, camera)

  // Static field for reduced-motion users: render one frame, no loop.
  if (!reduceMotion) {
    animationId = requestAnimationFrame(animate)
  }
  void timestamp
}

function onResize() {
  if (!camera || !renderer) return
  const { w, h } = containerSize()
  camera.aspect = w / h
  camera.updateProjectionMatrix()
  renderer.setSize(w, h)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  if (reduceMotion) renderer.render(scene!, camera)
}

function onMouseMove(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1
}

onMounted(async () => {
  await nextTick()
  reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  init()
  resizeObserver = new ResizeObserver(onResize)
  if (containerRef.value) resizeObserver.observe(containerRef.value)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  window.removeEventListener('mousemove', onMouseMove)

  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  if (scene) {
    scene.traverse((obj) => {
      if ((obj as THREE.Mesh).geometry) (obj as THREE.Mesh).geometry.dispose()
      if ((obj as THREE.Mesh).material) {
        const mat = (obj as THREE.Mesh).material
        if (Array.isArray(mat)) mat.forEach(m => m.dispose())
        else mat.dispose()
      }
    })
  }
})
</script>
