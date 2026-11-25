import { expect, it } from 'vitest'
import { convertTheBriefHtml } from '../../scripts/thebrief/convert-html.mjs'
import { source } from './fixture'

it('preserves the authored colour stop in a native editable text sweep', async () => {
  const frame = (offset: number) => `background-position:calc(var(--ctp-gw-tw,200px) * ${offset} - var(--ctp-gw-wx,0px)) center;background-clip:text;background-image:linear-gradient(-270deg,#fff 0,#49e5ff 99%);background-size:calc(var(--ctp-gw-tw,200px) * 2) auto`
  const html = source.replace('</style>', `
    [data-gradient-glyph]{animation-name:sweep;animation-duration:1s;animation-timing-function:linear;animation-delay:1s;animation-iteration-count:2;animation-fill-mode:none;animation-direction:normal}
    @keyframes sweep{100%{${frame(0)}}0%{${frame(-2)}}}
    </style>`).replace('<div class="row">Hello world</div>', '<div id="effMid1"><div class="text-content"><div class="row"><span data-gradient-glyph="true">Hello world</span></div></div></div>')
  const converted = await convertTheBriefHtml(html)
  expect(converted.warnings.join(' ')).not.toContain('animation not converted')
  const text = converted.canvasData.custom_300x250.layers.find(layer => layer.type === 'text')
  expect(text.textSweep.gradient).toBe('linear-gradient(-270deg, #ffffff 0%, #49e5ff 99%)')
})
