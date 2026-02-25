/**
 * Tests for Phase 8: Chat Productivity features
 * - Link preview OG metadata extraction
 * - Message formatting helpers
 * - URL extraction from messages
 */

import { describe, it, expect } from 'vitest'

// ── Link Preview: OG Meta Extraction ──
// These test the parsing logic used in the link-preview API

function extractMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]*(?:property|name)=["']${escapeRegExp(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']${escapeRegExp(name)}["']`, 'i'),
  ]
  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match?.[1]) return decodeEntities(match[1].trim())
  }
  return null
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

// URL extraction regex (same as ChatMessageList.vue)
const urlRegex = /https?:\/\/[^\s<>)"']+/

function extractFirstUrl(content: string): string | null {
  if (content.startsWith('```')) return null
  const match = content.match(urlRegex)
  return match ? match[0] : null
}

// ── Formatting helpers (same logic as ChatMentionInput.vue) ──

function wrapText(text: string, start: number, end: number, prefix: string, suffix?: string): string {
  const suf = suffix ?? prefix
  const selected = text.substring(start, end)
  if (selected) {
    return text.substring(0, start) + prefix + selected + suf + text.substring(end)
  }
  const placeholder = prefix === '```\n' ? 'code' : 'text'
  return text.substring(0, start) + prefix + placeholder + suf + text.substring(end)
}

describe('Link Preview: OG Meta Extraction', () => {
  it('should extract og:title from standard meta tags', () => {
    const html = '<html><head><meta property="og:title" content="My Page Title" /></head></html>'
    expect(extractMeta(html, 'og:title')).toBe('My Page Title')
  })

  it('should extract og:description', () => {
    const html = '<meta property="og:description" content="A description of the page">'
    expect(extractMeta(html, 'og:description')).toBe('A description of the page')
  })

  it('should extract og:image', () => {
    const html = '<meta property="og:image" content="https://example.com/image.jpg">'
    expect(extractMeta(html, 'og:image')).toBe('https://example.com/image.jpg')
  })

  it('should extract twitter:title as fallback', () => {
    const html = '<meta name="twitter:title" content="Twitter Title">'
    expect(extractMeta(html, 'twitter:title')).toBe('Twitter Title')
  })

  it('should handle content-first meta tags', () => {
    const html = '<meta content="Reversed Order" property="og:title">'
    expect(extractMeta(html, 'og:title')).toBe('Reversed Order')
  })

  it('should decode HTML entities', () => {
    const html = '<meta property="og:title" content="Tom &amp; Jerry&#39;s &quot;Show&quot;">'
    expect(extractMeta(html, 'og:title')).toBe('Tom & Jerry\'s "Show"')
  })

  it('should return null for missing tags', () => {
    const html = '<html><head><title>Just a title</title></head></html>'
    expect(extractMeta(html, 'og:title')).toBeNull()
  })

  it('should extract name-based meta (description)', () => {
    const html = '<meta name="description" content="A regular meta description">'
    expect(extractMeta(html, 'description')).toBe('A regular meta description')
  })

  it('should handle og:site_name', () => {
    const html = '<meta property="og:site_name" content="GitHub">'
    expect(extractMeta(html, 'og:site_name')).toBe('GitHub')
  })
})

describe('URL Resolution', () => {
  it('should resolve relative URLs', () => {
    expect(resolveUrl('/images/logo.png', 'https://example.com/page')).toBe('https://example.com/images/logo.png')
  })

  it('should keep absolute URLs', () => {
    expect(resolveUrl('https://cdn.example.com/img.jpg', 'https://example.com')).toBe('https://cdn.example.com/img.jpg')
  })

  it('should handle protocol-relative URLs', () => {
    expect(resolveUrl('//cdn.example.com/img.jpg', 'https://example.com')).toBe('https://cdn.example.com/img.jpg')
  })

  it('should return original on invalid base', () => {
    expect(resolveUrl('not-a-url', 'also-not-a-url')).toBe('not-a-url')
  })
})

describe('URL Extraction from Messages', () => {
  it('should extract http URLs', () => {
    expect(extractFirstUrl('Check out http://example.com')).toBe('http://example.com')
  })

  it('should extract https URLs', () => {
    expect(extractFirstUrl('Visit https://example.com/page?q=test')).toBe('https://example.com/page?q=test')
  })

  it('should return first URL when multiple present', () => {
    expect(extractFirstUrl('See https://first.com and https://second.com')).toBe('https://first.com')
  })

  it('should return null for messages without URLs', () => {
    expect(extractFirstUrl('Just a regular message')).toBeNull()
  })

  it('should skip code blocks', () => {
    expect(extractFirstUrl('```\nhttps://example.com\n```')).toBeNull()
  })

  it('should handle URLs at the start of message', () => {
    expect(extractFirstUrl('https://example.com is a great site')).toBe('https://example.com')
  })

  it('should handle URLs with paths and fragments', () => {
    expect(extractFirstUrl('See https://docs.example.com/api/v2#section')).toBe('https://docs.example.com/api/v2#section')
  })
})

describe('Message Formatting: Text Wrapping', () => {
  it('should wrap selected text with bold markers', () => {
    const result = wrapText('hello world', 6, 11, '**')
    expect(result).toBe('hello **world**')
  })

  it('should wrap selected text with italic markers', () => {
    const result = wrapText('hello world', 6, 11, '*')
    expect(result).toBe('hello *world*')
  })

  it('should wrap selected text with strikethrough', () => {
    const result = wrapText('hello world', 6, 11, '~~')
    expect(result).toBe('hello ~~world~~')
  })

  it('should wrap selected text with inline code', () => {
    const result = wrapText('use myFunction here', 4, 14, '`')
    expect(result).toBe('use `myFunction` here')
  })

  it('should wrap selected text with code block', () => {
    const result = wrapText('some code here', 5, 9, '```\n', '\n```')
    expect(result).toBe('some ```\ncode\n``` here')
  })

  it('should insert placeholder when no selection', () => {
    const result = wrapText('hello ', 6, 6, '**')
    expect(result).toBe('hello **text**')
  })

  it('should insert code placeholder for code blocks', () => {
    const result = wrapText('', 0, 0, '```\n', '\n```')
    expect(result).toBe('```\ncode\n```')
  })

  it('should handle wrapping at the start of text', () => {
    const result = wrapText('hello', 0, 5, '**')
    expect(result).toBe('**hello**')
  })

  it('should handle empty text with bold', () => {
    const result = wrapText('', 0, 0, '**')
    expect(result).toBe('**text**')
  })
})

describe('Favicon Extraction', () => {
  it('should extract favicon from link tag', () => {
    const html = '<link rel="icon" href="/favicon.ico">'
    const match = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
    expect(match?.[1]).toBe('/favicon.ico')
  })

  it('should extract favicon from shortcut icon', () => {
    const html = '<link rel="shortcut icon" href="/assets/icon.png">'
    const match = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
    expect(match?.[1]).toBe('/assets/icon.png')
  })

  it('should extract favicon when href comes before rel', () => {
    const html = '<link href="/my-icon.svg" rel="icon">'
    const match = html.match(/<link[^>]*rel=["'](?:icon|shortcut icon)["'][^>]*href=["']([^"']+)["']/i)
      || html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:icon|shortcut icon)["']/i)
    expect(match?.[1]).toBe('/my-icon.svg')
  })
})
