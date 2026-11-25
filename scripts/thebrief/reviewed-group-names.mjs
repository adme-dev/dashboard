import { readArchiveEntries } from './inspect-archive.mjs'
import { archiveContentSha256 } from './reviewed-row-layouts.mjs'

// The Brief truncated these original set names in its bulk export. Match the
// reviewed source files independently of ZIP order, timestamps or compression.
const names = new Map([
  ['Vic RV Sales Service', new Map([
    ['e8db2dfe8107632c09330c83d0724ea04bf3c0fa520caff5346a15066c840145', 'Vic RV Sales Service Special FB Traffic Update'],
    ['771fdf2cc7ea9ed76eb97ab5565d267979c1f8a1475fa9b206fb28977f2fd742', 'Vic RV Sales Service Special FB Traffic Update'],
    ['1ddee6bd34d6a9921fc08803a0bf0075525d9f69ec729f63d97a19677d2d963c', 'Vic RV Sales Service Special FB Traffic Update copy copy'],
    ['2ddf06493ab9f2022f99eb83be6987ec196ab64aea118d478aa12e1ad77cb0ef', 'Vic RV Sales Service Special FB Traffic Update copy copy'],
    ['b95ff86525139997567856a2b8b49dee018f731c0134b0eea5f14ff4c7a81922', 'Vic RV Sales Service Special FB Traffic Update JAN2025'],
    ['91b49436871bbad6c2e43fab0b9d6213a8337d2a36c61f5a3e89ff4499ebeafe', 'Vic RV Sales Service Special FB Traffic Update JAN2025'],
  ])],
  ['Victorian RV Sales Vi', new Map([
    ['0e097a5202e8e9b508f9242147aa2725f5356ec563f6d87865a2e9a1d2097371', 'Victorian RV Sales Vic Super Show Trade Show FB Video Traffic copy (1)'],
    ['fc540c6e11fde037a0a127076dfbaa0bb2a2875847282bd92521bd06139f3955', 'Victorian RV Sales Vic Super Show Trade Show FB Video Traffic copy (1)'],
  ])],
  ['Vic RV Sales Facebook', new Map([
    ['ac908d0e42d507278afb2e3c5a194c7fa7713f83b48b6286b9fe4967b8cd63d1', 'Vic RV Sales Facebook Boosted Caravan Show Video'],
    ['2494e501f05528badb837aec1417eaa594747b1cfa83f2f6184b385b8506309c', 'Vic RV Sales Facebook Boosted Caravan Show Video'],
  ])],
  ['Vic RV Sales Meta Tra', new Map([
    ['63755fb89bb43a86f41ef1d1932b589774e40cb0f698929a6c99ecf9e1482c2d', 'Vic RV Sales Meta Traffic Gippsland Caravan Expo'],
    ['a75eccb136779e119d7f181e5b2e80dcd06c7174a12309339b7ac6a3e6f2d57b', 'Vic RV Sales Meta Traffic Gippsland Caravan Expo'],
  ])],
])

export function reviewedGroupName(prefix, archive) {
  const candidates = names.get(prefix.trim())
  if (candidates) return candidates.get(archiveContentSha256(readArchiveEntries(archive)))
}
