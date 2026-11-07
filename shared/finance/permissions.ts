/** UI admission is conservative; the server independently rechecks current role grants. */
export function hasExplicitFinancePermission(user: { role?: unknown, permissionGroups?: readonly string[] } | null | undefined): boolean {
  return user?.permissionGroups?.includes('FINANCE') === true
}

export function hasExplicitInvoicePermission(user: { role?: unknown, permissionGroups?: readonly string[] } | null | undefined): boolean {
  return hasExplicitFinancePermission(user) || user?.permissionGroups?.includes('INVOICE_OWN_CLIENTS') === true
}
