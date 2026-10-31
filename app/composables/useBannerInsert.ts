import type { Layer } from '~/types/banner-studio'
import { brandFont, brandFontSelection } from '~/utils/banner-brand-kit'

const defaults: Record<string, Partial<Layer>> = {
  text: { type: 'text', name: 'Text', text: 'Text', fontSize: 24, fontWeight: 700, fontFamily: 'Barlow Condensed', color: '#fff', textAlign: 'left', w: 200, h: 40, animIn: 'fadeIn' },
  rect: { type: 'rect', name: 'Rectangle', fillColor: 'rgba(255,255,255,0.1)', w: 120, h: 80, animIn: 'fadeIn' },
  button: { type: 'button', name: 'Button', text: 'CLICK HERE', fontSize: 12, fontWeight: 800, fontFamily: 'Barlow Condensed', bgColor: '#e8c84a', textColor: '#000', borderRadius: 2, textTransform: 'uppercase', letterSpacing: '0.1em', w: 140, h: 36, animIn: 'slideU', delay: 1 },
  mask: { type: 'rect', name: 'Mask', fillColor: 'rgba(255,255,255,0.3)', w: 120, h: 80, animIn: 'fadeIn' }
}

export function useBannerInsert() {
  const { state, activeFormat, addLayer, toggleMask } = useBannerStudio()
  const { kit } = useBannerProjectBrand()
  function insertElement(type: string) {
    const item = defaults[type], format = activeFormat.value
    if (!item || !format) return
    const font = kit.value && ['text', 'button'].includes(type) ? brandFont(kit.value, 'heading') : undefined
    const layer = addLayer({ ...item, ...(font ? brandFontSelection(font) : {}), x: Math.max(0, (format.w - item.w!) / 2), y: Math.max(0, (format.h - item.h!) / 2) })
    if (type === 'mask') toggleMask(layer.id)
    state.activeTool = 'select'
  }
  return { insertElement }
}
