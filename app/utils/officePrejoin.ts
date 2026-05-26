import type { OfficeLobbyRequestSource } from '~~/app/types/office'

export type OfficePrejoinState = {
  micReady: boolean
  cameraOn: boolean
  notesApproved: boolean
  recordingApproved: boolean
}

export type ParsedOfficeLobbyMessage = {
  note: string
  meetingTitle: string | null
  meetingId: string | null
  source: OfficeLobbyRequestSource | null
  intakeAnswers: Array<{
    label: string
    value: string
  }>
  prejoin: OfficePrejoinState | null
}

export const DEFAULT_OFFICE_PREJOIN: OfficePrejoinState = {
  micReady: true,
  cameraOn: false,
  notesApproved: false,
  recordingApproved: false
}

export function formatOfficePrejoinLine(prejoin: OfficePrejoinState) {
  return `Prejoin: mic ${prejoin.micReady ? 'ready' : 'muted'}, camera ${prejoin.cameraOn ? 'on' : 'off'}, AI notes ${prejoin.notesApproved ? 'approved' : 'not approved'}, recording ${prejoin.recordingApproved ? 'approved' : 'not approved'}`
}

export function formatOfficeLobbyMessage(note: string, prejoin: OfficePrejoinState, maxLength = 500) {
  const prejoinLine = formatOfficePrejoinLine(prejoin)
  const separatorLength = note.trim() ? 1 : 0
  const maxNoteLength = Math.max(0, maxLength - prejoinLine.length - separatorLength)
  const trimmedNote = note.trim().slice(0, maxNoteLength)

  return [trimmedNote, prejoinLine].filter(Boolean).join('\n')
}

export function parseOfficeLobbyMessage(message: string): ParsedOfficeLobbyMessage {
  const lines = message.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const prejoinLine = lines.find(line => line.toLowerCase().startsWith('prejoin:'))
  const meetingIdLine = lines.find(line => /^meeting id:\s*[0-9a-f-]{36}$/i.test(line))
  const sourceLine = lines.find(line => /^source:\s*embed$/i.test(line))
  const contentLines = lines.filter(line => line !== prejoinLine && line !== meetingIdLine && line !== sourceLine)
  const noteLines: string[] = []
  const intakeAnswers: ParsedOfficeLobbyMessage['intakeAnswers'] = []
  let inIntake = false
  let currentIntake: ParsedOfficeLobbyMessage['intakeAnswers'][number] | null = null

  for (const line of contentLines) {
    if (/^intake:$/i.test(line)) {
      inIntake = true
      currentIntake = null
      continue
    }

    if (!inIntake) {
      noteLines.push(line)
      continue
    }

    if (/^joining\s+.+/i.test(line) || /^meeting:\s*.+/i.test(line)) {
      noteLines.push(line)
      currentIntake = null
      continue
    }

    const answerLine = line.match(/^([^:]{1,120}):\s*(.*)$/)
    if (answerLine) {
      currentIntake = {
        label: answerLine[1].trim(),
        value: answerLine[2].trim()
      }
      intakeAnswers.push(currentIntake)
      continue
    }

    if (currentIntake) {
      currentIntake.value = [currentIntake.value, line].filter(Boolean).join('\n')
    }
  }

  const meetingLine = noteLines.find(line => /^joining\s+.+/i.test(line) || /^meeting:\s*.+/i.test(line))
  const meetingTitleLines = noteLines.filter(line => /^joining\s+.+/i.test(line) || /^meeting:\s*.+/i.test(line))
  const meetingTitle = meetingLine
    ? meetingLine.replace(/^joining\s+/i, '').replace(/^meeting:\s*/i, '').replace(/\.$/, '').trim()
    : null
  const meetingId = meetingIdLine
    ? meetingIdLine.replace(/^meeting id:\s*/i, '').trim()
    : null
  const source = sourceLine ? 'embed' : null
  const note = noteLines.filter(line => !meetingTitleLines.includes(line)).join('\n')

  if (!prejoinLine) {
    return { note, meetingTitle, meetingId, source, intakeAnswers, prejoin: null }
  }

  const prejoin = prejoinLine.toLowerCase()
  return {
    note,
    meetingTitle,
    meetingId,
    source,
    intakeAnswers,
    prejoin: {
      micReady: prejoin.includes('mic ready'),
      cameraOn: prejoin.includes('camera on'),
      notesApproved: prejoin.includes('ai notes approved'),
      recordingApproved: prejoin.includes('recording approved')
    }
  }
}

export function parseOfficePrejoinState(message: string): OfficePrejoinState {
  return parseOfficeLobbyMessage(message).prejoin ?? DEFAULT_OFFICE_PREJOIN
}
