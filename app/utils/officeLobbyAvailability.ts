import type { OfficeLobbyAvailabilityWindow } from '~~/app/types/office'

const WEEKDAY_TO_INDEX: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6
}

function timeToMinutes(value: string) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value)
  if (!match) return null
  return Number(match[1]) * 60 + Number(match[2])
}

function zonedDayAndMinutes(date: Date, timezone?: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const weekday = parts.find(part => part.type === 'weekday')?.value.toLowerCase().slice(0, 3)
  const hour = Number(parts.find(part => part.type === 'hour')?.value ?? '0')
  const minute = Number(parts.find(part => part.type === 'minute')?.value ?? '0')

  return {
    day: weekday ? WEEKDAY_TO_INDEX[weekday] ?? 0 : 0,
    minutes: hour * 60 + minute
  }
}

export function isInOfficeLobbyAvailabilityWindow(
  scheduledStartAt: string,
  windows?: OfficeLobbyAvailabilityWindow[] | null
) {
  if (!windows?.length) return true

  const date = new Date(scheduledStartAt)
  if (Number.isNaN(date.getTime())) return false

  return windows.some((window) => {
    const start = timeToMinutes(window.start)
    const end = timeToMinutes(window.end)
    if (start === null || end === null || !window.days.length) return false

    const { day, minutes } = zonedDayAndMinutes(date, window.timezone)
    if (start < end) {
      return window.days.includes(day) && minutes >= start && minutes < end
    }

    const previousDay = (day + 6) % 7
    return (window.days.includes(day) && minutes >= start)
      || (window.days.includes(previousDay) && minutes < end)
  })
}
