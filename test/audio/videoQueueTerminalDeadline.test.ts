import { beforeEach, expect, it, vi } from 'vitest'
import { TerminalRenderDeadlineError, RenderDeadlineError, RenderPublicationUncertainError } from '../../shared/video/renderExecution'
const mock = vi.hoisted(() => ({ run: vi.fn() }))
vi.mock('../../workers/audio-jobs/src/videoCompositeRender', () => ({ runVideoCompositeJob: mock.run }))
import worker from '../../workers/audio-jobs/src/index'
beforeEach(() => vi.clearAllMocks())
it.each([
  [new TerminalRenderDeadlineError('container_timeout: expired'), true],
  [new RenderDeadlineError(), false],
  [new RenderPublicationUncertainError('response lost'), false],
  [new Error('transport unavailable'), false],
])('acknowledges only a durably persisted terminal deadline (%s)', async (error, terminal) => {
  mock.run.mockRejectedValue(error)
  const msg = { body: { jobId: 'owned-job' }, ack: vi.fn(), retry: vi.fn() }
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    await worker.queue({ queue: 'video-render', messages: [msg] } as any, { AUDIO_BUCKET: { delete: vi.fn() }, RENDER: {}, AI: {} } as any, {} as any)
    expect(msg.ack).toHaveBeenCalledTimes(terminal ? 1 : 0)
    expect(msg.retry).toHaveBeenCalledTimes(terminal ? 0 : 1)
  } finally { log.mockRestore() }
})
