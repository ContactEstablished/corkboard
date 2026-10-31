<script setup lang="ts">
import { type ContextOverride } from '@/features/voice/context'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import { useVoiceStore } from '@/stores/voice'
import MicButton from './MicButton.vue'

/**
 * Local microphone: same pipeline and modal as the global mic, but it carries
 * the more specific context of the view it sits in.
 */
const props = defineProps<{ context: ContextOverride; label: string }>()
const { launch } = useVoiceLauncher()
const voice = useVoiceStore()
</script>

<template>
  <div class="local-mic">
    <MicButton :state="voice.micVisual" :label="label" @press="launch(props.context, 'local-mic')" />
    <span class="local-mic__label hud-display" aria-hidden="true">{{ label }}</span>
  </div>
</template>

<style scoped lang="scss">
.local-mic {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.9rem;
  width: 5.8rem;
  flex: none;
}
.local-mic__label {
  font-size: 0.62rem;
  line-height: 1.35;
  letter-spacing: 0.1em;
  text-align: center;
  color: var(--hud-text);
  text-wrap: balance;
}
</style>
