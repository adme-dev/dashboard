# PRD: Banner Studio Professional Upgrade

**Status**: Active
**Created**: 2026-03-01
**Owner**: Engineering
**Priority**: P0 (Table Stakes) through P2 (Cutting Edge)

---

## 1. Executive Summary

Banner Studio currently serves as a capable intermediate-level HTML5 banner creation tool. Competitive analysis against Celtra, Bannerflow, The Brief (Creatopy), Bannerwise, Zuuvi, Google Web Designer, and AdCreative.ai reveals critical gaps that must be addressed to position this as a professional advertising agency tool.

**Current strengths**: 6 layer types, 12 animation presets, GSAP timeline, 23 ad sizes across 5 platforms, DCO with feed bindings, HTML5/PNG/JPG/GIF export, brand kits, templates, ad tag generation.

**Critical gaps**: Limited font selection (10 hardcoded vs industry-standard Google Fonts + custom upload), no grid/snapping/alignment tools, no exit animations, no collaboration workflows, no AI-assisted features.

---

## 2. Competitive Positioning Target

| Dimension | Current State | Target State | Benchmark |
|-----------|---------------|--------------|-----------|
| Fonts | 10 hardcoded web fonts | Google Fonts (1500+) + custom upload | Bannerflow, Celtra |
| Design Tools | Basic drag/resize | Grid, guides, snap, align, distribute | Every competitor |
| Animation | 12 entrance presets only | Entrance + exit + per-property keyframes | Google Web Designer |
| AI Features | None in Banner Studio | Auto-resize, copy generation, URL-to-banner | The Brief, AdCreative.ai |
| Collaboration | Single user only | Comments, approvals, external review links | Bannerflow, Celtra |
| Analytics | Impression/click pixels only | Dashboard, A/B testing | Bannerflow |
| Publishing | Manual export + ad tags | Direct publish to Google Ads / Meta | The Brief, Bannerflow |

**Pricing benchmark**: Bannerwise ($99-399/mo), Bannerflow ($299+/mo), Zuuvi ($495+/mo). Our tool is bundled into the agency dashboard — competitive advantage is zero incremental cost for existing users.

---

## 3. Phase Breakdown

### Phase 4a: Design Precision (P0 — Table Stakes)
**Goal**: Close the most visible professional gaps. Every competitor has these.
**Estimated scope**: ~25 files (8 new, 17 edited)

### Phase 4b: Advanced Animation (P1 — Strong Differentiator)
**Goal**: Move from preset-only to a real animation timeline.
**Estimated scope**: ~15 files (5 new, 10 edited)

### Phase 5a: AI Creative Assistant (P1 — Strong Differentiator)
**Goal**: AI-powered features that save production time.
**Estimated scope**: ~20 files (12 new, 8 edited)

### Phase 5b: Collaboration & Approval (P1 — Strong Differentiator)
**Goal**: Multi-user workflows for agency teams.
**Estimated scope**: ~25 files (15 new, 10 edited), 1 migration

### Phase 6a: Analytics & Optimization (P2 — Cutting Edge)
**Goal**: Performance data and optimization.
**Estimated scope**: ~15 files (10 new, 5 edited), 1 migration

### Phase 6b: Publishing & Distribution (P2 — Cutting Edge)
**Goal**: Direct ad platform integration.
**Estimated scope**: ~12 files (8 new, 4 edited)

---

## 4. Phase 4a: Design Precision — Detailed Requirements

### 4a.1: Google Fonts Integration

**Problem**: 10 hardcoded fonts vs 1500+ Google Fonts that every competitor offers.

**Requirements**:
- **Font picker UI**: Searchable dropdown in text/button inspector showing all Google Fonts
- **Font preview**: Each font name rendered in its own typeface in the dropdown
- **Font categories**: Filter by Serif, Sans-Serif, Display, Handwriting, Monospace
- **Recently used**: Track last 10 fonts used, show at top of picker
- **Popular fonts**: Curated top-20 list for quick access
- **Font loading**: Load selected font via Google Fonts CSS API on demand
- **Export embedding**: `<link>` tag in exported HTML with only used fonts + weights
- **Brand kit integration**: Brand kit fonts appear in a "Brand" section at top of picker
- **Weight availability**: Show only weights available for the selected font family
- **Performance**: Lazy-load font list (don't load 1500 fonts at init), cache font metadata

**Technical approach**:
- Server endpoint: `GET /api/agency/banner-studio/fonts` — proxy to Google Fonts API, cache response in KV (24h TTL)
- Font metadata cached client-side in composable (`useBannerFonts`)
- Font loaded dynamically via `<link>` injection into document head
- `banner-html-builder.ts` updated to emit `<link href="https://fonts.googleapis.com/css2?family=...">` with only used font families + weights
- `banner-constants.ts` FONT_OPTIONS replaced with dynamic font list

**Acceptance criteria**:
- [ ] User can search and select from full Google Fonts catalog
- [ ] Selected font loads and renders correctly on canvas
- [ ] Exported HTML includes correct Google Fonts `<link>` tag
- [ ] Brand kit fonts shown in dedicated section
- [ ] Font picker shows font name in its own typeface
- [ ] Recently used fonts persist per session

### 4a.2: Custom Font Upload

**Problem**: Agencies use brand-specific fonts not available on Google Fonts.

**Requirements**:
- Upload `.woff2`, `.woff`, `.otf`, `.ttf` font files
- Store on R2 at path `fonts/{orgId}/{filename}`
- Register via `@font-face` CSS injection
- Available in font picker under "Custom" section
- Per-organization font library (shared across all projects)
- Export embedding: Base64-encode or link to R2 URL in exported HTML
- Brand kit association: Custom fonts linkable to brand kits
- File size limit: 2MB per font file
- Metadata stored: family name, weight, style (normal/italic), file URL

**Technical approach**:
- DB table: `banner_custom_fonts` (id, org_id, family_name, weight, style, r2_key, url, file_size, uploaded_by, created_at)
- Upload endpoint: `POST /api/agency/banner-studio/fonts/upload`
- List endpoint: `GET /api/agency/banner-studio/fonts/custom`
- Delete endpoint: `DELETE /api/agency/banner-studio/fonts/[id]`
- Client: `@font-face` injected dynamically when custom font selected
- Export: Font file fetched from R2 and base64-encoded inline in `<style>` block

**Acceptance criteria**:
- [ ] User can upload .woff2/.woff/.otf/.ttf files
- [ ] Custom fonts appear in font picker under "Custom" section
- [ ] Custom fonts render correctly on canvas and in exports
- [ ] Fonts shared across all projects in the organization
- [ ] Font files stored on R2 with proper cleanup on delete

### 4a.3: Grid, Guides & Snap-to-Object

**Problem**: No visual alignment aids. Every design tool has grid and snapping.

**Requirements**:

**Grid**:
- Toggle grid visibility (keyboard shortcut: `G`)
- Configurable grid size (8px, 16px, 24px, 32px)
- Grid rendered as subtle dotted lines on canvas
- Snap-to-grid: layers snap to nearest grid intersection during drag
- Grid settings persisted per project

**Guides**:
- Drag from ruler to create horizontal/vertical guides
- Guides rendered as colored lines (distinct from grid)
- Snap-to-guide during layer drag/resize
- Delete guide by dragging back to ruler
- Smart guides: Auto-show alignment lines when layer edges/centers align with other layers

**Snap-to-Object**:
- Edge snapping: Layer edges snap to other layer edges (threshold: 5px)
- Center snapping: Layer center snaps to other layer centers
- Equal spacing indicators: Show when spacing between 3+ layers is equal
- Visual indicators: Magenta/cyan snap lines shown during drag
- Hold Alt/Option to temporarily disable snapping

**Technical approach**:
- Grid overlay: SVG or CSS pattern overlay on canvas (above artboard bg, below layers)
- Snap logic: Added to `useBannerDrag.ts` — compute snap targets from all visible layers, find nearest within threshold, adjust position
- Smart guides: Compute on drag start (positions of all other layers), check during drag move
- State: `state.gridSize`, `state.showGrid`, `state.snapEnabled`, `state.guides[]`
- New composable: `useBannerSnap.ts` — snap computation logic, extracted for testability

**Acceptance criteria**:
- [ ] Grid toggles on/off with `G` key
- [ ] Layers snap to grid intersections during drag
- [ ] Smart guides appear when aligning with other layers
- [ ] Snap lines (magenta) visible during alignment
- [ ] Alt/Option temporarily disables snapping
- [ ] Grid size configurable in toolbar

### 4a.4: Alignment Toolbar

**Problem**: No way to align or distribute multiple layers. Basic design tool expectation.

**Requirements**:
- **Alignment operations** (when 1+ layers selected):
  - Align Left / Center H / Right
  - Align Top / Center V / Bottom
  - Reference: Artboard bounds (or selection bounds if multiple layers)
- **Distribution operations** (when 3+ layers selected):
  - Distribute Horizontal (equal spacing)
  - Distribute Vertical (equal spacing)
- **Match Size** (when 2+ layers selected):
  - Match Width / Match Height / Match Both
- **UI**: Toolbar row in inspector (visible when layer selected)
- **Keyboard shortcuts**: Not required (toolbar buttons sufficient)

**Technical approach**:
- Multi-select: Shift+click to add layers to selection (requires `selectedLayerIds: number[]` instead of single `selectedLayerId`)
- Alignment math: Compute bounding box of selection, adjust layer positions
- Added to `useBannerStudio.ts`: `alignLayers(direction)`, `distributeLayers(axis)`, `matchLayerSize(dimension)`
- Inspector: New `AlignmentToolbar.vue` component shown below position inspector

**Acceptance criteria**:
- [ ] Shift+click selects multiple layers
- [ ] Align left/center/right/top/middle/bottom works
- [ ] Distribute horizontal/vertical works with 3+ layers
- [ ] Match width/height works with 2+ layers
- [ ] Operations create undo entries

### 4a.5: Exit Animations

**Problem**: `animOut` field exists on Layer type but is unused. Competitors all have entrance + exit.

**Requirements**:
- **Exit animation presets** (mirror of entrance):
  - fadeOut, slideOutL, slideOutR, slideOutU, slideOutD
  - zoomOutShrink, zoomOutGrow, spinOut, bounceOut
- **Per-layer exit properties**:
  - `animOut`: Exit animation type
  - `animOutDur`: Exit animation duration (default 0.4s)
  - `animOutEase`: Exit easing (defaults to entrance ease)
- **Timeline integration**: Exit animation plays from `endTime - animOutDur` to `endTime`
- **Inspector UI**: Exit animation section in Animation inspector (mirrors entrance section)
- **Export**: Exit animations included in GSAP timeline in exported HTML

**Technical approach**:
- Type: Add `AnimOutType` to `banner-studio.ts` with exit preset names
- Timeline builder: `useBannerTimeline.ts` — after entrance tween, add exit tween at `endTime - animOutDur`
- `banner-html-builder.ts`: Generate exit GSAP tweens in exported HTML `<script>`
- Inspector: Extend existing animation section with "Exit" sub-section

**Acceptance criteria**:
- [ ] 9 exit animation presets available in inspector
- [ ] Exit animations play correctly in timeline preview
- [ ] Exit animations included in exported HTML5
- [ ] Exit duration and easing configurable per layer
- [ ] GIF export captures exit animations

---

## 5. Phase 4b: Advanced Animation — Detailed Requirements

### 4b.1: Per-Property Keyframe Timeline

**Problem**: Preset-only animations limit creative expression. Google Web Designer offers full keyframe control for free.

**Requirements**:
- **Keyframe tracks**: Per-layer tracks for opacity, x, y, scaleX, scaleY, rotation
- **Keyframe editing**: Click on track to add keyframe, drag to adjust timing
- **Value editing**: Click keyframe to edit value in inspector
- **Interpolation**: Linear, ease-in, ease-out, ease-in-out, custom cubic-bezier per segment
- **Visual timeline**: Diamond keyframe markers on each property track
- **Backward compatible**: Preset animations still work (converted to keyframes internally)
- **Copy/paste keyframes**: Between layers and between properties

**Technical approach**:
- New layer property: `keyframes?: Record<string, Keyframe[]>` where key is property name
- `Keyframe = { time: number, value: number, easing?: string }`
- Timeline UI: Expand layer lane to show sub-tracks per property
- GSAP builder: Convert keyframes to `gsap.to()` calls with staggered timing
- Preset conversion: When user selects preset, generate equivalent keyframes
- Fallback: If no keyframes, use existing preset system

### 4b.2: Custom Easing Curve Editor

**Requirements**:
- Visual cubic-bezier curve editor (like Chrome DevTools)
- Preset curves (ease, ease-in, ease-out, bounce, elastic, etc.)
- Custom curve saved per keyframe segment
- Preview animation with selected easing

### 4b.3: MP4 Video Export

**Requirements**:
- Export animated banner as MP4 video
- Configurable: resolution (1x/2x), FPS (24/30/60), quality
- Use Puppeteer to capture frames, ffmpeg to encode
- Useful for social media placements that don't support HTML5

### 4b.4: Animation Preview All Formats

**Requirements**:
- "Play All" modal already exists (`BannerPlayAll`)
- Enhance: Show all formats playing simultaneously in a grid
- Sync playback across all formats
- Useful for reviewing animation consistency across sizes

---

## 6. Phase 5a: AI Creative Assistant — Detailed Requirements

### 5a.1: AI Auto-Resize

**Problem**: Resizing from one format to another requires manual repositioning. Competitors offer smart resize.

**Requirements**:
- When adding a new format size to a project, AI suggests layer positions
- Considers: relative position (percentage-based), text readability (min font size), visual hierarchy
- User can accept/reject/adjust AI suggestions
- Uses existing `scaleLayersToFormat()` as base, enhanced with AI positioning

**Technical approach**:
- Server endpoint: `POST /api/agency/banner-studio/ai/auto-resize`
- Input: Source format layers + target format dimensions
- Uses Workers AI (Llama) or Groq to suggest positions as JSON
- Prompt engineering: Describe layout rules, layer hierarchy, spacing guidelines
- Fallback: If AI unavailable, use existing proportional scaling

### 5a.2: AI Copy Generation

**Requirements**:
- Right-click text layer → "AI Suggest Copy"
- Context: Banner purpose (from project brief/client), current text, format constraints
- Generates 3-5 alternative headlines/CTAs
- User picks one or edits
- Powered by Groq (existing integration)

### 5a.3: URL-to-Banner Generation

**Problem**: The Brief's killer feature — scan a URL, extract brand assets, generate banner.

**Requirements**:
- Input: Website URL + target ad formats
- Process: Scrape URL → extract colors, fonts, logo, imagery, copy → generate layers
- Output: Pre-populated banner project with brand-matched design
- Uses existing `urlScraper.ts` as base

### 5a.4: AI Image Suggestions

**Requirements**:
- In image picker, "AI Suggest" button
- Based on banner text/purpose, suggest relevant stock images
- Uses Workers AI for image generation or stock photo API integration

---

## 7. Phase 5b: Collaboration & Approval — Detailed Requirements

### 5b.1: Comments & Annotations

**Requirements**:
- Pin comments to specific x,y coordinates on a format
- Thread-based replies
- Resolve/unresolve comments
- Comment count badge on project cards
- Real-time updates (SSE or polling)

**DB**: New table `banner_comments` (id, project_id, format_key, x, y, user_id, text, parent_id, resolved, created_at)

### 5b.2: Approval Workflow

**Requirements**:
- Project status: Draft → In Review → Changes Requested → Approved → Published
- Assign reviewers (internal users or client portal users)
- Reviewer can Approve / Request Changes with comment
- Status visible on project card and in editor toolbar
- Email notification to reviewers

### 5b.3: External Review Links

**Problem**: Most requested feature by agencies — let clients review without an account.

**Requirements**:
- Generate shareable review URL with expiry
- Review page shows all formats with animation playback
- Reviewer can add comments (name + email, no account needed)
- Comments visible to project owner in editor
- Revoke link at any time

### 5b.4: Version History

**Requirements**:
- Auto-save creates version snapshots (max 50 per project)
- Version list in sidebar with timestamps and thumbnails
- Restore any previous version
- Compare two versions side-by-side (nice-to-have)

---

## 8. Phase 6a: Analytics & Optimization — Detailed Requirements

### 6a.1: Analytics Dashboard

**Requirements**:
- Per-published-banner: impressions, clicks, CTR
- Data ingested from tracking pixels (existing impression/click pixels)
- Time-series charts (daily/weekly/monthly)
- Filter by format, date range
- Compare formats within same project

**DB**: New table `banner_analytics` (id, published_id, date, impressions, clicks)
**Worker**: Analytics pixel endpoint that logs events to queue → batch insert

### 6a.2: A/B Testing Framework

**Requirements**:
- Create A/B test: Select 2-4 variants of same format
- Traffic split configuration (50/50, 70/30, etc.)
- Ad tag that routes traffic based on split
- Results dashboard with statistical significance indicator
- Auto-winner selection (when confidence >95%)

### 6a.3: Platform Validation

**Requirements**:
- Validate banner against platform specs (Google Ads, Meta, etc.)
- Check: file size limits, animation duration, click tag presence
- Warning badges shown per format in export modal
- Auto-fix suggestions where possible

---

## 9. Phase 6b: Publishing & Distribution — Detailed Requirements

### 6b.1: Google Ads Direct Publish

**Requirements**:
- OAuth connection to Google Ads account (existing Meta/Google OAuth in platform)
- Select campaign/ad group → publish banner directly
- Format matching: Only show compatible formats for selected placement
- Status sync: Published/paused state reflected in Banner Studio

### 6b.2: Meta Ads Direct Publish

**Requirements**:
- OAuth connection to Meta Business Manager (existing)
- Select campaign/ad set → publish creative directly
- Carousel support: Multiple formats as carousel cards
- Status sync

### 6b.3: Publish Scheduling

**Requirements**:
- Schedule publish for future date/time
- Scheduled state visible in project list
- Auto-publish via queue worker at scheduled time
- Cancel scheduled publish

---

## 10. Success Metrics

| Phase | Metric | Target |
|-------|--------|--------|
| 4a | Font variety used per project | >3 unique fonts (vs current 1-2) |
| 4a | Grid/snap usage | >60% of editor sessions |
| 4b | Keyframe usage | >30% of animations use custom keyframes |
| 5a | AI features adoption | >40% of new projects use AI assist |
| 5b | Review link usage | >50% of published projects reviewed externally |
| 6a | Analytics dashboard views | >3x per published project |
| 6b | Direct publish adoption | >25% of publishes via direct API |

---

## 11. Non-Goals

- Full video editor (trimming, cuts, audio) — use dedicated tools
- Per-character text styling — not expected even by competitors
- Website banners (hero, sticky bar, pop-up) — different category, future opportunity
- Real-time collaborative cursors — overkill for agency size
- 100+ ad network publishing — start with Google + Meta
- VAST/SIMID video ad serving — specialized ad server territory
- Lottie import — niche, After Effects pipeline
- 3D transforms — complexity not justified for banner ads

---

## 12. Dependencies & Risks

| Risk | Mitigation |
|------|-----------|
| Google Fonts API rate limits | Cache font metadata in KV (24h TTL) |
| Custom font licensing issues | User responsibility disclaimer on upload |
| AI auto-resize quality | Always show as suggestion, never auto-apply |
| Build OOM with more components | Lazy-load heavy modals, code-split editor |
| Snap performance with many layers | Limit snap computation to visible layers only |
| Multi-select complexity | Start with shift-click, defer rubber-band selection |

---

## 13. Implementation Order

```
Phase 4a (NOW — Table Stakes)
├── 4a.1 Google Fonts Integration
├── 4a.2 Custom Font Upload
├── 4a.3 Grid, Guides & Snap-to-Object
├── 4a.4 Alignment Toolbar
└── 4a.5 Exit Animations

Phase 4b (Next — Animation)
├── 4b.1 Per-Property Keyframe Timeline
├── 4b.2 Custom Easing Curve Editor
├── 4b.3 MP4 Video Export
└── 4b.4 Animation Preview Enhancement

Phase 5a (AI Features)
├── 5a.1 AI Auto-Resize
├── 5a.2 AI Copy Generation
├── 5a.3 URL-to-Banner Generation
└── 5a.4 AI Image Suggestions

Phase 5b (Collaboration)
├── 5b.1 Comments & Annotations
├── 5b.2 Approval Workflow
├── 5b.3 External Review Links
└── 5b.4 Version History

Phase 6a (Analytics)
├── 6a.1 Analytics Dashboard
├── 6a.2 A/B Testing Framework
└── 6a.3 Platform Validation

Phase 6b (Publishing)
├── 6b.1 Google Ads Direct Publish
├── 6b.2 Meta Ads Direct Publish
└── 6b.3 Publish Scheduling
```
