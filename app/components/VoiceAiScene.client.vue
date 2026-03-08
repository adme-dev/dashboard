<template>
  <div ref="containerRef" class="fixed inset-0 z-[1] pointer-events-none" />
</template>

<script setup lang="ts">
import * as THREE from 'three'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

const containerRef = ref<HTMLDivElement>()

let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let animationId: number | null = null
let waveGroup: THREE.Group | null = null
let particleSystem: THREE.Points | null = null
let orbGroup: THREE.Group | null = null
let constellationSystem: THREE.LineSegments | null = null
let uniforms: Record<string, { value: any }> = {}

const mouse = { x: 0, y: 0 }
let scrollProgress = 0

// --- Audio-reactive waveform ring ---
const RING_COUNT = 5
const RING_SEGMENTS = 128
let ringMeshes: THREE.Line[] = []

function createStarTexture(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
  gradient.addColorStop(0.15, 'rgba(180, 200, 255, 0.8)')
  gradient.addColorStop(0.4, 'rgba(120, 140, 255, 0.4)')
  gradient.addColorStop(1, 'rgba(40, 40, 180, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 64, 64)

  const texture = new THREE.Texture(canvas)
  texture.needsUpdate = true
  return texture
}

function lerp(a: number, b: number, t: number) {
  return a * (1 - t) + b * t
}

function init() {
  if (!containerRef.value) return

  scene = new THREE.Scene()
  scene.background = null

  camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 0, 6)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  containerRef.value.appendChild(renderer.domElement)

  // Central orb group
  orbGroup = new THREE.Group()
  scene.add(orbGroup)

  // Shader orb — voice "source" in center
  createCentralOrb()

  // Waveform rings — audio-reactive concentric rings
  waveGroup = new THREE.Group()
  scene.add(waveGroup)
  createWaveRings()

  // Floating particles — ambient depth
  createParticles()

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.4)
  scene.add(ambient)
  const point1 = new THREE.PointLight(0x6366f1, 2.5, 25) // indigo
  point1.position.set(-4, 3, 5)
  scene.add(point1)
  const point2 = new THREE.PointLight(0x06b6d4, 1.8, 25) // cyan
  point2.position.set(4, -2, 3)
  scene.add(point2)

  setupScrollAnimation()
  animate(0)
}

function createCentralOrb() {
  if (!orbGroup) return

  const geometry = new THREE.IcosahedronGeometry(0.8, 6)

  uniforms = {
    iTime: { value: 0 },
    scrollProgress: { value: 0.0 },
    mouseX: { value: 0 },
    mouseY: { value: 0 },
  }

  const vertexShader = `
    uniform float iTime;
    uniform float scrollProgress;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vDisplacement;

    // Simplex noise approximation
    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0/6.0, 1.0/3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
        i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0))
        + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
    }

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);

      // Voice-like displacement — multiple frequencies
      float speed = iTime * 0.8;
      float noiseScale = 2.0 + scrollProgress * 1.5;
      float n1 = snoise(position * noiseScale + speed) * 0.15;
      float n2 = snoise(position * noiseScale * 2.0 + speed * 1.3) * 0.08;
      float n3 = snoise(position * noiseScale * 4.0 + speed * 2.0) * 0.04;

      // Breathing amplitude tied to simulated voice
      float breathe = sin(iTime * 1.2) * 0.5 + 0.5;
      float voiceAmp = mix(0.6, 1.0, breathe);
      float displacement = (n1 + n2 + n3) * voiceAmp;
      vDisplacement = displacement;

      vec3 newPosition = position + normal * displacement;
      vPosition = newPosition;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
    }
  `

  const fragmentShader = `
    uniform float iTime;
    uniform float scrollProgress;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    varying float vDisplacement;

    void main() {
      // Fresnel edge glow
      float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);

      // Color palette — indigo/cyan/violet shifting with scroll
      vec3 colorA = vec3(0.39, 0.40, 0.95); // indigo
      vec3 colorB = vec3(0.02, 0.71, 0.83); // cyan
      vec3 colorC = vec3(0.58, 0.29, 0.87); // violet

      float t = sin(iTime * 0.3) * 0.5 + 0.5;
      vec3 baseColor = mix(colorA, colorB, t);
      baseColor = mix(baseColor, colorC, scrollProgress);

      // Displacement glow — brighter where displaced more
      float dispGlow = abs(vDisplacement) * 6.0;
      vec3 glowColor = mix(vec3(0.02, 0.71, 0.83), vec3(0.8, 0.3, 0.9), scrollProgress);

      vec3 color = baseColor * (0.4 + fresnel * 0.8);
      color += glowColor * dispGlow * 0.5;
      color += vec3(0.7, 0.8, 1.0) * fresnel * 0.6;

      // Inner luminance
      float inner = 1.0 - length(vUv - 0.5) * 1.8;
      inner = clamp(inner, 0.0, 1.0);
      color += baseColor * inner * 0.2;

      float alpha = 0.85 + fresnel * 0.15;
      gl_FragColor = vec4(color, alpha);
    }
  `

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
  })

  const orb = new THREE.Mesh(geometry, material)
  orbGroup.add(orb)

  // Wireframe overlay
  const wireGeo = new THREE.IcosahedronGeometry(0.82, 3)
  const wireframe = new THREE.LineSegments(
    new THREE.EdgesGeometry(wireGeo, 8),
    new THREE.LineBasicMaterial({
      color: 0x6366f1,
      transparent: true,
      opacity: 0.06,
      blending: THREE.AdditiveBlending,
    })
  )
  orbGroup.add(wireframe)
}

function createWaveRings() {
  if (!waveGroup) return

  const colors = [
    new THREE.Color(0x6366f1), // indigo
    new THREE.Color(0x06b6d4), // cyan
    new THREE.Color(0x8b5cf6), // violet
    new THREE.Color(0x06b6d4), // cyan
    new THREE.Color(0x6366f1), // indigo
  ]

  for (let r = 0; r < RING_COUNT; r++) {
    const radius = 1.5 + r * 0.6
    const points: THREE.Vector3[] = []
    for (let s = 0; s <= RING_SEGMENTS; s++) {
      const theta = (s / RING_SEGMENTS) * Math.PI * 2
      points.push(new THREE.Vector3(
        Math.cos(theta) * radius,
        Math.sin(theta) * radius,
        0
      ))
    }

    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({
      color: colors[r],
      transparent: true,
      opacity: 0.25 - r * 0.035,
      blending: THREE.AdditiveBlending,
    })

    const ring = new THREE.Line(geometry, material)
    waveGroup.add(ring)
    ringMeshes.push(ring)
  }
}

function createParticles() {
  if (!scene) return

  const PARTICLE_COUNT = 1500
  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const originalPositions = new Float32Array(PARTICLE_COUNT * 3)
  const velocities = new Float32Array(PARTICLE_COUNT * 3)
  const sizes = new Float32Array(PARTICLE_COUNT)
  const colors = new Float32Array(PARTICLE_COUNT * 3)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const radius = 4 + Math.random() * 6

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = (Math.random() - 0.5) * 10

    originalPositions[i * 3] = positions[i * 3]
    originalPositions[i * 3 + 1] = positions[i * 3 + 1]
    originalPositions[i * 3 + 2] = positions[i * 3 + 2]

    velocities[i * 3] = (Math.random() - 0.5) * 0.0003
    velocities[i * 3 + 1] = (Math.random() - 0.5) * 0.0003
    velocities[i * 3 + 2] = (Math.random() - 0.5) * 0.0001

    sizes[i] = 0.005 + Math.random() * 0.025

    // Indigo/cyan palette
    const colorChoice = Math.random()
    if (colorChoice < 0.4) {
      colors[i * 3] = 0.39; colors[i * 3 + 1] = 0.40; colors[i * 3 + 2] = 0.95
    } else if (colorChoice < 0.7) {
      colors[i * 3] = 0.02; colors[i * 3 + 1] = 0.71; colors[i * 3 + 2] = 0.83
    } else {
      colors[i * 3] = 0.55; colors[i * 3 + 1] = 0.36; colors[i * 3 + 2] = 0.87
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3))
  geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

  const mat = new THREE.PointsMaterial({
    size: 0.025,
    map: createStarTexture(),
    transparent: true,
    vertexColors: true,
    opacity: 0.8,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    sizeAttenuation: true,
  })

  particleSystem = new THREE.Points(geo, mat)
  scene.add(particleSystem)

  // Constellation lines
  const constMat = new THREE.LineBasicMaterial({
    color: 0x6366f1,
    transparent: true,
    opacity: 0.06,
    blending: THREE.AdditiveBlending,
  })
  constellationSystem = new THREE.LineSegments(new THREE.BufferGeometry(), constMat)
  scene.add(constellationSystem)
}

function updateWaveRings(time: number) {
  ringMeshes.forEach((ring, r) => {
    const positions = ring.geometry.attributes.position.array as Float32Array
    const radius = 1.5 + r * 0.6

    for (let s = 0; s <= RING_SEGMENTS; s++) {
      const theta = (s / RING_SEGMENTS) * Math.PI * 2
      const i3 = s * 3

      // Multi-frequency wave displacement (simulates voice waveform)
      const freq1 = Math.sin(theta * 3 + time * 2.0 + r * 0.8) * 0.12
      const freq2 = Math.sin(theta * 7 + time * 3.5 + r * 1.2) * 0.06
      const freq3 = Math.sin(theta * 13 + time * 5.0 + r * 0.4) * 0.03
      const freq4 = Math.sin(theta * 2 + time * 0.7) * 0.08

      // Breathing envelope
      const breathe = Math.sin(time * 1.2 + r * 0.5) * 0.5 + 0.5
      const amplitude = mix(0.3, 1.0, breathe) * (1 + scrollProgress * 0.5)
      const wave = (freq1 + freq2 + freq3 + freq4) * amplitude

      const r2 = radius + wave
      positions[i3] = Math.cos(theta) * r2
      positions[i3 + 1] = Math.sin(theta) * r2
      positions[i3 + 2] = Math.sin(theta * 2 + time * 0.5 + r) * 0.15 * scrollProgress
    }

    ring.geometry.attributes.position.needsUpdate = true

    // Fade opacity based on scroll
    const mat = ring.material as THREE.LineBasicMaterial
    mat.opacity = lerp(0.25 - r * 0.035, 0.12, scrollProgress)
  })
}

function mix(a: number, b: number, t: number) {
  return a * (1 - t) + b * t
}

function setupScrollAnimation() {
  if (!orbGroup || !camera) return

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '.voice-ai-content',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,
      onUpdate: (self) => {
        scrollProgress = self.progress
        uniforms.scrollProgress.value = self.progress
      },
    },
  })

  // Orb rotates and scales
  tl.to(orbGroup.rotation, {
    x: Math.PI * 0.8,
    y: Math.PI * 1.5,
    z: Math.PI * 0.2,
    ease: 'power2.inOut',
    immediateRender: false,
  })
  // Camera zooms in then out
  .to(camera.position, { z: 3.5, ease: 'power2.inOut' }, 0)
  .to(camera.position, { z: 7.0, ease: 'power2.inOut' }, 0.6)
  // Camera pans subtly
  .to(camera.position, { x: 0.5, y: 0.3, ease: 'power2.inOut' }, 0)
  .to(camera.position, { x: -0.3, y: -0.2, ease: 'power2.inOut' }, 0.5)
  .to({}, {
    duration: 1,
    onUpdate() { camera!.lookAt(orbGroup!.position) },
  }, 0)
}

function animate(timestamp: number) {
  animationId = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera) return

  const t = timestamp * 0.001
  uniforms.iTime.value = t

  // Slow rotation when not scrolling
  if (orbGroup && !ScrollTrigger.isScrolling()) {
    orbGroup.rotation.x += 0.0003
    orbGroup.rotation.y += 0.0005
  }

  // Wave ring animation
  if (waveGroup) {
    waveGroup.rotation.z = t * 0.05
    updateWaveRings(t)
  }

  // Particle movement
  if (particleSystem) {
    const positions = particleSystem.geometry.attributes.position.array as Float32Array
    const velocities = particleSystem.geometry.attributes.velocity.array as Float32Array
    const count = positions.length / 3
    const connectedPoints: number[] = []

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      positions[i3] += velocities[i3]
      positions[i3 + 1] += velocities[i3 + 1]
      positions[i3 + 2] += velocities[i3 + 2]

      // Gentle mouse attraction
      positions[i3] += (mouse.x * 3 - positions[i3]) * 0.00005
      positions[i3 + 1] += (mouse.y * 3 - positions[i3 + 1]) * 0.00005

      // Recycle far particles
      const dist = Math.sqrt(positions[i3] ** 2 + positions[i3 + 1] ** 2 + positions[i3 + 2] ** 2)
      if (dist > 12) {
        const theta = Math.random() * Math.PI * 2
        const phi = Math.acos(2 * Math.random() - 1)
        const r = 5 + Math.random() * 3
        positions[i3] = r * Math.sin(phi) * Math.cos(theta)
        positions[i3 + 1] = r * Math.sin(phi) * Math.sin(theta)
        positions[i3 + 2] = r * Math.cos(phi)
      }

      // Constellation lines at mid-scroll
      if (i % 40 === 0 && scrollProgress > 0.3 && scrollProgress < 0.8) {
        for (let j = i + 1; j < Math.min(i + 80, count); j += 8) {
          const j3 = j * 3
          const dx = positions[i3] - positions[j3]
          const dy = positions[i3 + 1] - positions[j3 + 1]
          const dz = positions[i3 + 2] - positions[j3 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < 0.8) {
            connectedPoints.push(
              positions[i3], positions[i3 + 1], positions[i3 + 2],
              positions[j3], positions[j3 + 1], positions[j3 + 2]
            )
          }
        }
      }
    }

    if (constellationSystem) {
      constellationSystem.geometry.setAttribute(
        'position', new THREE.Float32BufferAttribute(connectedPoints, 3)
      )
      constellationSystem.geometry.attributes.position.needsUpdate = true
      const opRange = Math.max(0, Math.min(scrollProgress - 0.3, 0.8 - scrollProgress)) * 0.3
      ;(constellationSystem.material as THREE.LineBasicMaterial).opacity = opRange
    }

    particleSystem.geometry.attributes.position.needsUpdate = true
  }

  renderer.render(scene, camera)
}

function onResize() {
  if (!camera || !renderer) return
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
}

function onMouseMove(e: MouseEvent) {
  mouse.x = (e.clientX / window.innerWidth) * 2 - 1
  mouse.y = -(e.clientY / window.innerHeight) * 2 + 1

  if (!ScrollTrigger.isScrolling() && orbGroup) {
    gsap.to(orbGroup.rotation, {
      x: '+=' + (mouse.y * 0.02),
      y: '+=' + (mouse.x * 0.02),
      duration: 1.2,
      ease: 'power2.out',
      overwrite: 'auto',
    })
  }
}

onMounted(async () => {
  await nextTick()
  init()
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)

  ScrollTrigger.getAll().forEach(st => st.kill())

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
  ringMeshes = []
})
</script>
