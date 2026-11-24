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
  }
]

export function reviewedRowsForArchive(sha256) {
  const receipt = reviewed.find(item => item.sha256 === sha256)
  return receipt ? structuredClone(receipt) : undefined
}
