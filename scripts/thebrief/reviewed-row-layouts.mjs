import { createHash } from 'node:crypto'

// Row counts measured against the original source previews. Exact archive and
// layout identities bind these receipts; edited or rewrapped layouts still hold.
const reviewed = [
  // Original Jeep and Toyota row boxes measured with their exported font faces.
  {"sha256": "167d2fbba728d4bb59962b44a950006d7eced7e01fed17154574b159201c9abd", "designHash": "85kzelz", "rowLines": {"element-201": [3, 3]}, "rowHeights": {"element-201": [478.406, 478.406]}},
  {"sha256": "6f71c67eb3dcd0a2e619821818323157bdd086e70c5a002589fe90a20134e83e", "designHash": "g23pn78", "rowLines": {"element-201": [3, 3]}, "rowHeights": {"element-201": [426.516, 426.516]}},
  {"sha256": "9865c38c52e00efa03cdd25f77f5fb4e3cdb45a122da7783c2a9f1350ea7c1f1", "designHash": "0y5r3gz", "rowLines": {"element-6": [4, 4]}, "rowHeights": {"element-6": [418.75, 418.75]}},
  {"sha256": "3c722af8df348c2913eabf7c01a2d1ad04e268e22ee9690dccb76f7fd4d77dc9", "designHash": "85q1en5", "rowLines": {"element-6": [6, 6]}, "rowHeights": {"element-6": [632.906, 632.906]}},
  {"sha256": "86f15b0d80723fed90872ab23abe2aced4e7e9ca04d6ae67648af419744d82c0", "designHash": "7nkjrqm", "rowLines": {"element-56": [2, 1, 1]}, "rowHeights": {"element-56": [78.7188, 39.3594, 24.9844]}},
  {"sha256": "649b43d90decaec2ee353b9474aeb2d3275a7be1457c285c645e00d2015c0e78", "designHash": "x13w2q6", "rowLines": {"element-56": [2, 1, 1]}, "rowHeights": {"element-56": [70.4688, 35.2344, 22.3594]}},
  {"sha256": "99998862c2e1aa65d1723029cfac2cf581a685415722b8630bd592278f632341", "designHash": "q1j2ggz", "rowLines": {"element-5": [3, 1, 3, 1, 2, 1, 2]}, "rowHeights": {"element-5": [66.5625, 22.1875, 66.5625, 22.1875, 44.375, 22.1875, 44.375]}},
  {"sha256": "7c068b9f6d0fef00ecc3ac9b25b3491ff686870a83f616ded85b9355e3d9ecf9", "designHash": "x8kgxw6", "rowLines": {"element-15": [4, 1], "element-81": [2, 1], "element-37": [3, 1], "element-39": [2, 1], "element-43": [2, 1, 1], "element-57": [3, 1], "element-64": [4, 1]}, "rowHeights": {"element-15": [120.625, 30.1562], "element-81": [51.125, 25.5625], "element-37": [76.6875, 25.5625], "element-39": [180.594, 90.2969], "element-43": [115.719, 57.8594, 57.8594], "element-57": [76.6875, 25.5625], "element-64": [120.625, 30.1562]}},
  // Suzuki multi-row text, measured with the original bundled fonts at source size.
  { sha256: '447993fde561f55b9ce8e0fea8012b8e377878d6cf6bfe64a73c38b3825a4918', designHash: 'o1q8xoy', rowLines: { 'element-470': [1, 2] }, rowHeights: { 'element-470': [86, 172] } },
  { sha256: '064106b99e527ee2b1318ccbba1294c0c285dadf9cfcbac06e0a695e2a9047c8', designHash: 'w11exxe', rowLines: { 'element-439': [2, 1] }, rowHeights: { 'element-439': [154, 77] } },
  { sha256: 'f9fbe8203969ea0f3564075d1f7f911eca57d4e7e1f7b9a3a2eb9af93f4b8eb9', designHash: 'n15pw03', rowLines: { 'element-439': [2, 1] }, rowHeights: { 'element-439': [161, 81] } },
  { sha256: 'f769130aea7e00e4c437946b66a86ea0cdb81cc278f49e019e0ecfca62044843', designHash: 'm12k6g6', rowLines: { 'element-439': [2, 1] }, rowHeights: { 'element-439': [154, 77] } },
  { sha256: '71255b4f5b5a2de0c419c8bf2af1bd39560b0df00027a6327121ea0d5b1b602e', designHash: 'xz6pwm5', rowLines: { 'element-5': [2, 1] }, rowHeights: { 'element-5': [92, 46] } },
  { sha256: 'ac6b46787b83b380cbb98cea61ed4707e205b9cf3ae9244b02e474407bd9f4b7', designHash: '3158m1y', rowLines: { 'element-41': [2, 1] }, rowHeights: { 'element-41': [154, 77] } },
  { sha256: 'bd62f0e23e2442c06e100502206ed0adcbf40ff20e06a2227cfcb81853e8f0bc', designHash: '0y3dnpd', rowLines: { 'element-409': [2, 1, 2] }, rowHeights: { 'element-409': [83, 30, 61] } },
  { sha256: '408fd77a66366728e9335b834348a880ab455c7d130081916d88896d557628a5', designHash: 'k5zd7qe', rowLines: { 'element-380': [2, 2] }, rowHeights: { 'element-380': [188, 188] } },
  // Original Gotham row boxes measure 72.90 and 145.80 px at a 72.90 px line height.
  { sha256: '7b9903ea11b55d8427379b3abf19d75514f10fd3a776ffc2567406009c8ef2f2', designHash: '2r2l82q', rowLines: { 'element-25': [1, 2] } },
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
  ['b3a6e65722a95e789ff67ffc26bb2b75f8450b1dd7dcd01b8d3befa6a0ba8002', '167d2fbba728d4bb59962b44a950006d7eced7e01fed17154574b159201c9abd'],
  ['8b1dd87c1738075a7edabfed2b3468529bba816c66c4da02f6f3273337ff6ab6', '6f71c67eb3dcd0a2e619821818323157bdd086e70c5a002589fe90a20134e83e'],
  ['6cf9d019fcb6dd2683a1df5d255805e5e934782cb9d0e366d5f434fc1d115251', '9865c38c52e00efa03cdd25f77f5fb4e3cdb45a122da7783c2a9f1350ea7c1f1'],
  ['2932cd1e421abc8102b5af7b0338858dec41ef24b7b881567d852241d8719f2c', '3c722af8df348c2913eabf7c01a2d1ad04e268e22ee9690dccb76f7fd4d77dc9'],
  ['f5862351415469a44873cc27263f920eb761483997f4089504781e7f54ead7f4', '86f15b0d80723fed90872ab23abe2aced4e7e9ca04d6ae67648af419744d82c0'],
  ['dfefed30bbaa6eb1c80203578334b4fc789c472e32340699fb9bf022c902bf79', '649b43d90decaec2ee353b9474aeb2d3275a7be1457c285c645e00d2015c0e78'],
  ['8d08f3836839d6708af249a0b88700c100c0d0a73a5399526786e7aeddf337df', '99998862c2e1aa65d1723029cfac2cf581a685415722b8630bd592278f632341'],
  ['e5b3a7239c6b729e73b490065bf44c5f6568a35e53e7015158e1204a6b5ea212', '7c068b9f6d0fef00ecc3ac9b25b3491ff686870a83f616ded85b9355e3d9ecf9'],
  ['c708b7e51b3482b870f0c18ba37aaac0287c2bbc70687721e9be4b13ceb2784e', '447993fde561f55b9ce8e0fea8012b8e377878d6cf6bfe64a73c38b3825a4918'],
  ['7c7cd8788be38e768724a82b313dd3aaa56af795b2be94d622b1197837c1cafd', '064106b99e527ee2b1318ccbba1294c0c285dadf9cfcbac06e0a695e2a9047c8'],
  ['194dcfda6528ad8a77ad48c08aa6ddba551d1878b535bc4f99796ca3ebc44de4', 'f9fbe8203969ea0f3564075d1f7f911eca57d4e7e1f7b9a3a2eb9af93f4b8eb9'],
  ['293fb9085f704930b69dfab18cee6a265b36f82666482c2902b649fefa3433a1', 'f769130aea7e00e4c437946b66a86ea0cdb81cc278f49e019e0ecfca62044843'],
  ['a5bf13f97e39f71505369957a7b153e0254a77e7217d68fca6a0daa84688179c', '71255b4f5b5a2de0c419c8bf2af1bd39560b0df00027a6327121ea0d5b1b602e'],
  ['6e11582a8ef1b7b34492345c47aa18807ab39d36a7832e1fa7fb989f69635c6b', 'ac6b46787b83b380cbb98cea61ed4707e205b9cf3ae9244b02e474407bd9f4b7'],
  ['8feff1baaccae484837d2a034d92d0866516ba390e416f179f1abc77f65bd7eb', 'bd62f0e23e2442c06e100502206ed0adcbf40ff20e06a2227cfcb81853e8f0bc'],
  ['550b685c63c3ae9e0e58eacc7f6b892604ce8c134e190e77c6a208788313a121', '408fd77a66366728e9335b834348a880ab455c7d130081916d88896d557628a5'],
  ['0e097a5202e8e9b508f9242147aa2725f5356ec563f6d87865a2e9a1d2097371', '7b9903ea11b55d8427379b3abf19d75514f10fd3a776ffc2567406009c8ef2f2'],
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
