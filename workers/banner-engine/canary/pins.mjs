// Independent canary pins. Existing accepted runtime/capability selection is untouched.
export const INNER_IMAGE = 'sha256:390a78bbbf9a49c84f09dcdc200709e8fce56d3e15d6bdd5dd09a256a6653dca'
export const DOCKER_BASE = 'docker:29.2.0-dind@sha256:99aa88f75d8d401c30e395db1d2e679a89ff0be9b415f020b8e2383c517e1fda'
export const NODE_BASE = 'node:24.18.0-alpine@sha256:4ba75f835bb8802193e4c114572113d4b26f95f6f094f4b5229d2a77773e0afc'
export const FONT = {
  path: '/usr/share/fonts/truetype/banner/SourceSans3-Bold.ttf',
  sha256: '9214b9d95e4231c609802815c2646c98174e2102d0d37f88978a7f8e71006e6a',
  licensePath: '/usr/share/doc/banner-engine/fonts/LICENSE.md',
  licenseSha256: '89ad2c4f66dd29127527493e729c31e731f111cf10faf5774c3db9275ed0c22c'
}
export const ENGINES = {
  photocraft: {
    version: '0.16.0', extension: 'pcraft', fixture: 'heading.pcraft',
    executableSha256: 'bc5ce108f01aed2965f3c067c4828d7bcaa33b83cd523e7e466f0e43bb47c21d',
    fixtureSha256: 'a4293afd97000474b6961c7a96ea28c38d442fc344a225646b878d54b8218d6c',
    pngSha256: '6b6672f7cc41fc9003d739eea84d77d5c4927999984ee4b95886fb7ba4845d07',
    width: 800, height: 256
  },
  vectorcraft: {
    version: '0.17.0', extension: 'vectorcraft', fixture: 'vector-font.vectorcraft',
    executableSha256: 'b0c02b7f82617cad91fef89c455694b4fbf2ad349ab576714e8a38e15b158862',
    fixtureSha256: 'ca3f94538478c9e0aeb8796c4a3bfb541efadc1b84889fb0eea96a7f71053205',
    pngSha256: '2d1a974952c83eb1e5ec04b030c54a4c36ff6308b8e70e5a6bd3d5baf1d9912b',
    width: 640, height: 360
  }
}
