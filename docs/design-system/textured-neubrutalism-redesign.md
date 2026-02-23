# Textured Neubrutalism Redesign Plan
## Agent Dashboard - Monday.com Style Interface

---

## 1. Design Philosophy

### Core Aesthetic: "Textured Neubrutalism" / "Premium Dev Tool Aesthetic"

The redesign moves from the current clean Nuxt UI default style to a deliberate intersection of:
- **Neubrutalism**: Raw grids, bold typography, direct presentation
- **Claymorphism**: Inflated 3D objects, soft organic shadows
- **Dev Tool Credibility**: Monospace hints, data tables, eval dashboard aesthetics

### Key Principles
1. **Tactile over glassy** - Physical, printed quality vs. mid-2010s flat design
2. **Data-forward presentation** - Tables and stats as hero content
3. **Brand cohesion through 3D** - Colored cubes as visual anchors
4. **Grid visibility** - Technical drafting aesthetic as decoration
5. **Floating elements** - Everything hovers slightly above the surface

---

## 2. Asset Requirements

### 2.1 Texture Assets (Create in `/public/textures/`)

```
public/textures/
├── noise-tile.webp           # Main grain overlay (subtle, 256x256 tileable)
├── noise-dark.webp           # Dark mode variant
├── footer-texture.webp       # Footer background grain
├── card-texture.webp         # Card surface texture
└── paper-texture.webp        # Paper-like overlay for content areas
```

**Generation approach**:
- Use CSS/SVG noise filters as fallback
- Create subtle 2-5% opacity grain overlays
- Tile seamlessly at 256x256 or 512x512
- Dark mode: invert + adjust contrast

### 2.2 Grid System

```
public/textures/
├── grid.svg                  # Technical grid pattern
├── grid-dots.svg             # Dot grid variant
└── grid-graph.svg            # Graph paper style
```

**CSS Implementation**:
```css
.bg-grid {
  background-image: url('/textures/grid.svg');
  background-size: 24px 24px;
}
```

### 2.3 3D Cube Brand System

```
public/brand/
├── cube-red.webp             # Browserbase - Primary red
├── cube-yellow.webp          # Stagehand - Yellow
├── cube-blue.webp            # Director - Blue  
├── cube-green.webp           # MCP - Green
└── cube-purple.webp          # Dashboard accent
```

**CSS-Only Alternative** (for MVP):
- Use CSS 3D transforms with `transform-style: preserve-3d`
- Colored div faces with soft shadows
- Subtle rotation animation on hover

### 2.4 Shadow System

```
public/shadows/
├── shadow-soft.webp          # Floating element shadow
├── shadow-card.webp          # Card lift shadow
└── shadow-button.webp        # Button press shadow
```

**CSS Implementation**:
```css
.shadow-float {
  box-shadow: 
    0 4px 0 0 rgba(0,0,0,0.1),
    0 8px 16px -4px rgba(0,0,0,0.15),
    0 2px 4px -1px rgba(0,0,0,0.1);
}

.shadow-lift {
  box-shadow: 
    0 1px 2px 0 rgba(0,0,0,0.05),
    0 4px 8px -2px rgba(0,0,0,0.1),
    0 8px 24px -4px rgba(0,0,0,0.08);
}
```

---

## 3. Color System

### 3.1 Primary Palette (Dark Mode First)

```css
:root {
  /* Core neutrals - warm paper tones */
  --nb-bg-primary: #0a0a0b;           /* Near black, slightly warm */
  --nb-bg-secondary: #141416;         /* Elevated surfaces */
  --nb-bg-tertiary: #1c1c1f;          /* Cards, panels */
  --nb-bg-elevated: #242428;          /* Hover states */
  
  /* Text colors */
  --nb-text-primary: #fafafa;         /* Primary text */
  --nb-text-secondary: #a1a1aa;       /* Muted text */
  --nb-text-tertiary: #71717a;        /* Subtle text */
  
  /* Accent colors - vibrant for neubrutalism */
  --nb-accent-primary: #FF6B6B;       /* Browserbase red */
  --nb-accent-secondary: #FFE66D;     /* Stagehand yellow */
  --nb-accent-tertiary: #4ECDC4;      /* Teal/green */
  --nb-accent-quaternary: #95E1D3;    /* Mint */
  
  /* Utility */
  --nb-border: #27272a;               /* Subtle borders */
  --nb-border-strong: #3f3f46;        /* Emphasized borders */
  --nb-grid: rgba(255,255,255,0.03);  /* Grid lines */
}
```

### 3.2 Light Mode Variant

```css
[data-theme="light"] {
  --nb-bg-primary: #fafaf9;           /* Warm white */
  --nb-bg-secondary: #f5f5f4;         /* Stone-100 */
  --nb-bg-tertiary: #e7e5e4;          /* Stone-200 */
  --nb-bg-elevated: #d6d3d1;          /* Stone-300 */
  
  --nb-text-primary: #1c1917;         /* Stone-900 */
  --nb-text-secondary: #57534e;       /* Stone-600 */
  --nb-text-tertiary: #a8a29e;        /* Stone-400 */
  
  --nb-border: #e7e5e4;
  --nb-border-strong: #d6d3d1;
  --nb-grid: rgba(0,0,0,0.03);
}
```

---

## 4. Typography System

### 4.1 Font Stack

```css
@theme {
  /* Primary: Geist or Inter - clean, technical */
  --font-sans: 'Geist', 'Inter', system-ui, sans-serif;
  
  /* Monospace: JetBrains Mono or Fira Code - dev credibility */
  --font-mono: 'JetBrains Mono', 'Fira Code', monospace;
  
  /* Display: Optional accent font for headlines */
  --font-display: 'Geist', sans-serif;
}
```

### 4.2 Type Scale (Neubrutalist - tighter, bolder)

```css
/* Hero/Display */
.text-display {
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 800;
  letter-spacing: -0.03em;
  line-height: 1;
}

/* Page titles */
.text-title {
  font-size: 1.875rem; /* 30px */
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.1;
}

/* Section headers */
.text-section {
  font-size: 1.25rem; /* 20px */
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
}

/* Card titles */
.text-card-title {
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

/* Body */
.text-body {
  font-size: 0.9375rem; /* 15px */
  font-weight: 400;
  line-height: 1.5;
}

/* Small/Caption */
.text-small {
  font-size: 0.8125rem; /* 13px */
  font-weight: 400;
  line-height: 1.4;
}

/* Monospace for data */
.font-mono-data {
  font-family: var(--font-mono);
  font-size: 0.875rem;
  font-feature-settings: 'tnum' 1;
}
```

---

## 5. Component Specifications

### 5.1 Cards (Neubrutalist Style)

```vue
<!-- NeubrutalistCard.vue -->
<template>
  <div 
    class="nb-card"
    :class="[
      variant,
      { 'is-hoverable': hoverable },
      { 'is-elevated': elevated }
    ]"
  >
    <div v-if="$slots.header" class="nb-card-header">
      <slot name="header" />
    </div>
    <div class="nb-card-body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="nb-card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
.nb-card {
  /* Base - tactile quality */
  background: var(--nb-bg-tertiary);
  border: 2px solid var(--nb-border-strong);
  border-radius: 4px; /* Minimal radius for neubrutalism */
  position: relative;
  
  /* Texture overlay */
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: url('/textures/noise-tile.webp');
    opacity: 0.03;
    pointer-events: none;
    border-radius: inherit;
  }
  
  /* Shadow - lifted effect */
  box-shadow: 
    4px 4px 0 0 var(--nb-border-strong),
    8px 8px 24px -8px rgba(0,0,0,0.3);
  
  transition: all 0.15s ease;
}

.nb-card.is-hoverable:hover {
  transform: translate(-2px, -2px);
  box-shadow: 
    6px 6px 0 0 var(--nb-border-strong),
    12px 12px 32px -8px rgba(0,0,0,0.35);
}

.nb-card.is-elevated {
  border-width: 2px;
  box-shadow: 
    6px 6px 0 0 var(--nb-accent-primary),
    12px 12px 32px -8px rgba(0,0,0,0.4);
}

.nb-card-header {
  padding: 1rem 1.25rem;
  border-bottom: 2px solid var(--nb-border);
  font-weight: 600;
}

.nb-card-body {
  padding: 1.25rem;
}

.nb-card-footer {
  padding: 1rem 1.25rem;
  border-top: 2px solid var(--nb-border);
  background: rgba(0,0,0,0.2);
}
</style>
```

### 5.2 Buttons (Bold, Pressable)

```vue
<!-- NeubrutalistButton.vue -->
<template>
  <button 
    class="nb-button"
    :class="[variant, size, { 'is-loading': loading }]"
    :disabled="disabled || loading"
  >
    <span class="nb-button-content">
      <slot />
    </span>
  </button>
</template>

<style scoped>
.nb-button {
  /* Reset */
  appearance: none;
  border: none;
  background: none;
  cursor: pointer;
  
  /* Layout */
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  
  /* Typography */
  font-family: var(--font-sans);
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  
  /* Neubrutalist styling */
  background: var(--nb-bg-elevated);
  border: 2px solid var(--nb-border-strong);
  border-radius: 4px;
  color: var(--nb-text-primary);
  
  /* 3D press effect */
  box-shadow: 3px 3px 0 0 var(--nb-border-strong);
  transform: translate(0, 0);
  
  transition: all 0.1s ease;
}

.nb-button:hover:not(:disabled) {
  background: var(--nb-bg-tertiary);
}

.nb-button:active:not(:disabled) {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 0 var(--nb-border-strong);
}

.nb-button.primary {
  background: var(--nb-accent-primary);
  border-color: var(--nb-accent-primary);
  color: var(--nb-bg-primary);
  box-shadow: 3px 3px 0 0 rgba(255, 107, 107, 0.4);
}

.nb-button.primary:hover:not(:disabled) {
  background: #ff8585;
}

.nb-button.secondary {
  background: var(--nb-accent-secondary);
  border-color: var(--nb-accent-secondary);
  color: var(--nb-bg-primary);
  box-shadow: 3px 3px 0 0 rgba(255, 230, 109, 0.4);
}
</style>
```

### 5.3 Data Tables (Hero Content Style)

```vue
<!-- NeubrutalistTable.vue -->
<template>
  <div class="nb-table-container">
    <!-- Grid background -->
    <div class="nb-table-grid-bg" aria-hidden="true" />
    
    <table class="nb-table">
      <thead>
        <tr>
          <th 
            v-for="col in columns" 
            :key="col.key"
            :class="{ 'is-sortable': col.sortable }"
          >
            {{ col.label }}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in data" :key="row.id">
          <td v-for="col in columns" :key="col.key">
            <slot :name="`cell-${col.key}`" :row="row" :value="row[col.key]">
              <span v-if="col.monospace" class="font-mono-data">
                {{ row[col.key] }}
              </span>
              <template v-else>{{ row[col.key] }}</template>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.nb-table-container {
  position: relative;
  border: 2px solid var(--nb-border-strong);
  border-radius: 4px;
  overflow: hidden;
  background: var(--nb-bg-secondary);
}

.nb-table-grid-bg {
  position: absolute;
  inset: 0;
  background-image: url('/textures/grid.svg');
  background-size: 24px 24px;
  opacity: 0.5;
  pointer-events: none;
}

.nb-table {
  width: 100%;
  border-collapse: collapse;
  position: relative;
  z-index: 1;
}

.nb-table th {
  padding: 0.875rem 1rem;
  text-align: left;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--nb-text-tertiary);
  background: var(--nb-bg-tertiary);
  border-bottom: 2px solid var(--nb-border-strong);
  font-family: var(--font-mono);
}

.nb-table td {
  padding: 1rem;
  border-bottom: 1px solid var(--nb-border);
  font-size: 0.9375rem;
}

.nb-table tbody tr:hover {
  background: var(--nb-bg-elevated);
}

.nb-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
```

### 5.4 Navigation (Sidebar)

```vue
<!-- NeubrutalistSidebar.vue -->
<template>
  <aside class="nb-sidebar">
    <!-- Grid overlay -->
    <div class="nb-sidebar-grid" aria-hidden="true" />
    
    <div class="nb-sidebar-header">
      <slot name="header" />
    </div>
    
    <nav class="nb-sidebar-nav">
      <slot />
    </nav>
    
    <div class="nb-sidebar-footer">
      <slot name="footer" />
    </div>
  </aside>
</template>

<style scoped>
.nb-sidebar {
  width: 280px;
  height: 100vh;
  background: var(--nb-bg-secondary);
  border-right: 2px solid var(--nb-border-strong);
  display: flex;
  flex-direction: column;
  position: relative;
}

.nb-sidebar-grid {
  position: absolute;
  inset: 0;
  background-image: url('/textures/grid-dots.svg');
  background-size: 20px 20px;
  opacity: 0.3;
  pointer-events: none;
}

.nb-sidebar-header {
  padding: 1.25rem;
  border-bottom: 2px solid var(--nb-border-strong);
  position: relative;
  z-index: 1;
}

.nb-sidebar-nav {
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem;
  position: relative;
  z-index: 1;
}

.nb-sidebar-footer {
  padding: 1rem;
  border-top: 2px solid var(--nb-border-strong);
  background: var(--nb-bg-tertiary);
  position: relative;
  z-index: 1;
}
</style>
```

### 5.5 3D Cube Component

```vue
<!-- BrandCube.vue -->
<template>
  <div 
    class="brand-cube"
    :class="`color-${color}`"
    :style="{ '--rotation': `${rotation}deg` }"
  >
    <div class="cube-face cube-front"></div>
    <div class="cube-face cube-back"></div>
    <div class="cube-face cube-right"></div>
    <div class="cube-face cube-left"></div>
    <div class="cube-face cube-top"></div>
    <div class="cube-face cube-bottom"></div>
    
    <!-- Shadow -->
    <div class="cube-shadow"></div>
  </div>
</template>

<script setup>
const props = defineProps({
  color: { type: String, default: 'red' }, // red, yellow, blue, green, purple
  size: { type: Number, default: 64 },
  rotation: { type: Number, default: -15 }
})
</script>

<style scoped>
.brand-cube {
  --cube-size: v-bind('`${size}px`');
  --cube-color: var(--nb-accent-primary);
  
  width: var(--cube-size);
  height: var(--cube-size);
  position: relative;
  transform-style: preserve-3d;
  transform: rotateX(-20deg) rotateY(var(--rotation));
  animation: float 6s ease-in-out infinite;
}

.brand-cube.color-red { --cube-color: #FF6B6B; }
.brand-cube.color-yellow { --cube-color: #FFE66D; }
.brand-cube.color-blue { --cube-color: #4ECDC4; }
.brand-cube.color-green { --cube-color: #95E1D3; }
.brand-cube.color-purple { --cube-color: #C7CEEA; }

.cube-face {
  position: absolute;
  width: var(--cube-size);
  height: var(--cube-size);
  background: var(--cube-color);
  border: 2px solid var(--nb-border-strong);
  border-radius: 4px;
}

.cube-front  { transform: translateZ(calc(var(--cube-size) / 2)); }
.cube-back   { transform: rotateY(180deg) translateZ(calc(var(--cube-size) / 2)); }
.cube-right  { transform: rotateY(90deg) translateZ(calc(var(--cube-size) / 2)); filter: brightness(0.9); }
.cube-left   { transform: rotateY(-90deg) translateZ(calc(var(--cube-size) / 2)); filter: brightness(1.1); }
.cube-top    { transform: rotateX(90deg) translateZ(calc(var(--cube-size) / 2)); filter: brightness(1.2); }
.cube-bottom { transform: rotateX(-90deg) translateZ(calc(var(--cube-size) / 2)); filter: brightness(0.7); }

.cube-shadow {
  position: absolute;
  width: var(--cube-size);
  height: var(--cube-size);
  background: rgba(0,0,0,0.2);
  transform: rotateX(90deg) translateZ(calc(var(--cube-size) * -0.8));
  filter: blur(8px);
  border-radius: 50%;
}

@keyframes float {
  0%, 100% { transform: rotateX(-20deg) rotateY(var(--rotation)) translateY(0); }
  50% { transform: rotateX(-20deg) rotateY(var(--rotation)) translateY(-8px); }
}
</style>
```

---

## 6. Page Layout Specifications

### 6.1 Dashboard Home (Agency Overview)

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Header: "Dashboard" + Workspace Selector     │
│            │                                               │
│ [3D Cube]  │  ┌─────────────────────────────────────────┐  │
│            │  │  KPI Cards (4-up) - Neubrutalist style  │  │
│ Navigation │  │  Each with shadow, texture, bold numbers│  │
│            │  └─────────────────────────────────────────┘  │
│            │                                               │
│            │  ┌──────────────────┐ ┌──────────────────┐   │
│            │  │  Recent Tasks    │ │  Activity Feed   │   │
│            │  │  (Table view)    │ │  (Timeline)      │   │
│            │  │                  │ │                  │   │
│            │  └──────────────────┘ └──────────────────┘   │
│            │                                               │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │  Board Grid - Claymorphic cards         │  │
│            │  │  with 3D hover effect                   │  │
│            │  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Monday Migration Page (Data-Forward)

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Header: "Monday.com Migration"               │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │  Connection Status Card                 │  │
│            │  │  [Status Dot] [Text] [Button]           │  │
│            │  └─────────────────────────────────────────┘  │
│            │                                               │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │  Migration Progress (if active)         │  │
│            │  │  Progress bar + Stats grid              │  │
│            │  └─────────────────────────────────────────┘  │
│            │                                               │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │  Migration History Table                │  │
│            │  │  - Grid background visible              │  │
│            │  │  - Monospace numbers                    │  │
│            │  │  - Status badges with strong borders    │  │
│            │  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Boards Index (Workspace Grid)

```
┌─────────────────────────────────────────────────────────────┐
│ [Sidebar]  │  Header: "All Workspaces" + [New Board Btn]   │
│            │                                               │
│            │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │
│            │  │ WS 1 │ │ WS 2 │ │ WS 3 │ │ WS 4 │        │
│            │  │      │ │      │ │      │ │ +    │        │
│            │  │ Icon │ │ Icon │ │ Icon │ │ New  │        │
│            │  │ Name │ │ Name │ │ Name │ │      │        │
│            │  │Stats │ │Stats │ │Stats │ │      │        │
│            │  └──────┘ └──────┘ └──────┘ └──────┘        │
│            │                                               │
│            │  Recent Boards                                │
│            │  ┌─────────────────────────────────────────┐  │
│            │  │ Horizontal scroll with board cards      │  │
│            │  │ Each card has subtle lift on hover      │  │
│            │  └─────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 7. Animation Specifications

### 7.1 Micro-interactions

```css
/* Card hover lift */
@keyframes card-lift {
  from {
    transform: translate(0, 0);
    box-shadow: 4px 4px 0 0 var(--nb-border-strong);
  }
  to {
    transform: translate(-2px, -2px);
    box-shadow: 6px 6px 0 0 var(--nb-border-strong), 8px 8px 24px rgba(0,0,0,0.15);
  }
}

/* Button press */
@keyframes button-press {
  to {
    transform: translate(2px, 2px);
    box-shadow: 1px 1px 0 0 currentColor;
  }
}

/* Page transition */
@keyframes page-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* Stagger children */
@keyframes stagger-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

### 7.2 Scroll Behaviors

```css
/* Smooth scroll */
html {
  scroll-behavior: smooth;
}

/* Fade in on scroll */
.scroll-reveal {
  opacity: 0;
  transform: translateY(20px);
  transition: opacity 0.4s ease, transform 0.4s ease;
}

.scroll-reveal.is-visible {
  opacity: 1;
  transform: translateY(0);
}
```

---

## 8. Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Create texture assets (CSS-generated first)
- [ ] Set up CSS custom properties (color system)
- [ ] Install/configure fonts (Geist + JetBrains Mono)
- [ ] Create base neubrutalist CSS utilities

### Phase 2: Core Components (Week 1-2)
- [ ] `NeubrutalistCard` component
- [ ] `NeubrutalistButton` component  
- [ ] `NeubrutalistTable` component
- [ ] `BrandCube` 3D component
- [ ] Updated sidebar navigation

### Phase 3: Page Redesigns (Week 2-3)
- [ ] Dashboard home page
- [ ] Agency boards index
- [ ] Monday migration page
- [ ] Admin pages

### Phase 4: Polish (Week 3-4)
- [ ] Animation refinements
- [ ] Dark/light mode toggle
- [ ] Performance optimization
- [ ] Accessibility audit

---

## 9. CSS Utility Classes

```css
/* utilities/neubrutalism.css */

/* Texture backgrounds */
.nb-texture {
  position: relative;
}
.nb-texture::before {
  content: '';
  position: absolute;
  inset: 0;
  background-image: url('/textures/noise-tile.webp');
  opacity: 0.03;
  pointer-events: none;
}

/* Grid backgrounds */
.nb-grid-bg {
  background-image: url('/textures/grid.svg');
  background-size: 24px 24px;
}

.nb-grid-dots {
  background-image: radial-gradient(circle, var(--nb-grid) 1px, transparent 1px);
  background-size: 20px 20px;
}

/* Strong borders (neubrutalist signature) */
.nb-border {
  border: 2px solid var(--nb-border-strong);
  border-radius: 4px;
}

/* Lifted shadow effect */
.nb-shadow {
  box-shadow: 4px 4px 0 0 var(--nb-border-strong);
}

.nb-shadow-lg {
  box-shadow: 
    6px 6px 0 0 var(--nb-border-strong),
    12px 12px 32px -8px rgba(0,0,0,0.3);
}

/* Accent shadows */
.nb-shadow-accent {
  box-shadow: 4px 4px 0 0 var(--nb-accent-primary);
}

/* Pressed state */
.nb-pressed {
  transform: translate(2px, 2px);
  box-shadow: 1px 1px 0 0 var(--nb-border-strong);
}

/* Monospace data styling */
.nb-mono {
  font-family: var(--font-mono);
  font-feature-settings: 'tnum' 1;
  font-size: 0.875rem;
}

/* Status badges */
.nb-badge {
  display: inline-flex;
  padding: 0.25rem 0.625rem;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  border: 2px solid;
  border-radius: 4px;
}

.nb-badge-success {
  background: rgba(78, 205, 196, 0.15);
  border-color: #4ECDC4;
  color: #4ECDC4;
}

.nb-badge-warning {
  background: rgba(255, 230, 109, 0.15);
  border-color: #FFE66D;
  color: #FFE66D;
}

.nb-badge-error {
  background: rgba(255, 107, 107, 0.15);
  border-color: #FF6B6B;
  color: #FF6B6B;
}
```

---

## 10. File Structure

```
app/
├── assets/
│   ├── css/
│   │   ├── main.css              # Existing - keep
│   │   ├── neubrutalism.css      # NEW: Core design system
│   │   ├── textures.css          # NEW: Texture utilities
│   │   └── animations.css        # NEW: Animation keyframes
│   └── fonts/                    # NEW: Self-hosted fonts (optional)
├── components/
│   ├── neubrutalism/             # NEW: Design system components
│   │   ├── NbCard.vue
│   │   ├── NbButton.vue
│   │   ├── NbTable.vue
│   │   ├── NbSidebar.vue
│   │   ├── NbBadge.vue
│   │   ├── NbInput.vue
│   │   └── NbSelect.vue
│   ├── brand/                    # NEW: Brand elements
│   │   ├── BrandCube.vue
│   │   ├── BrandLogo.vue
│   │   └── BrandMark.vue
│   └── ... (existing components)
├── layouts/
│   ├── default.vue               # UPDATE: Apply new design
│   ├── agency.vue                # UPDATE: Apply new design
│   └── admin.vue                 # UPDATE: Apply new design
├── pages/
│   └── ... (existing - apply incrementally)
└── composables/
    └── useNeubrutalism.ts        # NEW: Design system composable

public/
├── textures/                     # NEW: Texture assets
│   ├── noise-tile.webp
│   ├── grid.svg
│   └── shadows/
├── fonts/                        # NEW: Self-hosted fonts
└── ...
```

---

## 11. Usage Examples

### Basic Card
```vue
<NbCard hoverable elevated>
  <template #header>
    <h3>Migration Status</h3>
  </template>
  <p>Content goes here with tactile texture.</p>
  <template #footer>
    <NbButton variant="primary">Action</NbButton>
  </template>
</NbCard>
```

### Data Table
```vue
<NbTable 
  :columns="columns" 
  :data="migrations"
  show-grid
>
  <template #cell-status="{ row }">
    <NbBadge :variant="row.status">{{ row.status }}</NbBadge>
  </template>
</NbTable>
```

### With 3D Cube
```vue
<div class="flex items-center gap-4">
  <BrandCube color="red" :size="48" />
  <div>
    <h1 class="text-title">Monday Migration</h1>
    <p class="text-body text-secondary">Import your boards</p>
  </div>
</div>
```

---

## 12. Design Comparison

| Element | Current (Nuxt UI) | New (Textured Neubrutalism) |
|---------|------------------|----------------------------|
| Cards | Soft shadows, 8px radius | Hard shadows, 4px radius, offset |
| Buttons | Subtle hover | 3D press effect, bold borders |
| Tables | Clean, minimal | Grid background, monospace numbers |
| Sidebar | Flat | Textured, grid dots, tactile |
| Icons | Lucide default | Same, but with "floating" containers |
| Typography | Inter default | Geist, tighter tracking, bolder |
| Colors | Green accent | Multi-color system (red/yellow/blue/green) |
| Background | Solid | Subtle grain texture overlay |

---

## 13. Quick Start Implementation

### Step 1: Add CSS Variables (app/assets/css/neubrutalism.css)
```css
@import "tailwindcss" theme(static);

@theme static {
  /* Neubrutalism Color System */
  --color-nb-bg-primary: #0a0a0b;
  --color-nb-bg-secondary: #141416;
  --color-nb-bg-tertiary: #1c1c1f;
  --color-nb-bg-elevated: #242428;
  
  --color-nb-text-primary: #fafafa;
  --color-nb-text-secondary: #a1a1aa;
  --color-nb-text-tertiary: #71717a;
  
  --color-nb-accent-red: #FF6B6B;
  --color-nb-accent-yellow: #FFE66D;
  --color-nb-accent-teal: #4ECDC4;
  --color-nb-accent-mint: #95E1D3;
  
  --color-nb-border: #27272a;
  --color-nb-border-strong: #3f3f46;
}
```

### Step 2: Update nuxt.config.ts
```typescript
css: [
  '~/assets/css/main.css',
  '~/assets/css/neubrutalism.css'
]
```

### Step 3: Create First Component
Copy the `NbCard.vue` example from Section 5.1 into `app/components/neubrutalism/NbCard.vue`

---

*Document Version: 1.0*
*Last Updated: 2026-02-22*
