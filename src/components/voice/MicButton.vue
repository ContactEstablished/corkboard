<script setup lang="ts">
import { ClipboardCheck, Check, Mic, MicOff, TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'
import type { MicVisualState } from '@/stores/voice'

const props = withDefaults(
  defineProps<{
    state?: MicVisualState
    /** sm 52px · md 68px (primary controls) · lg 136px (voice modal) */
    size?: 'sm' | 'md' | 'lg'
    /** Accessible name; falls back to a state-based label. */
    label?: string
    disabled?: boolean
    /** Status display only: not focusable, not clickable, hidden from assistive tech. */
    passive?: boolean
  }>(),
  { state: 'idle', size: 'md' },
)
defineEmits<{ press: [] }>()

const icon = computed(() => {
  switch (props.state) {
    case 'permission': return MicOff
    case 'success': return Check
    case 'error': return TriangleAlert
    case 'confirm': return ClipboardCheck
    default: return Mic
  }
})

const STATE_LABEL: Record<MicVisualState, string> = {
  idle: 'Tap to speak',
  ready: 'Getting ready',
  listening: 'Listening',
  processing: 'Processing',
  permission: 'Microphone permission required',
  confirm: 'Review result',
  success: 'Done',
  error: 'Error. Tap to try again',
}
const ariaLabel = computed(() => props.label ?? STATE_LABEL[props.state])
</script>

<template>
  <button
    type="button"
    class="mic"
    :class="[`mic--${state}`, `mic--${size}`]"
    :aria-label="passive ? undefined : ariaLabel"
    :aria-hidden="passive || undefined"
    :tabindex="passive ? -1 : undefined"
    :disabled="disabled"
    @click="$emit('press')"
  >
    <span class="mic__halo" aria-hidden="true" />
    <span class="mic__pulse mic__pulse--a" aria-hidden="true" />
    <span class="mic__pulse mic__pulse--b" aria-hidden="true" />
    <span class="mic__spinner" aria-hidden="true" />
    <span class="mic__core">
      <component :is="icon" class="mic__icon" aria-hidden="true" />
    </span>
  </button>
</template>

<style scoped lang="scss">
.mic {
  --d: 4.25rem; // core diameter (68px at 1280×800): inside the 64–72px spec range
  --mic-color: var(--hud-primary);
  position: relative;
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--d);
  height: var(--d);
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: none;
  cursor: pointer;
  color: var(--hud-text);
  -webkit-tap-highlight-color: transparent;

  &--sm { --d: 3.25rem; }
  &--lg { --d: 8.5rem; }

  &--success { --mic-color: var(--hud-success); }
  &--error { --mic-color: var(--hud-danger); }
  &--permission { --mic-color: var(--hud-warning); }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
  &[aria-hidden='true'] {
    pointer-events: none;
  }
}

// Dark-blue core with the bright cyan border + controlled glow.
.mic__core {
  position: relative;
  z-index: 1;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: max(0.14rem, calc(var(--d) * 0.035)) solid var(--mic-color);
  background: radial-gradient(circle at 50% 35%, color-mix(in srgb, var(--hud-blue) 55%, var(--hud-bg)), color-mix(in srgb, var(--hud-blue-deep) 40%, var(--hud-bg-deep)) 75%);
  box-shadow:
    0 0 calc(var(--d) * 0.2) color-mix(in srgb, var(--mic-color) 65%, transparent),
    0 0 calc(var(--d) * 0.55) color-mix(in srgb, var(--mic-color) 28%, transparent),
    inset 0 0 calc(var(--d) * 0.25) color-mix(in srgb, var(--mic-color) 30%, transparent);
  transition: transform 0.12s, box-shadow 0.2s, border-color 0.2s;
  .mic:active:not(:disabled) & {
    transform: scale(0.93);
    box-shadow: 0 0 calc(var(--d) * 0.12) color-mix(in srgb, var(--mic-color) 80%, transparent);
  }
  .mic:focus-visible & {
    outline: 0.16rem solid var(--hud-text);
    outline-offset: 0.25rem;
  }
}

.mic__icon {
  width: 46%;
  height: 46%;
  color: var(--hud-text);
  stroke-width: 2;
  filter: drop-shadow(0 0 calc(var(--d) * 0.06) var(--mic-color));
}

// Faint outer halo — always present, subtle.
.mic__halo {
  position: absolute;
  inset: calc(var(--d) * -0.16);
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--mic-color) 30%, transparent);
  background: radial-gradient(circle, transparent 55%, color-mix(in srgb, var(--mic-color) 14%, transparent) 70%, transparent 72%);
  pointer-events: none;
}

// Expanding rings while listening.
.mic__pulse {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--mic-color);
  opacity: 0;
  pointer-events: none;
}

.mic__spinner {
  position: absolute;
  inset: calc(var(--d) * -0.1);
  border-radius: 50%;
  border: max(2px, calc(var(--d) * 0.04)) solid transparent;
  border-top-color: var(--mic-color);
  border-right-color: color-mix(in srgb, var(--mic-color) 45%, transparent);
  opacity: 0;
  pointer-events: none;
}

.mic--idle .mic__core {
  animation: mic-breathe 4.5s ease-in-out infinite;
}

.mic--listening {
  .mic__core {
    box-shadow:
      0 0 calc(var(--d) * 0.3) var(--mic-color),
      0 0 calc(var(--d) * 0.8) color-mix(in srgb, var(--mic-color) 45%, transparent),
      inset 0 0 calc(var(--d) * 0.3) color-mix(in srgb, var(--mic-color) 40%, transparent);
  }
  .mic__pulse {
    animation: mic-pulse 1.8s ease-out infinite;
    &--b { animation-delay: 0.9s; }
  }
}

.mic--processing {
  .mic__spinner {
    opacity: 1;
    animation: mic-spin 1s linear infinite;
  }
  .mic__icon {
    opacity: 0.6;
  }
}

.mic--ready .mic__core {
  animation: mic-breathe 1.4s ease-in-out infinite;
}

@keyframes mic-breathe {
  50% {
    box-shadow:
      0 0 calc(var(--d) * 0.28) color-mix(in srgb, var(--mic-color) 75%, transparent),
      0 0 calc(var(--d) * 0.7) color-mix(in srgb, var(--mic-color) 32%, transparent),
      inset 0 0 calc(var(--d) * 0.25) color-mix(in srgb, var(--mic-color) 30%, transparent);
  }
}
@keyframes mic-pulse {
  from { transform: scale(1); opacity: 0.65; }
  to { transform: scale(1.5); opacity: 0; }
}
@keyframes mic-spin {
  to { transform: rotate(360deg); }
}

// Reduced motion: no moving effects; states stay distinguishable by color,
// glow strength and a static ring so nothing relies on animation.
@media (prefers-reduced-motion: reduce) {
  .mic--listening .mic__pulse--a {
    animation: none;
    opacity: 0.55;
    transform: scale(1.25);
  }
  .mic--processing .mic__spinner {
    animation: none;
  }
}
</style>
