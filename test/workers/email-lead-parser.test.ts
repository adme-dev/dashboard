import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

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

  it('accepts valid namespaced/uppercase ADF and numeric entities while rejecting malformed XML', () => {
    const namespaced = `<ADF:ADF xmlns:ADF="urn:adf"><ADF:PROSPECT><ADF:ID>provider-42</ADF:ID><ADF:CUSTOMER><ADF:CONTACT><ADF:EMAIL>alex@example.test</ADF:EMAIL><ADF:PHONE>&#x2b;61400123456</ADF:PHONE></ADF:CONTACT></ADF:CUSTOMER></ADF:PROSPECT></ADF:ADF>`
    expect(parseAdfXml(namespaced, 'adf')?.fields.phone?.value).toBe('+61400123456')
    expect(parseAdfXml(readFileSync('test/fixtures/email-leads/carsales-adf-body.xml', 'utf8'), 'adf')?.provider).toBe('carsales')
    expect(() => parseAdfXml('<adf><prospect></adf>', 'adf')).toThrow(/Malformed XML/i)
    expect(() => parseAdfXml(readFileSync('test/fixtures/email-leads/entity-expansion.xml', 'utf8'), 'adf')).toThrow(/DTD|entity/i)
  })

  it('handles repeated ADF collection nodes deterministically', () => {
    const repeated = '<adf><prospect><customer><contact><email>first@example.test</email><phone>+61400123456</phone></contact></customer></prospect><prospect><customer><contact><email>second@example.test</email><phone>+61400987654</phone></contact></customer></prospect></adf>'
    expect(parseAdfXml(repeated, 'adf')?.fields.email?.value).toBe('first@example.test')
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
    expect(provider?.externalIdHash).toBe('dcb3450e3d753d1a0f98277376b9343c271610515ece8298d421e42b95a49371')
    expect(provider?.legacyExternalIdHash).toBe('9bfd2694f76bf7e7eac89ebf8fbd001adfc2f586c1a2ef8af8d78e35fb6a1f7a')
    expect(message?.externalIdHash).toBe('2d7f8a29eac29a0635b8f7c6707ea8e1bbe842197e9a49732e464a64cb8ae21a')
    expect(message?.legacyExternalIdHash).toBe('6f07f2f2a8ab165cff4acd0ff13d7ef3c897ef1b54018c45b2705154a07bd103')
    expect(provider?.externalIdHash).not.toBe(message?.externalIdHash)
    expect(message?.externalIdHash).not.toBe(fingerprint?.externalIdHash)
    expect(parseEmailLead({ ...base, messageId: null, text: base.text }, policy)?.externalIdHash).toBe(fingerprint?.externalIdHash)
  })

  it('domain-separates equal provider IDs across providers and identity kinds', () => {
    const carsales = parseEmailLead({
      ...base,
      text: `${base.text}\nLead ID: same@example.test`
    }, policy)
    const meta = parseEmailLead({
      ...base,
      envelopeSender: 'lead@meta.example',
      headerFrom: 'Meta <lead@meta.example>',
      subject: 'New Facebook Lead',
      text: 'New Facebook Lead\nName: Alex Example\nPhone: +61 400 123 456\nLead ID: same@example.test'
    }, { ...policy, expectedProvider: 'meta' })
    const message = parseEmailLead({
      ...base,
      text: base.text,
      messageId: '<same@example.test>'
    }, policy)

    expect(carsales?.externalIdHash).toBe('eacbd3632efb349e8eb40aff114a9dcf9c4c638fdd49720f5a0b9079faddf4e6')
    expect(message?.externalIdHash).toBe('905de3ff57d678043eb8032a183b47646828fc85329dd282af35be99cabe397b')
    expect(message?.externalIdHash).not.toBe(carsales?.externalIdHash)
    expect(meta?.externalIdHash).not.toBe(carsales?.externalIdHash)
  })

  it('canonicalizes a syntactically equivalent Message-ID and includes vehicle fields in fingerprint identity', () => {
    const canonical = parseEmailLead({ ...base, text: base.text, messageId: '<message-42@EXAMPLE.TEST>' }, policy)
    const spaced = parseEmailLead({ ...base, text: base.text, messageId: '< message-42@example.test >' }, policy)
    const unbracketed = parseEmailLead({ ...base, text: base.text, messageId: 'message-42@example.test' }, policy)
    expect(canonical?.externalIdHash).toBe(spaced?.externalIdHash)
    expect(canonical?.externalIdHash).toBe(unbracketed?.externalIdHash)
    const fingerprint = parseEmailLead({ ...base, text: base.text, messageId: null }, policy)
    for (const malformed of ['message-42@example.test other@example.test', '<message-42@example.test><other@example.test>', '<message-42@example.test', 'message-42@@example.test', '.bad@example.test', 'bad..id@example.test', 'bad.@example.test']) {
      expect(parseEmailLead({ ...base, text: base.text, messageId: malformed }, policy)?.externalIdHash).toBe(fingerprint?.externalIdHash)
    }
    const firstVehicle = parseEmailLead({ ...base, messageId: null, text: `${base.text}\nMake: Example` }, policy)
    const secondVehicle = parseEmailLead({ ...base, messageId: null, text: `${base.text}\nMake: Different` }, policy)
    expect(firstVehicle?.externalIdHash).not.toBe(secondVehicle?.externalIdHash)
  })

  it('uses a matching direct sender address only for a direct-customer email and removes signature text', () => {
    const direct = parseEmailLead({ ...base, envelopeSender: 'alex@example.test', headerFrom: 'Alex Example <alex@example.test>', text: `${readFileSync('test/fixtures/email-leads/direct-customer.txt', 'utf8')}\nKind regards,\nAlex Example` }, { ...policy, expectedProvider: null })
    expect(direct?.provider).toBe('generic')
    expect(direct?.fields.email?.value).toBe('alex@example.test')
    expect(direct?.fields.email?.provenance).toBe('header')
    expect(direct?.fields.full_name?.value).toBe('Alex Example')
    expect(direct?.message?.value).not.toMatch(/kind regards|signature/i)
    const relay = parseEmailLead({ ...base, envelopeSender: 'relay@carsales.example', headerFrom: 'Alex Example <alex@example.test>', text: readFileSync('test/fixtures/email-leads/relay-without-customer-contact.txt', 'utf8') }, { ...policy, expectedProvider: null })
    expect(relay?.fields.email).toBeUndefined()
  })

  it('requires human direct-customer evidence and never promotes relay or role mailboxes', () => {
    const direct = parseEmailLead({
      ...base,
      envelopeSender: 'alex@example.test',
      headerFrom: 'Alex Example <alex@example.test>',
      text: 'Hello, I am Alex Example and I would like to inspect the vehicle.'
    }, { ...policy, expectedProvider: null })
    expect(direct?.fields.email).toMatchObject({ value: 'alex@example.test', provenance: 'header' })
    expect(direct?.fields.full_name?.value).toBe('Alex Example')

    const automatedRelay = parseEmailLead({
      ...base,
      envelopeSender: 'notifications@relay.example',
      headerFrom: 'Notifications <notifications@relay.example>',
      text: 'I am Alex Example and I would like to inspect the vehicle.'
    }, { ...policy, expectedProvider: null })
    expect(automatedRelay?.fields.email).toBeUndefined()

    const roleMailbox = parseEmailLead({
      ...base,
      envelopeSender: 'sales@example.test',
      headerFrom: 'Sales <sales@example.test>',
      text: 'I am Alex Example and I would like to inspect the vehicle.'
    }, { ...policy, expectedProvider: null })
    expect(roleMailbox?.fields.email).toBeUndefined()

    const labelledRelay = parseEmailLead({
      ...base,
      envelopeSender: 'alex@example.test',
      headerFrom: 'Alex Example <alex@example.test>',
      text: 'Name: Alex Example\nPhone: +61 400 123 456\nI am Alex Example and I would like to inspect the vehicle.'
    }, { ...policy, expectedProvider: null })
    expect(labelledRelay?.fields.email).toBeUndefined()

    const nonCustomerInstruction = parseEmailLead({
      ...base,
      envelopeSender: 'updates@example.test',
      headerFrom: 'Updates <updates@example.test>',
      text: 'Please contact the customer about this enquiry.'
    }, { ...policy, expectedProvider: null })
    expect(nonCustomerInstruction?.fields.email).toBeUndefined()
  })

  it('requires a bounded first-person identity and a concrete enquiry or contact action for direct customers', () => {
    const directInput = {
      ...base,
      envelopeSender: 'alex@example.test',
      headerFrom: 'Alex Example <alex@example.test>'
    }
    const direct = parseEmailLead({
      ...directInput,
      text: 'Hello, I am Alex Example. I would like to inspect the vehicle.'
    }, { ...policy, expectedProvider: null })
    expect(direct?.fields.email).toMatchObject({ value: 'alex@example.test', provenance: 'header' })

    for (const text of [
      'I am Alex Example. I can confirm this is your daily report.',
      'I am Alex Example. I want an update.',
      'I am Alex Example. I want to inspect the daily report.',
      'I am Alex Example. I need confirmation.',
      'I am Alex Example. I need to arrange the daily report.',
      'I am Alex Example. I am interested in the daily report.',
      'I am Alex Example. Could you confirm the report?'
    ]) {
      expect(parseEmailLead({ ...directInput, text }, { ...policy, expectedProvider: null })?.fields.email).toBeUndefined()
    }
  })

  it.each([
    ['carsales', 'Carsales', 'carsales-adf-body.xml'], ['autotrader', 'AutoTrader', 'autotrader.txt'], ['carsguide', 'CarsGuide', 'carsguide.txt'], ['drive', 'Drive', 'drive.txt'], ['gumtree', 'Gumtree', 'gumtree.txt'],
    ['meta', 'New Facebook Lead', 'meta.txt'], ['instagram', 'New Instagram Lead', 'instagram.txt'], ['tiktok', 'New TikTok Lead', 'tiktok.txt'], ['google', 'New Google Ads Lead', 'google.txt']
  ])('classifies %s from deterministic body evidence and fixture %s', (expected, marker, fixture) => {
    const text = fixture.endsWith('.xml') ? `${marker}\nName: Alex Example\nPhone: +61 400 123 456` : readFileSync(`test/fixtures/email-leads/${fixture}`, 'utf8')
    expect(parseEmailLead({
      ...base,
      envelopeSender: 'relay@example.test',
      headerFrom: 'Relay <relay@example.test>',
      text
    }, { ...policy, expectedProvider: null })?.provider).toBe(expected)
  })

  it('uses generic, HTML, forwarded, phone-only, and ADF attachment fixtures', () => {
    expect(parseEmailLead({ ...base, envelopeSender: 'relay@generic.example', headerFrom: 'relay@generic.example', text: readFileSync('test/fixtures/email-leads/generic-labelled.txt', 'utf8') }, policy)?.provider).toBe('generic')
    expect(parseEmailLead({ ...base, text: null, html: readFileSync('test/fixtures/email-leads/html-only.html', 'utf8') }, { ...policy, expectedProvider: null })?.fields.phone?.value).toContain('400')
    expect(parseEmailLead({ ...base, text: readFileSync('test/fixtures/email-leads/forwarded-replied.txt', 'utf8') }, { ...policy, expectedProvider: null })?.message?.value).toBe('Please call.')
    expect(parseEmailLead({ ...base, text: readFileSync('test/fixtures/email-leads/phone-only.txt', 'utf8') }, { ...policy, expectedProvider: null })?.fields.phone).toBeDefined()
    expect(parseEmailLead({ ...base, text: 'fallback', attachments: [{ filename: 'lead.adf', contentType: 'application/xml', content: new TextEncoder().encode(readFileSync('test/fixtures/email-leads/carsales-adf-attachment.xml', 'utf8')) }] }, policy)?.parser).toBe('adf')
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
