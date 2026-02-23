# Browserbase-Style UI Components

Complete implementation of the "stall" scroll animation UI from Browserbase pricing/homepage.

## Components

### NbScrollReveal
The core animation wrapper - elements "stall" (animate in) as you scroll.

```vue
<NbScrollReveal 
  direction="up"      
  :distance="40"      // How far it travels
  :delay="200"        // Delay before starting (ms)
  :duration="600"     // Animation duration (ms)
  :threshold="0.1"    // Visibility threshold to trigger
  :once="true"        // Only animate once
>
  <YourContent />
</NbScrollReveal>
```

**Directions:** `up` | `down` | `left` | `right`

### NbPricingCard
Pricing cards with staggered entrance animation.

```vue
<NbPricingCard
  name="Startup"
  price="$99"
  period="/month"
  :features="[
    { text: '100 concurrent browsers' },
    { text: '500 browser hours', highlight: 'then $0.10/hour' }
  ]"
  ctaText="Sign Up"
  :popular="true"      // Shows "Most popular" badge
  :delay="200"         // Stagger delay for animation
/>
```

### NbFeatureGrid
8-icon feature grid with hover effects.

```vue
<NbFeatureGrid :features="[
  {
    icon: 'i-lucide-zap',
    title: 'Scalable',
    color: 'yellow',    // red | yellow | teal | purple
    items: ['Feature 1', 'Feature 2', 'Feature 3']
  }
]" />
```

### NbAnimatedText
Typewriter effect for hero headlines.

```vue
<NbAnimatedText
  prefix="We help AI"
  :words="['use the web', 'build agents', 'automate tasks']"
  suffix="."
  :typingSpeed="100"
  :pauseDuration="2000"
/>
```

## Demo Pages

| Page | URL | Description |
|------|-----|-------------|
| Design System | `/design-system` | All components showcase |
| Browserbase Style | `/browserbase-style` | Full landing page clone |

## Key Patterns

### 1. Staggered Card Entrance
```vue
<div class="grid grid-cols-4 gap-6">
  <NbPricingCard 
    v-for="(plan, i) in plans" 
    :key="plan.name"
    :delay="i * 100"  // 0ms, 100ms, 200ms, 300ms
  />
</div>
```

### 2. Section-by-Section Reveal
```vue
<section>
  <NbScrollReveal><h2>Title</h2></NbScrollReveal>
  <NbScrollReveal :delay="200"><p>Subtitle</p></NbScrollReveal>
  <NbScrollReveal :delay="400"><Buttons /></NbScrollReveal>
</section>
```

### 3. Grid Background Sections
```vue
<section class="nb-grid-dots py-24">
  <!-- Content reveals over dot grid background -->
</section>
```

## Animation Timing

| Property | Default | Usage |
|----------|---------|-------|
| duration | 600ms | Standard reveal |
| delay | 0ms | Stagger with 100ms increments |
| distance | 40px | Subtle movement |
| easing | cubic-bezier(0.4, 0, 0.2, 1) | Smooth deceleration |

## CSS Variables

```css
/* Stagger delays are automatically calculated */
--stagger-delay: 0ms | 100ms | 200ms | ...

/* Animation timing */
--reveal-duration: 600ms
--reveal-distance: 40px
--reveal-delay: 0ms
```
