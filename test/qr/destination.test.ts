import { describe, it, expect } from 'vitest'
import { validateDestinationUrl } from '../../shared/qr/destination'

describe('validateDestinationUrl', () => {
  it('accepts http(s) urls and normalises', () => {
    expect(validateDestinationUrl('https://example.com/page?x=1')).toEqual({ ok: true, url: 'https://example.com/page?x=1' })
    expect(validateDestinationUrl('  http://example.com ')).toEqual({ ok: true, url: 'http://example.com/' })
  })
  it.each([
    'ftp://example.com', 'javascript:alert(1)', 'example.com', '',
    'http://localhost/x', 'http://foo.localhost', 'http://127.0.0.1', 'http://10.1.2.3',
    'http://192.168.0.1', 'http://172.20.0.1', 'http://169.254.1.1', 'http://0.0.0.0', 'http://[::1]/',
    'https://app.xeroflow.io/q/AbC1234', 'https://APP.xeroflow.io/q/x',
  ])('rejects %s', (u) => {
    expect(validateDestinationUrl(u).ok).toBe(false)
  })
  it('allows other paths on app.xeroflow.io', () => {
    expect(validateDestinationUrl('https://app.xeroflow.io/portal').ok).toBe(true)
  })
})
