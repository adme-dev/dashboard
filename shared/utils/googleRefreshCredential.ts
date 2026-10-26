type BinaryToken = Uint8Array | ArrayBuffer

export const GOOGLE_CREDENTIAL_PROFILE_JOIN = `
  LEFT JOIN google_credential_profiles gcp
    ON gcp.id = sc.google_credential_profile_id
   AND gcp.status = 'active'
`

export interface ResolveCredentialDeps {
  decrypt: (ciphertext: BinaryToken, iv: BinaryToken) => Promise<string>
}

export interface GoogleRefreshCredentialRow {
  refresh_token: string | null
  google_credential_profile_id?: string | null
  profile_refresh_token_encrypted?: BinaryToken | null
  profile_refresh_token_iv?: BinaryToken | null
}

export async function resolveGoogleRefreshCredential(
  row: GoogleRefreshCredentialRow,
  deps: ResolveCredentialDeps
): Promise<string | null> {
  if (!row.google_credential_profile_id) return row.refresh_token
  if (!row.profile_refresh_token_encrypted && !row.profile_refresh_token_iv) return null
  if (!row.profile_refresh_token_encrypted || !row.profile_refresh_token_iv) {
    throw new Error('Google credential profile is incomplete')
  }
  return deps.decrypt(
    row.profile_refresh_token_encrypted,
    row.profile_refresh_token_iv
  )
}
