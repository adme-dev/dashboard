import { describe, expect, it, vi } from 'vitest'

import {
  assertPublicSiteOrigin,
  isPublicIpAddress,
  normalizeSiteOrigin
} from '~~/server/utils/siteIntelligence/urlPolicy'

describe('site intelligence URL policy', () => {
  it('normalises a public site URL to its lower-case origin', () => {
    expect(normalizeSiteOrigin('https://Dealer.Example.com:443/offers?model=cannon')).toBe(
      'https://dealer.example.com'
    )
    expect(normalizeSiteOrigin('http://Dealer.Example.com:8080/offers')).toBe(
      'http://dealer.example.com:8080'
    )
  })

  it.each([
    ['http://127.0.0.1/admin', 'Public HTTP(S) origin required'],
    ['http://169.254.169.254/latest', 'Public HTTP(S) origin required'],
    ['http://[::1]/admin', 'Public HTTP(S) origin required'],
    ['https://localhost/admin', 'Public HTTP(S) origin required'],
    ['https://service.local/admin', 'Public HTTP(S) origin required'],
    ['https://intranet/admin', 'Public HTTP(S) origin required'],
    ['file:///etc/passwd', 'Public HTTP(S) origin required'],
    ['https://user:pass@example.com', 'Credentials are not allowed'],
    ['https://example.com/offers#private-fragment', 'Fragments are not allowed']
  ])('rejects unsafe target %s', (input, message) => {
    expect(() => normalizeSiteOrigin(input)).toThrowError(message)
  })

  it.each([
    '10.0.0.1',
    '100.64.0.1',
    '172.16.0.1',
    '192.168.1.1',
    '198.51.100.10',
    '203.0.113.10',
    '::1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::ffff:127.0.0.1'
  ])('classifies non-public IP address %s as blocked', (address) => {
    expect(isPublicIpAddress(address)).toBe(false)
  })

  it.each(['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111'])(
    'classifies public IP address %s as allowed',
    (address) => {
      expect(isPublicIpAddress(address)).toBe(true)
    }
  )

  it('requires every DNS answer to be public immediately before use', async () => {
    const resolver = {
      resolve4: vi.fn().mockResolvedValue(['1.1.1.1', '10.0.0.8']),
      resolve6: vi.fn().mockResolvedValue([])
    }

    await expect(assertPublicSiteOrigin('https://dealer.example.com/offers', resolver))
      .rejects.toThrowError('Public HTTP(S) origin required')
  })

  it('returns the canonical origin for an IPv4-only public host', async () => {
    const resolver = {
      resolve4: vi.fn().mockResolvedValue(['1.1.1.1']),
      resolve6: vi.fn().mockResolvedValue([])
    }

    await expect(assertPublicSiteOrigin('https://Dealer.Example.com/offers', resolver))
      .resolves.toBe('https://dealer.example.com')
  })

  it('supports the resolve4 and resolve6 DNS APIs available in Cloudflare Workers', async () => {
    const resolver = {
      resolve4: vi.fn().mockResolvedValue(['1.1.1.1']),
      resolve6: vi.fn().mockResolvedValue(['2606:4700:4700::1111'])
    }

    await expect(assertPublicSiteOrigin(
      'https://Dealer.Example.com/offers',
      resolver
    )).resolves.toBe('https://dealer.example.com')
  })

  it('fails closed when DNS returns no addresses', async () => {
    const resolver = {
      resolve4: vi.fn().mockResolvedValue([]),
      resolve6: vi.fn().mockResolvedValue([])
    }

    await expect(assertPublicSiteOrigin('https://dealer.example.com', resolver))
      .rejects.toThrowError('Public HTTP(S) origin required')
  })
})
