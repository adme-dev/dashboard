// Five alternating vertical strips in TheBrief's sequential wipe.
const strips = [0, 1, 2, 3, 4]
export const stripWipeImage = strips.map(i => `linear-gradient(${i % 2 ? 0 : 180}deg,black 0%,black 50%,transparent 74%)`).join(',')
export const stripWipeSize = strips.map(() => '21% 200%').join(',')
export function stripWipePosition(completed) {
  return strips.map(i => {
    const from = i % 2 ? -48 : 148
    const to = i % 2 ? 100 : 0
    return `${25 * i}% ${i < completed ? to : from}%`
  }).join(',')
}
