// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VideoStudioReviewStatusPanel from '~~/app/components/media/VideoStudioReviewStatusPanel.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { name: 'UBadge', props: ['label'], template: '<span>{{ label }}</span>' },
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VideoStudioReviewStatusPanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VideoStudioReviewStatusPanel', () => {
  it('reserves approval, comments, and handoff state without enabling workflow actions', async () => {
    const html = await render({ renderJobCount: 2, latestRenderStatus: 'done' })

    expect(html).toContain('Review workflow')
    expect(html).toContain('Reserved')
    expect(html).toContain('Approval state')
    expect(html).toContain('Draft review')
    expect(html).toContain('Comments')
    expect(html).toContain('Render queue')
    expect(html).toContain('2 jobs')
    expect(html).toContain('Latest render')
    expect(html).toContain('done')
    expect(html).toContain('client sign-off')
  })
})
