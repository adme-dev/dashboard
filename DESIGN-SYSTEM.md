# XeroFlow Design System

Design tokens and patterns extracted from the landing page (Antigravity-inspired) for use across the admin section and public pages.

---

## Color Palette

### Brand Colors
| Token | Value | Usage |
|-------|-------|-------|
| `brand-dark` | `#121317` | Primary text, dark buttons, headings |
| `brand-secondary` | `#45474D` | Secondary text, descriptions, muted labels |
| `brand-lavender` | `#b7bfd9` | Subtle backgrounds, secondary button hover tints |
| `brand-surface` | `#f4f5f7` | Card backgrounds, elevated surfaces |

### Opacity Scale (on `#121317`)
| Level | Value | Usage |
|-------|-------|-------|
| `4%` | `rgba(18,19,23,0.04)` | Subtle pill backgrounds, lightest borders |
| `6%` | `rgba(18,19,23,0.06)` | Dividers, light borders |
| `10%` | `rgba(18,19,23,0.10)` | Input borders, medium borders |
| `15%` | `rgba(18,19,23,0.15)` | Hover borders |
| `30%` | `rgba(18,19,23,0.30)` | Focus borders |

### Accent Colors
| Name | Value | Usage |
|------|-------|-------|
| Emerald 400 | `#34d399` | Status indicators, success states |
| Emerald 500 | `#10b981` | Primary accent, CTA highlights |
| Emerald 600 | `#059669` | Dark accent text |
| Violet 500 | `#8b5cf6` | Feature highlights, badges |
| Amber 500 | `#f59e0b` | Warnings, AI elements |
| Rose 500 | `#f43f5e` | Alerts, destructive actions |
| Blue 500 | `#3b82f6` | Information, links |

### Pastel Gradient Palette (Feature Cards)
```css
/* Indigo/Blue — Work Management */
linear-gradient(135deg, #e0e7ff 0%, #dbeafe 25%, #ede9fe 50%, #e0e7ff 75%, #dbeafe 100%)

/* Green/Teal — Financial */
linear-gradient(135deg, #d1fae5 0%, #ccfbf1 25%, #dbeafe 50%, #d1fae5 75%, #fef3c7 100%)

/* Rainbow — Chat */
linear-gradient(135deg, #ede9fe 0%, #fce7f3 25%, #fef3c7 50%, #d1fae5 75%, #dbeafe 100%)

/* Amber/Orange — AI */
linear-gradient(135deg, #fef3c7 0%, #fed7aa 20%, #fce7f3 45%, #ede9fe 70%, #fef3c7 100%)

/* Pink/Rose — Client Portal */
linear-gradient(135deg, #fce7f3 0%, #fecdd3 25%, #ede9fe 50%, #dbeafe 75%, #fce7f3 100%)
```

### Dark Mode (CTA / Dark Sections)
| Token | Value | Usage |
|-------|-------|-------|
| `dark-bg` | `#0a0b0e` | Dark section background |
| `dark-surface` | `white/10` | Elevated element on dark bg |
| `dark-text` | `white` | Primary text on dark |
| `dark-muted` | `white/60` | Secondary text on dark |

---

## Typography

### Font Weight Scale
| Weight | Value | Usage |
|--------|-------|-------|
| Display | `450` | Hero headings, section titles, giant wordmark |
| Medium | `500` / `font-medium` | Body text, nav items, labels, buttons |
| Semibold | `600` / `font-semibold` | Emphasis, column headers, badges |
| Bold | `700` / `font-bold` | Strong emphasis (rare) |

### Font Size Scale (Responsive)
| Name | Value | Usage |
|------|-------|-------|
| Hero | `clamp(40px, 7vw, 80px)` | Main hero headline |
| Section Hero | `clamp(32px, 5vw, 56px)` | Section headings |
| Section Title | `clamp(28px, 4vw, 40px)` | Feature titles |
| Subtitle | `clamp(24px, 3.5vw, 36px)` | Secondary titles |
| Wordmark | `clamp(80px, 18vw, 220px)` | Footer brand wordmark |
| Body XL | `20px` / `text-xl` | Large body text |
| Body LG | `18px` / `text-lg` | Descriptions |
| Body | `16px` / `text-base` | Standard body |
| Button | `17.5px` | Primary CTA buttons |
| Nav | `15px` | Navigation items, footer links |
| Nav Secondary | `14.5px` | Secondary nav |
| Label | `13px` | Badges, small labels |
| Micro | `12px` | Uppercase labels, footer legal |

### Tracking (Letter Spacing)
| Value | Usage |
|-------|-------|
| `-0.03em` | Hero headlines |
| `-0.02em` | Section titles |
| `-0.01em` | Body headings, nav brand |
| `normal` | Body text |
| `tracking-wide` | Badge text |
| `tracking-wider` | Uppercase labels |

### Line Height
| Value | Usage |
|-------|-------|
| `1.1` | Display headlines |
| `1.15` | Section titles |
| `1.625` / `leading-relaxed` | Body paragraphs |
| `0.9` | Giant wordmark |

---

## Spacing

### Container
- Max width: `1200px`
- Horizontal padding: `24px` (`px-6`)

### Section Spacing
| Size | Value | Usage |
|------|-------|-------|
| Section Y | `py-20 md:py-32` | Major sections (80px / 128px) |
| Section Gap | `mb-24` | Between feature blocks |
| Content Gap | `gap-8` | Between text and illustration |
| Card Gap | `gap-5` | Between cards |

### Component Spacing
| Size | Value | Usage |
|------|-------|-------|
| Button Padding | `px-6 py-3` | Primary buttons |
| Small Button | `px-4 py-1.5` | Nav buttons |
| Card Padding | `p-6` | Platform cards |
| Input Padding | `px-4 py-3` | Form inputs |
| Badge Padding | `px-3 py-1.5` | Pill badges |

---

## Border Radius

| Token | Value | Usage |
|-------|-------|-------|
| `full` | `9999px` | Pill buttons, avatars, badges |
| `3xl` | `24px` | Large feature cards |
| `2xl` | `16px` | Cards, modals, floating icons |
| `xl` | `12px` | Inputs, message bubbles |
| `lg` | `8px` | Small cards, logo containers |
| `md` | `6px` | Mini cards, compact elements |
| CTA | `2rem` (32px) | Dark CTA section |

---

## Shadows

| Name | Value | Usage |
|------|-------|-------|
| Subtle | `0 1px 2px rgba(0,0,0,0.04)` | Kanban task cards |
| Card Icon | `0 1px 3px rgba(0,0,0,0.04)` | Platform card icon containers |
| Elevated | `shadow-xl` | Floating toasts |
| None | — | Most elements rely on borders + backdrop-blur |

---

## Borders

| Pattern | Usage |
|---------|-------|
| `border border-[#121317]/[0.04]` | Subtle card borders |
| `border border-[#121317]/[0.06]` | Dividers, separators |
| `border border-[#121317]/10` | Input borders, medium emphasis |
| `border-t border-black/[0.04]` | Section dividers |
| `border-t border-black/[0.06]` | Footer divider |

---

## Components

### Primary Button
```html
<button class="inline-flex items-center gap-2.5 px-6 py-3 bg-[#121317] text-white text-[17.5px] font-medium rounded-full hover:bg-[#2a2b30] transition-colors">
  Label
</button>
```

### Secondary Button
```html
<button class="inline-flex items-center gap-2 px-6 py-3 bg-[#b7bfd9]/10 text-[#121317] text-[17.5px] font-medium rounded-full hover:bg-[#b7bfd9]/20 transition-colors">
  Label
</button>
```

### Pill Badge
```html
<div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#121317]/[0.04]">
  <div class="w-1.5 h-1.5 rounded-full bg-emerald-500" />
  <span class="text-[13px] text-[#45474D] font-medium">Label</span>
</div>
```

### Card (Platform Style)
```html
<div class="rounded-2xl bg-[#f4f5f7] p-6 flex flex-col gap-5">
  <div class="w-14 h-14 rounded-xl bg-white flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
    <UIcon name="..." class="w-6 h-6 text-[#121317]" />
  </div>
  <div>
    <div class="text-[16px] font-medium text-[#121317] mb-1">Title</div>
    <div class="text-[14px] text-[#45474D]/70">Description</div>
  </div>
</div>
```

### Feature Illustration Container
```html
<div class="w-full rounded-3xl [gradient-class] overflow-hidden flex items-center justify-center px-6 py-10 md:px-10 md:py-14">
  <div class="w-full rounded-2xl bg-white/80 backdrop-blur-sm shadow-sm overflow-hidden">
    <!-- UI mockup content -->
  </div>
</div>
```

### Navigation (Frosted Glass)
```html
<nav class="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-white/85">
  <div class="max-w-[1200px] mx-auto px-6 h-[52px] flex items-center justify-between">
    <!-- Logo + Nav items + CTA -->
  </div>
</nav>
```

---

## Animations

### Float/Drift (Particles & Icons)
- Duration: `8-16s` (fast), `16-20s` (medium), `20s+` (slow)
- Easing: `ease-in-out`
- Translate range: `±24px`
- Rotation range: `±6deg`

### Colour Cycling (Icon backgrounds)
- Duration: `12s`
- Palette: lavender → violet → emerald → amber → rose → blue
- Background opacity: `0.06-0.09`
- Text opacity: `0.25-0.35`

### Marquee (Scrolling Cards)
- Duration: `22s`
- Direction: `translateX(0) → translateX(-50%)`
- Easing: `linear`
- Hover: `animation-play-state: paused`

### Glow Pulse (CTA Section)
- Duration: `8-10s`
- Scale: `0.9 ↔ 1.15`
- Opacity: `0.5 ↔ 1.0`

---

## Backdrop Effects
| Effect | Value | Usage |
|--------|-------|-------|
| Navigation | `backdrop-blur-lg` | Frosted glass nav bar |
| Feature cards | `backdrop-blur-sm` | Inner card glass effect |
| Persona badges | `backdrop-blur-md` | Badge on photo overlay |
| Floating icons | `backdrop-blur-[2px]` | Micro glass on hero icons |

---

## Responsive Patterns

### Breakpoints
| Prefix | Width | Usage |
|--------|-------|-------|
| `sm:` | 640px | Stack → row, show/hide elements |
| `md:` | 768px | Layout shifts (2-col), nav visible |
| `lg:` | 1024px | Full desktop layout |

### Container Pattern
```html
<div class="max-w-[1200px] mx-auto px-6">
  <!-- Content -->
</div>
```

### Section Pattern
```html
<section class="py-20 md:py-32">
  <div class="max-w-[1200px] mx-auto px-6">
    <!-- Section content -->
  </div>
</section>
```

---

## Admin Section Application Notes

When applying these tokens to the admin dashboard:

1. **Keep Nuxt UI v4 components** — the admin uses `UCard`, `UButton`, `UTable`, etc. Don't replace them.
2. **Adopt the colour palette** — use `#121317` for primary headings, `#45474D` for secondary text, emerald for success states.
3. **Apply the border style** — prefer `border-[#121317]/[0.06]` subtle borders over heavy Tailwind defaults.
4. **Use the shadow scale** — minimal shadows (`0 1px 2px rgba(0,0,0,0.04)`), rely on borders and subtle background differences.
5. **Match the radius scale** — `rounded-2xl` for cards, `rounded-xl` for inputs, `rounded-full` for buttons/badges.
6. **Typography** — adopt `font-[450]` for display headings, `clamp()` for responsive titles, `-0.02em` tracking for headings.
7. **Pastel gradients** can be used for admin card highlights, status backgrounds, or section headers.
8. **Dark mode** — the admin already supports dark mode via Nuxt UI. These tokens complement the existing `neubrutalism.css` system.
