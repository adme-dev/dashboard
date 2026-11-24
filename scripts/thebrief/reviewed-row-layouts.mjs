// Row counts measured against the original source previews. Exact archive and
// layout identities bind these receipts; edited or rewrapped layouts still hold.
const reviewed = [
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

export function reviewedRowsForArchive(sha256) {
  const receipt = reviewed.find(item => item.sha256 === sha256)
  return receipt ? structuredClone(receipt) : undefined
}
