// Separate architecture qualification; never substitute these into ARM64 proofs.
export const BASE = 'debian:bookworm-slim@sha256:7ff6ba31527b9e336162fa061746c366c4b2032f4d2cff2078bea43f78efe3f8'
export const RELEASES = Object.freeze({
  photocraft: Object.freeze({
    version: '0.16.0', extension: 'pcraft', bytes: 87847296,
    archiveSha256: '7c17f3633ebf7dabf27628e2d2637d918c7c2a5b163b8b90347a78acddf63608',
    executableSha256: 'bc5ce108f01aed2965f3c067c4828d7bcaa33b83cd523e7e466f0e43bb47c21d'
  }),
  vectorcraft: Object.freeze({
    version: '0.17.0', extension: 'vectorcraft', bytes: 129314923,
    archiveSha256: '66c289d0bd354b71e4cd787193ea0481e3a1cd239f2a18068110ea36852fc026',
    executableSha256: 'b0c02b7f82617cad91fef89c455694b4fbf2ad349ab576714e8a38e15b158862'
  })
})
