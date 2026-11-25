import { createHash } from 'node:crypto'

// Row counts measured against the original source previews. Exact archive and
// layout identities bind these receipts; edited or rewrapped layouts still hold.
const reviewed = [
  // Innisfail Mazda Black Friday: bundled-font, script-free source measurements
  // confirm one line followed by two lines in each of the four source layouts.
  { sha256: 'b0122d7b23fe41aca2d9bf2e3f6e588203d0f681e5e45e4061151e219fd06aca', designHash: 'zmr2y6k', rowLines: { 'element-134': [1, 2] } },
  { sha256: '33dbea67d3e7fde216df021220d29f219f599296ce4d57ae87b9cb3c88c780f4', designHash: 'yeommpw', rowLines: { 'element-134': [1, 2] } },
  { sha256: 'de1740230bc3d749e0825fcdb601145a25a96e0f89b6c527f6a1c8695e380a0d', designHash: 'o1kee0o', rowLines: { 'element-134': [1, 2] } },
  { sha256: 'e29425939a55b2c1541315ab15fcd3ac12ab002199c4db0d32a625efece8115c', designHash: 'zmr885k', rowLines: { 'element-134': [1, 2] } },
  // High (90%) export: independently measured with the same bundled face.
  { sha256: '1ce6cdc59350d83b5b4396bfb5b353e71593e533ec4e283cac4cf7116fa6eb47', designHash: 'zmr2y6k', rowLines: { 'element-134': [1, 2] } },
  { sha256: '77db16198f92a1a214446838facb7cca67e9625c58c27dfc7fffb6895be96a92', designHash: 'o1kee0o', rowLines: { 'element-134': [1, 2] } },
  { sha256: '0b0a98f978891de3a115e0843aea108f93611ed5e989a55050cb65058ee4fa86', designHash: 'yeommpw', rowLines: { 'element-134': [1, 2] } },
  { sha256: '39924a89770a4d4f03c283cc6b2e74a27dc1ea9a36bde95e3a70f88689d8a31c', designHash: 'zmr885k', rowLines: { 'element-134': [1, 2] } },
  {
    "sha256": "c2e05e14591bcd0939346d1ad448382c5d236cc20a1006cc190fd36130089067",
    "designHash": "g30qe75",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "588983b67cfc6d704c224dd0b7eb3c281eff4320c4326761aa536b6a9c024158",
    "designHash": "rmdpo8r",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "8bde5c7fe3fe5a50ebf5470ffbe3849a3da6b1f16b63c77242c9a66a0f201ba3",
    "designHash": "p5ko2qn",
    "rowLines": {
      "element-322": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "d8b0d67865e16de07640d3ebd850acc498d79401191f4168913676653df1b7fc",
    "designHash": "kge3kwm",
    "rowLines": {
      "element-322": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "4dd119de023f713e3a0d63811ce7452eb5426ab6f8e3b3eefdcb1cee47da0e5f",
    "designHash": "kg2o3po",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "16749436f4431fedceea7e1a2f0e6d0f3c31f3e1f19b99f8c497e6be977ef894",
    "designHash": "0qel06p",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "d654a0ece278929cdc4b5b2e8055ec06eb0b0c1014ca567675f8534e77fae309",
    "designHash": "1055yed",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "0cd25e334b0cd6aed91138fb343ccdefa0e839124c69fe48619aae8d22f9481f",
    "designHash": "ey22k8w",
    "rowLines": {
      "element-180": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "84c32b28946a2c5fe8a73f9c2470b441822c07a39e340a5a71231305b974bae7",
    "designHash": "qwzqmrg",
    "rowLines": {
      "element-13": [
        2,
        1,
        2
      ]
    }
  },
  {
    "sha256": "db9ed747ec6b74ffde8ca552f13505a98710671fbddb79e56367507690cd8cbe",
    "designHash": "gzx3d78",
    "rowHeights": { "element-4": [122, 183] },
    "rowLines": {
      "element-4": [
        2,
        3
      ]
    }
  },
  {
    "sha256": "d201f6d333a84f31d5fe396d96a0ded9942291c85dda951c1d05de883c397b6c",
    "designHash": "2rmk7x2",
    "rowLines": {
      "element-2": [
        1,
        2
      ]
    }
  },
  {
    "sha256": "0996c11570426b0a8285cf70f1ed82d20964ff019382fbfce04c69de8b02daca",
    "designHash": "mql1rwg",
    "rowLines": {
      "element-6": [
        1,
        1,
        2
      ],
      "element-9": [2, 1, 1],
      "element-10": [2, 1, 2]
    }
  },
  {
    "sha256": "60351f4602a1ee7258b1607ff283e16af6f064814f5d80a86c949977ef3cc8d5",
    "designHash": "7m8130q",
    "rowHeights": { "element-13": [43, 87] },
    "rowLines": {
      "element-13": [
        1,
        2
      ]
    }
  }
]

const reviewedContent = new Map([
  ['7afe59835b015ebea36297848627cccd773b0c37c6bef7c599d3ed8890debf7d', 'b0122d7b23fe41aca2d9bf2e3f6e588203d0f681e5e45e4061151e219fd06aca'],
  ['c81a468c221f866867fa81f2799f6409f089435b0e13a1e0f71948b35af6b064', '33dbea67d3e7fde216df021220d29f219f599296ce4d57ae87b9cb3c88c780f4'],
  ['e928b0a3ecf2b1d3199b162b592c87707a988f5b35c777d21bc59c3219a77b8a', 'de1740230bc3d749e0825fcdb601145a25a96e0f89b6c527f6a1c8695e380a0d'],
  ['57f1826ba0128baf8209f7f99039cd617a6a934992b8e781d0bff4cc07a889c1', 'e29425939a55b2c1541315ab15fcd3ac12ab002199c4db0d32a625efece8115c'],
  ['a2a3f2662ae524a08f14191b3491373846c257c9d8d8e85dca225a4fe7989b60', '1ce6cdc59350d83b5b4396bfb5b353e71593e533ec4e283cac4cf7116fa6eb47'],
  ['f6a613da66818cd2b4f06afa3d259319815f975648406e559d12e06c3f3bbf97', '77db16198f92a1a214446838facb7cca67e9625c58c27dfc7fffb6895be96a92'],
  ['8fc1f110ab166e43d7ff1b98116d10859ba7c1d7d47f73420e1c67245be33ae9', '0b0a98f978891de3a115e0843aea108f93611ed5e989a55050cb65058ee4fa86'],
  ['4f6c4c68602eb2c471dc1f2aeb8bfcac3162d62cafadca9e9b8798ca3e34e5b5', '39924a89770a4d4f03c283cc6b2e74a27dc1ea9a36bde95e3a70f88689d8a31c'],
])

/** Call only after archive validation. Ignore ZIP timestamps/compression, while
 * binding every filename and every byte of HTML, fonts and media to the review.
 */
export function archiveContentSha256(entries) {
  const files = entries.map(({ name, data }) => [name, createHash('sha256').update(data).digest('hex')])
    .sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
  return createHash('sha256').update(JSON.stringify(files)).digest('hex')
}

export function reviewedRowsForArchive(sha256, contentSha256) {
  const original = reviewedContent.get(contentSha256) ?? sha256
  const receipt = reviewed.find(item => item.sha256 === original)
  return receipt ? { ...structuredClone(receipt), sha256 } : undefined
}
