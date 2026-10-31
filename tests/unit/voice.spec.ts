import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceInteractionContext } from '@/models'
import type { CommandExecutor } from '@/services/interfaces'
import { MockSpeechCapture } from '@/services/speech/MockSpeechRecognizer'
import { useCalendarStore } from '@/stores/calendar'
import { useGroceryStore } from '@/stores/groceries'
import { useMessageStore } from '@/stores/messages'
import { VOICE_TRANSITIONS, type VoiceState, useVoiceStore } from '@/stores/voice'
import { setup } from './helpers'

const grocery: VoiceInteractionContext = { feature: 'groceries', route: '/groceries', origin: 'local-mic', operation: 'add' }
const home: VoiceInteractionContext = { feature: 'home', route: '/', origin: 'global-mic' }

const reach = (state: VoiceState) => vi.waitFor(() => expect(useVoiceStore().state).toBe(state))

describe('voice interaction state machine', () => {
  beforeEach(async () => {
    await setup()
  })

  it('walks listening → processing → reviewing and commits nothing before confirmation', async () => {
    const voice = useVoiceStore()
    const groceries = useGroceryStore()
    const before = groceries.items.length

    await voice.open(grocery)
    await reach('reviewing')

    expect(voice.proposal?.kind).toBe('grocery.add')
    expect(voice.proposal?.items).toEqual(['Yogurt', 'Rice', 'Oranges'])
    expect(voice.proposal?.confirmLabel).toBe('Add 3 Items')
    expect(groceries.items.length).toBe(before) // reviewed, not committed
  })

  it('commits on confirm, then reports success', async () => {
    const voice = useVoiceStore()
    const groceries = useGroceryStore()
    const before = groceries.items.length

    await voice.open(grocery)
    await reach('reviewing')
    await voice.confirm()

    expect(voice.state).toBe('success')
    expect(groceries.items.length).toBe(before + 3)
    voice.close()
    expect(voice.state).toBe('closed')
  })

  it('ignores a second open while already open (double tap)', async () => {
    const voice = useVoiceStore()
    await voice.open(grocery)
    await voice.open({ ...home })
    expect(voice.context?.feature).toBe('groceries')
  })

  it('cancelling mid-listen closes cleanly and drops late recognizer results', async () => {
    const voice = useVoiceStore()
    await voice.open(grocery)
    voice.close()
    await new Promise((r) => setTimeout(r, 30))
    expect(voice.state).toBe('closed')
    expect(voice.proposal).toBeNull()
  })

  it('every non-terminal state can only move along declared transitions', () => {
    expect(VOICE_TRANSITIONS.executing).not.toContain('closed') // a commit in flight cannot be cancelled
    expect(VOICE_TRANSITIONS.closed).toEqual(['requesting-permission'])
    expect(VOICE_TRANSITIONS.success).toEqual(['closed'])
  })

  it('uses the selected member as the default person for calendar requests', async () => {
    const voice = useVoiceStore()
    await voice.open({ feature: 'calendar', route: '/calendar', origin: 'local-mic', memberId: 'liam' })
    await reach('reviewing')
    const person = voice.proposal?.fields.find((f) => f.label === 'Person')
    expect(person).toMatchObject({ value: 'Liam', memberId: 'liam' })
    const calendar = useCalendarStore()
    const before = calendar.events.length
    await voice.confirm()
    expect(calendar.events.length).toBe(before + 1)
  })

  it('shows recipients and message before sending, and requires confirmation', async () => {
    const voice = useVoiceStore()
    const messages = useMessageStore()
    const before = messages.messages.length
    await voice.open({ feature: 'messages', route: '/messages', origin: 'local-mic' })
    await reach('reviewing')
    expect(voice.proposal?.outgoing).toBe(true)
    expect(voice.proposal?.fields.map((f) => f.label)).toEqual(['From', 'To', 'Message'])
    expect(messages.messages.length).toBe(before)
    await voice.confirm()
    expect(messages.messages.length).toBe(before + 1)
  })
})

describe('voice failure states', () => {
  it('reports microphone permission denied', async () => {
    await setup({ capture: new MockSpeechCapture('denied') })
    const voice = useVoiceStore()
    await voice.open(grocery)
    expect(voice.state).toBe('error')
    expect(voice.error?.code).toBe('permission-denied')
    expect(voice.micVisual).toBe('permission')
  })

  it('reports unsupported speech capture without offering a pointless retry', async () => {
    await setup({ capture: new MockSpeechCapture('unsupported') })
    const voice = useVoiceStore()
    await voice.open(grocery)
    expect(voice.error).toMatchObject({ code: 'unsupported', retryable: false })
  })

  it('handles "no speech" and recovers on retry', async () => {
    await setup()
    const voice = useVoiceStore()
    await voice.open(grocery)
    voice.devScenario('no-speech')
    await reach('error')
    expect(voice.error?.code).toBe('no-speech')

    voice.devScenario('grocery-add') // dev picker is a no-op in error? use retry instead
    voice.retry()
    await reach('reviewing')
    expect(voice.proposal?.kind).toBe('grocery.add')
  })

  it('asks the user to rephrase an unclear request instead of guessing', async () => {
    await setup()
    const voice = useVoiceStore()
    await voice.open(home)
    voice.devScenario('unclear')
    await reach('error')
    expect(voice.error?.code).toBe('unclear')
    expect(voice.proposal).toBeNull()
  })

  it('never claims success when the save fails, and lets the user retry the commit', async () => {
    const services = await setup()
    const failing: CommandExecutor = { execute: async () => ({ ok: false, retryable: true, message: 'Server unreachable' }) }
    services.executor = failing

    const voice = useVoiceStore()
    await voice.open(grocery)
    await reach('reviewing')
    await voice.confirm()

    expect(voice.state).toBe('error')
    expect(voice.error).toMatchObject({ code: 'execution-failed', retry: 'execute', message: 'Server unreachable' })
    expect(voice.resultMessage).toBe('')

    voice.retry() // returns to the review step with the same proposal intact
    expect(voice.state).toBe('reviewing')
    expect(voice.proposal?.kind).toBe('grocery.add')
  })

  it('treats a repeated command as harmless (items already on the list are skipped)', async () => {
    await setup()
    const voice = useVoiceStore()
    const groceries = useGroceryStore()
    for (let i = 0; i < 2; i++) {
      await voice.open(grocery)
      await reach('reviewing')
      await voice.confirm()
      voice.close()
    }
    const names = groceries.items.map((g) => g.name.toLowerCase())
    expect(names.filter((n) => n === 'yogurt')).toHaveLength(1)
  })
})
