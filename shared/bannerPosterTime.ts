/** A saved poster choice never seeks beyond the animation or accepts non-finite input. */
export function bannerPosterTime(duration: number, selected?: number) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 5
  return Number.isFinite(selected) ? Math.max(0, Math.min(length - 0.001, selected!)) : Math.min(3, length / 2)
}
