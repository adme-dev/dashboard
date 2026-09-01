import { describe, expect, it } from 'vitest'
import {
  buildListingGroupProviderOperations,
  listingGroupCaseValue,
  listingGroupDimensionFromCaseValue,
  validateAndNormalizeListingGroupNodes,
  type ListingGroupDimension
} from '~~/server/utils/googleAds/listingGroups'

describe('Google Ads retail listing-group trees', () => {
  it.each([
    [{ kind: 'PRODUCT_BRAND', value: 'GAC' }, { productBrand: { value: 'GAC' } }],
    [{ kind: 'PRODUCT_CATEGORY', level: 'LEVEL2', categoryId: '123' }, { productCategory: { level: 'LEVEL2', categoryId: '123' } }],
    [{ kind: 'PRODUCT_CHANNEL', value: 'ONLINE' }, { productChannel: { channel: 'ONLINE' } }],
    [{ kind: 'PRODUCT_CONDITION', value: 'USED' }, { productCondition: { condition: 'USED' } }],
    [{ kind: 'PRODUCT_CUSTOM_ATTRIBUTE', index: 'INDEX2', value: 'SUV' }, { productCustomAttribute: { index: 'INDEX2', value: 'SUV' } }],
    [{ kind: 'PRODUCT_ITEM_ID', value: 'SKU-1' }, { productItemId: { value: 'SKU-1' } }],
    [{ kind: 'PRODUCT_TYPE', level: 'LEVEL3', value: 'Vehicles' }, { productType: { level: 'LEVEL3', value: 'Vehicles' } }],
    [{ kind: 'PRODUCT_BRAND', other: true }, { productBrand: {} }],
    [{ kind: 'PRODUCT_CATEGORY', level: 'LEVEL1', other: true }, { productCategory: { level: 'LEVEL1' } }],
    [{ kind: 'PRODUCT_CUSTOM_ATTRIBUTE', index: 'INDEX4', other: true }, { productCustomAttribute: { index: 'INDEX4' } }]
  ] as Array<[ListingGroupDimension, Record<string, unknown>]>)('round-trips %j', (dimension, provider) => {
    expect(listingGroupCaseValue(dimension)).toEqual(provider)
    expect(listingGroupDimensionFromCaseValue(provider)).toEqual(dimension)
  })

  it('requires homogeneous, unique and complete subdivision partitions', () => {
    const root = { key: 'root', type: 'SUBDIVISION' as const }
    expect(() => validateAndNormalizeListingGroupNodes([
      root,
      { key: 'brand', parentKey: 'root', type: 'UNIT_INCLUDED', dimension: { kind: 'PRODUCT_BRAND', value: 'GAC' } },
      { key: 'condition-other', parentKey: 'root', type: 'UNIT_EXCLUDED', dimension: { kind: 'PRODUCT_CONDITION', other: true } }
    ])).toThrow('same dimension')
    expect(() => validateAndNormalizeListingGroupNodes([
      root,
      { key: 'brand-1', parentKey: 'root', type: 'UNIT_INCLUDED', dimension: { kind: 'PRODUCT_BRAND', value: 'GAC' } },
      { key: 'brand-2', parentKey: 'root', type: 'UNIT_INCLUDED', dimension: { kind: 'PRODUCT_BRAND', value: 'GAC' } },
      { key: 'other', parentKey: 'root', type: 'UNIT_EXCLUDED', dimension: { kind: 'PRODUCT_BRAND', other: true } }
    ])).toThrow('duplicate dimension')
  })

  it('rejects a persisted semantic tree with missing parents or non-canonical ordering', () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    expect(() => buildListingGroupProviderOperations({
      customerId: '1234567890',
      assetGroupResourceName,
      existingFilters: [],
      desiredNodes: [{
        path: [{ kind: 'PRODUCT_BRAND', value: 'GAC' }],
        type: 'UNIT_INCLUDED'
      }]
    })).toThrow('missing parent')
    expect(() => buildListingGroupProviderOperations({
      customerId: '1234567890',
      assetGroupResourceName,
      existingFilters: [],
      desiredNodes: [
        { path: [{ kind: 'PRODUCT_BRAND', other: true }], type: 'UNIT_EXCLUDED' },
        { path: [], type: 'SUBDIVISION' },
        { path: [{ kind: 'PRODUCT_BRAND', value: 'GAC' }], type: 'UNIT_INCLUDED' }
      ]
    })).toThrow('canonical order')
  })

  it('removes descendants before ancestors and creates parents before children', () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    const root = 'customers/1234567890/assetGroupListingGroupFilters/7001~11'
    const parent = 'customers/1234567890/assetGroupListingGroupFilters/7001~12'
    const child = 'customers/1234567890/assetGroupListingGroupFilters/7001~13'
    const operations = buildListingGroupProviderOperations({
      customerId: '1234567890',
      assetGroupResourceName,
      existingFilters: [
        { resourceName: root, assetGroup: assetGroupResourceName, type: 'SUBDIVISION', listingSource: 'SHOPPING' },
        {
          resourceName: parent, assetGroup: assetGroupResourceName, parentListingGroupFilter: root,
          type: 'SUBDIVISION', listingSource: 'SHOPPING', caseValue: { productBrand: {} }
        },
        {
          resourceName: child, assetGroup: assetGroupResourceName, parentListingGroupFilter: parent,
          type: 'UNIT_INCLUDED', listingSource: 'SHOPPING', caseValue: { productCondition: { condition: 'NEW' } }
        }
      ],
      desiredNodes: [{ path: [], type: 'UNIT_INCLUDED' }]
    })
    expect(operations.slice(0, 3)).toEqual([
      { mutate: { assetGroupListingGroupFilterOperation: { remove: child } } },
      { mutate: { assetGroupListingGroupFilterOperation: { remove: parent } } },
      { mutate: { assetGroupListingGroupFilterOperation: { remove: root } } }
    ])
    expect(operations[3]).toMatchObject({
      mutate: { assetGroupListingGroupFilterOperation: { create: { type: 'UNIT_INCLUDED' } } }
    })
  })

  it('rejects malformed persisted provider resource names', () => {
    const assetGroupResourceName = 'customers/1234567890/assetGroups/7001'
    expect(() => buildListingGroupProviderOperations({
      customerId: '1234567890',
      assetGroupResourceName,
      existingFilters: [{
        resourceName: 'customers/1234567890/assetGroupListingGroupFilters/7001~11/unsafe',
        assetGroup: assetGroupResourceName,
        type: 'UNIT_INCLUDED',
        listingSource: 'SHOPPING'
      }],
      desiredNodes: [{ path: [], type: 'UNIT_INCLUDED' }]
    })).toThrow('selected asset group')
  })
})
