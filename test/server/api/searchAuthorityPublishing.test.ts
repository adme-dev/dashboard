import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  activateSearchAuthorityPublication,
  rollbackSearchAuthorityPublication
} from '~~/server/utils/searchAuthority/publicationStore'

class MemoryBucket {
  objects = new Map<string, { body: string, etag: string, customMetadata?: Record<string, string> }>()
  puts: string[] = []

  async put(key: string, body: string, options?: { customMetadata?: Record<string, string> }) {
    this.puts.push(key)
    const etag = `etag-${this.puts.length}`
    this.objects.set(key, { body, etag, customMetadata: options?.customMetadata })
    return { key, etag }
  }

  async get(key: string) {
    const object = this.objects.get(key)
    return object ? { text: async () => object.body } : null
  }

  async head(key: string) {
    const object = this.objects.get(key)
    return object ? { key, etag: object.etag, customMetadata: object.customMetadata } : null
  }

  async delete(key: string) {
    this.objects.delete(key)
  }
}

const rendered = {
  html: '<!doctype html><html><body>Guide</body></html>',
  contentType: 'text/html; charset=utf-8' as const,
  etag: 'a'.repeat(64),
  canonicalUrl: 'https://learn.knoxgwmhaval.com.au/guides/cannon-alpha-towing-guide'
}

describe('Search Authority publication activation', () => {
  it('writes immutable objects before atomically changing the current host manifest', async () => {
    const bucket = new MemoryBucket()
    const result = await activateSearchAuthorityPublication(bucket, {
      hostname: 'learn.knoxgwmhaval.com.au',
      assetId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      publicationId: '33333333-3333-4333-8333-333333333333',
      slug: 'cannon-alpha-towing-guide',
      rendered,
      activatedAt: '2026-08-03T02:00:00.000Z',
      publicId: '44444444-4444-4444-8444-444444444444',
      mode: 'subdomain',
      brandName: 'Knox GWM Haval',
      dealershipUrl: 'https://www.knoxgwmhaval.com.au/',
      guide: { slug: 'cannon-alpha-towing-guide', title: 'Cannon Alpha towing guide', excerpt: 'Towing guidance.', publishedAt: '2026-08-03T02:00:00.000Z' }
    })

    expect(bucket.puts.at(-1)).toBe('hosts/learn.knoxgwmhaval.com.au/manifests/current.json')
    expect(bucket.puts).toContain(`hosts/learn.knoxgwmhaval.com.au/manifests/${result.manifestVersion}.json`)
    expect(bucket.puts).toContain('hosts/learn.knoxgwmhaval.com.au/versions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/index.html')
    expect(bucket.puts).toContain('hosts/learn.knoxgwmhaval.com.au/versions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/hub.html')
    expect(bucket.puts).toContain('aliases/44444444-4444-4444-8444-444444444444.json')
    expect(Object.keys(result.manifest.routes)).toEqual(expect.arrayContaining(['/guides', '/guides/sitemap.xml', '/sitemap.xml', '/robots.txt', '/guides/cannon-alpha-towing-guide']))
    expect(result.manifest.redirects).toEqual({ '/': '/guides' })
    expect(result.manifest.guides?.map(guide => guide.slug)).toEqual(['cannon-alpha-towing-guide'])
    expect(result.previousManifestVersion).toBeNull()
  })

  it('rolls the pointer back to a verified immutable manifest without rewriting content', async () => {
    const bucket = new MemoryBucket()
    const first = await activateSearchAuthorityPublication(bucket, {
      hostname: 'learn.knoxgwmhaval.com.au',
      assetId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      publicationId: '33333333-3333-4333-8333-333333333333',
      slug: 'cannon-alpha-towing-guide',
      rendered,
      activatedAt: '2026-08-03T02:00:00.000Z',
      publicId: '44444444-4444-4444-8444-444444444444',
      mode: 'subdomain',
      brandName: 'Knox GWM Haval',
      dealershipUrl: 'https://www.knoxgwmhaval.com.au/',
      guide: { slug: 'cannon-alpha-towing-guide', title: 'Cannon Alpha towing guide', excerpt: 'Towing guidance.', publishedAt: '2026-08-03T02:00:00.000Z' }
    })
    const contentPuts = bucket.puts.filter(key => key.includes('/versions/')).length

    await rollbackSearchAuthorityPublication(bucket, {
      hostname: 'learn.knoxgwmhaval.com.au',
      targetManifestVersion: first.manifestVersion,
      rolledBackAt: '2026-08-03T03:00:00.000Z'
    })

    expect(bucket.puts.filter(key => key.includes('/versions/'))).toHaveLength(contentPuts)
    const current = JSON.parse((await bucket.get('hosts/learn.knoxgwmhaval.com.au/manifests/current.json'))!.text
      ? await (await bucket.get('hosts/learn.knoxgwmhaval.com.au/manifests/current.json'))!.text()
      : '{}')
    expect(current.manifestVersion).toBe(first.manifestVersion)
  })

  it('rejects an existing immutable object when its stored hash cannot be verified', async () => {
    const bucket = new MemoryBucket()
    bucket.objects.set(
      'hosts/learn.knoxgwmhaval.com.au/versions/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/index.html',
      { body: 'unverified', etag: 'legacy-etag' }
    )

    await expect(activateSearchAuthorityPublication(bucket, {
      hostname: 'learn.knoxgwmhaval.com.au',
      assetId: '11111111-1111-4111-8111-111111111111',
      versionId: '22222222-2222-4222-8222-222222222222',
      publicationId: '33333333-3333-4333-8333-333333333333',
      slug: 'cannon-alpha-towing-guide',
      rendered,
      activatedAt: '2026-08-03T02:00:00.000Z',
      publicId: '44444444-4444-4444-8444-444444444444',
      mode: 'subdomain',
      brandName: 'Knox GWM Haval',
      dealershipUrl: 'https://www.knoxgwmhaval.com.au/',
      guide: { slug: 'cannon-alpha-towing-guide', title: 'Cannon Alpha towing guide', excerpt: 'Towing guidance.', publishedAt: '2026-08-03T02:00:00.000Z' }
    })).rejects.toThrow('could not be verified')
  })
})

describe('Search Authority publishing routes', () => {
  const route = (name: string) => readFileSync(`server/api/agency/search-authority/content/[id]/${name}`, 'utf8')

  it('requires tenant access and an approved immutable version for publishing', () => {
    const publish = route('publish.post.ts')
    expect(publish).toContain('requireAgencySearchAuthorityAccess')
    expect(publish).toMatch(/await requireAgencySearchAuthorityAccess[\s\S]+await queryOne/)
    expect(publish).toMatch(/status[^\n]+approved/i)
    expect(publish).toContain('current_version_id')
    expect(publish).toContain('transaction')
  })

  it('records audited rollback and never mutates a version object', () => {
    const rollback = route('rollback.post.ts')
    expect(rollback).toMatch(/await requireAgencySearchAuthorityAccess[\s\S]+await queryOne/)
    expect(rollback).toContain('rollbackSearchAuthorityPublication')
    expect(rollback).toContain('search_authority_content_audit_events')
    expect(rollback).toContain('INSERT INTO search_authority_publications')
    expect(rollback).not.toMatch(/UPDATE search_authority_publications SET[\s\S]{0,180}published_at/i)
    expect(rollback).not.toMatch(/UPDATE search_authority_content_versions/i)
  })
})
