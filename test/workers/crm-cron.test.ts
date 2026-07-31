import { beforeEach, describe, expect, it, vi } from 'vitest'

import worker from '../../workers/crm-cron/src/index'

describe('CRM cron fan-out', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('runs every CRM job without logging response content', async () => {
    const fetchMock = vi.fn(async () => new Response(
      JSON.stringify({ message: 'private CRM response canary' }),
      { status: 200 }
    ))
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    try {
      await worker.scheduled(
        { cron: '0 * * * *' } as ScheduledController,
        {
          APP_BASE_URL: 'https://app.example.test',
          CRON_SECRET: 'cron-secret'
        },
        {} as ExecutionContext
      )
    } finally {
      vi.unstubAllGlobals()
    }

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(log).toHaveBeenCalledTimes(5)
    expect(JSON.stringify(log.mock.calls)).not.toContain('private CRM response canary')
  })

  it('reports HTTP and request failures with bounded metadata', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('private first failure', { status: 503 }))
      .mockRejectedValueOnce(new Error('private network failure'))
      .mockResolvedValue(new Response('{}', { status: 200 }))
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.stubGlobal('fetch', fetchMock)
    try {
      await worker.scheduled(
        { cron: '0 * * * *' } as ScheduledController,
        {
          APP_BASE_URL: 'https://app.example.test',
          CRON_SECRET: 'cron-secret'
        },
        {} as ExecutionContext
      )
    } finally {
      vi.unstubAllGlobals()
    }

    expect(error).toHaveBeenNthCalledWith(1, 'crm-cron.run.failed', {
      job: 'crm-task-reminders',
      status: 503
    })
    expect(error).toHaveBeenNthCalledWith(2, 'crm-cron.run.failed', {
      job: 'crm-score-decay',
      status: 'request_error'
    })
    expect(JSON.stringify(error.mock.calls)).not.toContain('private')
  })
})
