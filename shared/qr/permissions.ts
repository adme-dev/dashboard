/** QR-only grants are independent of finance, advertising and account administration. */
export interface QrPermissionSubject {
  role: string
  permissionGroups?: readonly string[]
  isCustomReadOnly?: boolean
  qrCodeAccess?: boolean
}
const management = ['owner', 'admin', 'lead', 'project_manager']
const legacy = [...management, 'media_buyer', 'account_manager']

export function canAccessQrCodes(user: QrPermissionSubject | null | undefined): boolean {
  if (!user || user.isCustomReadOnly || ['viewer', 'guest'].includes(user.role)) return false
  return legacy.includes(user.role)
    || user.qrCodeAccess === true
    || user.permissionGroups?.includes('MEDIA_BUYING') === true
    || user.permissionGroups?.includes('QR_CODES') === true
}

/** An explicit QR_CODES grant covers the agency QR library only. Legacy media
 * access retains its existing client assignment restrictions. */
export function hasAgencyQrAccess(user: QrPermissionSubject): boolean {
  return canAccessQrCodes(user)
    && (management.includes(user.role) || user.permissionGroups?.includes('QR_CODES') === true)
}
