<script setup lang="ts">
import { Check, CircleHelp, Mic, RotateCcw, Square, TriangleAlert, Volume2, VolumeX } from 'lucide-vue-next'
import { computed } from 'vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudModal from '@/components/hud/HudModal.vue'
import { featureLabel, voiceHint, voiceTitle } from '@/features/voice/context'
import { getServices } from '@/services/container'
import { isScriptable } from '@/services/interfaces'
import { useFamilyStore } from '@/stores/family'
import { usePreferencesStore } from '@/stores/preferences'
import { useVoiceStore } from '@/stores/voice'
import ActionPreview from './ActionPreview.vue'
import MicButton from './MicButton.vue'
import TranscriptDisplay from './TranscriptDisplay.vue'
import Waveform from './Waveform.vue'

const voice = useVoiceStore()
const family = useFamilyStore()
const prefs = usePreferencesStore()

const ctx = computed(() => voice.context)
const title = computed(() => (ctx.value ? voiceTitle(ctx.value) : ''))
const memberName = computed(() => (ctx.value?.memberId ? family.nameOf(ctx.value.memberId) : undefined))
const hint = computed(() => (ctx.value ? voiceHint(ctx.value, memberName.value) : ''))

const STATUS: Record<string, string> = {
  'requesting-permission': 'Getting ready…',
  'listening': 'Listening…',
  'processing': 'Understanding your request…',
  'clarifying': 'One quick question',
  'reviewing': "Here's what I found",
  'executing': 'Saving…',
  'success': 'All set!',
}
const status = computed(() => (voice.state === 'error' ? (voice.error?.title ?? 'Something went wrong') : (STATUS[voice.state] ?? '')))
const listening = computed(() => voice.state === 'listening')
const busy = computed(() => voice.state === 'executing')

// Dev-only: a scenario picker for the mock recognizer. Not a text field.
const devScenarios = computed(() => {
  if (!import.meta.env.DEV || !ctx.value) return []
  const r = getServices().recognizer
  return isScriptable(r) ? r.scenarios(ctx.value) : []
})
</script>

<template>
  <HudModal :open="voice.isOpen" :title="title" size="md" layer="voice" :close-on-backdrop="false" :closable="!busy" @close="voice.close()">
    <template #header>
      <div class="vm__head">
        <h2 class="vm__title">{{ title }}</h2>
        <span class="vm__chip" data-testid="voice-context">From: {{ ctx ? featureLabel(ctx.feature) : '' }}</span>
        <span v-if="memberName" class="vm__chip vm__chip--member">For {{ memberName }}</span>
        <button type="button" class="vm__chip vm__chip--toggle" :class="{ 'vm__chip--on': prefs.speakReplies }" :aria-pressed="prefs.speakReplies" data-testid="speak-toggle" @click="prefs.speakReplies = !prefs.speakReplies">
          <component :is="prefs.speakReplies ? Volume2 : VolumeX" aria-hidden="true" />Speak replies
        </button>
      </div>
    </template>

    <div class="vm" :data-state="voice.state" data-testid="voice-modal">
      <div class="vm__mic">
        <Waveform :active="listening" flip />
        <MicButton :state="voice.micVisual" size="lg" passive />
        <Waveform :active="listening" />
      </div>

      <p class="vm__status" :class="`vm__status--${voice.state}`" aria-live="assertive" data-testid="voice-status">
        <Check v-if="voice.state === 'success'" aria-hidden="true" />
        <TriangleAlert v-else-if="voice.state === 'error'" aria-hidden="true" />
        {{ status }}
      </p>

      <!-- Listening / processing: live transcript -->
      <TranscriptDisplay
        v-if="['requesting-permission', 'listening', 'processing'].includes(voice.state)"
        :text="voice.interim"
        :hint="hint"
        :live="listening"
      />

      <!-- Clarifying: a question answered by touching an option -->
      <template v-else-if="voice.state === 'clarifying' && voice.clarification">
        <TranscriptDisplay :text="voice.transcript" />
        <section class="vm__clarify" aria-label="Clarifying question" data-testid="clarify">
          <h3 class="vm__question">{{ voice.clarification.question }}</h3>
          <div class="vm__options" :class="{ 'vm__options--grid': voice.clarification.options.length > 5 }">
            <button v-for="(o, i) in voice.clarification.options" :key="o.label + i" type="button" class="vm__option" data-testid="clarify-option" @click="voice.answerClarification(i)">
              <b>{{ o.label }}</b>
              <small v-if="o.detail">{{ o.detail }}</small>
            </button>
          </div>
        </section>
      </template>

      <!-- Review -->
      <template v-else-if="voice.state === 'reviewing' && voice.proposal">
        <TranscriptDisplay :text="voice.transcript" />
        <ActionPreview :action="voice.proposal" />
      </template>

      <!-- Executing -->
      <TranscriptDisplay v-else-if="voice.state === 'executing'" :text="voice.transcript" />

      <!-- Success -->
      <p v-else-if="voice.state === 'success'" class="vm__result" data-testid="voice-result">{{ voice.resultMessage }}</p>

      <!-- Error -->
      <div v-else-if="voice.state === 'error' && voice.error" class="vm__error" role="alert" data-testid="voice-error">
        <p>{{ voice.error.message }}</p>
        <p v-if="voice.transcript" class="vm__heard"><CircleHelp aria-hidden="true" /> I heard: “{{ voice.transcript }}”</p>
      </div>

      <div class="vm__actions">
        <template v-if="voice.state === 'listening'">
          <HudButton @click="voice.close()">Cancel</HudButton>
          <HudButton variant="primary" @click="voice.stopListening()">
            <template #icon><Square /></template>
            Done talking
          </HudButton>
        </template>

        <template v-else-if="voice.state === 'clarifying'">
          <HudButton @click="voice.close()">Cancel</HudButton>
          <HudButton @click="voice.retry()">
            <template #icon><RotateCcw /></template>
            Start over
          </HudButton>
        </template>

        <template v-else-if="voice.state === 'reviewing' && voice.proposal">
          <HudButton @click="voice.close()">Cancel</HudButton>
          <HudButton @click="voice.retry()">
            <template #icon><RotateCcw /></template>
            Retry
          </HudButton>
          <HudButton :variant="voice.proposal.destructive ? 'danger' : 'primary'" data-testid="voice-confirm" @click="voice.confirm()">
            {{ voice.proposal.confirmLabel }}
          </HudButton>
        </template>

        <template v-else-if="voice.state === 'error'">
          <HudButton @click="voice.close()">Cancel</HudButton>
          <HudButton v-if="voice.error?.retryable" variant="primary" data-testid="voice-retry" @click="voice.retry()">
            <template #icon><RotateCcw /></template>
            Retry
          </HudButton>
        </template>

        <template v-else-if="voice.state === 'success'">
          <HudButton variant="primary" @click="voice.close()">Done</HudButton>
        </template>

        <template v-else>
          <HudButton :disabled="busy" @click="voice.close()">Cancel</HudButton>
        </template>
      </div>

      <div v-if="devScenarios.length" class="vm__dev" aria-label="Development scenarios">
        <span class="vm__dev-tag"><Mic aria-hidden="true" /> DEV · mock voice</span>
        <button v-for="s in devScenarios" :key="s.id" type="button" class="vm__dev-chip" @click="voice.devScenario(s.id)">
          {{ s.label }}
        </button>
      </div>
    </div>
  </HudModal>
</template>

<style scoped lang="scss">
.vm__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.7rem;
  min-width: 0;
}
.vm__title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: 600;
}
.vm__chip {
  padding: 0.15rem 0.7rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  font-size: 0.78rem;
  color: var(--hud-text-dim);
  &--member {
    color: var(--hud-primary);
    border-color: var(--hud-border-bright);
  }
}

.vm {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.vm__mic {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 1.6rem 0 0.6rem;
}
.vm__status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin: 0;
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--hud-primary);
  svg {
    width: 1.3rem;
    height: 1.3rem;
  }
  &--success {
    color: var(--hud-success);
  }
  &--error {
    color: var(--hud-danger);
  }
}
.vm__result {
  margin: 0;
  text-align: center;
  font-size: 1.1rem;
  color: var(--hud-text);
}
.vm__error {
  padding: 0.8rem 1rem;
  border: 1px solid color-mix(in srgb, var(--hud-warning) 70%, transparent);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--hud-warning) 8%, transparent);
  text-align: center;
  p {
    margin: 0;
    font-size: 1.05rem;
  }
}
.vm__heard {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  margin-top: 0.5rem !important;
  font-size: 0.9rem !important;
  font-style: italic;
  color: var(--hud-text-dim);
  svg {
    width: 1rem;
    height: 1rem;
  }
}
.vm__chip--toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-height: 2rem;
  background: none;
  cursor: pointer;
  svg {
    width: 0.95rem;
    height: 0.95rem;
  }
}
.vm__chip--on {
  color: var(--hud-text);
  border-color: var(--hud-primary);
  background: color-mix(in srgb, var(--hud-primary) 16%, transparent);
}
.vm__clarify {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.vm__question {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  text-align: center;
  color: var(--hud-warning);
}
.vm__options {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  max-height: 16rem;
  overflow-y: auto;
  &--grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.vm__option {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 0.1rem;
  min-height: 3.4rem;
  padding: 0.3rem 1rem;
  border: 1px solid var(--hud-border-bright);
  border-radius: 0.8rem;
  background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
  color: var(--hud-text);
  text-align: left;
  cursor: pointer;
  b {
    font-size: 1.05rem;
  }
  small {
    font-size: 0.8rem;
    color: var(--hud-text-dim);
  }
  &:active {
    background: color-mix(in srgb, var(--hud-primary) 22%, transparent);
    border-color: var(--hud-primary);
  }
}
.vm__actions {
  display: flex;
  gap: 0.7rem;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 0.3rem;
  > * {
    flex: 1 1 8rem;
    max-width: 14rem;
  }
}
.vm__dev {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  padding-top: 0.7rem;
  border-top: 1px dashed var(--hud-border);
  max-height: 7.2rem;
  overflow-y: auto;
}
.vm__dev-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin-right: 0.3rem;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: var(--hud-text-faint);
  svg {
    width: 0.9rem;
    height: 0.9rem;
  }
}
.vm__dev-chip {
  min-height: 2.4rem;
  padding: 0 0.8rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: transparent;
  color: var(--hud-text-dim);
  font-size: 0.78rem;
  cursor: pointer;
  &:active {
    background: color-mix(in srgb, var(--hud-primary) 15%, transparent);
  }
}
</style>
