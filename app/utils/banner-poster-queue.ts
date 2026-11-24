// Limit cold poster requests across mounted gallery tiles. Removing a queued tile
// on scroll leaves the available slots for artwork the user can actually see.
const waiting = new Set<() => void>()
let active = 0
const maxActive = 4

function drain() {
  for (const start of waiting) {
    if (active >= maxActive) break
    waiting.delete(start)
    active++
    start()
  }
}

export function queueBannerPoster(start: () => void) {
  let running = false
  const begin = () => {
    running = true
    start()
  }
  waiting.add(begin)
  drain()
  return () => {
    waiting.delete(begin)
    if (running) {
      running = false
      active--
      drain()
    }
  }
}
