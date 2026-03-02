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
let cubeGroup: THREE.Group | null = null
let animationId: number | null = null
let particleSystem: THREE.Points | null = null
let constellationSystem: THREE.LineSegments | null = null
let uniforms: Record<string, { value: any }> = {}

const mouse = { x: 0, y: 0 }
let scrollProgress = 0

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

function lerp(a: number, b: number, t: number) {
  return a * (1 - t) + b * t
}

function init() {
  if (!containerRef.value) return

  scene = new THREE.Scene()
  scene.background = null

  camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  containerRef.value.appendChild(renderer.domElement)

  // Cube group
  cubeGroup = new THREE.Group()
  scene.add(cubeGroup)

  const geometry = new THREE.ConeGeometry(1.8, 2.8, 4, 4)

  uniforms = {
    iTime: { value: 0 },
    iResolution: { value: new THREE.Vector2(512, 512) },
    scrollProgress: { value: 0.0 }
  }

  const vertexShader = `
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;
    void main() {
      vUv = uv;
      vPosition = position;
      vNormal = normalize(normalMatrix * normal);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `

  const fragmentShader = `
    uniform float iTime;
    uniform vec2 iResolution;
    uniform float scrollProgress;
    varying vec2 vUv;
    varying vec3 vPosition;
    varying vec3 vNormal;

    void mainImage(out vec4 O, vec2 I) {
      vec2 r = iResolution.xy;
      vec2 z;
      vec2 i;
      vec2 f = I*(z+=4.-4.*abs(.7-dot(I=(I+I-r)/r.y, I)));
      float timeOffset = sin(iTime * 0.2) * 0.1;
      f.x += timeOffset;
      f.y -= timeOffset;
      float iterations = mix(8.0, 12.0, scrollProgress);
      for(O *= 0.; i.y++<iterations;
          O += (sin(f += cos(f.yx*i.y+i+iTime)/i.y+.7)+1.).xyyx
          * abs(f.x-f.y));
      O = tanh(7.*exp(z.x-4.-I.y*vec4(-1,1,2,0))/O);
      float pulse = 1.0 + 0.2 * sin(iTime * 0.5);
      O.rgb *= pulse;
      float nebula = sin(I.x * 0.01 + iTime * 0.3) * sin(I.y * 0.01 - iTime * 0.2);
      nebula = abs(nebula) * 0.5;
      vec3 color1 = mix(vec3(0.1, 0.2, 0.8), vec3(0.8, 0.1, 0.5), scrollProgress);
      vec3 color2 = mix(vec3(0.8, 0.2, 0.7), vec3(0.2, 0.8, 0.7), scrollProgress);
      vec3 colorMix = mix(color1, color2, sin(iTime * 0.2) * 0.5 + 0.5);
      O.rgb = mix(O.rgb, colorMix, nebula * (1.0 - length(O.rgb)));
    }

    void main() {
      vec2 cubeUV = vUv * iResolution;
      vec4 fragColor;
      mainImage(fragColor, cubeUV);
      float depthFactor = abs(dot(vNormal, vec3(0.0, 0.0, 1.0)));
      fragColor.rgb *= 0.7 + 0.3 * depthFactor;
      float edge = 1.0 - length(vUv - 0.5) * 2.0;
      edge = pow(clamp(edge, 0.0, 1.0), 3.0);
      fragColor.rgb += edge * vec3(0.1, 0.2, 0.8) * (0.6 + scrollProgress * 0.4);
      fragColor.rgb *= 2.0;
      gl_FragColor = fragColor;
    }
  `

  const material = new THREE.ShaderMaterial({
    vertexShader, fragmentShader, uniforms,
    transparent: true, side: THREE.DoubleSide
  })

  const cube = new THREE.Mesh(geometry, material)
  cube.castShadow = true
  cube.receiveShadow = true
  cubeGroup.add(cube)

  const wireframe = new THREE.LineSegments(
    new THREE.EdgesGeometry(geometry, 10),
    new THREE.LineBasicMaterial({ color: 0x4488ff, linewidth: 1.5, transparent: true, opacity: 0.1 })
  )
  wireframe.scale.setScalar(1.001)
  cubeGroup.add(wireframe)

  // Particles
  createParticles()

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.8)
  scene.add(ambient)
  const dir = new THREE.DirectionalLight(0xffffff, 1.5)
  dir.position.set(5, 10, 7)
  dir.castShadow = true
  scene.add(dir)
  const point = new THREE.PointLight(0x3366ff, 1.5, 20)
  point.position.set(-3, 2, 5)
  scene.add(point)

  // Scroll animation
  setupScrollAnimation()

  // Start render loop
  animate(0)
}

function createParticles() {
  if (!scene) return

  const PARTICLE_COUNT = 2000
  const DEPTH_RANGE = 12

  const positions = new Float32Array(PARTICLE_COUNT * 3)
  const originalPositions = new Float32Array(PARTICLE_COUNT * 3)
  const velocities = new Float32Array(PARTICLE_COUNT * 3)
  const sizes = new Float32Array(PARTICLE_COUNT)
  const colors = new Float32Array(PARTICLE_COUNT * 3)
  const depths = new Float32Array(PARTICLE_COUNT)

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(2 * Math.random() - 1)
    const radius = 3 + Math.random() * 3
    const depthExt = Math.random() * DEPTH_RANGE - DEPTH_RANGE / 2

    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta)
    positions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta)
    positions[i * 3 + 2] = radius * Math.cos(phi) + depthExt

    originalPositions[i * 3] = positions[i * 3]
    originalPositions[i * 3 + 1] = positions[i * 3 + 1]
    originalPositions[i * 3 + 2] = positions[i * 3 + 2]
    depths[i] = positions[i * 3 + 2]

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
  geo.setAttribute('originalPosition', new THREE.BufferAttribute(originalPositions, 3))
  geo.setAttribute('velocity', new THREE.BufferAttribute(velocities, 3))
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('depth', new THREE.BufferAttribute(depths, 1))

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

  const constMat = new THREE.LineBasicMaterial({
    color: 0x3366ff, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending
  })
  constellationSystem = new THREE.LineSegments(new THREE.BufferGeometry(), constMat)
  scene.add(constellationSystem)
}

function updateParticleZoom(progress: number) {
  if (!particleSystem) return

  const positions = particleSystem.geometry.attributes.position.array as Float32Array
  const originalPositions = particleSystem.geometry.attributes.originalPosition.array as Float32Array
  const sizes = particleSystem.geometry.attributes.size.array as Float32Array
  const colors = particleSystem.geometry.attributes.color.array as Float32Array
  const count = positions.length / 3

  let zoomCurve = progress < 0.5
    ? gsap.utils.clamp(0, 1, progress * 2)
    : gsap.utils.clamp(0, 1, 2 - progress * 2)
  zoomCurve = gsap.parseEase('power2.inOut')(zoomCurve)

  for (let i = 0; i < count; i++) {
    const i3 = i * 3
    const pushFactor = 1 + zoomCurve * 1.5
    positions[i3] = originalPositions[i3] * pushFactor
    positions[i3 + 1] = originalPositions[i3 + 1] * pushFactor

    const zPos = originalPositions[i3 + 2]
    let targetZ = Math.abs(zPos) > 1
      ? zPos * (1 - zoomCurve * 0.5)
      : zPos - zoomCurve * Math.sign(zPos) * 2
    positions[i3 + 2] = lerp(positions[i3 + 2], targetZ, 0.1)

    const distFromCamera = Math.abs(positions[i3 + 2])
    const closenessFactor = Math.max(0, 1 - distFromCamera / 5)
    const sizeBoost = 1 + zoomCurve * 4.0
    sizes[i] = (0.008 + 0.03 * closenessFactor) * sizeBoost

    const brightnessBoost = zoomCurve * 0.3
    const brightness = (0.5 + closenessFactor * 0.5) + brightnessBoost
    colors[i3] = 0.4 + 0.3 * brightness
    colors[i3 + 1] = 0.4 + 0.3 * brightness
    colors[i3 + 2] = 0.7 + 0.3 * brightness
  }

  particleSystem.geometry.attributes.position.needsUpdate = true
  particleSystem.geometry.attributes.size.needsUpdate = true
  particleSystem.geometry.attributes.color.needsUpdate = true
}

function setupScrollAnimation() {
  if (!cubeGroup || !camera) return

  const tl = gsap.timeline({
    scrollTrigger: {
      trigger: '.ai-training-content',
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.5,
      onUpdate: (self) => {
        scrollProgress = self.progress
        uniforms.scrollProgress.value = self.progress

        let zoomCurve = self.progress < 0.5
          ? gsap.utils.clamp(0, 1, self.progress * 2)
          : gsap.utils.clamp(0, 1, 2 - self.progress * 2)
        zoomCurve = gsap.parseEase('power2.inOut')(zoomCurve)

        const minFOV = 20
        const maxFOV = 60
        camera!.fov = maxFOV - (maxFOV - minFOV) * zoomCurve
        camera!.updateProjectionMatrix()

        cubeGroup!.scale.setScalar(1 + 0.2 * zoomCurve)
      }
    }
  })

  tl.to(cubeGroup.rotation, {
    x: Math.PI * 1.2,
    y: Math.PI * 2,
    z: Math.PI * 0.3,
    ease: 'power2.inOut',
    immediateRender: false
  })
  .to(camera.position, { z: 0.8, y: 0.2, x: 0, ease: 'power2.inOut' }, 0.5)
  .to(camera.position, { z: 4.0, y: 0, x: 0, ease: 'power2.inOut' }, 1.0)
  .to({}, {
    duration: 1,
    onUpdate() { camera!.lookAt(cubeGroup!.position) }
  }, 0)

  // Text animations are handled by the parent page component
}

function animate(timestamp: number) {
  animationId = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera || !cubeGroup) return

  const t = timestamp * 0.001
  uniforms.iTime.value = t

  if (!ScrollTrigger.isScrolling()) {
    cubeGroup.rotation.x += 0.0005
    cubeGroup.rotation.y += 0.0008
  }

  if (particleSystem) {
    updateParticleZoom(scrollProgress)

    const positions = particleSystem.geometry.attributes.position.array as Float32Array
    const velocities = particleSystem.geometry.attributes.velocity.array as Float32Array
    const count = positions.length / 3
    const connectedPoints: number[] = []

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
        positions[i3 + 2] = r * Math.cos(phi) * (1 - scrollProgress * 0.3)
        velocities[i3] = (Math.random() - 0.5) * 0.0004
        velocities[i3 + 1] = (Math.random() - 0.5) * 0.0004
        velocities[i3 + 2] = (Math.random() - 0.5) * 0.0002
      }

      if (i % 50 === 0 && scrollProgress > 0.6) {
        for (let j = i + 1; j < Math.min(i + 100, count); j += 10) {
          const j3 = j * 3
          const dx = positions[i3] - positions[j3]
          const dy = positions[i3 + 1] - positions[j3 + 1]
          const dz = positions[i3 + 2] - positions[j3 + 2]
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz)
          if (d < 0.5 && positions[i3 + 2] < 3 && positions[j3 + 2] < 3) {
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
      constellationSystem.material.opacity = Math.max(0, scrollProgress - 0.6) * 0.15
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

  if (!ScrollTrigger.isScrolling() && cubeGroup) {
    gsap.to(cubeGroup.rotation, {
      x: '+=' + (mouse.y * 0.03 - cubeGroup.rotation.x * 0.02),
      y: '+=' + (mouse.x * 0.03 - cubeGroup.rotation.y * 0.02),
      duration: 1,
      ease: 'power2.out',
      overwrite: 'auto'
    })
  }
}

function onClick() {
  if (!cubeGroup) return
  gsap.to(cubeGroup.rotation, {
    x: cubeGroup.rotation.x + Math.PI * 0.25 * (Math.random() - 0.5),
    y: cubeGroup.rotation.y + Math.PI * 0.25 * (Math.random() - 0.5),
    z: cubeGroup.rotation.z + Math.PI * 0.25 * (Math.random() - 0.5),
    duration: 1,
    ease: 'back.out(1.5)'
  })
}

onMounted(async () => {
  await nextTick()
  init()
  window.addEventListener('resize', onResize)
  window.addEventListener('mousemove', onMouseMove)
  document.addEventListener('click', onClick)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  window.removeEventListener('resize', onResize)
  window.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('click', onClick)

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
})
</script>
