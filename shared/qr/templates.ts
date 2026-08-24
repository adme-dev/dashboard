import type { QrStyle } from './style'
import { DEFAULT_STYLE } from './style'

export interface QrTemplate { key: string, label: string, style: QrStyle }

export const QR_TEMPLATES: QrTemplate[] = [
  { key: 'default', label: 'Default', style: { ...DEFAULT_STYLE } },
  { key: 'rounded-blue', label: 'Rounded Blue', style: { ...DEFAULT_STYLE, pattern: 'rounded', eye: 'rounded', fg: '#1877f2', eyeFg: '#1877f2' } },
  { key: 'gradient-pink', label: 'Smooth Pink', style: { ...DEFAULT_STYLE, pattern: 'smooth', eye: 'rounded', fg: '#c13584', eyeFg: '#833ab4' } },
  { key: 'dots-orange', label: 'Dots Orange', style: { ...DEFAULT_STYLE, pattern: 'circles', eye: 'circle', fg: '#ff6b35', eyeFg: '#d7263d' } },
  { key: 'inverse', label: 'Dark Card', style: { ...DEFAULT_STYLE, pattern: 'rounded', eye: 'rounded', fg: '#ffffff', bg: '#111111' } },
  { key: 'thin-mono', label: 'Thin Mono', style: { ...DEFAULT_STYLE, pattern: 'thin', eye: 'square' } },
]
