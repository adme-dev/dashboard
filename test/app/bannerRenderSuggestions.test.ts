import { describe, expect, it } from 'vitest'
import { createBannerRenderSuggestionStore, snapshotBannerSocialSuggestion } from '~~/app/utils/bannerRenderSuggestions'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) }
  }
}

describe('render-job social suggestions', () => {
  it('recovers the correct copy after closing the component and reloading the same tab', () => {
    const session = storage()
    const original = createBannerRenderSuggestionStore(() => session)
    original.remember('project-a', 'client-a', ['job-1', 'job-2'], { caption: 'Approved offer', suggestedSchedule: 'Tomorrow morning' })
    const recovered = createBannerRenderSuggestionStore(() => session)
    expect(recovered.get('project-a', 'client-a', 'job-1')).toEqual({ caption: 'Approved offer', suggestedSchedule: 'Tomorrow morning' })
    expect(recovered.get('project-a', 'client-a', 'job-2')).toEqual(recovered.get('project-a', 'client-a', 'job-1'))
  })

  it('isolates projects and jobs, and preserves the first copy on enqueue replay', () => {
    const store = createBannerRenderSuggestionStore(() => storage())
    store.remember('project-a', 'client-a', ['old-video'], { caption: 'Original caption' })
    store.remember('project-a', 'client-a', ['new-video'], { caption: 'New proposal caption' })
    store.remember('project-a', 'client-a', ['old-video'], { caption: 'Incorrect replay caption' })
    store.remember('project-b', 'client-a', ['old-video'], { caption: 'Other client' })
    expect(store.get('project-a', 'client-a', 'old-video')).toEqual({ caption: 'Original caption' })
    expect(store.get('project-a', 'client-a', 'new-video')).toEqual({ caption: 'New proposal caption' })
    expect(store.get('project-b', 'client-a', 'old-video')).toEqual({ caption: 'Other client' })
    expect(store.get('project-b', 'client-a', 'new-video')).toBeUndefined()
    expect(store.get('project-c', 'client-a', 'old-video')).toBeUndefined()
    expect(store.get('project-a', 'client-b', 'old-video')).toBeUndefined()
    store.remember('project-a', 'client-b', ['old-video'], { caption: 'Reassigned client copy' })
    expect(store.get('project-a', 'client-a', 'old-video')).toEqual({ caption: 'Original caption' })
    expect(store.get('project-a', 'client-b', 'old-video')).toEqual({ caption: 'Reassigned client copy' })
  })

  it('captures an immutable bounded snapshot before an asynchronous enqueue', async () => {
    const store = createBannerRenderSuggestionStore(() => storage())
    const prop = { caption: 'First offer', suggestedSchedule: 'Friday' }
    const snapshot = snapshotBannerSocialSuggestion(prop)
    await Promise.resolve()
    prop.caption = 'Changed while rendering'
    store.remember('project-a', 'client-a', ['job-1'], snapshot)
    snapshot.caption = 'Changed after recording'
    const copy = store.get('project-a', 'client-a', 'job-1')!
    expect(copy.caption).toBe('First offer')
    copy.caption = 'Changed by reader'
    expect(store.get('project-a', 'client-a', 'job-1')?.caption).toBe('First offer')
    expect(snapshotBannerSocialSuggestion({ caption: 'x'.repeat(6000), suggestedSchedule: 'x'.repeat(600) })).toEqual({ caption: 'x'.repeat(5000), suggestedSchedule: 'x'.repeat(500) })
  })

  it('retains the latest 50 jobs per project across reload', () => {
    const session = storage()
    const store = createBannerRenderSuggestionStore(() => session)
    for (let i = 0; i < 55; i++) store.remember('project-a', 'client-a', [`job-${i}`], { caption: `Caption ${i}` })
    const recovered = createBannerRenderSuggestionStore(() => session)
    expect(recovered.get('project-a', 'client-a', 'job-0')).toBeUndefined()
    expect(recovered.get('project-a', 'client-a', 'job-4')).toBeUndefined()
    expect(recovered.get('project-a', 'client-a', 'job-5')?.caption).toBe('Caption 5')
    expect(recovered.get('project-a', 'client-a', 'job-54')?.caption).toBe('Caption 54')
  })

  it('falls back to memory when storage is denied, without claiming reload persistence', () => {
    const denied = () => {
      throw new Error('Storage blocked')
    }
    const store = createBannerRenderSuggestionStore(denied)
    store.remember('project-a', 'client-a', ['job-1'], { caption: 'Retained until reload' })
    expect(store.get('project-a', 'client-a', 'job-1')?.caption).toBe('Retained until reload')
    expect(createBannerRenderSuggestionStore(denied).get('project-a', 'client-a', 'job-1')).toBeUndefined()
  })

  it('ignores corrupt storage and records absence of suggestions without borrowing later copy', () => {
    const session = storage()
    session.setItem('banner-render-suggestions:v2:project-a:client-a', '{broken')
    const store = createBannerRenderSuggestionStore(() => session)
    expect(store.get('project-a', 'client-a', 'job-1')).toBeUndefined()
    store.remember('project-a', 'client-a', ['job-1'])
    store.remember('project-a', 'client-a', ['job-1'], { caption: 'Unrelated later proposal' })
    expect(store.get('project-a', 'client-a', 'job-1')).toEqual({})
  })
})
