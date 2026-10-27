import { describe, expect, it } from 'vitest'
import { PNG } from 'pngjs'
import {
  composeBenchmarkLayers,
  parseBenchmarkArgs
} from '../../scripts/banner-studio/benchmark-qwen'

describe('Qwen benchmark runner', () => {
  it('is dry run by default with bounded explicit inference opt-in', () => {
    expect(parseBenchmarkArgs([])).toMatchObject({
      run: false,
      numLayers: 4,
      steps: 50
    })
    expect(
      parseBenchmarkArgs(['--run', '--input', '/tmp/source.jpg'])
    ).toMatchObject({ run: true, input: '/tmp/source.jpg' })
    expect(() => parseBenchmarkArgs(['--layers', '9'])).toThrow()
    expect(() => parseBenchmarkArgs(['--unknown'])).toThrow()
  })
  it('composes returned registered RGBA stack in order and rejects frame drift', () => {
    const base = new PNG({ width: 1, height: 1 })
    base.data.set([0, 0, 255, 255])
    const top = new PNG({ width: 1, height: 1 })
    top.data.set([255, 0, 0, 128])
    const image = PNG.sync.read(
      composeBenchmarkLayers([PNG.sync.write(base), PNG.sync.write(top)])
    )
    expect([...image.data]).toEqual([128, 0, 127, 255])
    expect(() =>
      composeBenchmarkLayers([
        PNG.sync.write(base),
        PNG.sync.write(new PNG({ width: 2, height: 1 }))
      ])
    ).toThrow()
  })
})
