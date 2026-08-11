import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function queueForBinding(config: string, binding: string): string | null {
  const blocks = config.match(/\[\[env\.production\.queues\.producers\]\][\s\S]*?(?=\n\[\[|\n\[|$)/g) || []
  const block = blocks.find(item => new RegExp(`binding\\s*=\\s*["']${binding}["']`).test(item))
  return block?.match(/queue\s*=\s*["']([^"']+)["']/)?.[1] ?? null
}

describe('Pages queue producer bindings', () => {
  it('declares the render queue producers used by the media render endpoints', () => {
    const config = readFileSync('wrangler.toml', 'utf8')

    expect(queueForBinding(config, 'TIMELINE_RENDER_QUEUE')).toBe('timeline-render')
    expect(queueForBinding(config, 'VIDEO_RENDER_QUEUE')).toBe('video-render')
    expect(queueForBinding(config, 'VIDEO_GENERATION_QUEUE')).toBe('video-generation')
  })
})
