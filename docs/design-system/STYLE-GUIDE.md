# Browserbase Style Guide
## Based on Screenshots from browserbase.com

---

## 1. Color Palette

### Primary Colors
| Color | Hex | Usage |
|-------|-----|-------|
| White | `#FFFFFF` | Backgrounds, cards |
| Black | `#000000` | Text, borders, primary buttons |
| Black 60% | `rgba(0,0,0,0.6)` | Secondary text |
| Black 40% | `rgba(0,0,0,0.4)` | Tertiary text, labels |
| Black 10% | `rgba(0,0,0,0.1)` | Subtle borders, dividers |

### Accent Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Yellow | `#F4B942` | Accent buttons, icons, highlights |
| Purple | `#9B87F5` | "Most popular" badge, quote section bg |
| Pink | `#E866A9` | 3D cubes, pricing cards |
| Mint | `#7DD3A8` | 3D cubes, expanded states |
| Blue | `#4A90D9` | 3D cubes, links |
| Red | `#FF6B6B` | Logo accents, highlights |

### Background Colors
| Color | Hex | Usage |
|-------|-----|-------|
| Surface | `#F5F5F5` | Alternate sections, pricing bg |
| Yellow Light | `#FFFBE6` | Expanded feature items |
| Green Light | `#E8F5E9` | Expanded FAQ items |

---

## 2. Typography

### Font Stack
- **Primary**: System UI (-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto)
- **Monospace**: For labels, badges, data (`font-family: monospace`)

### Type Scale
| Style | Size | Weight | Line Height | Usage |
|-------|------|--------|-------------|-------|
| Display | 48-64px | 400 | 1.1 | Hero headlines |
| Title | 28-40px | 400 | 1.2 | Section headings |
| Subtitle | 20px | 400 | 1.4 | Secondary headings |
| Body | 16px | 400 | 1.6 | Paragraphs |
| Small | 14px | 400 | 1.5 | Descriptions |
| Label | 11px | 500 | 1 | Uppercase labels (tracking: 0.08em) |

### Text Colors
- **Primary**: `#000000`
- **Secondary**: `rgba(0,0,0,0.6)`
- **Tertiary**: `rgba(0,0,0,0.4)`

---

## 3. Borders & Shadows

### Border Style
- **Width**: 1px (thin, precise)
- **Color**: `#000000` (strong) or `rgba(0,0,0,0.1)` (subtle)
- **Radius**: 6-8px for cards, 4px for buttons/badges

### Shadow Style
- **Card Shadow**: `0 4px 12px rgba(0,0,0,0.15)`
- **Button Shadow**: None (flat design)
- **3D Cube Shadow**: `4px 4px 0 rgba(0,0,0,0.2)`

---

## 4. Components

### Testimonial Cards
```
┌─────────────────────────────┐
│  ┌─────────────────────┐    │
│  │   COLORED HEADER    │    │ ← Brand color bg
│  │   (Company Logo)    │    │
│  └─────────────────────┘    │
│                             │
│  "Quote text here..."       │
│                             │
│  ─────────────────────────  │
│  Read More →                │
└─────────────────────────────┘
```
**Specs**:
- Border: 1px solid black
- Border radius: 6px
- Header height: 64px
- Padding: 20px

### Pricing Cards
```
┌─────────────────────────────┐
│         [3D CUBE]           │
│                             │
│       Free Plan             │
│       $0/month              │
│                             │
│  • 1 concurrent browser     │
│  • 1 browser hour           │
│  ─────────────────────────  │
│  [    Sign Up Button    ]   │
└─────────────────────────────┘
```
**Specs**:
- Border: 1px solid black
- "Most popular" badge: Purple bg, white text
- Featured plan: Black bg, white text

### Pricing Comparison Table
```
┌──────────┬────────┬──────────┬─────────┬───────┐
│Plan      │  Free  │ Developer│ Startup │ Scale │
│Details   │(charcoal│(charcoal │(charcoal│(charc│
│          │ header)│ header)  │ header) │oal h) │
├──────────┼────────┼──────────┼─────────┼───────┤
│Price     │  $0    │   $20    │   $99   │ Custom│
├──────────┼────────┼──────────┼─────────┼───────┤
│Browser   │  1     │   100    │   500   │Usage  │
│Hours     │        │          │         │based  │
├──────────┼────────┼──────────┼─────────┼───────┤
│Proxy     │  0 GB  │   1 GB   │   5 GB  │Usage  │
│You also  │        │          │         │based  │
│have the  │        │          │         │       │
│ability...│        │          │         │       │
└──────────┴────────┴──────────┴─────────┴───────┘
```
**Specs**:
- Header row: Dark charcoal (#2A2A2A) with white text
- Body: White background
- Borders: 1px solid rgba(0,0,0,0.1)
- Row labels: Left-aligned, can have subtitle text
- Data cells: Center-aligned
- Plan columns equal width

### FAQ Accordion
```
┌─────────────────────────────┐
│ Question here?          [+] │
├─────────────────────────────┤
│ Question here?          [-] ││ ← Expanded (mint bg)
│ Answer text appears here... ││
├─────────────────────────────┤
│ Question here?          [+] │
└─────────────────────────────┘
```
**Specs**:
- Collapsed: White bg
- Expanded: `#E8F5E9` (mint) bg
- Icon: Square with +/- 
- Border: 1px solid black (container)

### Feature Accordion
```
┌─────────────────────────────┐
│ [🔌] Seamless integration   ││ ← Expanded (yellow bg)
│      ▪ Compatible with...   ││
│      ▪ Integrate without... ││
├─────────────────────────────┤
│ [⚡] Scalable               │
├─────────────────────────────┤
│ [🚀] Fast                   │
└─────────────────────────────┘
```
**Specs**:
- Active item: `#FFFBE6` (yellow light) bg
- Icon box: Yellow fill when active
- Bullet points: Yellow squares

---

## 5. 3D Cubes

### Cube Colors
| Use Case | Color |
|----------|-------|
| Free plan | Pink `#E866A9` |
| Developer | Pink `#E866A9` |
| Startup | Yellow `#F4B942` |
| Scale | Mint `#7DD3A8` |

### Cube Style
- Size: 48-64px
- Shape: Square rotated 45°
- Shadow: Hard offset shadow (4px, 4px)
- Border radius: 8px

---

## 6. Layout Patterns

### Grid Backgrounds
- **Line Grid**: 40px grid, 1px lines at 5% black
- **Dot Grid**: 24px spacing, 1px dots at 15% black

### Section Spacing
- **Large sections**: 96px (py-24)
- **Medium sections**: 64px (py-16)
- **Small sections**: 48px (py-12)

### Container
- Max width: 1152px (max-w-6xl)
- Padding: 24px horizontal

### Form Composition Grid

Forms use one composition grid per related field group so controls align predictably at every breakpoint.

```html
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
  <!-- Short controls occupy one grid cell each. -->
  <UInput class="w-full" />
  <USelectMenu class="w-full" />

  <!-- Multiline controls and their action rows span the full form width. -->
  <UTextarea class="w-full col-span-full" :rows="3" />
  <div class="col-span-full">...</div>
</div>
```

**Specs**:
- Mobile: one column; tablet and desktop: two columns for standard forms.
- Dense reference/linking forms may extend to four columns at `xl`, but must still start with `grid-cols-1`.
- Inputs, selects, textareas, and rich-text controls use `w-full`; never rely on intrinsic control width.
- Textareas, rich-text fields, file controls, and other long-form inputs use `col-span-full` and at least three visible rows.
- Submit/action controls following a long-form field use a separate `col-span-full` row. They must not flow beside or overlap the field.
- Helper and validation text stays with its field and wraps within the same grid span.
- Verify form composition at 320px, 768px, 1024px, and 1440px before release.

---

## 7. Navigation

### Top Nav
- Height: 64px
- Border bottom: 1px solid `rgba(0,0,0,0.1)`
- Background: White
- Links: 14px, 60% black, hover to 100%
- Buttons: Primary (black bg), Ghost (text only)

---

## 8. Interactive States

### Buttons
| State | Style |
|-------|-------|
| Primary | Black bg, white text |
| Secondary | White bg, black border |
| Ghost | No border, 60% text |
| Accent | Yellow bg, black text |
| Hover (Secondary) | Black bg, white text |

### Cards
| State | Style |
|-------|-------|
| Default | 1px black border |
| Hover | Subtle shadow, slight lift |
| Active/Expanded | Colored background |

---

## 9. Data Display

### Stats Row
```
┌─────────┬─────────┬─────────┬─────────┐
│   95%   │  10M+   │  99.9%  │  50ms   │
│ Faster  │ Browsers│  Uptime │ Latency │
└─────────┴─────────┴─────────┴─────────┘
```
**Specs**:
- Border top/bottom: 1px solid `rgba(0,0,0,0.1)`
- Value: 40px, normal weight
- Label: 11px uppercase, 40% black

### Tables
- Header: 11px uppercase, 40% black
- Rows: 15px, 60% black
- Border bottom: 1px solid `rgba(0,0,0,0.1)`
- Hover: `#FAFAFA` background

---

## 10. Responsive Behavior

### Breakpoints
- Desktop: 4-column grids
- Tablet: 2-column grids
- Mobile: 1-column stacks

### Mobile Adaptations
- Reduce font sizes by ~20%
- Stack horizontal layouts
- Maintain touch targets (44px min)
- Simplify 3D cube displays

---

## Files Created

| File | Purpose |
|------|---------|
| `/pages/style-guide.vue` | Complete component showcase |
| `/pages/browserbase-light.vue` | Full landing page implementation |
| `/assets/css/browserbase-light.css` | Reusable CSS framework |

---

## Demo URLs

```
http://localhost:3000/style-guide       # Component library
http://localhost:3000/browserbase-light # Full landing page
```
