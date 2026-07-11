import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const upload = readFileSync(new URL('../../server/api/agency/hr/contracts/index.post.ts', import.meta.url), 'utf8')
const extract = readFileSync(new URL('../../server/api/agency/hr/contracts/[id]/extract.put.ts', import.meta.url), 'utf8')
const download = readFileSync(new URL('../../server/api/agency/hr/contracts/[id]/download.get.ts', import.meta.url), 'utf8')
const privateStorage = readFileSync(new URL('../../server/utils/hr/contractStorage.ts', import.meta.url), 'utf8')

describe('HR contract vault API security', () => {
  it('requires HR-owner access for upload, extraction and download', () => {
    for (const route of [upload, extract, download]) {
      expect(route).toContain('requireHrAdmin(event)')
      expect(route).toContain('recordHrAuditEvent')
    }
  })

  it('validates real file signatures, checksums uploads and never publishes originals', () => {
    expect(upload).toContain('hasExpectedSignature')
    expect(upload).toContain("createHash('sha256')")
    expect(upload).toContain("classification: 'restricted-hr-contract'")
    expect(download).toContain("'Cache-Control', 'private, no-store'")
  })

  it('uses a dedicated fail-closed private store and authenticated proxy download', () => {
    expect(upload).toContain('uploadHrContractFile')
    expect(upload).not.toContain("from '~~/server/utils/storage'")
    expect(download).toContain('downloadHrContractFileBuffer')
    expect(download).not.toContain('sendRedirect')
    expect(privateStorage).toContain("getCachedObjectBinding<PrivateR2Bucket>('HR_CONTRACTS_BUCKET')")
    expect(privateStorage).not.toContain('R2_PUBLIC_URL')
    expect(privateStorage).not.toContain('/api/_uploads')
    expect(privateStorage).toContain("process.env.NODE_ENV !== 'production'")
  })
})
