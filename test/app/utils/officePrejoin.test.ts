import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OFFICE_PREJOIN,
  formatOfficeLobbyMessage,
  formatOfficePrejoinLine,
  parseOfficeLobbyMessage,
  parseOfficePrejoinState
} from '~~/app/utils/officePrejoin'

describe('office prejoin utilities', () => {
  it('formats the canonical prejoin line', () => {
    expect(formatOfficePrejoinLine({
      micReady: false,
      cameraOn: true,
      notesApproved: false,
      recordingApproved: true
    })).toBe('Prejoin: mic muted, camera on, AI notes not approved, recording approved')
  })

  it('parses a note and prejoin state from a lobby message', () => {
    expect(parseOfficeLobbyMessage('Please let me in\nPrejoin: mic ready, camera off, AI notes approved, recording approved')).toEqual({
      note: 'Please let me in',
      meetingTitle: null,
      meetingId: null,
      source: null,
      intakeAnswers: [],
      prejoin: {
        micReady: true,
        cameraOn: false,
        notesApproved: true,
        recordingApproved: true
      }
    })
  })

  it('parses muted mic, enabled camera, and notes disabled', () => {
    expect(parseOfficePrejoinState('Prejoin: mic muted, camera on, AI notes not approved')).toEqual({
      micReady: false,
      cameraOn: true,
      notesApproved: false,
      recordingApproved: false
    })
  })

  it('falls back to default prejoin state when no prejoin line exists', () => {
    expect(parseOfficeLobbyMessage('Plain guest note')).toEqual({
      note: 'Plain guest note',
      meetingTitle: null,
      meetingId: null,
      source: null,
      intakeAnswers: [],
      prejoin: null
    })
    expect(parseOfficePrejoinState('Plain guest note')).toEqual(DEFAULT_OFFICE_PREJOIN)
  })

  it('preserves prejoin metadata when truncating long notes', () => {
    const message = formatOfficeLobbyMessage('a'.repeat(100), {
      micReady: true,
      cameraOn: false,
      notesApproved: true,
      recordingApproved: false
    }, 80)

    expect(message.length).toBeLessThanOrEqual(80)
    expect(message).toContain('Prejoin: mic ready, camera off, AI notes approved, recording not approved')
    expect(parseOfficePrejoinState(message)).toEqual({
      micReady: true,
      cameraOn: false,
      notesApproved: true,
      recordingApproved: false
    })
  })

  it('extracts invite meeting titles from guest notes', () => {
    expect(parseOfficeLobbyMessage('Joining Client Review\nPrejoin: mic ready, camera off, AI notes not approved, recording not approved')).toEqual({
      note: '',
      meetingTitle: 'Client Review',
      meetingId: null,
      source: null,
      intakeAnswers: [],
      prejoin: {
        micReady: true,
        cameraOn: false,
        notesApproved: false,
        recordingApproved: false
      }
    })

    expect(parseOfficeLobbyMessage('Meeting: Weekly planning.\nNeed a quick sync')).toEqual({
      note: 'Need a quick sync',
      meetingTitle: 'Weekly planning',
      meetingId: null,
      source: null,
      intakeAnswers: [],
      prejoin: null
    })
  })

  it('extracts invite meeting ids without showing them as guest notes', () => {
    expect(parseOfficeLobbyMessage([
      'Joining Client Review',
      'Meeting ID: 11111111-1111-4111-8111-111111111111',
      'Meeting: Client Review',
      'Prejoin: mic ready, camera off, AI notes approved, recording not approved'
    ].join('\n'))).toEqual({
      note: '',
      meetingTitle: 'Client Review',
      meetingId: '11111111-1111-4111-8111-111111111111',
      source: null,
      intakeAnswers: [],
      prejoin: {
        micReady: true,
        cameraOn: false,
        notesApproved: true,
        recordingApproved: false
      }
    })
  })

  it('extracts embed source without showing it as a guest note', () => {
    expect(parseOfficeLobbyMessage([
      'Joining Client Review',
      'Source: embed',
      'Prejoin: mic ready, camera off, AI notes approved, recording not approved'
    ].join('\n'))).toEqual({
      note: '',
      meetingTitle: 'Client Review',
      meetingId: null,
      source: 'embed',
      intakeAnswers: [],
      prejoin: {
        micReady: true,
        cameraOn: false,
        notesApproved: true,
        recordingApproved: false
      }
    })
  })

  it('extracts structured intake answers from lobby messages', () => {
    expect(parseOfficeLobbyMessage([
      'Joining Client Review',
      'Intake:',
      'What should we review first?: Launch blockers',
      'Any extra context?: Budget shifted',
      'Need creative and spend checked',
      'Prejoin: mic ready, camera off, AI notes approved, recording not approved'
    ].join('\n'))).toEqual({
      note: '',
      meetingTitle: 'Client Review',
      meetingId: null,
      source: null,
      intakeAnswers: [
        {
          label: 'What should we review first?',
          value: 'Launch blockers'
        },
        {
          label: 'Any extra context?',
          value: 'Budget shifted\nNeed creative and spend checked'
        }
      ],
      prejoin: {
        micReady: true,
        cameraOn: false,
        notesApproved: true,
        recordingApproved: false
      }
    })
  })
})
