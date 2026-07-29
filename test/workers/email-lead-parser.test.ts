import { describe, expect, it } from 'vitest'

import { parseAdfXml, parseEmailLead, sha256Hex } from '../../shared/leads/email/parser'
import type { EmailEndpointPolicy } from '../../shared/leads/email/contracts'
import type { NormalizedInboundEmail } from '../../shared/leads/email/types'

const policy: EmailEndpointPolicy = { schemaVersion: 1, parserMode: 'auto', aiExtractionMode: 'disabled', expectedProvider: 'carsales', allowedSenderDomains: [], maxRawBytes: 2 * 1024 * 1024, maxAdfAttachmentBytes: 256 * 1024 }
const base: NormalizedInboundEmail = {
  transport: 'cloudflare_email_routing', envelopeRecipient: 'lead_token@example.test', envelopeSender: 'relay@carsales.example', headerFrom: 'Carsales <relay@carsales.example>',
  subject: 'A new enquiry', text: 'Name: Alex Example\nEmail: alex@example.test\nPhone: +61 400 123 456\nComments: Please call after 5pm\nStock Number: STK-7',
  html: null, messageId: '<message-42@example.test>', attachments: [], receivedAt: '2026-07-29T00:00:00.000Z', rawSize: 300
}

describe('deterministic email lead parser', () => {
  it('gives ADF priority and rejects XML DTD/entity declarations', () => {
    const adf = `<adf><prospect><id sequence="1">provider-42</id><requestdate>2026-07-29T00:00:00Z</requestdate><customer><contact><name part="first">Alex</name><name part="last">Example</name><email>alex@example.test</email><phone>+61400123456</phone></contact><comments>ADF comment</comments></customer><vehicle><year>2024</year><make>Example</make><model>Roadster</model><stocknumber>STK-7</stocknumber></vehicle><provider><name>Carsales</name></provider></prospect></adf>`
    const extracted = parseAdfXml(adf, 'adf')
    expect(extracted?.fields.full_name?.value).toBe('Alex Example')
    expect(extracted?.vehicle?.stock_number?.value).toBe('STK-7')
    expect(extracted?.fields.request_date?.value).toContain('2026-07-29')
    expect(extracted?.providerId).toBe('provider-42')
    expect(() => parseAdfXml('<!DOCTYPE x [<!ENTITY boom "x">]><adf>&boom;</adf>', 'adf')).toThrow(/DTD|entity/i)
  })

  it('extracts generic labelled and phone-only leads, strips reply/signature text, and never treats relay sender as customer email', () => {
    const extraction = parseEmailLead({ ...base, text: `${base.text}\n\nOn yesterday, Support wrote:\nold message\n-- \nSignature` }, policy)
    expect(extraction?.provider).toBe('carsales')
    expect(extraction?.fields.email?.value).toBe('alex@example.test')
    expect(extraction?.fields.phone?.value).toBe('+61 400 123 456')
    expect(extraction?.message?.value).toBe('Please call after 5pm')
    expect(extraction?.externalIdHash).toMatch(/^[a-f0-9]{64}$/)
    expect(parseEmailLead({ ...base, text: 'Phone: +61 400 123 456', envelopeSender: 'relay@carsales.example', headerFrom: 'relay@carsales.example' }, policy)?.fields.email).toBeUndefined()
  })

  it('uses provider ID, then message ID, then a stable fingerprint before hashing identity', () => {
    const provider = parseEmailLead({ ...base, text: `${base.text}\nLead ID: provider-42` }, policy)
    const message = parseEmailLead({ ...base, text: base.text }, policy)
    const fingerprint = parseEmailLead({ ...base, messageId: null, text: base.text }, policy)
    expect(provider?.externalIdHash).not.toBe(message?.externalIdHash)
    expect(message?.externalIdHash).not.toBe(fingerprint?.externalIdHash)
    expect(parseEmailLead({ ...base, messageId: null, text: base.text }, policy)?.externalIdHash).toBe(fingerprint?.externalIdHash)
  })

  it.each([
    ['carsales', 'Carsales'], ['autotrader', 'AutoTrader'], ['carsguide', 'CarsGuide'], ['drive', 'Drive'], ['gumtree', 'Gumtree'],
    ['meta', 'New Facebook Lead'], ['instagram', 'New Instagram Lead'], ['tiktok', 'New TikTok Lead'], ['google', 'New Google Ads Lead']
  ])('classifies %s from deterministic body evidence', (expected, marker) => {
    expect(parseEmailLead({ ...base, text: `${marker}\nName: Alex Example\nPhone: +61 400 123 456` }, { ...policy, expectedProvider: null })?.provider).toBe(expected)
  })

  it('uses a known SHA-256 vector before returning an externally safe identity hash', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('has no outer-layer imports', async () => {
    const source = await import('node:fs/promises').then(fs => fs.readFile('shared/leads/email/parser.ts', 'utf8'))
    const imports = source.split('\n').filter(line => line.startsWith('import ')).join('\n')
    expect(imports).not.toMatch(/server\/|nitro|cloudflare|fetch\(|database|persistence|groq|ai binding/i)
  })
})
