import { describe, expect, it } from 'vitest'
import { resolveVoiceContext, voiceTitle } from '@/features/voice/context'

const base = { route: '/', feature: 'home' as const, memberId: 'liam' as string | null }

describe('voice context resolution', () => {
  it('uses the shell context for the global mic', () => {
    const ctx = resolveVoiceContext(base, 'global-mic')
    expect(ctx).toMatchObject({ feature: 'home', memberId: 'liam', origin: 'global-mic' })
  })

  it('lets a local mic override with the more specific feature, keeping the member', () => {
    const ctx = resolveVoiceContext(base, 'local-mic', { feature: 'groceries', operation: 'add', activeModal: 'groceries' })
    expect(ctx).toMatchObject({ feature: 'groceries', operation: 'add', memberId: 'liam', origin: 'local-mic' })
    expect(voiceTitle(ctx)).toBe('Add to Groceries')
  })

  it('does not let an undefined override erase a base value', () => {
    expect(resolveVoiceContext(base, 'local-mic', { memberId: undefined }).memberId).toBe('liam')
  })

  it('treats "no member selected" as family-wide', () => {
    expect(resolveVoiceContext({ ...base, memberId: null }, 'global-mic').memberId).toBeUndefined()
  })
})
