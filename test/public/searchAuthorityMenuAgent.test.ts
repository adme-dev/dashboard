// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface MenuRuntime {
  init: (options: { configUrl: string }) => Promise<void>
  destroy: () => void
}

const script = readFileSync('public/search-authority/menu-agent.v1.js', 'utf8')
const configUrl = 'https://app.xeroflow.io/api/public/search-authority/menu/11111111-1111-4111-8111-111111111111'
let config: Record<string, unknown>

function runtime(): MenuRuntime {
  return (window as unknown as { XeroFlowSearchAuthorityMenu: MenuRuntime }).XeroFlowSearchAuthorityMenu
}

async function settle() {
  await Promise.resolve()
  await new Promise(resolve => setTimeout(resolve, 80))
}

describe('versioned Search Authority Menu Agent', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = '<head></head><body><nav id="desktop"><ul><li>Home</li><li>Contact</li></ul></nav><nav id="mobile"><ul><li>Home</li></ul></nav></body>'
    config = {
      enabled: true,
      label: 'Buying Guides',
      href: 'https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide',
      desktopSelector: '#desktop ul',
      mobileSelector: '#mobile ul',
      insertion: 'before-last'
    }
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.endsWith('/observed') ? { ok: true } : config
    })))
    window.eval(script)
  })

  afterEach(() => {
    runtime().destroy()
  })

  it('adds one accessible link per configured menu and stays idempotent on duplicate loads', async () => {
    await runtime().init({ configUrl })
    await runtime().init({ configUrl })

    const links = document.querySelectorAll('[data-xeroflow-search-authority-menu="v1"] a')
    expect(links).toHaveLength(2)
    expect([...links].map(link => link.textContent)).toEqual(['Buying Guides', 'Buying Guides'])
    expect(links[0]?.getAttribute('href')).toBe(config.href)
  })

  it('inserts only one link when desktop and mobile selectors resolve to the same menu', async () => {
    config.desktopSelector = '#desktop ul'
    config.mobileSelector = '#desktop ul'
    await runtime().init({ configUrl })

    expect(document.querySelectorAll('#desktop [data-xeroflow-search-authority-menu="v1"]')).toHaveLength(1)
  })

  it('reconciles a Next-style menu rerender without touching unrelated nodes', async () => {
    await runtime().init({ configUrl })
    document.querySelector('#desktop ul')!.innerHTML = '<li data-keep="true">New home</li>'
    await settle()

    expect(document.querySelector('#desktop [data-keep="true"]')).not.toBeNull()
    expect(document.querySelectorAll('#desktop [data-xeroflow-search-authority-menu="v1"]')).toHaveLength(1)
  })

  it('does nothing for missing selectors or untrusted labels and URLs', async () => {
    config.desktopSelector = '#missing'
    config.mobileSelector = '#also-missing'
    await runtime().init({ configUrl })
    expect(document.querySelectorAll('[data-xeroflow-search-authority-menu]')).toHaveLength(0)

    config.desktopSelector = '#desktop ul'
    config.mobileSelector = '#mobile ul'
    config.label = '<img src=x onerror=alert(1)>'
    config.href = 'javascript:alert(1)'
    await runtime().init({ configUrl })
    expect(document.querySelectorAll('[data-xeroflow-search-authority-menu]')).toHaveLength(0)
  })

  it('removes inserted nodes when the remote kill switch is disabled', async () => {
    await runtime().init({ configUrl })
    expect(document.querySelectorAll('[data-xeroflow-search-authority-menu]')).toHaveLength(2)

    config.enabled = false
    await runtime().init({ configUrl })
    expect(document.querySelectorAll('[data-xeroflow-search-authority-menu]')).toHaveLength(0)
  })
})
