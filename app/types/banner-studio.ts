// Banner Studio Types

export interface BannerFormat {
  key: string
  w: number
  h: number
  name: string
  label: string
  platform: 'Google' | 'Facebook' | 'Instagram' | 'TikTok' | 'LinkedIn'
  icon: string
}

export type LayerType = 'bg' | 'image' | 'video' | 'text' | 'button' | 'rect' | 'audio'

export type AnimInType =
  | 'none' | 'fadeIn' | 'slideL' | 'slideR' | 'slideU' | 'slideD'
  | 'zoomIn' | 'zoomOut' | 'spinIn' | 'bounceIn' | 'elastic' | 'kenBurns'

export type AnimOutType =
  | 'none' | 'fadeOut' | 'slideL' | 'slideR' | 'slideU' | 'slideD'
  | 'zoomIn' | 'zoomOut' | 'spinOut'

// Keyframe animation types (Phase 4b)
export type KeyframeProperty = 'opacity' | 'x' | 'y' | 'scaleX' | 'scaleY' | 'rotation'

export interface Keyframe {
  time: number    // seconds on timeline
  value: number   // property value at this time
  easing?: string // easing to NEXT keyframe (GSAP or cubic-bezier)
}

export interface AnimPreset {
  id: AnimInType
  label: string
  icon: string
  from: Record<string, number>
  special?: string
}

export interface AnimOutPreset {
  id: AnimOutType
  label: string
  icon: string
  to: Record<string, number>
}

export interface MotionPathPoint {
  x: number   // offset from layer.x
  y: number   // offset from layer.y
}

export interface MotionPathTween {
  startTime: number    // absolute time on timeline
  endTime: number      // absolute time on timeline
  pathStart: number    // 0-1, start progress on path
  pathEnd: number      // 0-1, end progress on path
  ease?: string
}

export interface Layer {
  id: number
  type: LayerType
  name: string
  // Position & size
  x: number
  y: number
  w: number
  h: number
  zIndex: number
  opacity: number
  rotation?: number
  // Visibility
  locked?: boolean
  hidden?: boolean
  // Text properties
  text?: string
  fontSize?: number
  fontWeight?: number
  fontFamily?: string
  color?: string
  textTransform?: string
  letterSpacing?: string
  lineHeight?: number
  textAlign?: string
  // Text effects
  fontStyle?: 'normal' | 'italic'
  textShadow?: string
  textStroke?: string
  gradientColors?: string[]
  // Background (for bg layer or text badges)
  bgColor?: string
  // Image/video
  src?: string
  srcType?: 'image' | 'video' // default 'image'
  fit?: 'cover' | 'contain' | 'fill'
  /** Marks an image layer as the brand logo so brand kits can swap it */
  isLogo?: boolean
  focalX?: number // 0-100, default 50 (center)
  focalY?: number // 0-100, default 50 (center)
  // Button
  textColor?: string
  borderRadius?: number
  paddingH?: number
  paddingV?: number
  // Rect
  fillColor?: string
  // Audio
  volume?: number       // 0-1, default 1
  muted?: boolean       // default false
  loopAudio?: boolean   // loop the audio source within presence range
  // Animation
  animIn: AnimInType
  animInDur: number
  startTime: number
  endTime: number
  ease?: string
  animOut?: AnimOutType
  animOutEase?: string
  outDur?: number
  // Keyframe animation (Phase 4b) — overrides preset when present
  keyframes?: Partial<Record<KeyframeProperty, Keyframe[]>>
  // Feed bindings (Phase 3a)
  feedBindings?: FeedBinding[]
  // Mask properties
  isMask?: boolean
  maskShape?: 'rect' | 'ellipse'
  maskTargetIds?: number[]
  maskInvert?: boolean
  // Motion path (curved trajectory animation)
  motionPath?: MotionPathPoint[]
  motionPathCurviness?: number     // 0 = sharp, 1 = smooth, 2 = very curvy (default 1)
  motionPathAutoRotate?: boolean   // orient layer to follow path direction
  motionPathTweens?: MotionPathTween[]  // chained tweens along the path
  // Legacy aliases (kept for compatibility)
  delay?: number
  dur?: number
}

export interface ArtboardState {
  layers: Layer[]
  bgColor?: string
}

export interface BannerProject {
  id: string
  name: string
  clientId: string | null
  clientName?: string
  canvasData: Record<string, ArtboardState>
  thumbnailUrl: string | null
  status: 'draft' | 'published'
  tags: string[]
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BannerAsset {
  id: string
  name: string
  mimeType: string
  fileSize: number
  r2Key: string
  url: string
  thumbnailUrl: string | null
  tags: string[]
  uploadedBy: string
  createdAt: string
}

export interface BannerTemplate {
  id: string
  name: string
  category: string
  thumbnail?: string
  layers: (fmt: { w: number; h: number }) => Partial<Layer>[]
}

export interface BannerExportRecord {
  id: string
  projectId: string
  formatKey: string
  r2Key: string
  url: string
  fileSize: number | null
  exportType: 'html5' | 'png' | 'jpg' | 'gif'
  quality: number
  exportedBy: string
  exportedAt: string
}

// Brand Kit
export type BrandColorRole = 'primary' | 'secondary' | 'accent' | 'background' | 'text' | 'extra'
export type BrandFontRole = 'heading' | 'body' | 'extra'

export interface BrandKitColor {
  role: BrandColorRole
  hex: string
  /** Optional human name, e.g. "Leapmotor Green" */
  label?: string
}

export interface BrandKitFont {
  role: BrandFontRole
  family: string
  weights: number[]
}

export interface BrandKitLogo {
  name: string
  url: string
  r2Key: string
  /** Which backgrounds this mark is designed for */
  variant?: 'light' | 'dark' | 'any'
}

export interface BannerBrandKit {
  id: string
  clientId: string | null
  clientName?: string
  clientLogoUrl?: string | null
  name: string
  colors: BrandKitColor[]
  fonts: BrandKitFont[]
  logos: BrandKitLogo[]
  guidelines: string | null
  isDefault: boolean
  sourceUrl?: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface BrandKitVersion {
  id: string
  brandKitId: string
  version: number
  note: string | null
  createdBy: string | null
  createdAt: string
  snapshot: Pick<BannerBrandKit, 'name' | 'colors' | 'fonts' | 'logos' | 'guidelines'>
}

/** What "Extract from website" returns before the user confirms */
export interface BrandKitExtraction {
  name: string
  sourceUrl: string
  colors: BrandKitColor[]
  fonts: BrandKitFont[]
  logos: BrandKitLogo[]
}

// Image Export
export interface ImageExportFormat {
  key: string
  html: string
  width: number
  height: number
}

export interface ImageExportOptions {
  projectId: string
  formats: ImageExportFormat[]
  quality: 1 | 2
  format: 'png' | 'jpg'
  jpgQuality?: number
}

export interface GifExportOptions {
  projectId: string
  formats: ImageExportFormat[]
  fps?: number // default 10
}

export interface ImageExportResult {
  formatKey: string
  url: string
  fileSize: number
}

export interface DragState {
  type: 'move' | 'resize'
  layerId: number
  startX: number
  startY: number
  origX: number
  origY: number
  origW?: number
  origH?: number
  resizeHandle?: string
  scale: number
}

export interface SelectionState {
  layerId: number | null
  multiSelect: number[]
}

export interface UndoAction {
  type: string
  before: any
  after: any
}

export interface BannerSetDef {
  id: string
  name: string
  keys: string[]
  desc: string
}

export interface ElementDef {
  name: string
  layer: (fmt: { w: number; h: number }) => Partial<Layer>
  extra?: (fmt: { w: number; h: number }) => Partial<Layer>[]
}

export interface ElementCategory {
  cat: string
  items: ElementDef[]
}

export interface PlatformMeta {
  color: string
  bg: string
  label: string
}

// Phase 1b: Published Banners & Ad Tags
export interface BannerPublished {
  id: string
  projectId: string
  formatKey: string
  version: number
  r2Key: string
  url: string
  clickUrl: string | null
  impressionPixel: string | null
  clickPixel: string | null
  width: number
  height: number
  fileSize: number | null
  isLive: boolean
  publishedBy: string
  publishedAt: string
  updatedAt: string
}

export type AdTagType = 'iframe' | 'javascript' | 'amphtml'

export interface AdTagConfig {
  type: AdTagType
  clickUrl?: string
  impressionPixel?: string
  clickPixel?: string
}

export interface AdTagResult {
  type: AdTagType
  code: string
  formatKey: string
  width: number
  height: number
}

// Phase 2b: Template Marketplace
export interface BannerTemplateDB {
  id: string
  name: string
  category: string
  description: string | null
  canvasData: Record<string, ArtboardState>
  thumbnailUrl: string | null
  previewUrl: string | null
  isSystem: boolean
  tags: string[]
  formats: string[]
  usageCount: number
  createdBy: string
  createdAt: string
}

// Phase 3a: Data Feeds
export interface FeedColumn {
  name: string
  type: 'text' | 'number' | 'url' | 'color'
}

export interface BannerFeed {
  id: string
  projectId: string
  name: string
  sourceType: 'csv' | 'json'
  columns: FeedColumn[]
  rowCount: number
  r2Key: string | null
  dataUrl: string | null
  sampleData: Record<string, string>[]
  uploadedBy: string
  createdAt: string
  updatedAt: string
}

export interface FeedBinding {
  feedId: string
  column: string
  property: string
}

// Phase 3b: DCO (Dynamic Creative Optimization)
export interface BannerVariant {
  id: string
  projectId: string
  feedId: string
  formatKey: string
  rowIndex: number
  rowData: Record<string, string>
  r2Key: string
  url: string
  width: number
  height: number
  fileSize: number | null
  clickUrl: string | null
  isLive: boolean
  generatedBy: string
  generatedAt: string
}

export interface DCOGenerateRequest {
  projectId: string
  feedId: string
  formatKey: string
  html: string
  width: number
  height: number
  rowIndex: number
  rowData: Record<string, string>
  clickUrl?: string
}

export interface DCOGenerateResult {
  total: number
  generated: number
  errors: number
  variants: BannerVariant[]
}

// ── Custom HTML Templates ──

export interface CustomTemplateVariable {
  name: string
  label: string
  type: 'text' | 'color' | 'url' | 'number'
  default: string
  group?: string
}

export interface CustomTemplate {
  id: string
  name: string
  category: string
  description: string | null
  tags: string[]
  html: string
  css: string
  js: string
  variables: CustomTemplateVariable[]
  width: number
  height: number
  thumbnailUrl: string | null
  previewUrl: string | null
  externalScripts: string[]
  externalStyles: string[]
  isSystem: boolean
  usageCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface CustomTemplateInstance {
  id: string
  templateId: string
  templateName?: string
  templateCategory?: string
  name: string
  htmlOverride: string | null
  cssOverride: string | null
  jsOverride: string | null
  variableValues: Record<string, string>
  width: number | null
  height: number | null
  publishedUrl: string | null
  r2Key: string | null
  isPublished: boolean
  clickUrl: string | null
  impressionPixel: string | null
  clickPixel: string | null
  clientId: string | null
  createdBy: string
  createdAt: string
  updatedAt: string
}

// ── Banner Dissector Types ──

export type TokenType =
  | 'price' | 'price_label' | 'model_name' | 'brand'
  | 'campaign_label' | 'color' | 'font_size' | 'disclaimer'
  | 'cta_label' | 'image_asset'

export interface DesignToken {
  id: string
  type: TokenType
  value: string
  label: string
  editable: boolean
  required: boolean
  validation?: {
    maxLength?: number
    pattern?: string
    allowedValues?: string[]
  }
  affects_layers: string[]
}

export type DissectorLayerType = 'graphic_text' | 'live_text' | 'vehicle' | 'logo' | 'background'

export interface DissectorLayer {
  id: string
  type: DissectorLayerType
  description: string
  z_index: number
  editable: boolean
  export_as_png: boolean
  region: { x: number; y: number; width: number; height: number }
  asset_path?: string
  r2_url?: string
  render_as?: 'html'
  token_bindings?: string[]
  typography?: Record<string, { font_weight: string; font_size: string; color: string }>
  font_notes?: string
  mask?: string // Gemini segmentation mask (base64 PNG)
}

export interface DissectorManifest {
  jobId: string
  version: '2.0'
  brand: string
  campaign_type: string
  banner_size: string
  processed_at: string
  status: 'analyzing' | 'segmenting' | 'complete' | 'failed'
  error?: string
  tokens: Record<string, DesignToken>
  layers: DissectorLayer[]
}

// ── AI Layer Edit Types ──

export interface EditLayerResult {
  url: string
  r2Key: string
  seed: number | null
}

// ── AI Image Generation Types ──

export interface GenerateImageResult {
  url: string
  r2Key: string
  seed: number | null
}

// ── Layer Decomposition Types ──

export interface DecomposeResultLayer {
  name: string
  url: string
  r2Key: string
  width: number
  height: number
}

export interface DecomposeResult {
  layers: DecomposeResultLayer[]
  pptxUrl: string | null
  zipUrl: string | null
}
