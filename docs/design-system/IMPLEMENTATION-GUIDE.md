# Textured Neubrutalism - Implementation Guide

## Overview

This guide walks you through implementing the "Textured Neubrutalism" design system into the Agent Dashboard.

## What's Been Created

### 1. Design System CSS (`app/assets/css/neubrutalism.css`)
A complete CSS framework with:
- CSS custom properties (design tokens)
- Texture overlays (SVG noise)
- Grid backgrounds
- Neubrutalist shadows and borders
- Component base styles (cards, buttons, tables, etc.)
- Animation keyframes

### 2. Vue Components (`app/components/neubrutalism/`)

| Component | Purpose |
|-----------|---------|
| `NbCard.vue` | Container with texture, offset shadow |
| `NbButton.vue` | 3D press-effect buttons |
| `NbBadge.vue` | Status badges with strong borders |
| `NbTable.vue` | Data tables with grid background |
| `NbInput.vue` | Form inputs with inset shadows |
| `NbProgress.vue` | Progress bars with texture |

### 3. Brand Components (`app/components/brand/`)

| Component | Purpose |
|-----------|---------|
| `BrandCube.vue` | 3D animated cubes (red/yellow/blue/green/purple) |

### 4. Demo Page (`app/pages/design-system.vue`)
Visual showcase of all components and patterns.

---

## Quick Start

### Step 1: View the Design System
```bash
npm run dev
# Navigate to: http://localhost:3000/design-system
```

### Step 2: Use Components in Your Pages

```vue
<template>
  <div class="p-8">
    <!-- Card with content -->
    <NbCard title="Migration Status" hoverable elevated>
      <p>Your migration is 68% complete.</p>
      <template #footer>
        <NbButton variant="primary">View Details</NbButton>
      </template>
    </NbCard>
    
    <!-- With 3D cube -->
    <div class="flex items-center gap-4 mt-6">
      <BrandCube color="red" :size="48" />
      <h1 class="nb-text-title">Monday Migration</h1>
    </div>
  </div>
</template>

<script setup>
// Components are auto-imported by Nuxt
</script>
```

---

## Migration Strategy

### Phase 1: Foundation (Immediate)
1. ✅ CSS imported in `main.css`
2. ✅ Components created
3. ✅ Demo page ready

### Phase 2: Layout Updates
Update these files to use new design:

```
app/layouts/
├── default.vue          # Main app layout
├── agency.vue           # Agency workspace layout
└── admin.vue            # Admin settings layout
```

### Phase 3: Page Updates (Priority Order)

1. **Dashboard Home** (`pages/index.vue`)
   - Replace KPICards with NbCard components
   - Add BrandCube to header
   - Use NbTable for data

2. **Monday Migration** (`pages/agency/monday.vue`)
   - Use elevated cards for connection status
   - Replace progress bars with NbProgress
   - Migration history as NbTable

3. **Boards Index** (`pages/agency/boards/index.vue`)
   - Grid of hoverable cards
   - BrandCube accents per workspace

4. **Admin Pages** (`pages/admin/`)
   - Consistent card layouts
   - Data-forward table presentations

### Phase 4: Component Replacement Map

| Current | New | Notes |
|---------|-----|-------|
| `UCard` | `NbCard` | Add `hoverable` for interaction |
| `UButton` | `NbButton` | Same props, new aesthetic |
| `UTable` | `NbTable` | Add `show-grid` prop |
| `UBadge` | `NbBadge` | Variants: neutral/primary/secondary/success/warning/error |
| `UInput` | `NbInput` | Similar API |
| `UProgress` | `NbProgress` | Better label support |

---

## Design Tokens Reference

### Colors
```css
/* Backgrounds */
var(--nb-bg-primary)     /* #0a0a0b - Main background */
var(--nb-bg-secondary)   /* #141416 - Sidebar */
var(--nb-bg-tertiary)    /* #1c1c1f - Cards */
var(--nb-bg-elevated)    /* #242428 - Hover states */

/* Accents */
var(--nb-accent-red)     /* #FF6B6B - Primary actions */
var(--nb-accent-yellow)  /* #FFE66D - Secondary */
var(--nb-accent-teal)    /* #4ECDC4 - Success */
var(--nb-accent-mint)    /* #95E1D3 - Tertiary */
var(--nb-accent-purple)  /* #C7CEEA - Brand */

/* Text */
var(--nb-text-primary)   /* #fafafa */
var(--nb-text-secondary) /* #a1a1aa */
var(--nb-text-tertiary)  /* #71717a */
```

### Utility Classes
```css
/* Texture */
.nb-texture      /* Noise overlay */
.nb-grid         /* Grid lines */
.nb-grid-dots    /* Dot grid */

/* Shadows */
.nb-shadow       /* 4px offset */
.nb-shadow-lg    /* 6px offset + blur */
.nb-shadow-red   /* Accent colored */

/* Borders */
.nb-border       /* 2px solid */
.nb-border-thin  /* 1px solid */
```

### Typography Classes
```css
.nb-text-display      /* Hero text */
.nb-text-title        /* Page titles */
.nb-text-section      /* Section headers */
.nb-text-card-title   /* Card titles */
.nb-text-body         /* Body text */
.nb-text-small        /* Captions */
.nb-text-mono         /* Monospace data */
.nb-text-label        /* Uppercase labels */
```

---

## Page-Specific Guidelines

### Dashboard Page
```vue
<template>
  <div class="nb-root nb-grid-dots min-h-screen">
    <!-- Header with cube -->
    <header class="flex items-center gap-4 p-6">
      <BrandCube color="red" :size="48" />
      <h1 class="nb-text-title">Dashboard</h1>
    </header>
    
    <!-- KPI Cards -->
    <div class="grid grid-cols-4 gap-4 p-6">
      <NbCard v-for="kpi in kpis" :key="kpi.id" hoverable>
        <div class="nb-text-label">{{ kpi.label }}</div>
        <div class="nb-text-mono text-2xl font-bold">{{ kpi.value }}</div>
      </NbCard>
    </div>
  </div>
</template>
```

### Migration Page
```vue
<template>
  <div class="p-6 space-y-6">
    <!-- Connection status - elevated -->
    <NbCard elevated>
      <div class="flex items-center gap-4">
        <BrandCube color="blue" :size="48" />
        <div>
          <h2 class="nb-text-card-title">Monday.com Connection</h2>
          <p class="nb-text-body">Connected to account</p>
        </div>
        <NbBadge variant="success">Connected</NbBadge>
      </div>
    </NbCard>
    
    <!-- Progress -->
    <NbCard>
      <NbProgress label="Migration Progress" :progress="68" show-value />
    </NbCard>
    
    <!-- History table -->
    <NbTable :columns="columns" :data="migrations" show-grid />
  </div>
</template>
```

---

## Customization

### Changing Accent Colors
Edit `app/assets/css/neubrutalism.css`:
```css
:root {
  --nb-accent-red: #your-color;     /* Primary actions */
  --nb-accent-yellow: #your-color;  /* Secondary */
  --nb-accent-teal: #your-color;    /* Success */
}
```

### Adding New Cube Colors
Edit `BrandCube.vue`:
```typescript
const colorMap = {
  red: '#FF6B6B',
  yellow: '#FFE66D',
  // Add your color
  custom: '#YOURCOLOR'
}
```

### Custom Textures
Replace the SVG data URI in `neubrutalism.css` with your own:
```css
.nb-texture::before {
  background-image: url('/textures/your-texture.webp');
}
```

---

## Accessibility

All components include:
- Proper contrast ratios (tested on dark background)
- Focus states (ring outline on interactive elements)
- Semantic HTML (buttons are `<button>`, tables have proper structure)
- Reduced motion support:
```css
@media (prefers-reduced-motion: reduce) {
  .nb-card, .nb-button {
    transition: none;
  }
  .brand-cube {
    animation: none;
  }
}
```

---

## Performance

- CSS is ~17KB (uncompressed)
- No external dependencies beyond Nuxt UI
- SVG textures are inline (no HTTP requests)
- Animations use `transform` and `opacity` only

---

## Next Steps

1. **Review the demo**: Visit `/design-system` to see all components
2. **Pick a page**: Start with `pages/agency/monday.vue` for focused migration
3. **Iterate**: Replace components one section at a time
4. **Test**: Check dark mode, mobile, and accessibility

---

## Questions?

Reference the full design spec:
- `docs/design-system/textured-neubrutalism-redesign.md`
