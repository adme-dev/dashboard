import { describe, expect, it, vi } from 'vitest'
import { findGoogleProfileAccount } from '~~/server/utils/googleCredentialProfiles'

describe('Google credential profile account discovery', () => {
  it('finds a newly-created child account under an existing manager profile', async () => {
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['5250473322'])
    const listClientAccounts = vi.fn().mockResolvedValue([
      {
        customerId: '3892176492',
        name: 'Knox LDV',
        currencyCode: 'AUD',
        descriptiveName: 'Knox LDV'
      }
    ])
    const getCustomerInfo = vi.fn()

    await expect(findGoogleProfileAccount({
      accessToken: 'access-token',
      developerToken: 'developer-token',
      targetCustomerId: '389-217-6492',
      profileMetadata: {
        managerCustomerIds: ['525-047-3322']
      }
    }, {
      listAccessibleCustomers,
      listClientAccounts,
      getCustomerInfo
    })).resolves.toEqual({
      customerId: '3892176492',
      name: 'Knox LDV',
      currencyCode: 'AUD',
      descriptiveName: 'Knox LDV',
      managerCustomerId: '5250473322'
    })
    expect(getCustomerInfo).not.toHaveBeenCalled()
  })

  it('discovers an exact direct account without trusting a partial ID match', async () => {
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['3892176492', '1389217649'])
    const listClientAccounts = vi.fn()
    const getCustomerInfo = vi.fn().mockResolvedValue({
      customerId: '3892176492',
      name: 'Knox LDV',
      currencyCode: 'AUD',
      descriptiveName: 'Knox LDV'
    })

    await expect(findGoogleProfileAccount({
      accessToken: 'access-token',
      developerToken: 'developer-token',
      targetCustomerId: '3892176492',
      profileMetadata: {}
    }, {
      listAccessibleCustomers,
      listClientAccounts,
      getCustomerInfo
    })).resolves.toEqual({
      customerId: '3892176492',
      name: 'Knox LDV',
      currencyCode: 'AUD',
      descriptiveName: 'Knox LDV',
      managerCustomerId: null
    })
    expect(listClientAccounts).not.toHaveBeenCalled()
    expect(getCustomerInfo).toHaveBeenCalledWith(
      '3892176492',
      'access-token',
      'developer-token'
    )
  })

  it('returns null when the exact account is not accessible', async () => {
    const listAccessibleCustomers = vi.fn().mockResolvedValue(['5250473322'])
    const listClientAccounts = vi.fn().mockResolvedValue([
      {
        customerId: '3892176493',
        name: 'Different account',
        currencyCode: 'AUD'
      }
    ])
    const getCustomerInfo = vi.fn()

    await expect(findGoogleProfileAccount({
      accessToken: 'access-token',
      developerToken: 'developer-token',
      targetCustomerId: '3892176492',
      profileMetadata: {
        managerCustomerIds: ['5250473322']
      }
    }, {
      listAccessibleCustomers,
      listClientAccounts,
      getCustomerInfo
    })).resolves.toBeNull()
  })
})
