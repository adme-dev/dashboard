import { expect, it } from 'vitest'
import { strToU8, zipSync } from 'fflate'
import { prepareTheBriefGroup } from '../../scripts/thebrief/prepare-group.mjs'
import { parseTheBriefPackage } from '../../app/utils/thebrief-import'

function sourceLayout(width: number, height: number) {
  const element = (id: number, group: string) => `<div id="element-${id}" data-eltype="shape" data-elgroup="${group}" class="shape"><div id="c-${id}" class="content" data-elgroup="slate-9"></div></div>`
  const slide = (id: number) => ({ id, type: 'slide', duration: 2000, effInDuration: 0, effOutDuration: 0, elements: [] })
  const designData = { designHash: `layout-${width}`, width, height, loopCount: 0, animations: [slide(1), slide(2)], customAnimations: [] }
  return `<style>#designContainer{width:${width}px;height:${height}px}
    .shape{position:absolute;left:10px;top:20px;width:30px;height:40px}
    .content{width:100%;height:100%;background-color:#f00;background-image:none}</style>
    <script>window.creatopyEmbed={designData:${JSON.stringify(designData)}};</script>
    <div id="designContainer"><div id="slide-1">${[5, 6, 7, 8].map(id => element(id, 'cgroup-13')).join('')}${element(9, 'slate-9')}${element(10, '')}</div>
    <div id="slide-2">${element(11, 'cgroup-13')}${element(12, 'cgroup-13')}</div></div>`
}

it('preserves the four marked letters in each layout through ZIP preparation, merge and package validation', async () => {
  const sizes = [[1000, 1000], [800, 300], [600, 300], [1200, 644]] as const
  const sizesZip = Object.fromEntries(sizes.map(([width, height]) => [
    `Logo-${width}x${height}-px.zip`, zipSync({ 'index.html': strToU8(sourceLayout(width, height)) })
  ]))
  const result = await prepareTheBriefGroup(zipSync(sizesZip))
  expect(result.issues).toEqual([])
  expect(result.packages).toHaveLength(1)
  const { canvasData } = parseTheBriefPackage(JSON.parse(JSON.stringify(result.packages[0])))
  expect(Object.keys(canvasData)).toHaveLength(4)
  for (const board of Object.values(canvasData)) {
    const letters = board.layers.filter(layer => layer.timelineGroup?.id === 'source-slide:1:cgroup-13')
    expect(letters.map(layer => layer.linkId)).toEqual(['source:5', 'source:6', 'source:7', 'source:8'])
    expect(letters.every(layer => layer.timelineGroup?.name === 'Group 13')).toBe(true)
    expect(board.layers.filter(layer => layer.timelineGroup?.id === 'source-slide:2:cgroup-13')).toHaveLength(2)
    expect(board.layers.filter(layer => !layer.timelineGroup).map(layer => layer.linkId)).toEqual(['source:background', 'source:9', 'source:10'])
  }
}, 30000)
