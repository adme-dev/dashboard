import { describe, expect, it } from 'vitest'
import fixture from '../fixtures/collection-contract-golden.json'
import { CollectionDefinitionSchema, parseCollectionValues } from '~~/shared/pageStudio/collectionDefinition'
import { CollectionRecordSchema, collectionDigest } from '~~/shared/pageStudio/collectionApi'

describe('Studio-generated collection golden contract', () => {
  it('matches schema/record payloads and canonical digests', async () => {
    expect(CollectionDefinitionSchema.parse(fixture.definition)).toEqual(fixture.definition)
    expect(CollectionRecordSchema.parse(fixture.record)).toEqual(fixture.record)
    expect(await collectionDigest(fixture.definition)).toBe(fixture.definitionDigest)
    expect(await collectionDigest(fixture.record)).toBe(fixture.recordDigest)
  })
  it.each(fixture.cases)('matches Studio field validation: $input', (entry) => {
    if (entry.success) expect(parseCollectionValues(fixture.definition, entry.input)).toEqual(entry.output)
    else expect(() => parseCollectionValues(fixture.definition, entry.input)).toThrow()
  })
})
