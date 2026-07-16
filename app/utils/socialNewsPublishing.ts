export interface NewsPublishingAccount {
  id: string
  platform: string
}

export function buildNewsPublishTargets(
  accounts: NewsPublishingAccount[],
  selectedAccountIds: string[],
  selectedPlatforms: string[],
) {
  const accountIds = new Set(selectedAccountIds)
  const platforms = new Set(selectedPlatforms)
  return accounts
    .filter(account => accountIds.has(account.id) && platforms.has(account.platform))
    .map(account => ({ platform: account.platform, accountId: account.id }))
}
